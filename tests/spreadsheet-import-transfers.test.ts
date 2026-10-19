import assert from 'node:assert/strict';
import test from 'node:test';
import { acceptedGeographicPlace } from '../lib/easyt/geographic-binding.ts';
import { buildSpreadsheetImportProposal, canonicalTripFromSpreadsheetProposal, parseDelimitedText } from '../lib/easyt/spreadsheet-import.ts';
import { assessCanonicalTransferJourneys } from '../lib/easyt/multimodal-transfer-resolution.ts';
import { assessSpreadsheetImportTransfers } from '../lib/easyt/spreadsheet-import-transfers.ts';
import type { TripLeg } from '../lib/easyt/trip.ts';
import type { RoadRoutingProvider } from '../lib/easyt/road-routing.ts';

function tripFor(points: Array<[string, string, [number, number]]>) {
  const places = points.map(([name, country, coordinates]) => {
    const candidate = { canonicalPlaceId: `fixture:${name}`, providerId: `fixture:${name}`, name, country, coordinates, placeType: 'city', routability: 'direct_destination' };
    return { ...candidate, ...acceptedGeographicPlace(candidate, candidate)!, coordinates };
  });
  const source = 'Destination,Country,Arrival date,Departure date\n' + places.slice(1).map((place, index) => `${place.name},${place.country},2026-12-${11 + index * 2},2026-12-${13 + index * 2}`).join('\n');
  const proposal = buildSpreadsheetImportProposal(parseDelimitedText(source));
  return canonicalTripFromSpreadsheetProposal({ id: 'reviewed-import', proposal, origin: places[0], places: places.slice(1).map((place, i) => ({ ...place, sourceStopId: proposal.stops[i].id })), recommendUnbookedTransfers: true });
}

const resolve = async (legs: readonly TripLeg[]) => {
  const result = await assessCanonicalTransferJourneys([...legs]);
  return { ok: true as const, legs: result.legs, assessments: result.assessments, failedLegIds: [] };
};

for (const points of [
  [['Hiroshima', 'Japan', [132.4553, 34.3853]], ['Kyoto', 'Japan', [135.7681, 35.0116]]],
  [['Paris', 'France', [2.3522, 48.8566]], ['Brussels', 'Belgium', [4.3517, 50.8503]]],
] as Array<Array<[string, string, [number, number]]>>) test(`${points[0][0]} to ${points[1][0]} imports a supported rail recommendation without changing source facts`, async () => {
  const trip = tripFor(points); const before = structuredClone(trip);
  const result = await assessSpreadsheetImportTransfers(trip, new AbortController().signal, resolve);
  assert.equal(result.legs[0].mode, 'train');
  assert.deepEqual({ ...result, legs: before.legs }, before);
  assert.deepEqual(trip, before, 'assessment cannot mutate the reviewed input');
});

test('bookings, traveller decisions and legacy imports are never submitted for import recommendations', async () => {
  const original = tripFor([['Hiroshima', 'Japan', [132.4553, 34.3853]], ['Kyoto', 'Japan', [135.7681, 35.0116]]]);
  for (const patch of [{ importedBookingId: 'booking-1' }, { userConfirmed: true }, { decisionOption: 'train' }, { source: 'spreadsheet-import-unconfirmed' }]) {
    const trip = structuredClone(original); Object.assign(trip.legs[0].routeMetadata, patch);
    const result = await assessSpreadsheetImportTransfers(trip, new AbortController().signal, async () => { throw new Error('Protected facts reached a provider'); });
    assert.deepEqual(result, trip);
  }
});

test('unsupported island crossing and unavailable provider stay unknown', async () => {
  const island = tripFor([['Unreviewed island A', 'Indonesia', [120, -8]], ['Unreviewed island B', 'Indonesia', [130, -8]]]);
  const resolved = await assessSpreadsheetImportTransfers(island, new AbortController().signal, resolve);
  assert.equal(resolved.legs[0].mode, 'unknown');
  assert.equal(resolved.legs[0].durationMinutes, null);
  assert.deepEqual(await assessSpreadsheetImportTransfers(island, new AbortController().signal, async () => ({ ok: false, reason: 'invalid-input' })), island);
});

test('unverified endpoints authorize no request', async () => {
  const trip = tripFor([['Hiroshima', 'Japan', [132.4553, 34.3853]], ['Kyoto', 'Japan', [135.7681, 35.0116]]]);
  delete trip.legs[0].fromEndpoint!.geographicBinding;
  let called = false;
  assert.deepEqual(await assessSpreadsheetImportTransfers(trip, new AbortController().signal, async () => { called = true; return { ok: false, reason: 'invalid-input' }; }), trip);
  assert.equal(called, false);
});

test('late cancelled responses and changed endpoints cannot be adopted', async () => {
  const trip = tripFor([['Hiroshima', 'Japan', [132.4553, 34.3853]], ['Kyoto', 'Japan', [135.7681, 35.0116]]]);
  const controller = new AbortController();
  await assert.rejects(assessSpreadsheetImportTransfers(trip, controller.signal, async legs => { controller.abort(); return resolve(legs); }), { name: 'AbortError' });
  const result = await assessSpreadsheetImportTransfers(trip, new AbortController().signal, async legs => {
    const resolved = await resolve(legs); resolved.legs[0].toStopId = 'different-occurrence'; return resolved;
  });
  assert.deepEqual(result, trip);
});

test('European road recommendation uses the existing route provider and retains traveller preferences', async () => {
  const trip = tripFor([['Munich', 'Germany', [11.582, 48.1351]], ['Salzburg', 'Austria', [13.055, 47.8095]]]);
  trip.legs[0].routeMetadata.transportConstraints = { preferredModes: ['road'] };
  let calls = 0;
  const provider: RoadRoutingProvider = { provider: 'openrouteservice', async route(input) {
    calls += 1;
    return { mode: 'road', distanceKm: 145, durationMinutes: 110, confidence: 'medium', provenance: 'routed', provider: 'openrouteservice', providerCheckedAt: '2026-10-19T00:00:00Z', profile: 'driving-car', routeGeometry: [input.origin.coordinates, input.destination.coordinates], attribution: 'Regression fixture' };
  } };
  const result = await assessSpreadsheetImportTransfers(trip, new AbortController().signal, async legs => ({ ok: true, ...await assessCanonicalTransferJourneys(legs, { provider }), failedLegIds: [] }));
  assert.equal(calls, 1);
  assert.equal(result.legs[0].mode, 'road');
  assert.equal(result.legs[0].durationMinutes, 110);
  assert.deepEqual(result.legs[0].routeMetadata.transportConstraints, { preferredModes: ['road'] });
});

test('European long-distance flight without compatible corridor evidence stays unknown, with dates and repeated stops intact', async () => {
  const trip = tripFor([['London', 'United Kingdom', [-0.1276, 51.5072]], ['Athens', 'Greece', [23.7275, 37.9838]], ['London', 'United Kingdom', [-0.1276, 51.5072]]]);
  const before = structuredClone(trip);
  const result = await assessSpreadsheetImportTransfers(trip, new AbortController().signal, resolve);
  assert.deepEqual(result.legs.map(leg => leg.mode), ['unknown', 'unknown']);
  assert.deepEqual(result.stops, before.stops);
  assert.deepEqual(result.brief, before.brief);
  assert.deepEqual(result.planItems, before.planItems);
});
