import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import { renderBuilder } from './helpers/builder-render.ts';
import { canonicalRouteFixture } from './fixtures/batch14-route-documents.ts';
import { canonicalTripForOwner } from '../lib/easyt/trip-promotion.ts';
import { requireReadableTripDocument } from '../lib/easyt/trip-document.ts';
import { nextTripUpdatedAt } from '../lib/easyt/trip-continuity.ts';
import { extractStructuredTripBrief } from '../lib/easyt/structured-trip-brief.ts';
import { resolvePlaceMentions } from '../lib/easyt/place-intelligence.ts';

const enabled = process.env.MORROVIA_BUILDER_APP_BROWSER_TESTS === '1';
function savedBelizeTrip() {
  const trip = requireReadableTripDocument(canonicalTripForOwner('owner-a', canonicalRouteFixture()));
  const mention = resolvePlaceMentions('Belize').mentions[0]!;
  const structured = extractStructuredTripBrief('Explore Belize. Caye Caulker for 2 nights.');
  structured.placeMentions = [mention];
  structured.completedPlanningAreaMentionIds = [mention.mentionId];
  structured.placeSelections = [{ mentionId: mention.mentionId, kind: 'base', selectedCanonicalPlaceId: 'caye-caulker',
    selectedName: 'Caye Caulker', selectedPlaceType: 'town', selectedParentCountries: ['Belize'], routeStopId: 'caye-occurrence',
    provenance: { id: 'fixture-traveller-selection', label: 'Traveller', kind: 'builder', supports: 'Explicit fixture choice' } }];
  trip.brief.structuredBrief = structured;
  trip.stops = [{ id: 'caye-occurrence', order: 0, name: 'Caye Caulker', country: 'Belize', canonicalPlaceId: 'caye-caulker',
    latitude: 17.7425, longitude: -88.0246, arrivalDate: trip.startDate, departureDate: '2026-10-12', nights: 2 }];
  trip.legs = []; trip.planItems = []; trip.brief.bookings = [];
  trip.brief.intent.hardConstraints.mustSeeStopIds = []; trip.brief.intent.hardConstraints.optionalStopIds = [];
  trip.brief.manualNightStopIds = ['caye-occurrence']; trip.brief.nightAllocations = { 'caye-occurrence': 2 };
  trip.brief.intent.route.orderedStopIds = ['caye-occurrence'];
  trip.brief.intent.route.destinations = [{ id: mention.mentionId, sourceText: 'Belize', kind: 'planning_area',
    selectedPlace: { name: 'Belize', country: 'Belize', canonicalPlaceId: 'belize' }, resolution: 'resolved',
    requestedNights: null, routeMembership: 'required', stopIds: ['caye-occurrence'] }];
  return requireReadableTripDocument(trip);
}
async function mountSavedTrip(candidates: Record<string, unknown[]> = {}) {
  let cloud = savedBelizeTrip(); const initial = structuredClone(cloud); let writes = 0;
  const view = await renderBuilder({ initialTrip: cloud, seedRecovery: false, ownerId: 'owner-a', query: `?trip=${cloud.id}`,
    geocodeCandidates: candidates, accountRequest: ({ method, trip }) => {
      if (method === 'GET') return { status: 200, body: { trip: cloud } };
      const next = requireReadableTripDocument(trip); assert.equal(next.updatedAt, cloud.updatedAt);
      writes++; cloud = { ...next, updatedAt: nextTripUpdatedAt(cloud.updatedAt) };
      return { status: 200, body: { trip: cloud } };
    } });
  view.page.setDefaultTimeout(5000);
  await view.page.locator('[data-builder-top-controls]').waitFor();
  return { view, initial, cloud: () => cloud, writes: () => writes };
}
async function until(view: Awaited<ReturnType<typeof renderBuilder>>, predicate: () => boolean) {
  for (let i = 0; i < 70 && !predicate(); i++) await view.page.waitForTimeout(100);
  assert.ok(predicate());
}

for (const width of [390, 1440]) test(`actual Belize Discovery at ${width}px renders neutral choices and deliberate Add autosaves/reloads without replacing Caye`, { skip: !enabled, timeout: 40000 }, async () => {
  const h = await mountSavedTrip(); const { page } = h.view;
  try {
    await page.setViewportSize({ width, height: 900 });
    await page.getByRole('button', { name: 'Edit Belize', exact: true }).click();
    const dialog = page.getByRole('dialog').last();
    await dialog.getByRole('heading', { name: 'Belize City', exact: true }).waitFor();
    assert.equal(await dialog.locator('[data-discovery-card="true"]').count(), 4);
    assert.equal(await dialog.locator('[data-discovery-card="true"][data-selected="true"]').count(), 0);
    assert.equal(await dialog.locator('[data-photo]').count(), 0);
    assert.doesNotMatch(await dialog.innerText(), /No suggested stops here yet|Recommended|Stay here/);
    assert.equal(h.cloud().stops.length, 1);
    await dialog.getByRole('button', { name: 'Add to shortlist: Belize City', exact: true }).click();
    assert.equal(h.cloud().stops.length, 1, 'shortlisting alone never adds a route stop');
    const add = dialog.getByRole('button', { name: 'Add 1 place', exact: true });
    assert.equal(await add.isEnabled(), true);
    // The fixture omits CSS; bypass layout stability while invoking the actual
    // mounted button handler, as the existing Discovery browser suite does.
    await add.evaluate((button: HTMLButtonElement) => button.click());
    await until(h.view, () => h.cloud().stops.some(stop => stop.canonicalPlaceId === 'belize-city'));
    await page.getByText('Saved to your account', { exact: true }).waitFor();
    const saved = structuredClone(h.cloud());
    assert.equal(saved.stops.length, 2); assert.equal(saved.stops[0]!.id, 'caye-occurrence');
    assert.equal(saved.stops[0]!.nights, 2); assert.equal(saved.stops[0]!.canonicalPlaceId, 'caye-caulker');
    assert.equal(saved.brief.intent.route.orderAuthority, 'manual');
    assert.deepEqual(saved.brief.intent.route.journeyEnd, h.initial.brief.intent.route.journeyEnd);
    assert.equal(saved.stops.filter(stop => stop.canonicalPlaceId === 'caye-caulker').length, 1);
    assert.ok(h.writes() > 0);
    await page.reload(); await page.locator('[data-builder-top-controls]').waitFor();
    assert.equal(await page.getByRole('button', { name: 'Edit Belize City', exact: true }).count(), 1);
    assert.deepEqual(h.cloud().stops, saved.stops);
    assert.deepEqual(h.cloud().brief.structuredBrief!.discoveryDraftByMentionId, saved.brief.structuredBrief!.discoveryDraftByMentionId);
    assert.deepEqual(h.view.errors, []);
  } catch (error) { throw new Error(`${String(error)}; body=${(await page.locator('body').innerText()).slice(-3000)}`, { cause: error }); }
  finally { await h.view.close(); }
});

