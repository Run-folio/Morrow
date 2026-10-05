import { legacyItineraryIdeas, type EasyTTrip, type ItineraryIdea } from "./trip.ts";

export type ItineraryAddSource = "manual" | "suggestion" | "viator" | "food_place";

/** Classify the planning source without passing provider or place details to analytics. */
export function itineraryAddSourceForIdea(idea: ItineraryIdea): Exclude<ItineraryAddSource, "manual"> {
  if (idea.provider === "viator") return "viator";
  if (idea.category === "restaurant") return "food_place";
  return "suggestion";
}

/** A saved-to-planned transition counts; an existing planned item's move does not. */
export function newlyScheduledItineraryIdea(before: EasyTTrip, after: EasyTTrip, idea: ItineraryIdea): boolean {
  const sameProduct = (candidate: ItineraryIdea) => candidate.id === idea.id
    || Boolean(idea.provider && idea.providerProductId
      && candidate.stopId === idea.stopId && candidate.provider === idea.provider
      && candidate.providerProductId === idea.providerProductId);
  const previouslyPlanned = legacyItineraryIdeas(before.brief.itineraryIdeas)
    .some((candidate) => sameProduct(candidate) && Boolean(candidate.dayId));
  if (previouslyPlanned) return false;
  const scheduled = legacyItineraryIdeas(after.brief.itineraryIdeas)
    .find((candidate) => candidate.id === idea.id && candidate.stopId === idea.stopId);
  return Boolean(scheduled?.dayId && after.planItems.some((day) => day.id === scheduled.dayId && day.stopId === idea.stopId));
}
