import { tripFromBuilder } from '../../lib/easyt/trip.ts';
import { referencePlaceById, referenceSnapshotId } from '../../lib/easyt/place-reference.server.ts';
import { acceptedGeographicPlace } from '../../lib/easyt/geographic-binding.ts';
import { buildCanonicalTripLegs } from '../../lib/easyt/trip-legs.ts';

/** Synthetic canonical route with distinct origin, overnight and return roles. */
export function affiliateEndpointTrip(startDate = '2026-10-07', endDate = '2026-10-21') {
  const trip = tripFromBuilder({
    id: 'synthetic-affiliate-endpoints', origin: 'London', originCountry: 'United Kingdom',
    originCanonicalPlaceId: 'london', originCoordinates: [-0.1276, 51.5072],
    journeyEnd: { mode: 'same_as_start' }, startDate, endDate,
    stops: [
      { id: 'paris', name: 'Paris', country: 'France', canonicalPlaceId: 'paris', coordinates: [2.3522, 48.8566] },
      { id: 'madrid', name: 'Madrid', country: 'Spain', canonicalPlaceId: 'madrid', coordinates: [-3.7038, 40.4168] },
    ],
    nightAllocations: { paris: 7, madrid: 7 }, picks: {}, mustDo: '', pace: 'slow',
    hotels: 'few', budget: 'mid', draft: [],
  });
  const london = referencePlaceById('reference:geonames:2643743')!;
  const facts = { name: london.canonicalName, country: 'United Kingdom', canonicalPlaceId: london.canonicalPlaceId,
    providerId: london.providerId, referenceSnapshotId: referenceSnapshotId(), coordinates: [...london.coordinates] as [number, number], placeType: london.placeType, routability: 'direct_destination' as const };
  const origin = acceptedGeographicPlace(facts, facts, 'endpoint')!;
  trip.brief.originCanonicalPlaceId = origin.canonicalPlaceId;
  trip.brief.originProviderId = origin.providerId;
  trip.brief.originCoordinates = origin.coordinates;
  trip.brief.intent!.route!.origin = origin;
  trip.legs = buildCanonicalTripLegs({ tripId: trip.id, origin: { ...origin, coordinates: origin.coordinates! }, journeyEnd: { mode: 'same_as_start' }, stops: trip.stops });
  return trip;
}
