"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { authClient } from "@/lib/auth-client";
import { isMeaningfulFeedbackAcknowledgement } from "@/lib/easyt/feedback-survey";
import { feedbackSlotOnEntry, type FeedbackSlotState } from "@/lib/easyt/feedback-entry-policy";
import { useFeedbackActiveUse } from "./use-feedback-active-use";
import { useTripShellMutation } from "./trip-shell-client";

type SurveyState = { dismissed: boolean; submitted: boolean };
type FeedbackContext = { ownerId: string | null; eligible: boolean; state: SurveyState | null; refresh(): Promise<void> };
const Context = createContext<FeedbackContext | null>(null);

export function ContextualFeedbackProvider({ children }: { children: ReactNode }) {
  const mutation = useTripShellMutation();
  const { data: session } = authClient.useSession();
  const ownerId = session?.user?.id && session.user.id === mutation.trip.ownerId ? session.user.id : null;
  const activeUse = useFeedbackActiveUse(ownerId);
  const [state, setState] = useState<SurveyState | null>(null);
  const refresh = async () => {
    if (!ownerId) { setState(null); return; }
    try {
      const response = await fetch("/api/easyt/feedback/survey", { cache: "no-store" });
      if (!response.ok) throw new Error("Survey state unavailable");
      const value: unknown = await response.json();
      if (!value || typeof value !== "object" || typeof (value as SurveyState).dismissed !== "boolean" || typeof (value as SurveyState).submitted !== "boolean") throw new Error("Survey state unreadable");
      setState(value as SurveyState);
    } catch { setState(null); }
  };
  useEffect(() => {
    let current = true;
    setState(null);
    if (!ownerId) return () => { current = false; };
    void fetch("/api/easyt/feedback/survey", { cache: "no-store" }).then(async (response) => {
      if (!response.ok) throw new Error("Survey state unavailable");
      const value: unknown = await response.json();
      if (!value || typeof value !== "object" || typeof (value as SurveyState).dismissed !== "boolean" || typeof (value as SurveyState).submitted !== "boolean") throw new Error("Survey state unreadable");
      if (current) setState(value as SurveyState);
    }).catch(() => { if (current) setState(null); });
    return () => { current = false; };
  }, [ownerId]);
  const acknowledgement = mutation.lastAcknowledgedMutation;
  useEffect(() => {
    if (ownerId && acknowledgement?.ownerId === ownerId && acknowledgement.tripId === mutation.trip.id
      && isMeaningfulFeedbackAcknowledgement(acknowledgement.pendingKey, acknowledgement.feedbackAction)) activeUse.markAcknowledgedAction();
  }, [acknowledgement, activeUse.markAcknowledgedAction, mutation.trip.id, ownerId]);
  const eligible = Boolean(ownerId && state && !state.dismissed && !state.submitted && activeUse.qualifiedTime && activeUse.acknowledgedAction
    && mutation.saveState !== "saving" && mutation.saveState !== "error" && !mutation.historicalRecovery && !mutation.hasPendingSaves());
  return <Context.Provider value={{ ownerId, eligible, state, refresh }}>{children}</Context.Provider>;
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
  if (!context?.ownerId || !entry.visible || context.state?.dismissed || context.state?.submitted) return null;
  return <div data-contextual-feedback-slot={workspace} />;
}
