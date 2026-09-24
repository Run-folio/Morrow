import type { StructuredTripBrief } from "./structured-trip-brief.ts";

export const DISCOVERY_DRAFT_VERSION = 1 as const;

export type DiscoveryStep = "directions" | "places" | "bases" | "review";

export type DiscoveryDraft = {
  version: typeof DISCOVERY_DRAFT_VERSION;
  step: DiscoveryStep;
  directionId: string | null;
  shortlistIds: string[];
  baseByIntentId: Record<string, string>;
  visitBaseByIntentId: Record<string, string>;
  removedIds: string[];
  reviewState: "editing" | "ready" | "confirmed";
};

export type DiscoveryDraftAction =
  | { type: "set-step"; step: DiscoveryStep }
  | { type: "change-direction"; directionId: string | null }
  | { type: "add-shortlist" | "remove-shortlist"; placeId: string }
  | { type: "choose-base" | "choose-visit-base"; intentId: string; baseId: string }
  | { type: "mark-review-ready" | "mark-confirmed" | "reset" };

export type DiscoveryDraftRead = {
  draft: DiscoveryDraft;
  status: "new" | "current" | "migrated" | "unsupported-version";
};

export function createDiscoveryDraft(): DiscoveryDraft {
  return {
    version: DISCOVERY_DRAFT_VERSION,
    step: "directions",
    directionId: null,
    shortlistIds: [],
    baseByIntentId: {},
    visitBaseByIntentId: {},
    removedIds: [],
    reviewState: "editing",
  };
}

/** Reading never mutates the brief; callers persist a migrated draft once under its mention ID. */
export function readDiscoveryDraft(brief: StructuredTripBrief, mentionId: string): DiscoveryDraftRead {
  const drafts = brief.discoveryDraftByMentionId;
  if (drafts && Object.prototype.hasOwnProperty.call(drafts, mentionId)) {
    const raw = drafts[mentionId];
    if (raw?.version === DISCOVERY_DRAFT_VERSION) return { draft: raw, status: "current" };
    // Keep unsupported payloads intact for exceptional recovery; do not fall back to legacy defaults.
    return { draft: raw, status: "unsupported-version" };
  }

  const choices = brief.countryDiscoveryChoices;
  if (choices && Object.prototype.hasOwnProperty.call(choices, mentionId)) {
    const legacyIds = choices[mentionId];
    if (Array.isArray(legacyIds)) {
      return { draft: { ...createDiscoveryDraft(), shortlistIds: [...legacyIds] }, status: "migrated" };
    }
  }
  return { draft: createDiscoveryDraft(), status: "new" };
}

export function reduceDiscoveryDraft(draft: DiscoveryDraft, action: DiscoveryDraftAction): DiscoveryDraft {
  switch (action.type) {
    case "set-step":
      return { ...draft, step: action.step };
    case "change-direction":
      return { ...draft, directionId: action.directionId, reviewState: "editing" };
    case "add-shortlist":
      return {
        ...draft,
        shortlistIds: [...new Set([...draft.shortlistIds, action.placeId])],
        removedIds: draft.removedIds.filter((id) => id !== action.placeId),
        reviewState: "editing",
      };
    case "remove-shortlist":
      return {
        ...draft,
        shortlistIds: draft.shortlistIds.filter((id) => id !== action.placeId),
        removedIds: [...new Set([...draft.removedIds, action.placeId])],
        reviewState: "editing",
      };
    case "choose-base":
      return { ...draft, baseByIntentId: { ...draft.baseByIntentId, [action.intentId]: action.baseId }, reviewState: "editing" };
    case "choose-visit-base":
      return { ...draft, visitBaseByIntentId: { ...draft.visitBaseByIntentId, [action.intentId]: action.baseId }, reviewState: "editing" };
    case "mark-review-ready":
      return { ...draft, reviewState: "ready" };
    case "mark-confirmed":
      return { ...draft, reviewState: "confirmed" };
    case "reset":
      return createDiscoveryDraft();
  }
}
