import type { ActivityInventoryItem } from "./activity-inventory.ts";
import { activityInventoryIdentity, itineraryIdeaForActivityInventory } from "./activity-inventory.ts";
import { composeItineraryDay } from "./itinerary-day-composition.ts";
import { itineraryInterestAffinity, type ItineraryDiscoveryPlace } from "./itinerary-day-context.ts";
import { preferredItineraryDayPart } from "./itinerary-activity-placement.ts";
import { ideaStateForPlace, itineraryIdeaForPlace, preferredItineraryIdeaDay, validIdeaDays } from "./itinerary-ideas.ts";
import { tripIntentForTrip, type EasyTTrip, type ItineraryDayPart, type ItineraryIdea, type PlanItem, type TripStop } from "./trip.ts";
import type { TripInterest } from "./trip-interest.ts";

export const exploreCategories = ["for-you", "must-see", "food", "tours", "day-trips", "outdoors"] as const;
export type ExploreCategory = typeof exploreCategories[number];

export const exploreCategoryLabels: Record<ExploreCategory, string> = {
  "for-you": "For you",
  "must-see": "Must-see",
  food: "Food",
  tours: "Tours",
  "day-trips": "Day trips",
  outdoors: "Outdoors",
};

export type ExploreDestination = {
  id: string;
  label: string;
  country: string;
  stop: TripStop;
};

export type ExploreLocalPlace = {
  id: string;
  name: string;
  address: string;
  category: string;
  coordinates: [number, number];
  mapsUrl: string;
  provider: "google-places" | "openstreetmap";
  rating?: number;
  priceLevel?: string;
};

export type ExploreResult = {
  identity: string;
  stopId: string;
  sourceId: string;
  kind: "activity" | "restaurant" | "tour";
  title: string;
  location: string;
  category: string;
  tags: string[];
  description?: string;
  image?: string;
  coordinates?: [number, number];
  duration?: string;
  price?: string;
  qualityScore?: number;
  provider?: string;
  providerProductId?: string;
  providerUrl?: string;
  idea: ItineraryIdea;
};

export type ExploreResultState =
  | { state: "available"; idea: null; day: null }
  | { state: "saved"; idea: ItineraryIdea; day: null }
  | { state: "planned"; idea: ItineraryIdea; day: PlanItem };

