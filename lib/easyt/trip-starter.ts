import type { EasyTTrip, TripStop } from "./trip.ts";
import type { JourneyLocalPlace } from "./local-place.ts";

export function markTripStarterBuild(trip: EasyTTrip): EasyTTrip {
  if (trip.status !== "draft" || trip.brief.tripStarter) return trip;
  return { ...trip, brief: { ...trip.brief, tripStarter: { version: 1, tripId: trip.id, state: "pending" } } };
}
export function tripStarterEligible(trip: EasyTTrip, search: string, ready: boolean): boolean {
  const marker = trip.brief.tripStarter;
  const query = new URLSearchParams(search);
  return ready && trip.status === "planned" && query.get("created") === "1" && !query.has("saved")
    && marker?.version === 1 && marker.tripId === trip.id && marker.state === "pending";
}
export function finishTripStarter(trip: EasyTTrip): EasyTTrip {
  if (trip.brief.tripStarter?.tripId !== trip.id || trip.brief.tripStarter.state !== "pending") return trip;
  return { ...trip, brief: { ...trip.brief, tripStarter: { ...trip.brief.tripStarter, state: "dismissed" } } };
}
export function stayShortlistDestinationKey(stop: TripStop): string {
  return stop.canonicalPlaceId ? `canonical:${stop.canonicalPlaceId}` : stop.providerId ? `provider:${stop.providerId}`
    : JSON.stringify([stop.name.trim().toLocaleLowerCase(),stop.country.trim().toLocaleLowerCase()]);
}
export function shortlistedStays(trip: EasyTTrip) {
  return (trip.brief.stayShortlist ?? []).filter(item => trip.stops.some(stop => stop.id === item.stopId && stayShortlistDestinationKey(stop) === item.destinationKey));
}
export function shortlistStay(trip: EasyTTrip, stopId: string, place: JourneyLocalPlace, expectedDestinationKey?: string): EasyTTrip {
  // Maplibre finder supplies OSM and Booking results. Google references retain
  // their existing separate policy and must never copy provider content here.
  const stop = trip.stops.find(stop => stop.id === stopId && (stop.nights ?? 0) > 0);
  if (!stop || (expectedDestinationKey !== undefined && stayShortlistDestinationKey(stop) !== expectedDestinationKey)
    || (place.provider !== "openstreetmap" && place.provider !== "booking-demand")
    || !place.id.trim() || !place.name.trim()) return trip;
  if (shortlistedStays(trip).some(item => item.stopId === stopId && item.placeId === place.id)) return trip;
  return { ...trip, brief: { ...trip.brief, stayShortlist: [...(trip.brief.stayShortlist ?? []),
    { stopId, destinationKey: stayShortlistDestinationKey(stop), placeId: place.id, provider: place.provider, name: place.name }] } };
}
export function removeShortlistedStay(trip: EasyTTrip, stopId: string, placeId: string): EasyTTrip {
  const entries = trip.brief.stayShortlist ?? [];
  const next = entries.filter(item => item.stopId !== stopId || item.placeId !== placeId);
  return next.length === entries.length ? trip : { ...trip, brief: { ...trip.brief, stayShortlist: next } };
}
