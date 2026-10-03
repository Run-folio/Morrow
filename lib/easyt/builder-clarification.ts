import type { CuratedRouteKnowledge } from "./curated-route-knowledge.ts";
import type { ResolvedPlaceMention } from "./place-intelligence.ts";
import type { PublicRoutePlanDraft } from "./public-route.ts";
import type { StructuredTripBrief } from "./structured-trip-brief.ts";

type ReviewedRouteStop = {
  id: string;
  name: string;
  country: string;
  canonicalPlaceId?: string;
  coordinates?: readonly [number, number];
};

/** A reviewed regional stop can satisfy its route-level decision without
 * pretending that the region is a town or inventing a more precise base. */
export function reviewedRouteStopSatisfiesMention({
  mention, brief, stops, sourceRouteKey, curatedRoute, reviewedDraft,
}: {
  mention: ResolvedPlaceMention;
  brief: StructuredTripBrief;
  stops: readonly ReviewedRouteStop[];
  sourceRouteKey?: string;
  curatedRoute?: CuratedRouteKnowledge;
  reviewedDraft?: PublicRoutePlanDraft;
}): boolean {
  if (!sourceRouteKey || !curatedRoute || !reviewedDraft
    || sourceRouteKey !== curatedRoute.routeKey || sourceRouteKey !== reviewedDraft.routeKey
    || curatedRoute.reviewedAt !== reviewedDraft.curatedRoute?.reviewedAt
    || mention.status !== "resolved" || !mention.canonicalPlaceId
    || (mention.routability !== "planning_area" && mention.routability !== "needs_base_selection")) return false;
  const issues = (brief.placeIssues ?? []).filter((issue) => issue.mentionId === mention.mentionId);
  if (issues.some((issue) => issue.code !== "region_requires_base" || issue.blocksRoute)) return false;
  const destination = brief.destinations.find((item) => item.placeMentionId === mention.mentionId
    && item.canonicalPlaceId === mention.canonicalPlaceId);
  if (!destination?.id) return false;
  const index = curatedRoute.canonicalStopIds.indexOf(destination.id);
  if (index < 0) return false;
  const expected = reviewedDraft.destinations[index];
  const reviewed = curatedRoute.stops[index];
  const actual = stops[index];
  // Account canonicalization prefixes trip-owned stop IDs while preserving the
  // original occurrence ID. Both the brief and reviewed snapshot must agree.
  const sameOccurrence = expected && (destination.id === expected.id || destination.id.endsWith(`-stop-${expected.id}`));
  return Boolean(expected && reviewed && actual
    && sameOccurrence && reviewed.stopId === destination.id && actual.id === destination.id
    && expected.name === reviewed.name && actual.name === expected.name && destination.name === expected.name
    && expected.country === reviewed.country && actual.country === expected.country
    && expected.canonicalPlaceId === reviewed.canonicalPlaceId
    && actual.canonicalPlaceId === expected.canonicalPlaceId
    && mention.canonicalPlaceId === expected.canonicalPlaceId
    && actual.coordinates?.[0] === expected.coordinates[0]
    && actual.coordinates?.[1] === expected.coordinates[1]);
}

export type BuilderClarificationTarget = {
  id: string;
  order: number;
};

export type BuilderClarificationSelectionOwnership = {
  mentionId: string;
  routeStopId?: string;
};

export type BuilderClarificationRemovalPlan = {
  ownershipKnown: boolean;
  removableStopIds: string[];
  preservedStopIds: string[];
};

export function orderedBuilderClarificationIds(targets: readonly BuilderClarificationTarget[]) {
  return [...targets]
    .sort((left, right) => left.order - right.order)
    .filter((target, index, all) => all.findIndex((candidate) => candidate.id === target.id) === index)
    .map((target) => target.id);
}

export function shouldAutoOpenBuilderClarification({
  hydrated,
  placesStep,
  arrivedFromHomepage,
  resolving,
  itemCount,
  alreadyOpened,
  explicitlyDismissed,
  competingModal,
  recoveryBlocked,
}: {
  hydrated: boolean;
  placesStep: boolean;
  arrivedFromHomepage: boolean;
  resolving: boolean;
  itemCount: number;
  alreadyOpened: boolean;
  explicitlyDismissed: boolean;
  competingModal: boolean;
  recoveryBlocked: boolean;
}) {
  return hydrated
    && placesStep
    && arrivedFromHomepage
    && !resolving
    && itemCount > 0
    && !alreadyOpened
    && !explicitlyDismissed
    && !competingModal
    && !recoveryBlocked;
}

export function builderClarificationProgress(index: number, total: number) {
  const safeTotal = Math.max(1, total);
  return `${Math.min(Math.max(0, index), safeTotal - 1) + 1} of ${safeTotal}`;
}

export function builderClarificationResumeLabel(count: number) {
  return count === 1 ? "1 area still needs shaping" : `${count} areas still need shaping`;
}

/**
 * Removing a planning parent is allowed to cascade only to route stops whose
 * sole canonical relationship is that parent. Protected or independently
 * referenced stops remain in the route; stale ownership fails closed.
 */
export function builderClarificationRemovalPlan({
  mentionId,
  selections,
  existingStopIds,
  protectedStopIds = [],
  independentStopIds = [],
}: {
  mentionId: string;
  selections: readonly BuilderClarificationSelectionOwnership[];
  existingStopIds: readonly string[];
  protectedStopIds?: readonly string[];
  independentStopIds?: readonly string[];
}): BuilderClarificationRemovalPlan {
  const existing = new Set(existingStopIds);
  const protectedIds = new Set(protectedStopIds);
  const independentIds = new Set(independentStopIds);
  const parentStopIds = [...new Set(selections
    .filter((selection) => selection.mentionId === mentionId)
    .flatMap((selection) => selection.routeStopId ? [selection.routeStopId] : []))];
  if (parentStopIds.some((stopId) => !existing.has(stopId))) {
    return { ownershipKnown: false, removableStopIds: [], preservedStopIds: parentStopIds };
  }
  const removableStopIds: string[] = [];
  const preservedStopIds: string[] = [];
  parentStopIds.forEach((stopId) => {
    const shared = selections.some((selection) => selection.mentionId !== mentionId && selection.routeStopId === stopId);
    if (shared || protectedIds.has(stopId) || independentIds.has(stopId)) preservedStopIds.push(stopId);
    else removableStopIds.push(stopId);
  });
  return { ownershipKnown: true, removableStopIds, preservedStopIds };
}

/** Discovery owns inline save/retry feedback; competing dialogs still retain precedence. */
export function shouldYieldBuilderClarification(input: {
  discoveryDraftOpen: boolean;
  saveBlocked: boolean;
  competingModal: boolean;
}) {
  return input.competingModal || (input.saveBlocked && !input.discoveryDraftOpen);
}
