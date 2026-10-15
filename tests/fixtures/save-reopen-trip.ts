import assert from 'node:assert/strict';
import { tripFromBuilder } from '../../lib/easyt/trip.ts';
import { acceptedGeographicPlace } from '../../lib/easyt/geographic-binding.ts';
import { canonicalTripForOwner } from '../../lib/easyt/trip-promotion.ts';
import { projectBuilderCalendar } from '../../lib/easyt/trip-builder-calendar.ts';
import type { JourneyEndpointPlace } from '../../lib/easyt/trip.ts';

// Synthetic identities; the route, dates and night allocation match the Test A capture.
export function saveReopenTripFixture() {
  const verified = (place: JourneyEndpointPlace) => {
    const value = acceptedGeographicPlace(place, { ...place, providerId: 'fixture:' + place.name,
      placeType: 'city', routability: 'direct_destination' }, 'endpoint');
    assert.ok(value); return value;
  };
  const places = [
    ['flores', 'Flores', 'Guatemala', [-89.883, 16.929], 3],
    ['antigua', 'Antigua Guatemala', 'Guatemala', [-90.7339, 14.5586], 2],
    ['panajachel', 'Panajachel', 'Guatemala', [-91.1565, 14.741], 2],
    ['colon', 'Colón', 'Panama', [-79.90019, 9.36025], 2],
    ['panama', 'Panama City', 'Panama', [-79.51973, 8.9936], 2],
    ['david', 'David', 'Panama', [-82.43085, 8.42729], 2],
  ] as const;
  const stops = places.map(([id, name, country, coordinates, nights]) => ({
    ...verified({ name, country, coordinates: [...coordinates], canonicalPlaceId: 'fixture:' + id }),
    id, name, country, nights }));
  const origin = verified({ name: 'London Gatwick Airport', country: 'United Kingdom',
    canonicalPlaceId: 'fixture:gatwick', coordinates: [-.1903, 51.1537] });
  const trip = tripFromBuilder({ id: 'synthetic-save-reopen', origin: origin.name,
    originCountry: origin.country, originCanonicalPlaceId: origin.canonicalPlaceId,
    originProviderId: origin.providerId, originCoordinates: origin.coordinates,
    journeyEnd: { mode: 'same_as_start' }, stops, startDate: '2026-10-14', endDate: '2026-10-27',
    picks: {}, mustDo: '', pace: 'slow', hotels: 'few', budget: 'mid',
    nightAllocations: Object.fromEntries(places.map(([id, , , , nights]) => [id, nights])), draft: [] });
  trip.brief.intent.route.origin = origin;
  trip.brief.intent.preferences.dislikes = ['stairs', 'late arrivals'];
  return canonicalTripForOwner('owner-a', { ...projectBuilderCalendar(trip, trip).trip, status: 'planned' });
}

/** PostgreSQL jsonb has object-key order independent of the application writer. */
export function jsonbObjectOrder<T>(value: T): T {
  if (Array.isArray(value)) return value.map(jsonbObjectOrder) as T;
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.length - b.length || a.localeCompare(b))
    .map(([key, child]) => [key, jsonbObjectOrder(child)])) as T;
}
