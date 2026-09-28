"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { authClient } from "@/lib/auth-client";
import { isMeaningfulFeedbackAcknowledgement } from "@/lib/easyt/feedback-survey";
import { feedbackSlotOnEntry, type FeedbackSlotState } from "@/lib/easyt/feedback-entry-policy";
import { useFeedbackActiveUse } from "./use-feedback-active-use";
import { useTripShellMutation } from "./trip-shell-client";
import { EasyTFeedback } from "./easyt-feedback";

type SurveyState = { dismissed: boolean; submitted: boolean };
type FeedbackContext = { ownerId: string | null; eligible: boolean; state: SurveyState | null; showReceipt: boolean; dismiss(ownerId: string): void; submitted(ownerId: string): void };
const Context = createContext<FeedbackContext | null>(null);
const dismissIntentKey = (ownerId: string) => `morrovia:contextual-feedback:dismiss:${encodeURIComponent(ownerId)}`;

export function ContextualFeedbackProvider({ children }: { children: ReactNode }) {
  const mutation = useTripShellMutation();
  const { data: session } = authClient.useSession();
  const ownerId = session?.user?.id && session.user.id === mutation.trip.ownerId ? session.user.id : null;
  const activeUse = useFeedbackActiveUse(ownerId);
  const [state, setState] = useState<SurveyState | null>(null);
  const [showReceipt, setShowReceipt] = useState(false);
  const ownerRef = useRef(ownerId);
  ownerRef.current = ownerId;
  useEffect(() => {
    let current = true;
    setState(null);
    setShowReceipt(false);
    if (!ownerId) return () => { current = false; };
    const refresh = () => { void fetch("/api/easyt/feedback/survey", { cache: "no-store" }).then(async (response) => {
      if (!response.ok) throw new Error("Survey state unavailable");
      const value: unknown = await response.json();
      if (!value || typeof value !== "object" || typeof (value as SurveyState).dismissed !== "boolean" || typeof (value as SurveyState).submitted !== "boolean") throw new Error("Survey state unreadable");
      if (current && ownerRef.current === ownerId) setState(localStorage.getItem(dismissIntentKey(ownerId)) === "1" ? { dismissed: true, submitted: (value as SurveyState).submitted } : value as SurveyState);
    }).catch(() => { if (current && ownerRef.current === ownerId) setState(null); }); };
    const retryDismiss = () => {
      if (localStorage.getItem(dismissIntentKey(ownerId)) !== "1") return;
      void fetch("/api/easyt/feedback/survey", { method: "PATCH" }).then((response) => {
        if (response.ok && current && ownerRef.current === ownerId) localStorage.removeItem(dismissIntentKey(ownerId));
      }).catch(() => {});
    };
    retryDismiss();
    refresh();
    const onReturn = () => { if (document.visibilityState === "visible") { retryDismiss(); refresh(); } };
    window.addEventListener("focus", onReturn);
    document.addEventListener("visibilitychange", onReturn);
    return () => { current = false; window.removeEventListener("focus", onReturn); document.removeEventListener("visibilitychange", onReturn); };
  }, [ownerId]);
  const dismiss = (capturedOwner: string) => {
    if (ownerRef.current !== capturedOwner) return;
    localStorage.setItem(dismissIntentKey(capturedOwner), "1");
    setState({ dismissed: true, submitted: false });
    void fetch("/api/easyt/feedback/survey", { method: "PATCH" }).then((response) => {
      if (response.ok && ownerRef.current === capturedOwner) localStorage.removeItem(dismissIntentKey(capturedOwner));
    }).catch(() => {});
  };
  const submitted = (capturedOwner: string) => {
    if (ownerRef.current !== capturedOwner) return;
    setState({ dismissed: false, submitted: true }); setShowReceipt(true);
  };
  const acknowledgement = mutation.lastAcknowledgedMutation;
  useEffect(() => {
    if (ownerId && acknowledgement?.ownerId === ownerId && acknowledgement.tripId === mutation.trip.id
      && isMeaningfulFeedbackAcknowledgement(acknowledgement.pendingKey, acknowledgement.feedbackAction)) activeUse.markAcknowledgedAction();
  }, [acknowledgement, activeUse.markAcknowledgedAction, mutation.trip.id, ownerId]);
  const eligible = Boolean(ownerId && state && !state.dismissed && !state.submitted && activeUse.qualifiedTime && activeUse.acknowledgedAction
    && mutation.saveState !== "saving" && mutation.saveState !== "error" && !mutation.historicalRecovery && !mutation.hasPendingSaves());
  return <Context.Provider value={{ ownerId, eligible, state, showReceipt, dismiss, submitted }}>{children}</Context.Provider>;
}

export function ContextualFeedbackSlot({ workspace, entryKey, hasContent, blocked }: { workspace: "itinerary" | "overview"; entryKey: string; hasContent: boolean; blocked: boolean }) {
  const context = useContext(Context);
  const active = typeof document !== "undefined" ? document.activeElement : null;
  const activeInteraction = Boolean(active?.closest("input, textarea, select, [contenteditable='true'], [role='dialog'], [aria-modal='true']")
    || (typeof document !== "undefined" && document.querySelector("dialog[open], [role='dialog'][aria-modal='true']")));
  const entryBlocked = blocked || activeInteraction;
  const eligible = Boolean(context?.eligible && hasContent);
  const [entry, setEntry] = useState<FeedbackSlotState>(() => feedbackSlotOnEntry({ entryKey: null, visible: false }, entryKey, eligible, entryBlocked));
  // Eligibility changing within this entry must not insert content under active work.
  useEffect(() => {
    setEntry((current) => feedbackSlotOnEntry(current, entryKey, eligible, entryBlocked));
    // Entry changes are the only trigger; eligibility or blocker changes wait for the next entry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entryKey]);
  if (!context?.ownerId || !entry.visible || context.state?.dismissed || (context.state?.submitted && !context.showReceipt)) return null;
  return <div data-contextual-feedback-slot={workspace}><EasyTFeedback key={context.ownerId} ownerId={context.ownerId} onDismiss={() => context.dismiss(context.ownerId!)} onSubmitted={() => context.submitted(context.ownerId!)} /></div>;
}
