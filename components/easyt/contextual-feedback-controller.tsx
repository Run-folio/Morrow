"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { authClient } from "@/lib/auth-client";
import { isMeaningfulFeedbackAcknowledgement } from "@/lib/easyt/feedback-survey";
import { feedbackSlotOnEntry, type FeedbackSlotState } from "@/lib/easyt/feedback-entry-policy";
import { useFeedbackActiveUse } from "./use-feedback-active-use";
import { useTripShellMutation } from "./trip-shell-client";
import { EasyTFeedback } from "./easyt-feedback";

type SurveyState = { ownerId: string; dismissed: boolean; submitted: boolean };
type FeedbackContext = { ownerId: string | null; eligible: boolean; hydrated: boolean; entryReady: boolean | null; state: SurveyState | null; showReceipt: boolean; dismiss(ownerId: string): void; submitted(ownerId: string): void };
const Context = createContext<FeedbackContext | null>(null);
const dismissIntentKey = (ownerId: string) => `morrovia:contextual-feedback:dismiss:${encodeURIComponent(ownerId)}`;
const surveyStateCache = new Map<string, SurveyState>();

export function ContextualFeedbackProvider({ children, storyEligible = false }: { children: ReactNode; storyEligible?: boolean }) {
  const mutation = useTripShellMutation();
  const { data: session } = authClient.useSession();
  const ownerId = session?.user?.id && session.user.id === mutation.trip.ownerId ? session.user.id : null;
  const activeUse = useFeedbackActiveUse(ownerId);
  const [state, setState] = useState<SurveyState | null>(null);
  const [entryReady, setEntryReady] = useState<boolean | null>(null);
  const [showReceipt, setShowReceipt] = useState(false);
  const ownerRef = useRef(ownerId);
  const requestVersionRef = useRef(0);
  ownerRef.current = ownerId;
  useEffect(() => {
    let current = true;
    requestVersionRef.current += 1;
    const cached = ownerId ? surveyStateCache.get(ownerId) ?? null : null;
    setState(cached);
    setEntryReady(Boolean(cached));
    setShowReceipt(false);
    if (!ownerId) return () => { current = false; };
    const retryDismiss = async () => {
      if (localStorage.getItem(dismissIntentKey(ownerId)) !== "1") return;
      try {
        const response = await fetch("/api/easyt/feedback/survey", { method: "PATCH" });
        if (response.ok && current && ownerRef.current === ownerId) localStorage.removeItem(dismissIntentKey(ownerId));
      } catch { /* Keep the account-scoped intent for the next entry. */ }
    };
    const refresh = async () => {
      const version = ++requestVersionRef.current;
      await retryDismiss();
      if (!current || ownerRef.current !== ownerId || version !== requestVersionRef.current) return;
      try {
        const response = await fetch("/api/easyt/feedback/survey", { cache: "no-store" });
        if (!response.ok) throw new Error("Survey state unavailable");
        const value: unknown = await response.json();
        if (!value || typeof value !== "object" || typeof (value as SurveyState).dismissed !== "boolean" || typeof (value as SurveyState).submitted !== "boolean") throw new Error("Survey state unreadable");
        if (current && ownerRef.current === ownerId && version === requestVersionRef.current) {
          const serverState = value as SurveyState;
          const next = { ownerId, dismissed: serverState.dismissed || localStorage.getItem(dismissIntentKey(ownerId)) === "1", submitted: serverState.submitted };
          surveyStateCache.set(ownerId, next);
          setState(next);
        }
      } catch {
        if (current && ownerRef.current === ownerId && version === requestVersionRef.current) {
          surveyStateCache.delete(ownerId);
          setState(null);
        }
      }
    };
    void refresh();
    const onReturn = () => { if (document.visibilityState === "visible") void refresh(); };
    window.addEventListener("focus", onReturn);
    document.addEventListener("visibilitychange", onReturn);
    return () => { current = false; window.removeEventListener("focus", onReturn); document.removeEventListener("visibilitychange", onReturn); };
  }, [ownerId]);
  const dismiss = (capturedOwner: string) => {
    if (ownerRef.current !== capturedOwner) return;
    requestVersionRef.current += 1;
    localStorage.setItem(dismissIntentKey(capturedOwner), "1");
    const dismissedState = { ownerId: capturedOwner, dismissed: true, submitted: false };
    surveyStateCache.set(capturedOwner, dismissedState);
    setState(dismissedState);
    void fetch("/api/easyt/feedback/survey", { method: "PATCH" }).then((response) => {
      if (response.ok && ownerRef.current === capturedOwner) localStorage.removeItem(dismissIntentKey(capturedOwner));
    }).catch(() => {});
  };
  const submitted = (capturedOwner: string) => {
    if (ownerRef.current !== capturedOwner) return;
    requestVersionRef.current += 1;
    const submittedState = { ownerId: capturedOwner, dismissed: false, submitted: true };
    surveyStateCache.set(capturedOwner, submittedState);
    setState(submittedState); setShowReceipt(true);
  };
  const acknowledgement = mutation.lastAcknowledgedMutation;
  useEffect(() => {
    if (ownerId && acknowledgement?.ownerId === ownerId && acknowledgement.tripId === mutation.trip.id
      && isMeaningfulFeedbackAcknowledgement(acknowledgement.pendingKey, acknowledgement.feedbackAction)) activeUse.markAcknowledgedAction();
  }, [acknowledgement, activeUse.markAcknowledgedAction, mutation.trip.id, ownerId]);
  const eligible = Boolean(ownerId && state?.ownerId === ownerId && !state.dismissed && !state.submitted && activeUse.qualifiedTime && activeUse.acknowledgedAction
    && mutation.saveState !== "saving" && mutation.saveState !== "error" && !mutation.historicalRecovery && !mutation.hasPendingSaves());
  const storyOwnerId = storyEligible ? mutation.trip.ownerId : null;
  const storyState = storyOwnerId ? { ownerId: storyOwnerId, dismissed: false, submitted: false } : null;
  return <Context.Provider value={{
    ownerId: storyOwnerId ?? ownerId,
    eligible: Boolean(storyState) || eligible,
    hydrated: Boolean(storyState) || activeUse.hydrated,
    entryReady: storyState ? true : entryReady,
    state: storyState ?? state,
    showReceipt, dismiss, submitted,
  }}>{children}</Context.Provider>;
}

