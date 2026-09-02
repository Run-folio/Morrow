import type { JourneyStop } from "../journey.ts";
import { mapRouteLegsFromTrip, type MapRouteLeg } from "./map-spatial-context.ts";
import { mappedPlacePinId } from "./map-place-itinerary.ts";
import { incomingLegForPlanItem, legForTransition, orderedTripPlanItems } from "./trip-facts.ts";
import { routeEndpointForLeg, stopEndpoint } from "./trip-legs.ts";
import { tripIntentForTrip, type CanonicalRouteEndpoint, type EasyTTrip, type PlanItem, type PlannerMapPin, type TripLeg } from "./trip.ts";
import { tripInterestLabels, type TripInterest } from "./trip-interest.ts";

export type ItineraryDiscoveryPlace = {
  id: string;
  title: string;
  area: string;
  type: string;
  tags: string[];
  description: string;
  image?: string;
  sourceUrl?: string;
  coordinates: [number, number];
  /** Existing provider/base relevance; interest affinity remains a small add-on. */
  qualityScore?: number;
};

export type ItineraryDayMapContext = {
  stops: JourneyStop[];
  legs: MapRouteLeg[];
  pins: PlannerMapPin[];
  selectedStopId: string;
  selectedLegId: string | null;
  selectedPlannerPinId: string | null;
  focusCoordinates: [number, number] | null;
};

const normalized = (value: string) => value.trim().replace(/\s+/g, " ").toLocaleLowerCase();

const activityInterestSignals: Record<TripInterest, RegExp> = {
  food: /\b(?:food|culinary|cooking|cookery|market|tastings?|wine|winery|brewery|gastronomy|restaurant|street food)\b/i,
  culture: /\b(?:museums?|galler(?:y|ies)|heritage|historic|historical|architecture|architectural|archaeolog(?:y|ical)|cathedral|church|temple|castle|palace|monument|cultural|theat(?:re|er)|art)\b/i,
  nature: /\b(?:parks?|wildlife|scenic|nature|natural|landmarks?|gardens?|forest|lake|waterfall|national park|botanical|zoo|aquarium)\b/i,
  cities: /\b(?:cities|city|neighbou?rhoods?|urban|walking tours?|viewpoints?|architecture|architectural|skyline|squares?|plazas?|towers?|bridges?)\b/i,
  beach: /\b(?:beaches|beach|coast|coastal|water activities|islands?|seaside|snorkel(?:ling|ing)?|surf(?:ing)?|kayak(?:ing)?|sailing|ocean|sea)\b/i,
  hiking: /\b(?:hikes?|hiking|trails?|trek(?:king|s)?|walking routes?|mountains?|outdoors?|footpaths?)\b/i,
};

function activityEvidenceText(place: Pick<ItineraryDiscoveryPlace, "title" | "type" | "tags" | "description">) {
  return [place.title, place.type, ...place.tags, place.description].join(" ");
}

/** Match only category/title/description evidence already present on the candidate. */
export function itineraryInterestAffinity(
  place: Pick<ItineraryDiscoveryPlace, "title" | "type" | "tags" | "description">,
  interests: readonly TripInterest[],
) {
  const evidence = activityEvidenceText(place);
  const matchedInterests = interests.filter((interest) => activityInterestSignals[interest].test(evidence));
  return {
    matchedInterests,
    // Enough to reorder comparable candidates, never enough to erase a large
    // provider/base-quality gap.
    score: matchedInterests.length ? Math.min(5, 2 + matchedInterests.length) : 0,
  };
}

export function rankItineraryDiscoveryPlaces(
  places: readonly ItineraryDiscoveryPlace[],
  interests: readonly TripInterest[],
) {
  if (!interests.length) return [...places];
  return places.map((place, index) => {
    const baseScore = place.qualityScore ?? Math.max(0, 12 - index);
    const affinity = itineraryInterestAffinity(place, interests);
    return { place, index, score: baseScore + affinity.score };
  }).sort((left, right) => right.score - left.score || left.index - right.index).map(({ place }) => place);
}

export function itineraryInterestReason(
  place: Pick<ItineraryDiscoveryPlace, "title" | "type" | "tags" | "description">,
  interests: readonly TripInterest[],
  language: "en" | "es" = "en",
) {
  const matches = itineraryInterestAffinity(place, interests).matchedInterests.slice(0, 2);
  if (!matches.length) return null;
  const labels = matches.map((interest) => tripInterestLabels[language][interest]);
  if (labels.length > 1) return language === "es" ? `Buena opción para ${labels.join(" + ")}` : `Good fit for ${labels.join(" + ")}`;
  return language === "es" ? `Coincide con tu interés en ${labels[0]}` : `Matches your ${labels[0]} interest`;
}

