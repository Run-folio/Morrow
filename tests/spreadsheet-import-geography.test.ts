import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { acceptedGeographicPlace, geographicallyReady, stopGeographicPlace } from '../lib/easyt/geographic-binding.ts';
import { buildSpreadsheetImportProposal, canonicalTripFromSpreadsheetProposal, parseDelimitedText } from '../lib/easyt/spreadsheet-import.ts';
import { parseSpreadsheetWorkbook } from '../lib/easyt/spreadsheet-import-file.ts';
import { resolveCanonicalTransferJourney } from '../lib/easyt/multimodal-transfer-resolution.ts';

function accepted(name: string, country: string, coordinates: [number, number]) {
  const candidate = { name, country, coordinates, canonicalPlaceId: `fixture:${name}`, providerId: `fixture:${name}`, placeType: 'city', routability: 'direct_destination' };
  const place = acceptedGeographicPlace(candidate, candidate)!;
  assert.ok(place.geographicBinding);
  return { ...candidate, ...place, coordinates };
}

test('the original XLSX decodes dates, repeated occurrences and side annotations without route changes', () => {
  const bytes = readFileSync(new URL('./fixtures/workbooks/philippines_route_morrovia_import_v2.xlsx', import.meta.url));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), '4c7494e1512b40c9d58f2a97b007ee472c69976eb3fd45b11816440372928601');
  const workbook = parseSpreadsheetWorkbook(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), 'philippines_route_morrovia_import_v2.xlsx');
  assert.equal(workbook.sheets.length, 1);
  const proposal = buildSpreadsheetImportProposal(workbook.sheets[0]);
  assert.equal(proposal.canConfirmStructure, true);
  assert.deepEqual(proposal.stops.map(stop => [stop.name, stop.arrivalDate, stop.departureDate, stop.nights]), [
    ['Manila, Philippines', '2026-12-11', '2026-12-13', 2],
    ['El Nido, Palawan, Philippines', '2026-12-13', '2026-12-18', 5],
    ['Bohol, Philippines', '2026-12-18', '2026-12-22', 4],
    ['Siquijor, Philippines', '2026-12-22', '2026-12-27', 5],
    ['Cebu City, Philippines', '2026-12-27', '2026-12-30', 3],
    ['Manila, Philippines', '2026-12-30', '2026-12-31', 1],
  ]);
  assert.equal(proposal.totalNights, 20);
  assert.equal(proposal.bookings.length, 0);
  assert.equal(new Set(proposal.stops.map(stop => stop.id)).size, 6);
});

test('an accepted import preserves geographic evidence on stops and origin through canonical conversion', () => {
  const proposal = buildSpreadsheetImportProposal(parseDelimitedText('Destination,Country,Arrival date,Departure date\nKyoto,Japan,2026-12-11,2026-12-13\nOsaka,Japan,2026-12-13,2026-12-15'));
  const origin = accepted('Tokyo', 'Japan', [139.6917, 35.6895]);
  const places = [accepted('Kyoto', 'Japan', [135.7681, 35.0116]), accepted('Osaka', 'Japan', [135.5023, 34.6937])].map((place, i) => ({ ...place, sourceStopId: proposal.stops[i].id }));
  const trip = canonicalTripFromSpreadsheetProposal({ id: 'japan-import', proposal, origin, places });
  assert.deepEqual(trip.stops.map(stop => stop.geographicBinding), places.map(place => place.geographicBinding));
  assert.ok(trip.stops.every(stop => geographicallyReady(stopGeographicPlace(stop))));
  assert.deepEqual(trip.brief.intent!.route!.origin!.geographicBinding, origin.geographicBinding);
  assert.ok(trip.legs.every(leg => geographicallyReady({ ...leg.fromEndpoint!, coordinates: leg.fromEndpoint!.coordinates! }, 'endpoint')));
});

