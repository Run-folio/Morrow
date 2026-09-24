import { mappedPlacePinId } from "./map-place-itinerary.ts";
import type { ExploreResult } from "./explore.ts";
import type { JourneyLocalPlace } from "./local-place.ts";
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
  description?: string;
  image?: string;
  tags?: string[];
  duration?: string;
  priceLabel?: string;
  priceLevel?: string;
  providerUrl?: string;
  providerProductId?: string;
  nativeName?: string;
  distanceKm?: number;
  operational?: true;
  provider?: "booking-demand" | "google-places" | "openstreetmap" | "viator";
  commercialProvider?: "booking-demand";
  commercialProviderProductId?: string;
  rating?: number;
  reviewCount?: number;
  price?: { total: number; currency: string };
  availability?: "available" | "check";
  cancellation?: string;
  persistedPinId?: string;
};

export type MapResultHandoffTarget = Pick<MapResultPlace,
  "selectionId" | "sourceId" | "stopId" | "dayNumber" | "name" | "coordinates" | "kind" | "address" | "category"
> & Pick<Partial<MapResultPlace>, "provider" | "providerProductId" | "commercialProvider" | "commercialProviderProductId">;
// Commercial provenance is carried separately when Booking.com enriches a
// canonical mapped property rather than becoming that property's map identity.

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

function supportedProvider(value: string | null | undefined): MapResultPlace["provider"] {
  return value === "booking-demand" || value === "google-places" || value === "openstreetmap" || value === "viator"
    ? value
    : undefined;
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

export function mapResultHandoffForExploreResult(
  result: ExploreResult,
  selectionId: string,
  dayNumber: number | null,
): MapResultHandoffTarget | null {
  if (!validCoordinates(result.coordinates)) return null;
  const kind = result.kind === "restaurant" ? "eat" : "see";
  return {
    selectionId,
    sourceId: result.sourceId,
    stopId: result.stopId,
    dayNumber,
    name: result.title,
    coordinates: result.coordinates,
    kind,
    address: result.location,
    category: result.category,
    ...(supportedProvider(result.provider) ? { provider: supportedProvider(result.provider) } : {}),
    ...(result.providerProductId ? { providerProductId: result.providerProductId } : {}),
  };
}

export function mapResultHandoffForLocalPlace(
  place: JourneyLocalPlace,
  kind: "stay" | "eat",
  stopId: string,
  dayNumber: number | null,
  selectionId = mapResultSelectionId(kind, place.id, stopId),
): MapResultHandoffTarget {
  return {
    selectionId,
    sourceId: place.id,
    stopId,
    dayNumber,
    name: place.name,
    coordinates: place.coordinates,
    kind,
    address: place.address,
    category: place.category,
    ...(place.provider ? { provider: place.provider } : {}),
    ...(place.providerProductId ? { providerProductId: place.providerProductId } : {}),
    ...(place.commercialProvider ? { commercialProvider: place.commercialProvider } : {}),
    ...(place.commercialProviderProductId ? { commercialProviderProductId: place.commercialProviderProductId } : {}),
  };
}

export function mapResultForHandoffTarget(target: MapResultHandoffTarget): MapResultPlace {
  return {
    ...target,
    state: "result",
    dayPart: null,
    mapsUrl: mapsUrl(target.coordinates),
  };
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
  tags?: string[];
  description?: string;
  image?: string;
  sourceUrl?: string;
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
    ...(place.tags ? { tags: [...place.tags] } : {}),
    ...(place.description ? { description: place.description } : {}),
    ...(place.image ? { image: place.image } : {}),
    ...(place.sourceUrl ? { providerUrl: place.sourceUrl } : {}),
  };
}

/** Keep one domain selection while inventory refreshes, then clear it if a
 * previously visible result disappears. Stop IDs prevent repeated places from
 * being replaced by a same-source sibling on another route occurrence. */
export function reconcileMapResultSelection(
  selected: MapResultPlace | null,
  results: readonly MapResultPlace[],
  previouslyVisibleSelectionId: string | null,
): MapResultPlace | null {
  if (!selected) return null;
  const current = results.find((result) => result.selectionId === selected.selectionId)
    ?? results.find((result) => result.kind === selected.kind
      && result.sourceId === selected.sourceId
      && result.stopId === selected.stopId);
  return current ?? (previouslyVisibleSelectionId === selected.selectionId ? null : selected);
}

/** Resolve a finder row only within the active route-stop occurrence. */
export function mapResultForSourceAtStop(
  results: readonly MapResultPlace[],
  kind: MapResultKind,
  sourceId: string,
  stopId: string | null,
  dayNumber: number | null,
): MapResultPlace | null {
  const matches = results.filter((result) => result.kind === kind
    && result.sourceId === sourceId
    && result.stopId === stopId);
  const sameDay = matches.find((result) => result.dayNumber === dayNumber);
  return sameDay ?? (kind === "stay" ? matches[0] ?? null : null);
}

/** A map result's own stop/day is authoritative for its detail actions. */
export function mapResultPlanItem(trip: EasyTTrip, result: MapResultPlace): EasyTTrip["planItems"][number] | null {
  if (!result.stopId || !trip.stops.some((stop) => stop.id === result.stopId)) return null;
  return trip.planItems.find((item) => item.stopId === result.stopId && item.dayNumber === result.dayNumber)
    ?? trip.planItems.find((item) => item.stopId === result.stopId)
    ?? null;
}

export function reconcilePlannerPinSelection(
  selected: PlannerMapPin | null,
  pins: readonly PlannerMapPin[],
): PlannerMapPin | null {
  return selected ? pins.find((pin) => pin.id === selected.id) ?? null : null;
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
      ...(idea.description ? { description: idea.description } : {}),
      ...(idea.image ? { image: idea.image } : {}),
      ...(idea.sourceUrl ? { providerUrl: idea.sourceUrl } : {}),
      ...(idea.provider ? { provider: idea.provider } : {}),
      ...(idea.providerProductId ? { providerProductId: idea.providerProductId } : {}),
      ...(idea.providerMetadata?.rating !== undefined ? { rating: idea.providerMetadata.rating } : {}),
      ...(idea.providerMetadata?.reviewCount !== undefined ? { reviewCount: idea.providerMetadata.reviewCount } : {}),
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
  const stableTransient: MapResultPlace[] = [];
  for (const result of transient) {
    const duplicateIndex = stableTransient.findIndex((candidate) => candidate.selectionId === result.selectionId || (
      candidate.kind === result.kind
      && candidate.stopId === result.stopId
      && (candidate.sourceId === result.sourceId || Boolean(candidate.providerProductId && candidate.provider === result.provider && candidate.providerProductId === result.providerProductId))
    ));
    if (duplicateIndex < 0) {
      stableTransient.push(result);
      continue;
    }
    const target = stableTransient[duplicateIndex]!;
    stableTransient[duplicateIndex] = {
      ...target,
      ...result,
      selectionId: target.selectionId,
      sourceId: target.sourceId,
      stopId: target.stopId,
      coordinates: target.coordinates,
      state: target.state,
    };
  }
  const merged = stableTransient.map((result) => {
    const expectedPinId = dayNumber === null
      ? null
      : mappedPlacePinId(dayNumber, result.kind === "stay" ? "stay" : result.kind === "eat" ? "restaurant" : "activity", {
        id: result.sourceId,
        name: result.name,
        coordinates: result.coordinates,
        provider: result.provider === "viator" ? undefined : result.provider,
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
