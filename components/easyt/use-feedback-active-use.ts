"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { advanceFeedbackActiveUse, feedbackActiveUseLeaseKey, feedbackActiveUseStorageKey, feedbackInputIsRecent, feedbackTimeQualified, parsePersistedFeedbackActiveUse, type ActiveUseSnapshot } from "@/lib/easyt/feedback-active-use";
import { CONTEXTUAL_FEEDBACK_SURVEY_ID } from "@/lib/easyt/feedback-survey";

export function useFeedbackActiveUse(ownerId: string | null) {
  const [elapsedMs, setElapsedMs] = useState(0);
  const [acknowledgedAction, setAcknowledgedAction] = useState(false);
  const [hydratedOwnerId, setHydratedOwnerId] = useState<string | null>(null);
  const snapshot = useRef<ActiveUseSnapshot>({ elapsedMs: 0, lastTickMs: null, lastInputMs: null });
  const storageKey = ownerId ? feedbackActiveUseStorageKey(ownerId, CONTEXTUAL_FEEDBACK_SURVEY_ID) : null;
  const markAcknowledgedAction = useCallback(() => {
    if (!storageKey) return;
    try {
      const stored = parsePersistedFeedbackActiveUse(localStorage.getItem(storageKey));
      localStorage.setItem(storageKey, JSON.stringify({ elapsedMs: Math.max(stored.elapsedMs, snapshot.current.elapsedMs), acknowledgedAction: true }));
      setAcknowledgedAction(true);
    } catch { /* Storage unavailable: do not qualify. */ }
  }, [storageKey]);

  useEffect(() => {
    if (!ownerId || !storageKey) { setElapsedMs(0); setAcknowledgedAction(false); setHydratedOwnerId(null); return; }
    const leaseKey = feedbackActiveUseLeaseKey(ownerId, CONTEXTUAL_FEEDBACK_SURVEY_ID);
    const tabId = crypto.randomUUID();
    let cancelled = false;
    let busy = false;
    try {
      const stored = parsePersistedFeedbackActiveUse(localStorage.getItem(storageKey));
      snapshot.current = { elapsedMs: stored.elapsedMs, lastTickMs: null, lastInputMs: null };
      setElapsedMs(stored.elapsedMs);
      setAcknowledgedAction(stored.acknowledgedAction);
      setHydratedOwnerId(ownerId);
    } catch {
      snapshot.current = { elapsedMs: 0, lastTickMs: null, lastInputMs: null };
      setElapsedMs(0); setAcknowledgedAction(false);
      setHydratedOwnerId(ownerId);
    }
    const onInput = (event: Event) => { if (event.isTrusted) snapshot.current.lastInputMs = Date.now(); };
    window.addEventListener("pointerdown", onInput);
    window.addEventListener("keydown", onInput);
    window.addEventListener("wheel", onInput, { passive: true });
    const tick = async () => {
      if (busy || cancelled) return;
      busy = true;
      const count = () => {
        if (cancelled) return;
        const now = Date.now();
        const active = document.visibilityState === "visible" && document.hasFocus() && feedbackInputIsRecent(now, snapshot.current.lastInputMs);
        try {
          if (!active) { snapshot.current = advanceFeedbackActiveUse(snapshot.current, now, false); return; }
          const lease = localStorage.getItem(leaseKey);
          const parts = lease?.split(":") ?? [];
          const otherOwns = parts[0] && parts[0] !== tabId && Number(parts[1]) > now;
          if (otherOwns) { snapshot.current = advanceFeedbackActiveUse(snapshot.current, now, false); return; }
          localStorage.setItem(leaseKey, `${tabId}:${now + 2500}`);
          if (localStorage.getItem(leaseKey) !== `${tabId}:${now + 2500}`) return;
          const stored = parsePersistedFeedbackActiveUse(localStorage.getItem(storageKey));
          snapshot.current = advanceFeedbackActiveUse({ ...snapshot.current, elapsedMs: Math.max(stored.elapsedMs, snapshot.current.elapsedMs) }, now, true);
          localStorage.setItem(storageKey, JSON.stringify({ elapsedMs: snapshot.current.elapsedMs, acknowledgedAction: stored.acknowledgedAction }));
          setElapsedMs(snapshot.current.elapsedMs);
          setAcknowledgedAction(stored.acknowledgedAction);
        } catch { snapshot.current = advanceFeedbackActiveUse(snapshot.current, now, false); }
      };
      try {
        if (navigator.locks) await navigator.locks.request(leaseKey, { ifAvailable: true }, (lock) => { if (lock) count(); });
        else count();
      } finally { busy = false; }
    };
    const timer = window.setInterval(() => { void tick(); }, 1000);
    return () => {
      cancelled = true; window.clearInterval(timer);
      window.removeEventListener("pointerdown", onInput);
      window.removeEventListener("keydown", onInput);
      window.removeEventListener("wheel", onInput);
      try { if (localStorage.getItem(leaseKey)?.startsWith(`${tabId}:`)) localStorage.removeItem(leaseKey); } catch { /* Optional local lease. */ }
    };
  }, [ownerId, storageKey]);
  return { elapsedMs, qualifiedTime: feedbackTimeQualified(elapsedMs), acknowledgedAction, hydrated: hydratedOwnerId === ownerId, markAcknowledgedAction };
}
