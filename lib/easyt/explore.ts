import type { ActivityInventoryItem } from "./activity-inventory.ts";
import { activityInventoryIdentity, itineraryIdeaForActivityInventory } from "./activity-inventory.ts";
import { composeItineraryDay } from "./itinerary-day-composition.ts";
import { itineraryInterestAffinity, type ItineraryDiscoveryPlace } from "./itinerary-day-context.ts";
import { preferredItineraryDayPart } from "./itinerary-activity-placement.ts";
import { ideaStateForPlace, itineraryIdeaForLocalPlace, itineraryIdeaForPlace, validIdeaDays } from "./itinerary-ideas.ts";
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
  dayLabel: string;
  image?: string;
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
  rating?: number;
  reviewCount?: number;
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

export function exploreDestinationOptions(trip: Pick<EasyTTrip, "stops" | "planItems">): ExploreDestination[] {
  return [...trip.stops]
    .sort((left, right) => left.order - right.order)
    .flatMap((stop) => {
      const days = trip.planItems.filter((day) => day.stopId === stop.id).sort((left, right) => left.dayNumber - right.dayNumber);
      if (!days.length) return [];
      const firstDay = days[0]!.dayNumber;
      const lastDay = days.at(-1)!.dayNumber;
      const dayLabel = firstDay === lastDay ? `Day ${firstDay}` : `Days ${firstDay}–${lastDay}`;
      const image = trustedExploreImage(days.find((day) => day.image)?.image, "reviewed");
      return [{ id: stop.id, label: stop.name, country: stop.country, dayLabel, ...(image ? { image } : {}), stop }];
    });
}

export function exploreResultIdentity(input: Pick<ExploreResult, "stopId" | "provider" | "providerProductId" | "sourceId">) {
  return input.provider && input.providerProductId
    ? `stop:${input.stopId}:provider:${input.provider}:${input.providerProductId}`
    : `stop:${input.stopId}:place:${input.sourceId}`;
}

const technicalImageRole = /(?:^|[\s/_.-])(?:route[-_ ]?map|map|diagram|floor[-_ ]?plan|plan|screenshot|screen[-_ ]?shot|schematic|chart)(?:[\s/_.-]|$)/i;
const reviewedImageHosts = /(?:^|\.)(?:images\.unsplash\.com|unsplash\.com|upload\.wikimedia\.org|thumb\.wikimedia\.org|wikimedia\.org|tacdn\.com|tripadvisor\.com)$/i;

export function trustedExploreImage(value: string | null | undefined, source: "provider" | "reviewed" = "reviewed") {
  if (!value || value !== value.trim() || technicalImageRole.test(value)) return undefined;
  if (value.startsWith("/") && !value.startsWith("//")) return value;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return undefined;
    return source === "provider" || reviewedImageHosts.test(url.hostname) ? value : undefined;
  } catch {
    return undefined;
  }
}

export function conciseExploreDescription(value: string | null | undefined) {
  const text = value?.replace(/\s+/g, " ").trim();
  if (!text) return undefined;
  const sentences = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g)?.map((sentence) => sentence.trim()).filter(Boolean) ?? [];
  const concise = sentences.slice(0, 2).join(" ");
  if (concise.length <= 260) return concise;
  const clipped = concise.slice(0, 257).replace(/\s+\S*$/, "").trim();
  return clipped ? `${clipped}…` : undefined;
}

export function exploreDiscoveryCategory(title: string, sourceType: string, description = "") {
  const explicit = normal(sourceType);
  const text = `${title} ${sourceType} ${description}`.toLocaleLowerCase();
  if (/museum/.test(explicit) || /\bmuseum\b/.test(title.toLocaleLowerCase())) return "Museum";
  if (/archaeological|ruins/.test(explicit) || /archaeological|\bruins?\b/.test(text)) return "Historic site";
  if (/historic/.test(explicit)) return "Historic site";
  if (/restaurant|cafe|food/.test(explicit)) return explicit.includes("restaurant") ? "Restaurant" : "Food";
  if (/market/.test(explicit) || /\bmarket\b/.test(title.toLocaleLowerCase())) return "Market";
  if (/beach/.test(explicit) || /\bbeach\b/.test(title.toLocaleLowerCase())) return "Beach";
  if (/hike|trail/.test(explicit)) return "Hike";
  if (/viewpoint|observatory/.test(explicit) || /viewpoint|observatory/.test(title.toLocaleLowerCase())) return "Viewpoint";
  if (/neighbou?rhood|quarter/.test(explicit)) return "Neighbourhood";
  if (/park|garden|mountain|lake|forest|nature/.test(explicit)) return "Nature";
  if (/square|plaza|piazza|palace|cathedral|church|monastery|temple|castle|fortress|monument|tower|bridge|landmark/.test(explicit)
    || /\b(?:square|plaza|piazza|palace|cathedral|church|monastery|temple|castle|fortress|monument|tower|bridge)\b/.test(title.toLocaleLowerCase())) return "Landmark";
  if (/gallery|theatre|theater|culture|cultural/.test(explicit)) return "Culture";
  return "Place";
}