/** Provider/base evidence only. Unknown quality is neutral, never promoted as significance. */
export function destinationHighlightCandidates(places: readonly ItineraryDiscoveryPlace[]) {
  return places
    .map((place, index) => ({ place, index }))
    .filter(({ place }) => typeof place.qualityScore === "number" && place.qualityScore > 0)
    .sort((left, right) => (right.place.qualityScore ?? 0) - (left.place.qualityScore ?? 0) || left.index - right.index)
    .map(({ place }) => place);
}

/** Interest relevance is deliberately independent from destination significance. */
export function personalisedItineraryCandidates(
  places: readonly ItineraryDiscoveryPlace[],
  interests: readonly TripInterest[],
) {
  if (!interests.length) return [];
  return rankItineraryDiscoveryPlaces(
    places.filter((place) => itineraryInterestAffinity(place, interests).matchedInterests.length > 0),
    interests,
  );
}

function validCoordinates(value: [number, number] | null | undefined): value is [number, number] {
  return Boolean(value
    && Number.isFinite(value[0])
    && Number.isFinite(value[1])
    && value[0] >= -180
    && value[0] <= 180
    && value[1] >= -90
    && value[1] <= 90);
}

export function outgoingLegForPlanItem(
  trip: Pick<EasyTTrip, "planItems" | "legs">,
  item: PlanItem,
): TripLeg | null {
  const ordered = orderedTripPlanItems(trip);
  const index = ordered.findIndex((candidate) => candidate.id === item.id);
  if (index < 0 || index >= ordered.length - 1) return null;
  const next = ordered[index + 1];
  if (next.stopId === item.stopId) return null;
  return legForTransition(trip, item.stopId, next.stopId);
}

export function itineraryDayLegs(trip: EasyTTrip, day: PlanItem) {
  const incoming = incomingLegForPlanItem(trip, day);
  const outgoing = outgoingLegForPlanItem(trip, day);
  const laterAtStop = orderedTripPlanItems(trip).some((candidate) => candidate.stopId === day.stopId && candidate.dayNumber > day.dayNumber);
  const finalDeparture = laterAtStop
    ? null
    : trip.legs.find((leg) => leg.classification === "departure" && leg.fromStopId === day.stopId) ?? null;
  return [...new Map([incoming, outgoing, finalDeparture]
    .filter((leg): leg is TripLeg => Boolean(leg))
    .map((leg) => [leg.id, leg])).values()];
}

function endpointStop(endpoint: CanonicalRouteEndpoint, day: PlanItem): JourneyStop | null {
  if (!validCoordinates(endpoint.coordinates)) return null;
  return {
    id: endpoint.id,
    city: endpoint.name,
    country: endpoint.country ?? "",
    date: day.date,
    coordinates: endpoint.coordinates,
    theme: endpoint.kind === "origin" ? "transit" : "city",
    marker: endpoint.kind === "origin" ? "plane" : "skyline",
    description: endpoint.kind === "origin" ? "Journey origin" : `Saved route stop for day ${day.dayNumber}.`,
    highlights: [],
    aiPrompt: `Explain this day around ${endpoint.name}.`,
  };
}

function planItemPin(day: PlanItem): PlannerMapPin | null {
  const coordinates: [number, number] | null = day.longitude === null || day.latitude === null ? null : [day.longitude, day.latitude];
  if (!validCoordinates(coordinates)) return null;
  const category: PlannerMapPin["category"] = day.type === "food"
    ? "restaurant"
    : day.type === "stay"
      ? "stay"
      : day.type === "arrival" || day.type === "transport"
        ? "transport"
        : "activity";
  return {
    id: `plan-item-${day.id}`,
    title: day.title,
    category,
    dayNumber: day.dayNumber,
    longitude: coordinates[0],
    latitude: coordinates[1],
  };
}

/**
 * Projects one canonical day into the shared map. Stable route, plan-item and
 * pin IDs are preserved; no title matching is used for selection linkage.
 */
