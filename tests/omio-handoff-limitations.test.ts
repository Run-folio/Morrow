import assert from 'node:assert/strict';
import test from 'node:test';
import { buildOmioRouteSearchLink } from '../lib/easyt/omio-search-link.ts';
import { affiliateHandoffDetail, affiliatePartners, omioBookingActionForLeg, transportAffiliateActionForLeg } from '../lib/easyt/booking-readiness.ts';
import { buildCanonicalTripLegs } from '../lib/easyt/trip-legs.ts';
import { cityReturnTrip } from './fixtures/omio-return.ts';
import { selectedTransferPlace } from './fixtures/accepted-transfer-place.ts';
import * as booking from '../lib/easyt/booking-readiness.ts';

const now = new Date('2026-11-04T23:59:00Z');
const cases = {
  honolulu: ['Honolulu', 'United States', 'reference:geonames:5856195', 'Mexico City', 'Mexico', 'reference:geonames:3530597', 'flight'],
  matsumoto: ['Matsumoto', 'Japan', 'reference:geonames:1857519', 'Chengdu', 'China', 'reference:geonames:1815286', 'flight'],
  rail: ['Zhangjiajie', 'China', 'reference:geonames:1813171', 'Hong Kong', 'Hong Kong', 'reference:geonames:1819729', 'train'],
} as const;

function syntheticTrip(key: keyof typeof cases, date = '2027-03-14') {
  const [fromName, fromCountry, fromId, toName, toCountry, toId, mode] = cases[key];
  const from = selectedTransferPlace(fromName, fromCountry, fromId, 'endpoint');
  const to = selectedTransferPlace(toName, toCountry, toId, 'stop');
  const trip = cityReturnTrip();
  trip.startDate = date;
  trip.endDate = new Date(Date.parse(`${date}T00:00:00Z`) + 5 * 86400000).toISOString().slice(0, 10);
  Object.assign(trip.brief, { origin: from.name, originCountry: from.country, originCanonicalPlaceId: from.canonicalPlaceId, originProviderId: from.providerId, originCoordinates: from.coordinates, journeyEnd: { mode: 'unknown' } });
  trip.brief.intent!.route!.origin = from;
  trip.brief.intent!.route!.journeyEnd = { mode: 'unknown' };
  trip.stops = [{ ...trip.stops[0], name: to.name, country: to.country!, canonicalPlaceId: to.canonicalPlaceId, providerId: to.providerId, geographicBinding: to.geographicBinding, latitude: to.coordinates![1], longitude: to.coordinates![0], arrivalDate: date, departureDate: trip.endDate }];
  trip.legs = buildCanonicalTripLegs({ tripId: trip.id, origin: { ...from, coordinates: from.coordinates! }, journeyEnd: { mode: 'unknown' }, stops: trip.stops }).map(leg => ({ ...leg, mode, provenance: 'planning_estimate', durationMinutes: 400, distanceKm: 1000, routeMetadata: {} }));
  trip.planItems = [];
  return trip;
}

for (const key of ['honolulu', 'matsumoto'] as const) test(`${key} city-text failure is an explicit general search without mutating the trip`, () => {
  const trip = syntheticTrip(key), before = structuredClone(trip), leg = trip.legs[0];
  for (const actionFor of [omioBookingActionForLeg, transportAffiliateActionForLeg]) {
    const action = actionFor(trip, leg, now)!;
    assert.ok(action);
    assert.equal(action.href, affiliatePartners.omio.transportUrl);
    assert.equal(action.cta, 'Search on Omio');
    const notice = affiliateHandoffDetail(action)!;
    assert.match(notice, key === 'matsumoto' ? /departure airport/i : /general search/i);
    assert.doesNotMatch(notice, /route and dates are sent/i);
    assert.match(affiliateHandoffDetail(action, 'es')!, /Omio/);
  }
  assert.deepEqual(trip, before);
});

