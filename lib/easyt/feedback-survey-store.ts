import { createHash } from "node:crypto";
import { CONTEXTUAL_FEEDBACK_SURVEY_ID, normalizeContextualFeedback, type ContextualFeedbackPayload } from "./feedback-survey.ts";

export type FeedbackSurveySql = (strings: TemplateStringsArray, ...values: unknown[]) => Promise<Record<string, unknown>[]>;
export type FeedbackSurveySubmitResult = "created" | "replayed" | "already-submitted" | "payload-conflict";

export function contextualFeedbackPayloadHash(payload: ContextualFeedbackPayload): string {
  return createHash("sha256").update(JSON.stringify([payload.rating, payload.comment])).digest("hex");
}

export function createFeedbackSurveyStore(sql: FeedbackSurveySql) {
  return {
    async state(ownerId: string): Promise<{ dismissed: boolean; submitted: boolean }> {
      const responses = await sql`select id from easyt_feedback where owner_id = ${ownerId} and survey_id = ${CONTEXTUAL_FEEDBACK_SURVEY_ID} limit 1`;
      const dismissals = await sql`select owner_id from easyt_feedback_survey_state where owner_id = ${ownerId} and survey_id = ${CONTEXTUAL_FEEDBACK_SURVEY_ID} limit 1`;
      return { dismissed: dismissals.length > 0, submitted: responses.length > 0 };
    },
    async dismiss(ownerId: string): Promise<void> {
      await sql`insert into easyt_feedback_survey_state (owner_id, survey_id) values (${ownerId}, ${CONTEXTUAL_FEEDBACK_SURVEY_ID}) on conflict (owner_id, survey_id) do nothing`;
    },
    async submit(input: { ownerId: string; attemptId: string; rating: number; comment?: string }): Promise<FeedbackSurveySubmitResult> {
      const payload = normalizeContextualFeedback(input.rating, input.comment);
      const hash = contextualFeedbackPayloadHash(payload);
      const inserted = await sql`insert into easyt_feedback (owner_id, survey_id, attempt_id, payload_hash, rating, comment, surface)
        values (${input.ownerId}, ${CONTEXTUAL_FEEDBACK_SURVEY_ID}, ${input.attemptId}, ${hash}, ${payload.rating}, ${payload.comment || null}, 'contextual')
        on conflict (owner_id, survey_id) where owner_id is not null and survey_id is not null do nothing returning id`;
      if (inserted.length) return "created";
      const existing = await sql`select attempt_id, payload_hash from easyt_feedback where owner_id = ${input.ownerId} and survey_id = ${CONTEXTUAL_FEEDBACK_SURVEY_ID} limit 1`;
      if (!existing[0]) throw new Error("Survey submission could not be reconciled.");
      if (existing[0].attempt_id === input.attemptId) return existing[0].payload_hash === hash ? "replayed" : "payload-conflict";
      return "already-submitted";
    },
  };
}
