import { mappedPlacePinId } from "./map-place-itinerary.ts";
import type { EasyTTrip, ItineraryDayPart, PlannerMapPin } from "./trip.ts";

export type MapResultKind = "stay" | "eat" | "see";
export type MapResultState = "result" | "saved" | "scheduled";

export type MapResultPlace = {
  selectionId: string;
  sourceId: string;
  /** Canonical route-stop context; repeated destination names must not collapse. */
  stopId: string | null;
  dayNumber: number | null;
  dayPart: ItineraryDayPart | null;
  canonicalItemId?: string;
  name: string;
  coordinates: [number, number];
  kind: MapResultKind;
  state: MapResultState;
  address: string;
  category: string;
  mapsUrl: string;
  nativeName?: string;
  distanceKm?: number;
  operational?: true;
  provider?: "booking-demand" | "google-places" | "openstreetmap";
  rating?: number;
  price?: { total: number; currency: string };
  persistedPinId?: string;
};

type TransientMapPlace = Omit<MapResultPlace, "selectionId" | "kind" | "sourceId" | "state" | "stopId" | "dayNumber" | "dayPart" | "canonicalItemId"> & { id: string };
type MapResultContext = { stopId?: string | null; dayNumber?: number | null };

const mappedPinPrefix = "venue-";

function validCoordinates(value: unknown): value is [number, number] {
  return Array.isArray(value)
    && value.length === 2
    && value.every((coordinate) => typeof coordinate === "number" && Number.isFinite(coordinate))
    && Math.abs(value[0]) <= 180
    && Math.abs(value[1]) <= 90;
}

function mapsUrl(coordinates: [number, number]) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${coordinates[1]},${coordinates[0]}`)}`;
}

function pinKind(category: PlannerMapPin["category"]): MapResultKind | null {
  if (category === "stay") return "stay";
  if (category === "restaurant") return "eat";
  if (category === "activity") return "see";
  return null;
}

export function mapResultSelectionId(kind: MapResultKind, sourceId: string, stopId?: string | null) {
  return `result:${kind}:${stopId ? `${stopId}:` : ""}${sourceId}`;
}

export function mapResultSelectionIdForIdea(ideaId: string) {
  return `idea:${ideaId}`;
}

export function mapResultForLocalPlace(place: TransientMapPlace, kind: "stay" | "eat", context: MapResultContext = {}): MapResultPlace {
  return {
    ...place,
    selectionId: mapResultSelectionId(kind, place.id, context.stopId),
    sourceId: place.id,
    stopId: context.stopId ?? null,
    dayNumber: context.dayNumber ?? null,
    dayPart: null,
    kind,
    state: "result",
  };
}

export function mapResultForDiscoveryPlace(place: {
  id: string;
  title: string;
  area: string;
  type: string;
  coordinates: [number, number];
}, context: MapResultContext = {}): MapResultPlace | null {
  if (!validCoordinates(place.coordinates)) return null;
  return {
    selectionId: mapResultSelectionId("see", place.id, context.stopId),
    sourceId: place.id,
    stopId: context.stopId ?? null,
    dayNumber: context.dayNumber ?? null,
    dayPart: null,
    name: place.title,
    coordinates: place.coordinates,
    kind: "see",
    state: "result",
    address: place.area,
    category: place.type,
    mapsUrl: mapsUrl(place.coordinates),
  };
}

export function projectPersistedMapResults(trip: EasyTTrip | null): {
  results: MapResultPlace[];
  plannerPins: PlannerMapPin[];
} {
  if (!trip) return { results: [], plannerPins: [] };
  const projectedPinIds = new Set<string>();
  const results: MapResultPlace[] = [];

  for (const idea of trip.brief.itineraryIdeas ?? []) {
    if (!validCoordinates(idea.coordinates)) continue;
    let persistedPinId: string | undefined;
    if (idea.dayId) {
      const day = trip.planItems.find((item) => item.id === idea.dayId);
      if (day) {
        persistedPinId = mappedPlacePinId(day.dayNumber, idea.category, {
          id: idea.placeId,
          name: idea.title,
          coordinates: idea.coordinates,
        });
        projectedPinIds.add(persistedPinId);
      }
    }
    results.push({
      selectionId: mapResultSelectionIdForIdea(idea.id),
      sourceId: idea.placeId,
      stopId: idea.stopId,
      dayNumber: idea.dayId ? trip.planItems.find((item) => item.id === idea.dayId)?.dayNumber ?? null : null,
      dayPart: idea.dayPart ?? null,
      canonicalItemId: idea.id,
      name: idea.title,
      coordinates: idea.coordinates,
      kind: idea.category === "restaurant" ? "eat" : "see",
      state: idea.dayId ? "scheduled" : "saved",
      address: idea.area ?? trip.stops.find((stop) => stop.id === idea.stopId)?.name ?? "Saved to this trip",
      category: idea.placeType ?? idea.category,
      mapsUrl: mapsUrl(idea.coordinates),
      ...(persistedPinId ? { persistedPinId } : {}),
    });
  }

  for (const pin of trip.brief.mapPins ?? []) {
    const kind = pinKind(pin.category);
    if (!kind || !pin.id.startsWith(mappedPinPrefix) || projectedPinIds.has(pin.id)) continue;
    const coordinates: [number, number] = [pin.longitude, pin.latitude];
    if (!validCoordinates(coordinates)) continue;
    projectedPinIds.add(pin.id);
    results.push({
      selectionId: `saved:${pin.id}`,
      sourceId: pin.id,
      stopId: trip.planItems.find((item) => item.dayNumber === pin.dayNumber)?.stopId ?? null,
      dayNumber: pin.dayNumber,
      dayPart: null,
      name: pin.title,
      coordinates,
      kind,
      state: "saved",
      address: "Saved to this trip",
      category: pin.category,
      mapsUrl: mapsUrl(coordinates),
      persistedPinId: pin.id,
    });
  }

  return {
    results,
    plannerPins: (trip.brief.mapPins ?? []).filter((pin) => !projectedPinIds.has(pin.id)),
  };
}

export function mergeMapResults(
  persisted: readonly MapResultPlace[],
  transient: readonly MapResultPlace[],
  dayNumber: number | null,
): MapResultPlace[] {
  const remaining = [...persisted];
  const merged = transient.map((result) => {
    const expectedPinId = dayNumber === null
      ? null
      : mappedPlacePinId(dayNumber, result.kind === "stay" ? "stay" : result.kind === "eat" ? "restaurant" : "activity", {
        id: result.sourceId,
        name: result.name,
        coordinates: result.coordinates,
        provider: result.provider,
      });
    const matchIndex = remaining.findIndex((candidate) => (
      candidate.kind === result.kind
      && (!candidate.stopId || !result.stopId || candidate.stopId === result.stopId)
      && (candidate.sourceId === result.sourceId || Boolean(expectedPinId && candidate.persistedPinId === expectedPinId))
    ));
    if (matchIndex < 0) return result;
    const [saved] = remaining.splice(matchIndex, 1);
    return {
      ...saved,
      ...result,
      selectionId: saved.selectionId,
      state: saved.state,
      persistedPinId: saved.persistedPinId,
    };
  });
  return [...merged, ...remaining];
}