test('city-text guard is bounded to observed inputs, country aliases and flight mode', () => {
  const input = { mode: 'flight', originName: 'Honolulu', originCountry: 'USA', destinationName: 'Mexico City', destinationCountry: 'Mexico', departureDate: '2027-03-01', now };
  assert.equal(buildOmioRouteSearchLink(input), null);
  assert.ok(buildOmioRouteSearchLink({ ...input, mode: 'train' }));
  assert.ok(buildOmioRouteSearchLink({ ...input, originName: 'Mexico City', originCountry: 'Mexico', destinationName: 'Honolulu', destinationCountry: 'United States' }));
  assert.ok(buildOmioRouteSearchLink({ ...input, destinationName: 'Los Angeles', destinationCountry: 'United States' }));
  assert.ok(buildOmioRouteSearchLink({ ...input, originName: 'Honolulu International Airport', destinationName: 'Mexico City International Airport' }));
});

test('existing explicit airport segments remain the search endpoints while Matsumoto remains the overnight identity', () => {
  const trip = syntheticTrip('matsumoto'), leg = trip.legs[0];
  const haneda = selectedTransferPlace('Tokyo Haneda', 'Japan', 'reference:ourairports:5627', 'endpoint');
  const chengdu = selectedTransferPlace('Chengdu', 'China', 'reference:ourairports:27230', 'endpoint');
  leg.segments = [{ id: 'synthetic-flight-segment', mode: 'flight', fromEndpoint: { ...haneda, coordinates: haneda.coordinates!, id: 'haneda', kind: 'gateway' }, toEndpoint: { ...chengdu, coordinates: chengdu.coordinates!, id: 'chengdu-airport', kind: 'gateway' }, durationMinutes: 300, distanceKm: null, provider: null, provenance: 'planning_estimate', confidence: 'unknown', scheduleNeedsChecking: true }];
  const before = structuredClone(trip), action = omioBookingActionForLeg(trip, leg, now)!;
  const search = new URL(new URL(action.href).searchParams.get('u')!);
  assert.equal(search.searchParams.get('departurePosTerm'), `${haneda.name}, Japan`);
  assert.equal(search.searchParams.get('arrivalPosTerm'), `${chengdu.name}, China`);
  assert.equal(search.searchParams.get('departureDate'), trip.startDate);
  assert.deepEqual(trip, before);
});

test('far-future China rail retains its exact link and separates sale-window uncertainty from no route', () => {
  const trip = syntheticTrip('rail', '2027-03-20'), before = structuredClone(trip);
  const action = omioBookingActionForLeg(trip, trip.legs[0], now)!;
  const search = new URL(new URL(action.href).searchParams.get('u')!);
  assert.equal(search.searchParams.get('departurePosTerm'), 'Zhangjiajie, China');
  assert.equal(search.searchParams.get('arrivalPosTerm'), 'Hong Kong, Hong Kong');
  assert.equal(search.searchParams.get('departureDate'), '2027-03-20');
  assert.equal(search.searchParams.get('travelMode'), 'TRAIN');
  assert.equal(action.cta, 'Check rail route on Omio');
  assert.match(affiliateHandoffDetail(action)!, /15.day.*ticket.sale window/i);
  assert.match(affiliateHandoffDetail(action, 'es')!, /15 días/);
  assert.deepEqual(trip, before);
});

test('rail notice uses calendar days and makes no on-sale or no-route assertion at the boundary', () => {
  for (const [date, outside] of [['2026-11-19', false], ['2026-11-20', true]] as const) {
    const trip = syntheticTrip('rail', date), action = omioBookingActionForLeg(trip, trip.legs[0], now)!;
    assert.equal(/15.day.*ticket.sale window/i.test(affiliateHandoffDetail(action)!), outside);
    assert.doesNotMatch(affiliateHandoffDetail(action)!, /tickets are available|no route|no trains/i);
  }
  const input = { mode: 'train', originName: 'Zhangjiajie', originCountry: 'China', destinationName: 'Hong Kong', destinationCountry: 'Hong Kong', departureDate: '2027-03-20', now };
  assert.ok(buildOmioRouteSearchLink(input), 'window uncertainty must not suppress the correctly carried route');
});