export function ContextualFeedbackSlot({ workspace, entryKey, hasContent, blocked }: { workspace: "itinerary" | "overview"; entryKey: string; hasContent: boolean; blocked: boolean }) {
  const context = useContext(Context);
  const active = typeof document !== "undefined" ? document.activeElement : null;
  const activeInteraction = Boolean(active?.closest("input, textarea, select, [contenteditable='true'], [role='dialog'], [aria-modal='true']")
    || (typeof document !== "undefined" && document.querySelector("dialog[open], [role='dialog'][aria-modal='true']")));
  const entryBlocked = blocked || activeInteraction;
  const eligible = Boolean(context?.eligible && hasContent);
  const [entry, setEntry] = useState<FeedbackSlotState>({ entryKey: null, visible: false });
  // Eligibility changing within this entry must not insert content under active work.
  useEffect(() => {
    if (!context?.ownerId || !context.hydrated || context.entryReady === null) return;
    setEntry((current) => feedbackSlotOnEntry(current, `${context.ownerId}:${entryKey}`, eligible, entryBlocked));
    // Account hydration and a cached entry snapshot count as entry setup;
    // later eligibility changes wait for the next workspace/section entry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entryKey, context?.ownerId, context?.hydrated, context?.entryReady]);
  if (!context?.ownerId || context.state?.ownerId !== context.ownerId || !entry.visible || context.state?.dismissed || (context.state?.submitted && !context.showReceipt)) return null;
  return <div data-contextual-feedback-slot={workspace}><EasyTFeedback key={context.ownerId} ownerId={context.ownerId} onDismiss={() => context.dismiss(context.ownerId!)} onSubmitted={() => context.submitted(context.ownerId!)} /></div>;
}
