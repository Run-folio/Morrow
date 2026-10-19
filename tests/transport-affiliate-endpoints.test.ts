import assert from 'node:assert/strict';
import test from 'node:test';
import { affiliatePartners, omioBookingActionForLeg, transportAffiliateActionForLeg } from '../lib/easyt/booking-readiness.ts';
import { deriveTripDateFacts } from '../lib/easyt/trip-facts.ts';
import { itineraryTransportAgenda } from '../lib/easyt/itinerary-transport-agenda.ts';
import { markTransportLegBooked } from '../lib/easyt/transport-booking.ts';
import { affiliateEndpointTrip } from './fixtures/transport-affiliate-endpoints.ts';

const now = new Date('2026-10-19T12:00:00.000Z');
const searchFor = (href: string) => new URL(new URL(href).searchParams.get('u')!);

test('an in-progress trip offers its future Madrid to London return flight without inventing a London overnight stop', () => {
  const trip = affiliateEndpointTrip(); const before = structuredClone(trip);
  const item = itineraryTransportAgenda(trip).find(item => item.to.kind === 'end')!;
  assert.equal(deriveTripDateFacts(trip, now).lifecycle.state, 'in-progress');
  assert.equal(item.date, '2026-10-21');
  assert.equal(trip.stops.some(stop => stop.id === item.leg.toStopId), false);
  for (const helper of [transportAffiliateActionForLeg, omioBookingActionForLeg]) {
    const action = helper(trip, item.leg, now, item.date);
    assert.ok(action, 'a canonical journey end is an eligible endpoint');
    const search = searchFor(action.href);
    assert.equal(action.provider, 'omio');
    assert.equal(search.searchParams.get('departurePosTerm'), 'Madrid, Spain');
    assert.equal(search.searchParams.get('arrivalPosTerm'), 'London, United Kingdom');
    assert.equal(search.searchParams.get('departureDate'), '2026-10-21');
    assert.equal(search.searchParams.get('travelMode'), 'FLIGHT');
  }
  assert.deepEqual(trip, before);
});

test('a wholly future trip offers the initial London to Paris rail journey using its real origin endpoint', () => {
  const trip = affiliateEndpointTrip('2026-11-01', '2026-11-15');
  const item = itineraryTransportAgenda(trip).find(item => item.from.kind === 'origin')!;
  assert.equal(trip.stops.some(stop => stop.id === item.leg.fromStopId), false);
  const action = transportAffiliateActionForLeg(trip, item.leg, now, item.date);
  assert.ok(action);
  const search = searchFor(action.href);
  assert.equal(search.searchParams.get('departurePosTerm'), 'London, United Kingdom');
  assert.equal(search.searchParams.get('arrivalPosTerm'), 'Paris, France');
  assert.equal(search.searchParams.get('departureDate'), '2026-11-01');
  assert.equal(search.searchParams.get('travelMode'), 'TRAIN');
  assert.equal(new URL(action.href).origin, new URL(affiliatePartners.omio.transportUrl).origin);
  assert.equal(new URL(action.href).pathname, new URL(affiliatePartners.omio.transportUrl).pathname);
});

for (const date of ['2026-10-18', '2026-02-30', null]) test(`a future trip cannot offer a handoff with unavailable displayed departure ${date}`, () => {
  const trip = affiliateEndpointTrip('2026-11-01', '2026-11-15');
  const leg = trip.legs.find(leg => leg.classification === 'international')!;
  // Explicit null is an unavailable agenda date; it must not fall back to another date.
  assert.equal(transportAffiliateActionForLeg(trip, leg, now, date), null);
});

test('ended trips, unknown modes and existing bookings remain excluded for origin and return journeys', () => {
  for (const classification of ['arrival', 'departure']) {
    const trip = affiliateEndpointTrip();
    const leg = trip.legs.find(leg => leg.classification === classification)!;
    assert.equal(transportAffiliateActionForLeg({ ...trip, endDate: '2026-10-18' }, leg, now, '2026-10-21'), null);
    assert.equal(transportAffiliateActionForLeg(trip, { ...leg, mode: 'unknown' }, now, '2026-10-21'), null);
    assert.equal(transportAffiliateActionForLeg(markTransportLegBooked(trip, leg.id), leg, now, '2026-10-21'), null);
  }
});

test('an unavailable journey end cannot be revived from stale saved leg endpoint facts', () => {
  const trip = affiliateEndpointTrip(); const leg = trip.legs.find(leg => leg.classification === 'departure')!;
  trip.brief.journeyEnd = { mode: 'unknown' };
  assert.equal(transportAffiliateActionForLeg(trip, leg, now, '2026-10-21'), null);
});
