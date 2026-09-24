import { discoveryPlacesForMention, type DiscoveryPlace } from "./discovery-content.ts";
import { discoveryDirectionsForPlaces, type DiscoveryDirection } from "./discovery-directions.ts";
import type { DiscoveryDraft } from "./discovery-draft.ts";
import type { ResolvedPlaceMention } from "./place-intelligence.ts";

export type DiscoveryProjectionContext = {
  durationDays?: number;
  interests: string[];
  existingPlaceIds: string[];
};

export type DiscoveryProjection = {
  /** Full evidenced collection, ordered for browsing. */
  places: DiscoveryPlace[];
  directions: DiscoveryDirection[];
  visiblePlaceIds: string[];
  /** A conservative, noncommittal proposal; it never edits the draft. */
  recommendedIds: string[];
  totalEligible: number;
  counts: { source: number; eligible: number; ranked: number; displayed: number };
  rejected: Array<{ id: string; reason: string }>;
};

export function discoveryPlaceScore(place: DiscoveryPlace, context: DiscoveryProjectionContext, anchorId?: string): number {
  let score = place.id === anchorId ? 100 : 0;
  if (context.existingPlaceIds.includes(place.id)) score += 12;
  score += place.tags.filter(tag => context.interests.includes(tag)).length * 15;
  score += Math.min(3, place.relevance.sources.length) * 3;
  if (place.stayEvidence.length) score += 2;
  if (place.accessEvidence.length) score += 1;
  return score;
}

function rejectionReason(place: DiscoveryPlace): string | null {
  if (!place.id || place.id.startsWith("route-base:")) return "noncanonical-id";
  if (!place.name.trim() || !place.country.trim()) return "missing-identity";
  if (!place.coordinates || place.coordinates.length !== 2 || !place.coordinates.every(Number.isFinite)
    || Math.abs(place.coordinates[0]) > 180 || Math.abs(place.coordinates[1]) > 90) return "invalid-geography";
  if (!place.relevance.en.trim() || !place.relevance.es.trim() || !place.relevance.sources.length
    || place.relevance.sources.some(source => !source.url?.startsWith("https://") || !source.reviewedAt || !source.supports.trim()))
    return "missing-reviewed-relevance";
  return null;
}

function rankPlaces(places: DiscoveryPlace[], context: DiscoveryProjectionContext, anchorId?: string): DiscoveryPlace[] {
  const remaining = [...places];
  const ranked: DiscoveryPlace[] = [];
  const groupCounts = new Map<string, number>();
  while (remaining.length) {
    remaining.sort((a, b) => {
      const aScore = discoveryPlaceScore(a, context, anchorId) - (groupCounts.get(a.group) ?? 0) * 2;
      const bScore = discoveryPlaceScore(b, context, anchorId) - (groupCounts.get(b.group) ?? 0) * 2;
      return bScore - aScore || a.id.localeCompare(b.id);
    });
    const next = remaining.shift()!;
    ranked.push(next);
    groupCounts.set(next.group, (groupCounts.get(next.group) ?? 0) + 1);
  }
  return ranked;
}

export function projectDiscovery(input: {
  mention: ResolvedPlaceMention;
  draft: DiscoveryDraft;
  context: DiscoveryProjectionContext;
  evidence?: { places: readonly DiscoveryPlace[]; directions: readonly DiscoveryDirection[] };
}): DiscoveryProjection {
  const { mention, draft, context, evidence } = input;
  const source = evidence?.places ?? discoveryPlacesForMention(mention);
  const rejected: DiscoveryProjection["rejected"] = [];
  const seen = new Set<string>();
  const eligible = source.filter(place => {
    const reason = rejectionReason(place) ?? (seen.has(place.id) ? "duplicate-id" : null);
    if (reason) {
      rejected.push({ id: place.id, reason });
      return false;
    }
    seen.add(place.id);
    return true;
  });
  const places = rankPlaces(eligible, context, mention.canonicalPlaceId);
  const eligibleById = new Map(places.map(place => [place.id, place]));
  const candidateDirections = evidence?.directions ?? discoveryDirectionsForPlaces(places);
  const directions = candidateDirections.flatMap(direction => {
    const placeIds = [...new Set(direction.placeIds)].filter(id => eligibleById.get(id)?.groupIds.includes(direction.id));
    return placeIds.length >= 3 ? [{ ...direction, placeIds }] : [];
  });
  const selectedDirection = directions.find(direction => direction.id === draft.directionId);
  const visiblePlaceIds = places
    .filter(place => !selectedDirection || selectedDirection.placeIds.includes(place.id))
    .slice(0, 6).map(place => place.id);
  // Unknown duration permits a single tentative base, never a fit claim.
  // A known longer window may show two possibilities; route review still owns feasibility.
  const recommendationLimit = mention.placeType === "continent" || mention.placeType === "macro_region"
    ? 0 : context.durationDays !== undefined && context.durationDays >= 14 ? 2 : 1;
  const recommendedIds = places.filter(place => place.actionability === "overnight-base"
    && place.stayEvidence.length > 0
    && !context.existingPlaceIds.includes(place.id)
    && !draft.removedIds.includes(place.id))
    .slice(0, recommendationLimit).map(place => place.id);
  return {
    places, directions, visiblePlaceIds, recommendedIds, totalEligible: eligible.length,
    counts: { source: source.length, eligible: eligible.length, ranked: places.length, displayed: visiblePlaceIds.length },
    rejected,
  };
}
