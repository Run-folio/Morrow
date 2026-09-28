export type FeedbackAttempt = Readonly<{ attemptId: string; rating: number; comment: string }>;
export type FeedbackResponseFlow = {
  phase: "open" | "sending" | "uncertain" | "failed" | "sent" | "already-submitted";
  rating: number | null;
  comment: string;
  attempt: FeedbackAttempt | null;
};

export function beginFeedbackAttempt(state: FeedbackResponseFlow, attemptId: string): FeedbackResponseFlow {
  if (state.phase === "sending" || state.phase === "sent" || state.phase === "already-submitted") return state;
  if (state.phase === "uncertain" && state.attempt) return { ...state, phase: "sending" };
  if (!state.rating || state.rating < 1 || state.rating > 5) return state;
  return { ...state, phase: "sending", attempt: Object.freeze({ attemptId, rating: state.rating, comment: state.comment.trim() }) };
}

export function completeFeedbackAttempt(state: FeedbackResponseFlow, result: "created" | "replayed" | "already-submitted"): FeedbackResponseFlow {
  return { ...state, phase: result === "already-submitted" ? "already-submitted" : "sent" };
}

export function failFeedbackAttempt(state: FeedbackResponseFlow, uncertain: boolean): FeedbackResponseFlow {
  return { ...state, phase: uncertain ? "uncertain" : "failed", attempt: uncertain ? state.attempt : null };
}

export function reconcileFeedbackAttempt(state: FeedbackResponseFlow, submitted: boolean): FeedbackResponseFlow {
  return submitted ? { ...state, phase: "sent" } : { ...state, phase: "open", attempt: null };
}