function normal(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

export function exploreDestinationOptions(trip: Pick<EasyTTrip, "stops">): ExploreDestination[] {
  const seen = new Set<string>();
  return [...trip.stops]
    .sort((left, right) => left.order - right.order)
    .flatMap((stop) => {
      const key = stop.canonicalPlaceId ? `canonical:${stop.canonicalPlaceId}` : `named:${normal(stop.name)}:${normal(stop.country)}`;
      if (seen.has(key)) return [];
      seen.add(key);
      return [{ id: stop.id, label: stop.name, country: stop.country, stop }];
    });
}

export function exploreResultIdentity(input: Pick<ExploreResult, "provider" | "providerProductId" | "sourceId">) {
  return input.provider && input.providerProductId
    ? `provider:${input.provider}:${input.providerProductId}`
    : `place:${input.sourceId}`;
}

export function exploreResultForPlace(stop: TripStop, place: ItineraryDiscoveryPlace, interests: readonly TripInterest[] = []): ExploreResult {
  const affinity = itineraryInterestAffinity(place, interests);
  const idea = itineraryIdeaForPlace({
    stopId: stop.id,
    place,
    reasons: [
      ...(place.qualityScore && place.qualityScore > 0 ? ["destination-significance" as const] : []),
      ...(affinity.matchedInterests.length ? ["interest-relevance" as const] : []),
    ],
  });
  const kind = idea.category === "restaurant" ? "restaurant" : "activity";
  const result: ExploreResult = {
    identity: "",
    stopId: stop.id,
    sourceId: place.id,
    kind,
    title: place.title,
    location: place.area || stop.name,
    category: place.type,
    tags: [...place.tags],
    description: place.description,
    image: place.image,
    coordinates: place.coordinates,
    qualityScore: place.qualityScore,
    providerUrl: place.sourceUrl,
    idea,
  };
  return { ...result, identity: exploreResultIdentity(result) };
}

export function exploreResultForLocalPlace(stop: TripStop, place: ExploreLocalPlace): ExploreResult {
  const idea: ItineraryIdea = {
    id: `idea-${stop.id}-${place.id.replace(/[^a-z0-9_-]+/gi, "-")}`,
    stopId: stop.id,
    placeId: place.id,
    title: place.name,
    category: "restaurant",
    coordinates: place.coordinates,
    area: place.address || stop.name,
    placeType: place.category,
    description: undefined,
    sourceUrl: place.mapsUrl,
    source: "personalised-recommendation",
    reasons: [],
  };
  const result: ExploreResult = {
    identity: "",
    stopId: stop.id,
    sourceId: place.id,
    kind: "restaurant",
    title: place.name,
    location: place.address || stop.name,
    category: place.category.replaceAll("_", " "),
    tags: ["Food"],
    coordinates: place.coordinates,
    provider: place.provider,
    providerUrl: place.mapsUrl,
    idea,
  };
  return { ...result, identity: exploreResultIdentity(result) };
}

export function activityDurationLabel(duration: ActivityInventoryItem["duration"]) {
  if (!duration) return undefined;
  const from = duration.fixedMinutes ?? duration.fromMinutes;
  if (!from) return undefined;
  const to = duration.toMinutes;
  const format = (minutes: number) => minutes >= 60
    ? `${Math.floor(minutes / 60)} hr${Math.floor(minutes / 60) === 1 ? "" : "s"}${minutes % 60 ? ` ${minutes % 60} min` : ""}`
    : `${minutes} min`;
  return to && to !== from ? `${format(from)}–${format(to)}` : format(from);
}

export function activityPriceLabel(price: ActivityInventoryItem["price"]) {
  if (!price) return undefined;
  try {
    return `From ${new Intl.NumberFormat("en-GB", { style: "currency", currency: price.currency, maximumFractionDigits: 0 }).format(price.amount)}`;
  } catch {
    return `From ${price.currency} ${price.amount}`;
  }
}

export function exploreResultForActivity(stop: TripStop, item: ActivityInventoryItem, trip: EasyTTrip): ExploreResult {
  const interests = tripIntentForTrip(trip).preferences.interests;
  const idea = itineraryIdeaForActivityInventory(stop.id, item, interests);
  const result: ExploreResult = {
    identity: "",
    stopId: stop.id,
    sourceId: activityInventoryIdentity(item),
    kind: "tour",
    title: item.title,
    location: item.destination.label || stop.name,
    category: "Tour",
    tags: [...(item.tags ?? [])],
    image: item.image,
    duration: activityDurationLabel(item.duration),
    price: activityPriceLabel(item.price),
    provider: item.provider,
    providerProductId: item.providerProductId,
    providerUrl: item.productUrl,
    idea,
  };
  return { ...result, identity: exploreResultIdentity(result) };
}

export function exploreResultForIdea(trip: EasyTTrip, idea: ItineraryIdea): ExploreResult | null {
  const stop = trip.stops.find((candidate) => candidate.id === idea.stopId);
  if (!stop) return null;
  const kind = idea.provider === "viator" ? "tour" : idea.category === "restaurant" ? "restaurant" : "activity";
  const duration = activityDurationLabel(idea.providerMetadata?.duration);
  const price = activityPriceLabel(idea.providerMetadata?.price);
  const result: ExploreResult = {
    identity: "",
    stopId: idea.stopId,
    sourceId: idea.placeId,
    kind,
    title: idea.title,
    location: idea.area || stop.name,
    category: idea.placeType || (kind === "restaurant" ? "Food" : kind === "tour" ? "Tour" : "Activity"),
    tags: kind === "restaurant" ? ["Food"] : [],
    description: idea.description,
    image: idea.image,
    coordinates: idea.coordinates,
    duration,
    price,
    provider: idea.provider,
    providerProductId: idea.providerProductId,
    providerUrl: idea.sourceUrl,
    idea,
  };
  return { ...result, identity: exploreResultIdentity(result) };
}

export function dedupeExploreResults(results: readonly ExploreResult[]) {
  const seen = new Set<string>();
  return results.filter((result) => {
    if (seen.has(result.identity)) return false;
    seen.add(result.identity);
    return true;
  });
}

export function exploreResultState(trip: EasyTTrip, result: ExploreResult): ExploreResultState {
  return ideaStateForPlace(trip, result.stopId, result.idea.placeId);
}

function categoryMatches(result: ExploreResult, category: ExploreCategory) {
  const evidence = `${result.title} ${result.category} ${result.tags.join(" ")} ${result.description ?? ""}`;
  if (category === "for-you") return true;
  if (category === "must-see") return typeof result.qualityScore === "number" && result.qualityScore > 0;
  if (category === "food") return result.kind === "restaurant";
  if (category === "tours") return result.kind === "tour";
  if (category === "day-trips") return result.kind === "tour" && /\b(?:day trip|full[- ]day|half[- ]day|excursion)\b/i.test(evidence);
  return /\b(?:nature|outdoors?|park|garden|mountain|beach|lake|forest|trail|hike|hiking|coast|island)\b/i.test(evidence);
}

export function filterExploreResults(
  trip: EasyTTrip,
  results: readonly ExploreResult[],
  destinationId: string,
  category: ExploreCategory,
) {
  const scoped = results.filter((result) => destinationId === "all" || result.stopId === destinationId);
  const matching = scoped.filter((result) => categoryMatches(result, category));
  const interests = tripIntentForTrip(trip).preferences.interests;
  return matching.map((result, index) => {
    const affinity = itineraryInterestAffinity({
      title: result.title,
      type: result.category,
      tags: result.tags,
      description: result.description ?? "",
    }, interests);
    return { result, index, score: (result.qualityScore ?? Math.max(0, 12 - index)) + affinity.score };
  }).sort((left, right) => right.score - left.score || left.index - right.index).map(({ result }) => result);
}

export function exploreScheduleTarget(trip: EasyTTrip, result: ExploreResult, requestedDayNumber?: number | null) {
  const requested = requestedDayNumber
    ? validIdeaDays(trip, result.stopId).find((day) => day.dayNumber === requestedDayNumber)
    : undefined;
  const day = requested ?? preferredItineraryIdeaDay(trip, result.stopId);
  if (!day) return null;
  return {
    day,
    dayPart: preferredItineraryDayPart(trip, day.id, result.idea.category),
  };
}

export type ExploreOpportunity = {
  day: PlanItem;
  stop: TripStop;
  dayPart: ItineraryDayPart;
};

const opportunityPartOrder: ItineraryDayPart[] = ["afternoon", "midday", "morning", "evening"];

/** A free part means no scheduled canonical activity and no unslotted activity on an ordinary local day. */
export function exploreOpportunityForTrip(trip: EasyTTrip, destinationId = "all"): ExploreOpportunity | null {
  for (const day of [...trip.planItems].sort((left, right) => left.dayNumber - right.dayNumber)) {
    if (destinationId !== "all" && day.stopId !== destinationId) continue;
    if (day.type === "arrival" || day.type === "transport") continue;
    const stop = trip.stops.find((candidate) => candidate.id === day.stopId);
    const composition = composeItineraryDay(trip, day.id);
    if (!stop || !composition || composition.unslotted.length) continue;
    const dayPart = opportunityPartOrder.find((part) => composition.planned[part].length === 0);
    if (dayPart) return { day, stop, dayPart };
  }
  return null;
}