test('new reviewed imports can request canonical recommendations while legacy imported legs stay protected', async () => {
  const proposal = buildSpreadsheetImportProposal(parseDelimitedText('Destination,Country,Arrival date,Departure date\nKyoto,Japan,2026-12-11,2026-12-13'));
  const origin = accepted('Hiroshima', 'Japan', [132.4553, 34.3853]);
  const places = [{ ...accepted('Kyoto', 'Japan', [135.7681, 35.0116]), sourceStopId: proposal.stops[0].id }];
  const legacy = canonicalTripFromSpreadsheetProposal({ id: 'legacy', proposal, origin, places });
  const reviewed = canonicalTripFromSpreadsheetProposal({ id: 'reviewed', proposal, origin, places, recommendUnbookedTransfers: true });
  assert.equal(legacy.legs[0].routeMetadata.source, 'spreadsheet-import-unconfirmed');
  assert.equal(reviewed.legs[0].mode, 'unknown', 'conversion alone invents no transport');
  const result = await resolveCanonicalTransferJourney(reviewed.legs[0]);
  assert.equal(result.leg.mode, 'train');
  assert.notEqual(result.outcome, 'preserved');
  assert.equal((await resolveCanonicalTransferJourney(legacy.legs[0])).outcome, 'preserved');
});

test('an explicit imported booking remains tied to its dated occurrence after base clarification', async () => {
  const proposal = buildSpreadsheetImportProposal(parseDelimitedText('Destination,Country,Arrival date,Departure date,From,To,Transport date,Transport mode,Booking reference\nBohol,Philippines,2026-12-18,2026-12-22,El Nido,Bohol,2026-12-18,Flight,FLIGHT-1'));
  assert.equal(proposal.bookings.length, 1);
  const trip = canonicalTripFromSpreadsheetProposal({ id: 'booked-island', proposal, origin: accepted('El Nido', 'Philippines', [119.39, 11.18]),
    places: [{ ...accepted('Panglao', 'Philippines', [123.75, 9.58]), sourceStopId: proposal.stops[0].id }], recommendUnbookedTransfers: true });
  assert.equal(trip.stops[0].name, 'Panglao');
  assert.equal(trip.legs[0].routeMetadata.importedBookingId, proposal.bookings[0].id);
  assert.equal(trip.legs[0].mode, 'flight');
  assert.equal(trip.legs[0].durationMinutes, null);
  assert.equal(trip.brief.bookings![0].transportDetails?.to, 'Bohol');
  assert.deepEqual((await resolveCanonicalTransferJourney(trip.legs[0])).leg, trip.legs[0]);
});

test('the canonical resolver preserves an explicit imported road booking on a reviewed rail corridor', async () => {
  const proposal = buildSpreadsheetImportProposal(parseDelimitedText('Destination,Country,Arrival date,Departure date,From,To,Transport date,Transport mode,Booking reference\nBrussels,Belgium,2026-12-18,2026-12-22,Paris,Brussels,2026-12-18,Road,ROAD-1'));
  const trip = canonicalTripFromSpreadsheetProposal({ id: 'booked-europe', proposal, origin: accepted('Paris', 'France', [2.3522, 48.8566]),
    places: [{ ...accepted('Brussels', 'Belgium', [4.3517, 50.8503]), sourceStopId: proposal.stops[0].id }], recommendUnbookedTransfers: true });
  assert.equal(trip.legs[0].mode, 'road');
  const result = await resolveCanonicalTransferJourney(trip.legs[0]);
  assert.equal(result.outcome, 'preserved');
  assert.deepEqual(result.leg, trip.legs[0]);
});

