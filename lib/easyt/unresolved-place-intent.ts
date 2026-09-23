import type { PlaceIssue, ResolvedPlaceMention } from "./place-intelligence.ts";
import type { EasyTTrip, TripRecommendation } from "./trip.ts";

const recoverableIssueCodes = new Set<PlaceIssue["code"]>([
  "unresolved_place",
  "ambiguous_place",
  "region_requires_base",
]);

export function placeIssueRepresentsUnresolvedIntent(issue: Pick<PlaceIssue, "blocksRoute" | "code">) {
  return issue.blocksRoute && recoverableIssueCodes.has(issue.code);
}

export type UnresolvedPlaceIntent = {
  mention: ResolvedPlaceMention;
  issue: PlaceIssue;
};

/**
 * Project recoverable place intent from the canonical structured brief.
 * This is deliberately not persisted as a second model: the original mention,
 * issue, selection and explicit-removal records remain the source of truth.
 */
export function unresolvedPlaceIntentsForTrip(trip: EasyTTrip): UnresolvedPlaceIntent[] {
  const brief = trip.brief.structuredBrief;
  if (!brief) return [];
  const removedMentionIds = new Set(brief.removedPlaceMentionIds ?? []);
  const routeStopIds = new Set(trip.stops.map((stop) => stop.id));
  const resolvedMentionIds = new Set((brief.placeSelections ?? [])
    .filter((selection) => selection.routeStopId && routeStopIds.has(selection.routeStopId))
    .map((selection) => selection.mentionId));
  const mentionById = new Map((brief.placeMentions ?? []).map((mention) => [mention.mentionId, mention]));
  const projectedMentionIds = new Set<string>();

  return (brief.placeIssues ?? []).flatMap((issue) => {
    if (!placeIssueRepresentsUnresolvedIntent(issue)
      || removedMentionIds.has(issue.mentionId)
      || resolvedMentionIds.has(issue.mentionId)
      || projectedMentionIds.has(issue.mentionId)) return [];
    const mention = mentionById.get(issue.mentionId);
    if (!mention) return [];
    projectedMentionIds.add(issue.mentionId);
    return [{ mention, issue }];
  });
}

export function recommendationIsRepresentedByUnresolvedPlaceIntent(
  recommendation: TripRecommendation,
  intents: readonly UnresolvedPlaceIntent[],
) {
  const proposedChange = recommendation.proposedChange;
  return proposedChange?.action === "resolve-place-intent"
    && typeof proposedChange.mentionId === "string"
    && intents.some((intent) => intent.mention.mentionId === proposedChange.mentionId);
}

/** Record only an explicit traveller dismissal in the canonical brief. */
export function dismissUnresolvedPlaceIntent(trip: EasyTTrip, mentionId: string): EasyTTrip {
  const brief = trip.brief.structuredBrief;
  if (!brief || !unresolvedPlaceIntentsForTrip(trip).some((intent) => intent.mention.mentionId === mentionId)) return trip;
  return {
    ...trip,
    brief: {
      ...trip.brief,
      structuredBrief: {
        ...brief,
        removedPlaceMentionIds: [...new Set([...(brief.removedPlaceMentionIds ?? []), mentionId])],
      },
    },
  };
}
