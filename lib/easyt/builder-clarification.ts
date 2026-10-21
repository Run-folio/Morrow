import type { CuratedRouteKnowledge } from "./curated-route-knowledge.ts";
import type { ResolvedPlaceMention } from "./place-intelligence.ts";
import type { PublicRoutePlanDraft } from "./public-route.ts";
import type { StructuredTripBrief } from "./structured-trip-brief.ts";
import type { CanonicalEasyTTrip } from "./trip.ts";
import { authoredContentKey } from "./trip-retained-authored-content.ts";
import { geographicallyReady, stopGeographicPlace } from "./geographic-binding.ts";

export function builderMentionHasVerifiedOccurrence(trip: CanonicalEasyTTrip, mention: ResolvedPlaceMention): boolean {
  if (mention.status!=='resolved' || mention.routability!=='direct_destination') return false;
  if (mention.role==='origin' || mention.role==='fixed_start') return geographicallyReady(trip.brief.intent.route.origin,'endpoint');
  if (mention.role==='fixed_end') {
    const end=trip.brief.intent.route.journeyEnd;
    return end.mode==='explicit' && geographicallyReady(end.place,'endpoint');
  }
  const intent=trip.brief.intent.route.destinations.find(item=>item.id===mention.mentionId);
  if (intent?.kind!=='overnight_place' || intent.resolution!=='resolved' || intent.stopIds.length!==1) return false;
  const stop=trip.stops.find(item=>item.id===intent.stopIds[0]);
  return Boolean(stop && geographicallyReady(stopGeographicPlace(stop)));
}

/** Only a previous provider session proves that an absent intent was retired.
 * Newly authored transient planning mentions can legitimately precede intent. */
export function retiredProviderClarificationIds<T extends {
  mention: ResolvedPlaceMention;
  scope?: {tripId:string;ownerId:string|null};
}>(entries: readonly T[], trip: CanonicalEasyTTrip|undefined, tripId:string, ownerId:string|null): Set<string> {
  if (!trip || trip.id!==tripId) return new Set();
  return new Set(entries.filter(entry=>!['origin','fixed_start','fixed_end'].includes(entry.mention.role)
    && (!entry.scope || entry.scope.tripId===tripId && entry.scope.ownerId===ownerId)
    && trip.brief.structuredBrief?.placeMentions?.some(source=>source.mentionId===entry.mention.mentionId
      && authoredContentKey(source)===authoredContentKey(entry.mention))
    && !trip.brief.intent.route.destinations.some(intent=>intent.id===entry.mention.mentionId))
    .map(entry=>entry.mention.mentionId));
}

/** Transient lookup results cannot outlive their current authored occurrence. */
export function currentProviderClarifications<T extends {
  mention: ResolvedPlaceMention;
  scope?: {tripId:string;ownerId:string|null};
}>(entries: readonly T[], context: {
  trip?: CanonicalEasyTTrip;
  tripId: string;
  ownerId: string|null;
  activeMentions: readonly ResolvedPlaceMention[];
}): T[] {
  return entries.filter(entry => {
    if (entry.scope && (entry.scope.tripId !== context.tripId || entry.scope.ownerId !== context.ownerId)) return false;
    const active=context.activeMentions.find(mention=>mention.mentionId===entry.mention.mentionId);
    if (!active || authoredContentKey(active)!==authoredContentKey(entry.mention)) return false;
    if (!context.trip) return true;
    if (context.trip.id!==context.tripId || context.trip.brief.structuredBrief?.removedPlaceMentionIds?.includes(entry.mention.mentionId)) return false;
    const source=context.trip.brief.structuredBrief?.placeMentions?.find(mention=>mention.mentionId===entry.mention.mentionId);
    if (!source || authoredContentKey(source)!==authoredContentKey(entry.mention)) return false;
    if (builderMentionHasVerifiedOccurrence(context.trip,source)) return false;
    if (['origin','fixed_start','end','fixed_end'].includes(source.role)) return true;
    const intent=context.trip.brief.intent.route.destinations.find(item=>item.id===source.mentionId);
    if (!intent) return false;
    // A failed optional enrichment cannot invalidate an independently verified
    // settlement already accepted into this occurrence. Unresolved identity is
    // deliberately excluded from this completion rule.
    return true;
  });
}

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