async function actualGuaPayload(iata?: string) {
  const captured = JSON.parse(readFileSync(new URL('./fixtures/batch14-gua-live-provider.json', import.meta.url), 'utf8'));
  const require = createRequire(import.meta.url);
  const bundle = await build({ stdin: { contents: "export {GET} from './app/api/journey-geocode/route';", resolveDir: process.cwd(), loader: 'ts' },
    bundle: true, write: false, platform: 'node', format: 'cjs', external: ['next/server'], logLevel: 'silent' });
  const module = { exports: {} as any };
  new Function('require', 'module', 'exports', bundle.outputFiles[0]!.text)(require, module, module.exports);
  const original = globalThis.fetch; let payload;
  globalThis.fetch = (async (input: any) => { const row = captured.responses.find((r: any) => r.url === String(input));
    assert.ok(row);
    const body = iata && new URL(String(input)).searchParams.get('q') === 'GUA airport'
      ? row.body.map((value: any) => ({ ...value, namedetails: { ...value.namedetails, iata } })) : row.body;
    return new Response(JSON.stringify(body), { status: row.status }); }) as typeof fetch;
  try { payload = await (await module.exports.GET(new (require('next/server').NextRequest)('http://fixture/api/journey-geocode?place=GUA&candidates=1&intent=route-stop'))).json(); }
  finally { globalThis.fetch = original; }
  return payload;
}

test('actual API response from live-captured GUA provider bodies reaches the mounted origin chooser and survives accepted autosave/reload', { skip: !enabled, timeout: 35000 }, async () => {
  const payload = await actualGuaPayload();
  assert.equal(payload.candidates[0].providerId, 'nominatim:relation:17228072');
  const h = await mountSavedTrip({ GUA: payload.candidates }); const { page } = h.view;
  try {
    const origin = page.getByRole('combobox', { name: 'Start from', exact: true });
    await origin.fill('GUA');
    await page.getByRole('option').filter({ hasText: 'La Aurora International Airport' }).waitFor();
    const first = page.getByRole('option').first(); await first.waitFor();
    assert.match(await first.innerText(), /La Aurora International Airport[\s\S]*Guatemala/);
    await first.click();
    await until(h.view, () => h.cloud().brief.intent.route.origin?.name === 'La Aurora International Airport');
    await page.getByText('Saved to your account', { exact: true }).waitFor();
    const saved = structuredClone(h.cloud());
    assert.equal(saved.brief.intent.route.origin?.canonicalPlaceId, payload.candidates[0].canonicalPlaceId);
    assert.deepEqual(saved.brief.intent.route.origin?.coordinates, [-90.5271541, 14.5832025]);
    assert.deepEqual(saved.stops, h.initial.stops);
    assert.equal(saved.brief.intent.route.orderAuthority, h.initial.brief.intent.route.orderAuthority);
    assert.deepEqual(saved.brief.intent.route.journeyEnd, h.initial.brief.intent.route.journeyEnd);
    await page.reload(); await origin.waitFor(); assert.match(await origin.inputValue(), /La Aurora/);
    assert.deepEqual(h.cloud().brief.intent.route.origin, saved.brief.intent.route.origin); assert.deepEqual(h.view.errors, []);
  } finally { await h.view.close(); }
});

for (const iata of ['GUA/XXX', 'XXX']) test(`actual provider response with ${iata} cannot gain code priority or silently change the mounted origin`, { skip: !enabled, timeout: 30000 }, async () => {
  const payload = await actualGuaPayload(iata);
  assert.ok(payload.candidates.every((candidate: any) => !candidate.matchedAirportCode));
  const h = await mountSavedTrip({ GUA: payload.candidates });
  try {
    const { page } = h.view;
    const response = page.waitForResponse((res: any) => new URL(res.url()).pathname === '/api/journey-geocode'
      && new URL(res.url()).searchParams.get('place') === 'GUA');
    await page.getByRole('combobox', { name: 'Start from', exact: true }).fill('GUA');
    await response;
    await page.waitForTimeout(100);
    assert.doesNotMatch(await page.getByRole('option').first().innerText(), /La Aurora/);
    assert.deepEqual(h.cloud().brief.intent.route.origin, h.initial.brief.intent.route.origin);
    assert.deepEqual(h.cloud().stops, h.initial.stops);
    assert.deepEqual(h.view.errors, []);
  } finally { await h.view.close(); }
});