test('limited handoff CTAs remain explicit in Spanish and preserve unrelated provider actions', () => {
  assert.equal(typeof booking.affiliateHandoffCta, 'function');
  const general = omioBookingActionForLeg(syntheticTrip('honolulu'), syntheticTrip('honolulu').legs[0], now)!;
  const rail = omioBookingActionForLeg(syntheticTrip('rail'), syntheticTrip('rail').legs[0], now)!;
  assert.equal(booking.affiliateHandoffCta(general, 'es'), 'Buscar en Omio');
  assert.equal(booking.affiliateHandoffCta(rail, 'es'), 'Consultar ruta de tren en Omio');
  assert.equal(booking.affiliateHandoffCta(general, 'en'), 'Search on Omio');
  assert.equal(booking.affiliateHandoffCta({ ...general, provider: 'viator', cta: 'View on Viator' }, 'es'), 'View on Viator');
});

test('targeted handoffs warn that Omio can show a different mode without claiming missing services', () => {
  const trip=cityReturnTrip(),action=omioBookingActionForLeg(trip,trip.legs[0],now)!;
  const before=action.href;
  assert.match(affiliateHandoffDetail(action)!, /Omio may show other transport modes/);
  assert.match(affiliateHandoffDetail(action)!, /check the mode and traveller count/i);
  assert.match(affiliateHandoffDetail(action,'es')!, /otros medios de transporte/);
  assert.match(affiliateHandoffDetail(action,'es')!, /medio de transporte y el número de viajeros/);
  assert.doesNotMatch(affiliateHandoffDetail(action)!, /no flights|no trains|guaranteed|available tickets/i);
  assert.equal(action.href,before);
  const inner=new URL(new URL(action.href).searchParams.get('u')!);
  assert.equal(inner.searchParams.get('travelMode'),'FLIGHT');
  assert.equal(inner.searchParams.get('returnDate'),'2026-12-16');
});

for (const roundTrip of [false, true]) test(`${roundTrip ? 'return' : 'one-way'} two-traveller search exposes count carryover limitation without changing the trip`, () => {
  const trip = cityReturnTrip();
  trip.travellers = 2;
  // A mixed-mode return must use an ordinary one-way flight search.
  if (!roundTrip) trip.legs.at(-1)!.mode = 'train';
  const before = structuredClone(trip);
  for (const actionFor of [omioBookingActionForLeg, transportAffiliateActionForLeg]) {
    const action = actionFor(trip, trip.legs[0], now)!;
    assert.ok(action);
    assert.equal(Boolean(action.returnSearch), roundTrip);
    const inner = new URL(new URL(action.href).searchParams.get('u')!);
    assert.equal(inner.searchParams.get('travelMode'), 'FLIGHT');
    assert.equal(inner.searchParams.get('departureDate'), '2026-12-11');
    assert.equal(inner.searchParams.get('returnDate'), roundTrip ? '2026-12-16' : null);
    assert.deepEqual([...inner.searchParams.keys()].sort(), [
      'arrivalPosTerm', 'currency', 'departureDate', 'departurePosTerm', 'locale',
      ...(roundTrip ? ['returnDate'] : []), 'travelMode',
    ].sort(), 'no undocumented passenger parameter should be guessed');
    assert.match(affiliateHandoffDetail(action)!, /traveller count is not carried over/);
    assert.match(affiliateHandoffDetail(action)!, /check the mode and traveller count before booking/i);
    assert.match(affiliateHandoffDetail(action, 'es')!, /pero no el número de viajeros/);
    assert.match(affiliateHandoffDetail(action, 'es')!, /número de viajeros antes de reservar/);
  }
  assert.deepEqual(trip, before, 'provider limitations must not reset the saved party size');
});
