import { isGooglePlaceReferenceIdea, type EasyTTrip, type ItineraryIdea, type TripStop } from "./trip.ts";
import { removeItineraryIdea, saveItineraryIdea } from "./itinerary-ideas.ts";
import { authoredContentKey } from "./trip-retained-authored-content.ts";
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

type StarterActivityScope = Pick<EasyTTrip,"id"|"ownerId"> & {stopId:string;destinationKey:string};
export type StarterDeckSaveReceipt = {scope:StarterActivityScope;ideaId:string;authoredKey:string};
type StarterDeckSave = {trip:EasyTTrip;status:"stale"|"existing"} | {trip:EasyTTrip;status:"added";receipt:StarterDeckSaveReceipt};

export function starterActivityScope(trip: EasyTTrip, stop: TripStop): StarterActivityScope {
  return {id:trip.id,ownerId:trip.ownerId,stopId:stop.id,destinationKey:stayShortlistDestinationKey(stop)};
}

function starterActivityScopeIsCurrent(trip: EasyTTrip, scope: StarterActivityScope) {
  return trip.id === scope.id && trip.ownerId === scope.ownerId && trip.stops.some(stop =>
    stop.id === scope.stopId && stayShortlistDestinationKey(stop) === scope.destinationKey
  );
}

/** A receipt exists only when the canonical save actually adds an unscheduled activity. */
export function saveStarterDeckActivity(trip: EasyTTrip, scope: StarterActivityScope, idea: ItineraryIdea): StarterDeckSave {
  if (!starterActivityScopeIsCurrent(trip,scope) || idea.stopId !== scope.stopId || isGooglePlaceReferenceIdea(idea)
      || idea.category !== "activity" || idea.source !== "live-provider-inventory" || !idea.provider || !idea.providerProductId
      || idea.dayId || idea.dayPart || idea.startsAt) return {trip,status:"stale"};
  const next = saveItineraryIdea(trip,idea);
  if (next !== trip) return {trip:next,status:"added",receipt:{scope,ideaId:idea.id,authoredKey:authoredContentKey(idea)}};
  // A sanitized legacy ID can collide; don't mark a different product saved.
  const sameProduct = (trip.brief.itineraryIdeas ?? []).some(item => !isGooglePlaceReferenceIdea(item)
    && item.stopId === idea.stopId && item.provider === idea.provider && item.providerProductId === idea.providerProductId);
  return {trip,status:sameProduct ? "existing" : "stale"};
}

/** Refuse to remove an idea once another workflow has edited or scheduled it. */
export function undoStarterDeckActivity(trip: EasyTTrip, receipt: StarterDeckSaveReceipt): EasyTTrip {
  if (!starterActivityScopeIsCurrent(trip,receipt.scope)) return trip;
  const matches = (trip.brief.itineraryIdeas ?? []).filter(idea => idea.id === receipt.ideaId);
  const idea = matches[0];
  if (matches.length !== 1 || !idea || isGooglePlaceReferenceIdea(idea) || idea.stopId !== receipt.scope.stopId
      || idea.dayId || idea.dayPart || idea.startsAt || authoredContentKey(idea) !== receipt.authoredKey) return trip;
  return removeItineraryIdea(trip,idea.id);
}