test('qualified original area labels keep their explicit dated booking after base selection', () => {
  const proposal = buildSpreadsheetImportProposal(parseDelimitedText('Destination,Country,Arrival date,Departure date,From,To,Transport date,Transport mode,Booking reference\n"Kyoto Prefecture, Japan",Japan,2026-12-18,2026-12-22,Hiroshima,Kyoto Prefecture,2026-12-18,Road,ROAD-2'));
  const trip = canonicalTripFromSpreadsheetProposal({ id: 'booked-japan-region', proposal, origin: accepted('Hiroshima', 'Japan', [132.4553, 34.3853]),
    places: [{ ...accepted('Kyoto', 'Japan', [135.7681, 35.0116]), sourceStopId: proposal.stops[0].id }], recommendUnbookedTransfers: true });
  assert.equal(trip.legs[0].routeMetadata.importedBookingId, proposal.bookings[0].id);
  assert.equal(trip.legs[0].mode, 'road');
});

test('an unassociated dated booking prevents a conflicting generated recommendation', () => {
  const proposal = buildSpreadsheetImportProposal(parseDelimitedText('Destination,Country,Arrival date,Departure date,From,To,Transport date,Transport mode,Booking reference\nKyoto,Japan,2026-12-18,2026-12-22,Hiroshima station,Kyoto station,2026-12-18,Road,ROAD-3'));
  const trip = canonicalTripFromSpreadsheetProposal({ id: 'unmatched-booking', proposal, origin: accepted('Hiroshima', 'Japan', [132.4553, 34.3853]),
    places: [{ ...accepted('Kyoto', 'Japan', [135.7681, 35.0116]), sourceStopId: proposal.stops[0].id }], recommendUnbookedTransfers: true });
  assert.equal(trip.legs[0].routeMetadata.importedBookingId, undefined);
  assert.equal(trip.legs[0].mode, 'unknown');
  assert.equal(trip.legs[0].routeMetadata.source, 'spreadsheet-import-unconfirmed');
  assert.equal(trip.brief.bookings![0].transportDetails?.mode, 'road');
});

test('an overnight booking on the incoming source row prevents a competing recommendation', () => {
  const proposal = buildSpreadsheetImportProposal(parseDelimitedText('Destination,Country,Arrival date,Departure date,From,To,Transport date,Transport mode,Booking reference\nKyoto,Japan,2026-12-18,2026-12-22,Hiroshima,Kyoto,2026-12-17,Road,NIGHTBUS-1'));
  const trip = canonicalTripFromSpreadsheetProposal({ id: 'overnight-booking', proposal, origin: accepted('Hiroshima', 'Japan', [132.4553, 34.3853]),
    places: [{ ...accepted('Kyoto', 'Japan', [135.7681, 35.0116]), sourceStopId: proposal.stops[0].id }], recommendUnbookedTransfers: true });
  assert.equal(trip.legs[0].routeMetadata.importedBookingId, undefined, 'do not infer an overnight booking association');
  assert.equal(trip.legs[0].routeMetadata.source, 'spreadsheet-import-unconfirmed');
  assert.equal(trip.brief.bookings![0].date, '2026-12-17');
});

test('an overnight station booking on the outgoing row holds both adjacent legs without guessing its association', () => {
  const proposal = buildSpreadsheetImportProposal(parseDelimitedText('Destination,Country,Arrival date,Departure date,From,To,Transport date,Transport mode,Booking reference\nHiroshima,Japan,2026-12-15,2026-12-18,Hiroshima station,Kyoto station,2026-12-17,Road,NIGHTBUS-2\nKyoto,Japan,2026-12-18,2026-12-22,,,,,'));
  const trip = canonicalTripFromSpreadsheetProposal({ id: 'outgoing-overnight-booking', proposal, origin: accepted('Tokyo', 'Japan', [139.6917, 35.6895]),
    places: [accepted('Hiroshima', 'Japan', [132.4553, 34.3853]), accepted('Kyoto', 'Japan', [135.7681, 35.0116])].map((place, i) => ({ ...place, sourceStopId: proposal.stops[i].id })), recommendUnbookedTransfers: true });
  assert.deepEqual(trip.legs.map(leg => leg.routeMetadata.source), ['spreadsheet-import-unconfirmed', 'spreadsheet-import-unconfirmed']);
  assert.ok(trip.legs.every(leg => !leg.routeMetadata.importedBookingId));
});
