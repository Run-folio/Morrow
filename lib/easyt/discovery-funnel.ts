import type { DiscoveryDraft, DiscoveryDraftAction } from "./discovery-draft.ts";

export type DiscoveryEntryCategory = "continent" | "country" | "region" | "landmark" | "natural-area" | "clarification";

export function discoveryChoiceEvent(kind: DiscoveryEntryCategory, previous: DiscoveryDraft, next: DiscoveryDraft, action: DiscoveryDraftAction, candidateCount = 0) {
  if (action.type === "change-direction") return previous.directionId === next.directionId ? null
    : { name: "discovery_direction_selected" as const, properties: { entry_kind: kind, candidate_count: candidateCount } };
  if (action.type === "add-shortlist" || action.type === "remove-shortlist") {
    const wasSelected = previous.shortlistIds.includes(action.placeId);
    const isSelected = next.shortlistIds.includes(action.placeId);
    if (wasSelected === isSelected) return null;
    return { name: "discovery_place_choice_changed" as const, properties: { entry_kind: kind,
      action: isSelected ? "add" as const : "remove" as const, shortlist_count: next.shortlistIds.length } };
  }
  if (action.type === "choose-base" || action.type === "choose-visit-base") {
    const previousBase = previous.baseByIntentId[action.intentId];
    const previousVisitBase = previous.visitBaseByIntentId[action.intentId];
    const nextBase = next.baseByIntentId[action.intentId];
    const nextVisitBase = next.visitBaseByIntentId[action.intentId];
    if (previousBase === nextBase && previousVisitBase === nextVisitBase) return null;
    return { name: "discovery_place_choice_changed" as const, properties: { entry_kind: kind,
      action: action.type === "choose-base" ? "choose_base" as const : "choose_visit_base" as const,
      shortlist_count: next.shortlistIds.length } };
  }
  return null;
}

export function discoveryConfirmedEvent(accepted: boolean, kind: DiscoveryEntryCategory, count: number) {
  return accepted ? { entry_kind: kind, shortlist_count: count } : null;
}

export function discoveryDismissedEvent(accepted: boolean, kind: DiscoveryEntryCategory, action: "closed" | "finish_later", count: number) {
  return accepted ? { entry_kind: kind, action, shortlist_count: count } : null;
}
