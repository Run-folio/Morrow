export const FEEDBACK_ACTIVE_THRESHOLD_MS = 600_000;
export const FEEDBACK_IDLE_CUTOFF_MS = 60_000;
export type ActiveUseSnapshot = { elapsedMs: number; lastTickMs: number | null; lastInputMs: number | null };
export type PersistedFeedbackActiveUse = { elapsedMs: number; acknowledgedAction: boolean };

export function feedbackActiveUseStorageKey(ownerId: string, surveyId: string): string {
  return `morrovia:feedback-active:${encodeURIComponent(ownerId)}:${encodeURIComponent(surveyId)}`;
}
export function feedbackActiveUseLeaseKey(ownerId: string, surveyId: string): string {
  return `morrovia:feedback-lease:${encodeURIComponent(ownerId)}:${encodeURIComponent(surveyId)}`;
}
export function feedbackInputIsRecent(nowMs: number, lastInputMs: number | null): boolean {
  return lastInputMs !== null && nowMs >= lastInputMs && nowMs - lastInputMs <= FEEDBACK_IDLE_CUTOFF_MS;
}
export function feedbackTimeQualified(elapsedMs: number): boolean { return elapsedMs >= FEEDBACK_ACTIVE_THRESHOLD_MS; }
export function advanceFeedbackActiveUse(snapshot: ActiveUseSnapshot, nowMs: number, qualifying: boolean): ActiveUseSnapshot {
  const delta = snapshot.lastTickMs === null ? 0 : Math.max(0, Math.min(1_000, nowMs - snapshot.lastTickMs));
  return { ...snapshot, elapsedMs: snapshot.elapsedMs + (qualifying ? delta : 0), lastTickMs: nowMs };
}
export function parsePersistedFeedbackActiveUse(raw: string | null): PersistedFeedbackActiveUse {
  try {
    const value: unknown = raw ? JSON.parse(raw) : null;
    if (!value || typeof value !== "object") return { elapsedMs: 0, acknowledgedAction: false };
    const record = value as Record<string, unknown>;
    return { elapsedMs: typeof record.elapsedMs === "number" && Number.isFinite(record.elapsedMs) ? Math.max(0, Math.min(record.elapsedMs, 86_400_000)) : 0, acknowledgedAction: record.acknowledgedAction === true };
  } catch { return { elapsedMs: 0, acknowledgedAction: false }; }
}
