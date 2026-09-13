import { discoveryVisitorRelevance } from "./discovery-quality.ts";
import { exploreResultEligible, exploreResultState, type ExploreResult } from "./explore.ts";
import { composeItineraryDay } from "./itinerary-day-composition.ts";
import { itineraryInterestAffinity } from "./itinerary-day-context.ts";
import { activityDurationBounds, isFullDayActivity } from "./itinerary-schedule-awareness.ts";
import { tripIntentForTrip, type EasyTTrip, type ItineraryDayPart, type PlanItem } from "./trip.ts";

function baseQuality(result: ExploreResult, index: number) {
  return result.qualityScore ?? Math.max(0, 12 - index);
}

/**
 * Explore quality remains the admission boundary. Itinerary-specific context
 * then adjusts comparable candidates without giving commercial inventory a
 * status boost or fabricating time suitability.
 */
export function rankItineraryRecommendations(
  trip: EasyTTrip,
  day: PlanItem,
  results: readonly ExploreResult[],
  selectedDayPart: ItineraryDayPart | null = null,
) {
  const composition = composeItineraryDay(trip, day.id);
  const fitDayPart = selectedDayPart
    ?? (composition?.freeDayParts.length === 1 ? composition.freeDayParts[0]! : null);
  const plannedCount = composition
    ? composition.unslotted.length + Object.values(composition.planned).flat().length
    : day.notes.length;
  const interests = tripIntentForTrip(trip).preferences.interests;
  const scored = results.flatMap((result, index) => {
    if (!exploreResultEligible(trip, result)) return [];
    const relevance = discoveryVisitorRelevance({
      title: result.title,
      category: result.category,
      tags: result.tags,
      description: result.description,
      qualityScore: result.qualityScore,
      kind: result.kind,
    });
    if (!relevance.eligible) return [];
    if (exploreResultState(trip, result).state === "planned") return [];
    const affinity = itineraryInterestAffinity({
      title: result.title,
      type: result.category,
      tags: result.tags,
      description: result.description ?? "",
    }, interests);
    const duration = result.idea.providerMetadata?.duration;
    const bounds = activityDurationBounds(duration);
    let fit = 0;
    if (fitDayPart === "evening" && isFullDayActivity(duration)) fit -= 14;
    if (plannedCount >= 2 && isFullDayActivity(duration)) fit -= 9;
    if (plannedCount === 0 && isFullDayActivity(duration)) fit += 1;
    if (fitDayPart === "evening" && bounds?.maximumMinutes !== undefined && bounds.maximumMinutes <= 180) fit += 2;
    const saved = exploreResultState(trip, result).state === "saved" ? 1 : 0;
    return [{ result, index, score: baseQuality(result, index) + relevance.scoreAdjustment + affinity.score + fit + saved }];
  });
  const remaining = [...scored];
  const ranked: ExploreResult[] = [];
  const categoryCounts = new Map<string, number>();
  while (remaining.length) {
    remaining.sort((left, right) => {
      const leftAdjusted = left.score - (categoryCounts.get(left.result.category) ?? 0) * 2;
      const rightAdjusted = right.score - (categoryCounts.get(right.result.category) ?? 0) * 2;
      return rightAdjusted - leftAdjusted || left.index - right.index;
    });
    const next = remaining.shift()!;
    ranked.push(next.result);
    categoryCounts.set(next.result.category, (categoryCounts.get(next.result.category) ?? 0) + 1);
  }
  return ranked;
}
