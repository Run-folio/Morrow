import type { DiscoveryActionability } from "./discovery-content.ts";
import { discoveryConfirmationChoiceForId } from "./discovery-confirmation.ts";
import { resolveDiscoveryBaseChoice, type DiscoveryDraft } from "./discovery-draft.ts";
import type { DiscoveryProjection } from "./discovery-projection.ts";

export type DiscoveryReviewChoice = {
  id: string;
  name: string;
  role: DiscoveryActionability | null;
  existing: boolean;
  outsideDirection: boolean;
  confirmable: boolean;
};

/** Shared, fail-closed presentation and confirmation state. Browsing direction is not a route constraint. */
export function discoveryReviewState(mentionId: string, draft: DiscoveryDraft, projection: DiscoveryProjection,
  existingPlaceIds: readonly string[] = []) {
  const places = new Map(projection.places.map(place => [place.id, place]));
  const direction = projection.directions.find(item => item.id === draft.directionId);
  const missingDirection = Boolean(draft.directionId && !direction);
  const { baseId, conflict } = resolveDiscoveryBaseChoice(draft, mentionId);
  const base = baseId ? places.get(baseId) : null;
  const choices: DiscoveryReviewChoice[] = draft.shortlistIds.map(id => {
    const place = places.get(id);
    return {
      id,
      name: place?.name ?? id,
      role: place?.actionability ?? null,
      existing: existingPlaceIds.includes(id),
      outsideDirection: Boolean(direction && !direction.placeIds.includes(id)),
      confirmable: place?.actionability === "overnight-base"
        && !("reason" in discoveryConfirmationChoiceForId(id, projection)),
    };
  });
  const baseConfirmable = Boolean(base && base.actionability === "overnight-base"
    && !("reason" in discoveryConfirmationChoiceForId(baseId!, projection)));
  return {
    choices,
    base: baseId ? { id: baseId, name: base?.name ?? baseId, confirmable: baseConfirmable,
      existing: existingPlaceIds.includes(baseId) } : null,
    hasOutsideDirection: choices.some(choice => choice.outsideDirection),
    hasUnresolvedChoices: conflict || missingDirection || choices.some(choice => !choice.confirmable) || Boolean(baseId && !baseConfirmable),
    canConfirm: !conflict && !missingDirection && (choices.length > 0 || Boolean(baseId))
      && choices.every(choice => choice.confirmable)
      && (!baseId || baseConfirmable),
  };
}
