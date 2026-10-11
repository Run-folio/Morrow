import { buildCredibleItinerary, type PlannerPlace } from './planner.ts';
import { planningLaneResponseStatus } from './planning-evidence-presentation.ts';
import type { CanonicalEasyTTrip } from './trip.ts';

/** Only generated prose is owned here. Activity rows, bookings and day bindings remain authored. */
export type BuilderRecommendationProjection = {
    stopId: string;
    days: Array<{ id: string; contextNotes: string[] }>;
};

export function builderRecommendationProjection(trip: CanonicalEasyTTrip, stopId: string, places: PlannerPlace[]): BuilderRecommendationProjection {
    if (!trip.stops.some(stop => stop.id === stopId)) throw new Error('Unknown recommendation occurrence');
    const orderedDays = [...trip.planItems].sort((a, b) => a.dayNumber - b.dayNumber);
    const planned = buildCredibleItinerary({
        origin: trip.brief.origin, originCoordinates: trip.brief.originCoordinates ?? undefined,
        stops: [...trip.stops].sort((a, b) => a.order - b.order).map(stop => ({
            id: stop.id, name: stop.name, country: stop.country, canonicalPlaceId: stop.canonicalPlaceId,
            coordinates: stop.longitude !== null && stop.latitude !== null ? [stop.longitude, stop.latitude] : undefined,
        })),
        startDate: trip.startDate,
        // Work inside existing day slots; recommendation refresh never allocates or moves days.
        allocations: Object.fromEntries(trip.stops.map(stop => [stop.id, orderedDays.filter(day => day.stopId === stop.id).length])),
        picks: trip.brief.selectedPlaces, places: { [stopId]: places },
        constraints: { avoidDriving: trip.brief.intent.hardConstraints.avoidDriving,
            transportModes: trip.brief.intent.preferences.transportModes,
            fixedCommitments: trip.brief.intent.hardConstraints.fixedCommitments },
    }).filter(day => day.stopId === stopId);
    return { stopId, days: orderedDays.filter(day => day.stopId === stopId).map((day, index) => ({
        id: day.id, contextNotes: planned[index]?.contextNotes ?? [],
    })) };
}

function validPlace(value: unknown): value is PlannerPlace {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const place = value as PlannerPlace;
    return [place.title, place.area, place.type, place.description].every(text => typeof text === 'string' && text.length <= 10000)
        && Boolean(place.title.trim()) && Number.isFinite(place.cost) && place.cost >= 0
        && Array.isArray(place.tags) && place.tags.every(tag => typeof tag === 'string')
        && (place.coordinates === undefined || (Array.isArray(place.coordinates) && place.coordinates.length === 2
            && place.coordinates.every(Number.isFinite) && Math.abs(place.coordinates[0]) <= 180 && Math.abs(place.coordinates[1]) <= 90));
}

type BuilderDiscoveryStop = { id: string; name: string; country: string; canonicalPlaceId?: string; providerId?: string; coordinates?: [number, number] };
type BuilderDiscoveryScope = { ownerId: string | null; tripId: string };
export type BuilderDiscoveryCache = Record<string, { key: string; places: PlannerPlace[] }>;

/** Preview results belong to the exact selected identity and mounted document. */
export function builderDiscoveryInputKey(scope: BuilderDiscoveryScope, stop: BuilderDiscoveryStop): string {
    return JSON.stringify([scope.ownerId, scope.tripId, stop.id, stop.name, stop.country, stop.canonicalPlaceId, stop.providerId, stop.coordinates]);
}

export function currentBuilderDiscoveredPlaces(stops: BuilderDiscoveryStop[], cache: BuilderDiscoveryCache, scope: BuilderDiscoveryScope): Record<string, PlannerPlace[]> {
    return Object.fromEntries(stops.flatMap(stop => {
        const result = cache[stop.id];
        return result?.key === builderDiscoveryInputKey(scope, stop) ? [[stop.id, result.places]] : [];
    }));
}

/** Shared discovery adapter for the preview and canonical recommendation worker. */
export async function loadBuilderDiscoveryPlaces(stop: BuilderDiscoveryStop, signal: AbortSignal): Promise<PlannerPlace[]> {
    if (!stop.coordinates && !stop.canonicalPlaceId) throw new Error('Recommendation location unavailable');
    const params = new URLSearchParams({ destination: stop.name, country: stop.country });
    if (stop.coordinates) { params.set('lat', String(stop.coordinates[1])); params.set('lon', String(stop.coordinates[0])); }
    if (stop.canonicalPlaceId) params.set('canonicalPlaceId', stop.canonicalPlaceId);
    if (stop.providerId) params.set('providerId', stop.providerId);
    const response = await fetch(`/api/journey-discover?${params}`, { cache: 'no-store', signal: AbortSignal.any([signal, AbortSignal.timeout(10000)]) });
    if (!response.ok) throw new Error('Recommendation provider unavailable');
    const payload = await response.json() as { places?: unknown; unavailable?: boolean; assessment?: unknown };
    if (signal.aborted) throw new DOMException('Builder input changed', 'AbortError');
    if (planningLaneResponseStatus(payload, true) !== 'ready' || !Array.isArray(payload.places) || !payload.places.every(validPlace)) throw new Error('Recommendation result unavailable');
    return payload.places;
}

/** Existing discovery provider, bounded by the session lifetime and a request timeout. */
export async function resolveBuilderRecommendation(trip: CanonicalEasyTTrip, stopId: string, signal: AbortSignal): Promise<BuilderRecommendationProjection> {
    const stop = trip.stops.find(stop => stop.id === stopId);
    if (!stop || stop.latitude === null || stop.longitude === null) throw new Error('Recommendation location unavailable');
    const places = await loadBuilderDiscoveryPlaces({ ...stop, coordinates: [stop.longitude, stop.latitude] }, signal);
    // An available empty shortlist is a real result. PlannerPlace.cost is visit duration, not money.
    return builderRecommendationProjection(trip, stopId, places);
}
