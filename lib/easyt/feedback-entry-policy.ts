export type FeedbackSlotState = { entryKey: string | null; visible: boolean };

/** Display only at an entry boundary; later eligibility never inserts content mid-work. */
export function feedbackSlotOnEntry(state: FeedbackSlotState, entryKey: string, eligible: boolean, blocked: boolean): FeedbackSlotState {
  if (state.entryKey === entryKey) return state;
  return { entryKey, visible: eligible && !blocked };
}
