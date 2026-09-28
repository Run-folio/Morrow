export const CONTEXTUAL_FEEDBACK_SURVEY_ID = "contextual-beta-v1";

export type ContextualFeedbackPayload = { rating: number; comment: string };

export function normalizeContextualFeedback(rating: unknown, comment: unknown): ContextualFeedbackPayload {
  if (!Number.isInteger(rating) || Number(rating) < 1 || Number(rating) > 5) throw new Error("Choose a rating from 1 to 5.");
  if (comment !== undefined && typeof comment !== "string") throw new Error("Feedback note must be text.");
  if (typeof comment === "string" && comment.length > 1000) throw new Error("Keep the note within 1000 characters.");
  return { rating: Number(rating), comment: typeof comment === "string" ? comment.trim() : "" };
}

export type MeaningfulFeedbackAction = "activity-add" | "idea-schedule" | "activity-move" | "stay-select";

/** A caller must opt in to one reviewed action; a similar key alone is insufficient. */
export function isMeaningfulFeedbackAcknowledgement(pendingKey: string, action?: MeaningfulFeedbackAction): boolean {
  if (action === "activity-add") return /^itinerary-day-[1-9]\d*$/.test(pendingKey);
  if (action === "idea-schedule") return /^itinerary-suggestion-[A-Za-z0-9][A-Za-z0-9_-]*-[A-Za-z0-9][A-Za-z0-9_-]*$/.test(pendingKey);
  if (action === "activity-move") return /^itinerary-activity-move-[A-Za-z0-9][A-Za-z0-9_-]*$/.test(pendingKey);
  if (action === "stay-select") return /^stay-select-[A-Za-z0-9][A-Za-z0-9_-]*-[A-Za-z0-9][A-Za-z0-9_-]*$/.test(pendingKey);
  return false;
}

/** A DB test URL is accepted only for the disposable local database. */
export function feedbackSurveyTestDatabaseUrl(value: string | undefined): URL | null {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    if (!(["postgres:", "postgresql:"].includes(parsed.protocol))) return null;
    if (!(parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1" || parsed.hostname === "[::1]")) return null;
    if (parsed.pathname !== "/morrovia_feedback_test") return null;
    return parsed;
  } catch { return null; }
}