const rejectedExploreEntity = /\b(?:country|continent|macro[- ]?region|administrative|admin(?:istration)?|state|province|county|municipality|metropolitan area|electoral district|transport hub|airport|railway station|train station|bus station|metro station|rapid transit|disambiguation|wikipedia article)\b/i;
const usefulExploreEntity = /\b(?:attraction|landmark|museum|archaeological|historic|neighbou?rhood|quarter|viewpoint|park|garden|beach|natural area|hike|trail|market|restaurant|cafe|tour|experience|ticket|boat trip|day trip)\b/i;

export function exploreResultEligible(trip: Pick<EasyTTrip, "stops">, result: ExploreResult) {
  if (result.kind === "restaurant" || result.kind === "tour" || result.idea.source === "traveller-visit-intent") return true;
  const stop = trip.stops.find((candidate) => candidate.id === result.stopId);
  if (!stop) return false;
  if (normal(result.title) === normal(stop.name)) return false;
  if (usefulExploreEntity.test(`${result.category} ${result.tags.join(" ")}`)) return true;
  return !rejectedExploreEntity.test(`${result.category} ${result.tags.join(" ")}`);
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
    category: rejectedExploreEntity.test(place.type) && !usefulExploreEntity.test(place.type) ? place.type : exploreDiscoveryCategory(place.title, place.type, place.description),
    tags: [...place.tags],
    description: conciseExploreDescription(place.description),
    image: trustedExploreImage(place.image, "reviewed"),
    coordinates: place.coordinates,
    qualityScore: place.qualityScore,
    providerUrl: place.sourceUrl,
    idea,
  };
  return { ...result, identity: exploreResultIdentity(result) };
}

export function exploreResultForLocalPlace(stop: TripStop, place: ExploreLocalPlace): ExploreResult {
  const idea = itineraryIdeaForLocalPlace(stop.id, place);
  const result: ExploreResult = {
    identity: "",
    stopId: stop.id,
    sourceId: place.id,
    kind: "restaurant",
    title: place.name,
    location: place.address || stop.name,
    category: "Restaurant",
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
    category: /\b(?:ticket|admission|entry)\b/i.test(`${item.title} ${(item.tags ?? []).join(" ")}`) ? "Entry ticket" : /\bday trip\b/i.test(`${item.title} ${(item.tags ?? []).join(" ")}`) ? "Day trip" : "Tour",
    tags: [...(item.tags ?? [])],
    description: conciseExploreDescription(item.description),
    image: trustedExploreImage(item.image, "provider"),
    duration: activityDurationLabel(item.duration),
    price: activityPriceLabel(item.price),
    rating: item.rating,
    reviewCount: item.reviewCount,
    qualityScore: item.rating !== undefined ? Math.round(item.rating * 2 + Math.min(5, Math.log10((item.reviewCount ?? 0) + 1))) : undefined,
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
    image: trustedExploreImage(idea.image, idea.provider ? "provider" : "reviewed"),
    coordinates: idea.coordinates,
    duration,
    price,
    rating: idea.providerMetadata?.rating,
    reviewCount: idea.providerMetadata?.reviewCount,
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
  const scoped = results.filter((result) => exploreResultEligible(trip, result) && (destinationId === "all" || result.stopId === destinationId));
  const matching = scoped.filter((result) => categoryMatches(result, category));
  const interests = tripIntentForTrip(trip).preferences.interests;
  const ranked = matching.map((result, index) => {
    const affinity = itineraryInterestAffinity({
      title: result.title,
      type: result.category,
      tags: result.tags,
      description: result.description ?? "",
    }, interests);
    return { result, index, score: (result.qualityScore ?? Math.max(0, 12 - index)) + affinity.score };
  }).sort((left, right) => right.score - left.score || left.index - right.index).map(({ result }) => result);
  if (category !== "for-you" && category !== "must-see") return ranked;
  const organic = ranked.filter((result) => !result.providerProductId);
  const commercial = ranked.filter((result) => result.providerProductId);
  if (!organic.length || !commercial.length) return ranked;
  const mixed: ExploreResult[] = [];
  let organicIndex = 0;
  let commercialIndex = 0;
  while (organicIndex < organic.length || commercialIndex < commercial.length) {
    mixed.push(...organic.slice(organicIndex, organicIndex + 2));
    organicIndex += 2;
    if (commercialIndex < commercial.length) mixed.push(commercial[commercialIndex++]!);
  }
  return mixed;
}

export function exploreScheduleTarget(trip: EasyTTrip, result: ExploreResult, requestedDayNumber?: number | null) {
  const days = validIdeaDays(trip, result.stopId);
  const requested = requestedDayNumber ? days.find((day) => day.dayNumber === requestedDayNumber) : undefined;
  const opportunity = exploreOpportunityForTrip(trip, result.stopId);
  const day = requested ?? (days.length === 1 ? days[0] : opportunity?.day);
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