export function itineraryDayMapContext(
  trip: EasyTTrip,
  day: PlanItem,
  selectedItemId: string | null,
): ItineraryDayMapContext {
  const stop = trip.stops.find((candidate) => candidate.id === day.stopId) ?? null;
  const dayLegs = itineraryDayLegs(trip, day);
  const legIds = new Set(dayLegs.map((leg) => leg.id));
  const legs = mapRouteLegsFromTrip(trip).filter((leg) => legIds.has(leg.id));
  const endpoints = dayLegs.flatMap((leg) => [routeEndpointForLeg(trip, leg, "from"), routeEndpointForLeg(trip, leg, "to")]);
  if (stop) endpoints.push(stopEndpoint(stop));
  const stops = [...new Map(endpoints
    .filter((endpoint): endpoint is CanonicalRouteEndpoint => Boolean(endpoint))
    .map((endpoint) => [endpoint.id, endpointStop(endpoint, day)] as const))
    .values()]
    .filter((candidate): candidate is JourneyStop => Boolean(candidate));
  const canonicalPins = (trip.brief.mapPins ?? []).filter((pin) => pin.dayNumber === day.dayNumber);
  const dayPin = planItemPin(day);
  const pins = dayPin && !canonicalPins.some((pin) => pin.id === dayPin.id) ? [dayPin, ...canonicalPins] : canonicalPins;
  const selectedStopId = stop?.id ?? stops[0]?.id ?? "";
  const baseCoordinates = stop ? stopEndpoint(stop).coordinates : null;
  return itineraryDayMapSelection({
    stops,
    legs,
    pins,
    selectedStopId,
    selectedLegId: null,
    selectedPlannerPinId: null,
    focusCoordinates: stops.length <= 1 && validCoordinates(baseCoordinates) ? baseCoordinates : null,
  }, day, selectedItemId);
}

/**
 * Applies presentational selection without rebuilding the selected day's
 * canonical spatial arrays. Timeline-only selection therefore cannot make the
 * shared map redraw routes or recreate markers.
 */
export function itineraryDayMapSelection(
  context: ItineraryDayMapContext,
  day: PlanItem,
  selectedItemId: string | null,
): ItineraryDayMapContext {
  const selectedLegId = selectedItemId?.startsWith("leg-")
    ? selectedItemId.slice(4)
    : null;
  const selectedPlannerPinId = selectedItemId?.startsWith("map-pin:")
    ? selectedItemId.slice("map-pin:".length)
    : selectedItemId === `plan-item:${day.id}`
      ? `plan-item-${day.id}`
      : null;
  const selectedPin = context.pins.find((pin) => pin.id === selectedPlannerPinId);
  return {
    ...context,
    selectedLegId: selectedLegId && context.legs.some((leg) => leg.id === selectedLegId) ? selectedLegId : null,
    selectedPlannerPinId: selectedPin?.id ?? null,
    focusCoordinates: selectedPin ? [selectedPin.longitude, selectedPin.latitude] : context.focusCoordinates,
  };
}

export function itinerarySelectionForMapPin(pin: PlannerMapPin, day: PlanItem) {
  return pin.id === `plan-item-${day.id}` ? `plan-item:${day.id}` : `map-pin:${pin.id}`;
}

export function itineraryDiscoveryCategory(place: Pick<ItineraryDiscoveryPlace, "type" | "tags">) {
  return place.type === "Food" || place.tags.includes("Food") ? "restaurant" as const : "activity" as const;
}

/** Remove stable pin duplicates first, then conservative visible-title duplicates. */
export function itinerarySuggestionCandidates(
  trip: EasyTTrip,
  day: PlanItem,
  places: readonly ItineraryDiscoveryPlace[],
) {
  const stopPlaces = trip.brief.selectedPlaces[day.stopId] ?? [];
  const visibleTitles = new Set([
    day.title,
    ...day.notes,
    ...(trip.brief.customActivities?.[day.dayNumber] ?? []),
    ...(trip.brief.dayNotes?.[day.dayNumber] ?? []),
    ...stopPlaces,
    ...(trip.brief.mapPins ?? []).filter((pin) => pin.dayNumber === day.dayNumber).map((pin) => pin.title),
  ].map(normalized));
  const pinIds = new Set((trip.brief.mapPins ?? []).map((pin) => pin.id));
  const ideaPlaceIds = new Set((trip.brief.itineraryIdeas ?? [])
    .filter((idea) => idea.stopId === day.stopId)
    .map((idea) => idea.placeId));
  const seen = new Set<string>();
  const eligible = places.filter((place) => {
    const title = normalized(place.title);
    const category = itineraryDiscoveryCategory(place);
    const canonicalIdea = ideaPlaceIds.has(place.id);
    const duplicate = !title
      || seen.has(title)
      || (!canonicalIdea && visibleTitles.has(title))
      || (!canonicalIdea && pinIds.has(mappedPlacePinId(day.dayNumber, category, { id: place.id, name: place.title, coordinates: place.coordinates })));
    seen.add(title);
    return !duplicate && validCoordinates(place.coordinates);
  });
  return rankItineraryDiscoveryPlaces(eligible, tripIntentForTrip(trip).preferences.interests);
}
