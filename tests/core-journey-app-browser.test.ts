import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import test from "node:test";
import type { BrowserContext, Page } from "playwright";
import { createPrivacyConsentRecord, PRIVACY_CONSENT_STORAGE_KEY } from "../lib/privacy-consent.ts";
import { geographicallyReady, stopGeographicPlace } from "../lib/easyt/geographic-binding.ts";
import { REFERENCE_SNAPSHOT_ID } from "../lib/easyt/place-reference.ts";
import type { EasyTTrip, JourneyEndpointPlace, DestinationIntent } from "../lib/easyt/trip.ts";
import { canonicalRouteFixture } from "./fixtures/batch14-route-documents.ts";
import { requireReadableTripDocument, prepareTripDocumentForWrite } from "../lib/easyt/trip-document.ts";
import { acceptedGeographicPlace } from "../lib/easyt/geographic-binding.ts";
import { prepareBuilderHandlerEdit } from "../lib/easyt/trip-builder-handler-contract.ts";
import { builderDocumentFingerprint } from "../lib/easyt/trip-builder-document-commit.ts";
import {findCatalogPlaceById} from '../lib/easyt/place-catalog.ts';

const require = createRequire(import.meta.url);
const bundled = `${homedir()}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright`;
const { chromium } = require(process.env.MORROVIA_PLAYWRIGHT_MODULE ?? (existsSync(bundled) ? bundled : "playwright")) as typeof import("playwright");
const enabled = process.env.MORROVIA_CORE_JOURNEY_BROWSER_TESTS === "1";
const base = process.env.MORROVIA_BASE_URL ?? "http://127.0.0.1:3100";
if (enabled) {
  const target = new URL(base);
  if (target.protocol !== "http:" || !["127.0.0.1", "localhost", "[::1]"].includes(target.hostname)) {
    throw new Error("Tier 1 browser tests may target only a local HTTP app; hosted staging and production are excluded.");
  }
}
const artifacts = process.env.MORROVIA_BROWSER_ARTIFACT_DIR ?? "/tmp/morrovia-core-journey";
const consent = JSON.stringify(createPrivacyConsentRecord({ analytics: false, affiliateTracking: false }, "2026-10-05T12:00:00.000Z"));

const places = {
  Madrid: { canonicalPlaceId: "madrid", name: "Madrid", country: "Spain", countryCode: "ES", coordinates: [-3.7038, 40.4168] },
  Lisbon: { canonicalPlaceId: "lisbon", name: "Lisbon", country: "Portugal", countryCode: "PT", coordinates: [-9.1393, 38.7223] },
  Porto: { canonicalPlaceId: "porto", name: "Porto", country: "Portugal", countryCode: "PT", coordinates: [-8.6291, 41.1579] },
  London: { canonicalPlaceId: "london", name: "London", country: "United Kingdom", countryCode: "GB", coordinates: [-0.1278, 51.5074] },
  Paris: { canonicalPlaceId: "paris", name: "Paris", country: "France", countryCode: "FR", coordinates: [2.3522, 48.8566] },
  Agra: { canonicalPlaceId: "agra", name: "Agra", country: "India", countryCode: "IN", coordinates: [78.0081, 27.1767] },
} as const;

// Coordinate-required origin selection uses these maintained city identities.
// Legacy destination identities in this journey remain separately authoritative.
const origins = {
  Paris: { name: "Paris", country: "France", countryCode: "FR", canonicalPlaceId: "reference:geonames:2988507", coordinates: [2.3488, 48.85341] },
  London: { name: "London", country: "United Kingdom", countryCode: "GB", canonicalPlaceId: "reference:geonames:2643743", coordinates: [-0.12574, 51.50853] },
} as const;

function assertOrigin(place: JourneyEndpointPlace | null | undefined, expected: typeof origins[keyof typeof origins]) {
  assert.ok(place);
  assert.deepEqual({ name: place.name, country: place.country, canonicalPlaceId: place.canonicalPlaceId, coordinates: place.coordinates },
    { name: expected.name, country: expected.country, canonicalPlaceId: expected.canonicalPlaceId, coordinates: [...expected.coordinates] });
  const sourceId = expected.canonicalPlaceId.split(":")[2];
  assert.equal(place.providerId, `reference:geonames:${sourceId}@${REFERENCE_SNAPSHOT_ID}:${expected.countryCode}:city:${expected.coordinates.join(":")}`);
  assert.equal(place.geographicBinding?.canonicalPlaceId, expected.canonicalPlaceId);
  assert.equal(place.geographicBinding?.country, expected.country);
  assert.equal(geographicallyReady(place, "endpoint"), true, "selected origin owns valid current geography");
}

function assertDestinationGeography(trip: EasyTTrip) {
  assert.deepEqual(trip.stops.map(stop => ({ id: stop.canonicalPlaceId, country: stop.country, coordinates: [stop.longitude, stop.latitude] })),
    [places.Madrid, places.Lisbon, places.Porto].map(place => ({ id: place.canonicalPlaceId, country: place.country, coordinates: [...place.coordinates] })));
  for (const stop of trip.stops) assert.equal(geographicallyReady(stopGeographicPlace(stop)), true);
  assert.deepEqual(trip.brief.intent?.route?.destinations.map(intent => [intent.selectedPlace?.canonicalPlaceId, intent.selectedPlace?.country, intent.kind]),
    [["madrid", "Spain", "overnight_place"], ["lisbon", "Portugal", "overnight_place"], ["porto", "Portugal", "overnight_place"]]);
  assert.equal(trip.brief.intent?.route?.tripType, "return_to_start");
  assert.equal(trip.brief.intent?.route?.journeyEnd.mode, "same_as_start");
}

test("legacy saved Paris origin retains its own identity, point, route order and nights", () => {
  const original = requireReadableTripDocument(canonicalRouteFixture());
  const candidate = { ...places.Paris, coordinates: [...places.Paris.coordinates] as [number, number],
    providerId: "core-fixture:paris", placeType: "city", routability: "direct_destination" };
  const place = acceptedGeographicPlace({ name: candidate.name, canonicalPlaceId: candidate.canonicalPlaceId,
    country: candidate.country, providerId: candidate.providerId, coordinates: candidate.coordinates }, candidate, "endpoint");
  assert.ok(place);
  const edit = prepareBuilderHandlerEdit(original, { kind: "origin", place }, builderDocumentFingerprint(original));
  assert.ok(edit.ok);
  if (!edit.ok) return;
  const saved = prepareTripDocumentForWrite(edit.trip);
  const reloaded = requireReadableTripDocument(JSON.parse(JSON.stringify(saved)));
  assert.deepEqual(reloaded.brief.intent.route.origin, place);
  assert.equal(reloaded.brief.intent.route.origin?.canonicalPlaceId, "paris", "historical identities are not replaced by current reference aliases");
  assert.equal(geographicallyReady(reloaded.brief.intent.route.origin, "endpoint"), true);
  assert.deepEqual(reloaded.stops.map(stop => [stop.id, stop.canonicalPlaceId, stop.nights]), original.stops.map(stop => [stop.id, stop.canonicalPlaceId, stop.nights]));
  assert.deepEqual(reloaded.brief.intent.route.orderedStopIds, original.brief.intent.route.orderedStopIds);
});

/** Measure native activation through visible feedback across two animation frames
 * (a paint opportunity), excluding driver round trips and post-click waits.
 * Retain page-side blocking before click and after DOM mutation in the budget. */
async function armBrowserInteractionTiming(page: Page, condition: { trigger: string; selected?: string; leavingArea?: string }) {
  await page.evaluate(condition => {
    const record: { start: number | null; end: number | null } = { start: null, end: null };
    (window as unknown as { __coreInteractionTiming: typeof record }).__coreInteractionTiming = record;
    const trigger = [...document.querySelectorAll('button')].find(button =>
      (button.getAttribute('aria-label') ?? button.textContent?.trim()) === condition.trigger);
    if (!trigger) throw new Error('Measured interaction trigger is missing');
    const visible = (element: Element | null): boolean => element instanceof HTMLElement && element.isConnected
      && element.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })
      && element.getClientRects().length > 0 && element.getBoundingClientRect().width > 0 && element.getBoundingClientRect().height > 0;
    const ready = () => {
      if (condition.selected) return visible(trigger) && trigger.getAttribute('aria-label') === condition.selected
        && trigger.getAttribute('aria-pressed') === 'true';
      const dialogs = [...document.querySelectorAll('[role="dialog"]')];
      if (dialogs.some(dialog => dialog.textContent?.includes(condition.leavingArea!))) return false;
      // Acceptance exposes the next Discovery dialog or the Builder controls.
      return dialogs.length ? dialogs.some(visible) : visible(document.querySelector('[data-builder-top-controls]'));
    };
    if (ready()) throw new Error('Interaction feedback must not be ready before activation');
    let clicked = false, readyFrame = false;
    const frame = () => {
      const feedbackReady = clicked && ready();
      if (feedbackReady && readyFrame) {
        record.end = performance.now();
        for (const type of ['pointerdown', 'mousedown', 'keydown', 'click']) document.removeEventListener(type, onInput, true);
        return;
      }
      readyFrame = feedbackReady;
      requestAnimationFrame(frame);
    };
    const onInput = (event: Event) => {
      if (!(event.target instanceof Element) || event.target.closest('button') !== trigger) return;
      if (event instanceof KeyboardEvent && !['Enter', ' ', 'Spacebar'].includes(event.key)) return;
      if (event instanceof MouseEvent && event.button !== 0) return;
      if (record.start === null) {
        // Modern browsers use the performance timeline; retain an epoch fallback.
        record.start = event.timeStamp > performance.timeOrigin ? event.timeStamp - performance.timeOrigin : event.timeStamp;
        requestAnimationFrame(frame);
      }
      if (event.type === 'click') clicked = true;
    };
    for (const type of ['pointerdown', 'mousedown', 'keydown', 'click']) document.addEventListener(type, onInput, true);
  }, condition);
}
async function browserInteractionElapsed(page: Page) {
  await page.waitForFunction(() => (window as unknown as { __coreInteractionTiming?: { end: number | null } }).__coreInteractionTiming?.end != null, undefined, { timeout: 15000 });
  return page.evaluate(() => {
    const record = (window as unknown as { __coreInteractionTiming: { start: number; end: number } }).__coreInteractionTiming;
    return record.end - record.start;
  });
}

async function installDeterministicBoundaries(context: BrowserContext) {
  await context.addInitScript(({ key, value }: { key: string; value: string }) => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, value);
  }, { key: PRIVACY_CONSENT_STORAGE_KEY, value: consent });
  await context.route("**/api/journey-geocode?*", async (route) => {
    const query = new URL(route.request().url()).searchParams.get("place")?.toLowerCase() ?? "";
    const match = Object.entries(places).find(([name]) => query.includes(name.toLowerCase()))?.[1];
    const candidate = match ? { ...match, providerId: `core-fixture:${match.canonicalPlaceId}`, providerSourceLabel: "Core journey fixture", kind: "city", placeType: "city", routability: "direct_destination", matchQuality: "exact", rankScore: 200 } : null;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ candidates: candidate ? [candidate] : [] }) });
  });
  // No external media/providers are needed for this local deterministic journey.
  // The bundled fallback style still mounts the real MapLibre canvas and markers.
  await context.route("https://**/*", (route) => route.abort());
}

async function withEvidence(name: string, run: (page: Page, context: BrowserContext) => Promise<void>, width = 390) {
  const browser = await chromium.launch({ headless: true, ...(process.env.MORROVIA_BROWSER_CHANNEL ? { channel: process.env.MORROVIA_BROWSER_CHANNEL } : {}) });
  const context = await browser.newContext({ viewport: { width, height: 1000 } });
  const page = await context.newPage();
  const pageErrors: string[] = [];
  page.on("pageerror", error => pageErrors.push(error.message));
  await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
  try {
    await installDeterministicBoundaries(context);
    await run(page, context);
    assert.deepEqual(pageErrors, [], "guest journey has no unhandled page errors");
    await context.tracing.stop();
  } catch (error) {
    mkdirSync(artifacts, { recursive: true });
    // Fresh local guest context only: retain canonical/recovery evidence, not
    // cookies or arbitrary browser storage, when an end-to-end assertion fails.
    const guestEvidence = await page.evaluate(() => Object.fromEntries(Object.keys(localStorage)
      .filter(key => key.startsWith("easyt:trip-recovery:v2:guest:") || key === "easyt-private:guest:homepage-input")
      .map(key => [key, JSON.parse(localStorage.getItem(key) ?? "null")]))).catch(() => null);
    if (guestEvidence) writeFileSync(`${artifacts}/${name}-guest-recovery.json`, JSON.stringify(guestEvidence, null, 2));
    await page.screenshot({ path: `${artifacts}/${name}.png`, fullPage: true }).catch(() => {});
    await context.tracing.stop({ path: `${artifacts}/${name}.zip` }).catch(() => {});
    throw error;
  } finally {
    await context.close();
    await browser.close();
  }
}

async function recoveryTrip(page: Page, tripId: string) {
  return page.evaluate((id) => {
    const records = Object.keys(localStorage).filter((key) => key.startsWith(`easyt:trip-recovery:v2:guest:${encodeURIComponent(id)}:`));
    return records.map((key) => {
      try { return JSON.parse(localStorage.getItem(key) ?? "null")?.trip; } catch { return null; }
    }).find((trip) => trip?.id === id) ?? null;
  }, tripId) as Promise<EasyTTrip | null>;
}

test('unconfirmed destination focuses its editor and preserves a confirmed airport origin', {skip:!enabled,timeout:60_000},async()=>withEvidence('destination-error-focus',async(page,context)=>{
 await context.unroute('**/api/journey-geocode?*');
 await page.goto(base,{waitUntil:'domcontentloaded'});
 await page.getByRole('combobox',{name:'Start from',exact:true}).fill('LAX');
 await page.getByRole('option',{name:/Los Angeles International Airport.*United States/}).click();
 await page.getByRole('combobox',{name:'Destination',exact:true}).fill('Asia');
 await page.getByRole('button',{name:'Plan my trip'}).first().click();
 await page.getByText('Select each destination from the results.',{exact:true}).waitFor();
 await page.waitForFunction(()=>document.activeElement?.getAttribute('aria-label')==='Destination');
 await page.getByRole('combobox',{name:'Start from',exact:true}).focus();
 await page.getByRole('button',{name:'Plan my trip'}).first().click();
 await page.waitForFunction(()=>document.activeElement?.getAttribute('aria-label')==='Destination');
 const stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('easyt-private:guest:homepage-input')??'null'));
 assert.equal(stored.snapshot.origin.value.canonicalPlaceId,'reference:ourairports:3632');
 assert.equal(geographicallyReady(stored.snapshot.origin.value,'endpoint'),true);
 assert.equal(stored.snapshot.entries[0].text,'Asia');assert.equal(stored.snapshot.entries[0].selection,null);
 assert.equal(new URL(page.url()).pathname,'/');
}));

test('unconfirmed origin recovers focus and raw intent after primary-action validation', {skip:!enabled,timeout:60_000},async()=>withEvidence('origin-error-focus',async(page,context)=>{
 await context.unroute('**/api/journey-geocode?*');await page.goto(base,{waitUntil:'domcontentloaded'});
 await page.getByRole('combobox',{name:'Start from',exact:true}).fill('Springfield');
 await page.getByRole('combobox',{name:'Destination',exact:true}).fill('Madrid');await page.getByRole('option',{name:/Madrid.*Spain/}).first().click();
 await page.getByRole('button',{name:'Plan my trip'}).first().click();await page.getByText('Select your starting place from the results.',{exact:true}).waitFor();
 await page.waitForFunction(()=>document.activeElement?.getAttribute('aria-label')==='Start from');
 const stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('easyt-private:guest:homepage-input')??'null'));
 assert.equal(stored.snapshot.originInput,'Springfield');assert.equal(stored.snapshot.origin.state,'cleared');assert.equal(stored.receipt,undefined);
 assert.equal(new URL(page.url()).pathname,'/');
}));

test('maintained airport origin survives actual submit, manual Builder change, Build and reload', {skip:!enabled,timeout:120_000},async()=>withEvidence('airport-origin-build-reload',async(page,context)=>{
 await context.unroute('**/api/journey-geocode?*');
 await page.goto(base,{waitUntil:'domcontentloaded'});
 await page.getByRole('combobox',{name:'Start from',exact:true}).fill('LAX');
 await page.getByRole('option',{name:/Los Angeles International Airport.*United States/}).click();
 await page.getByRole('combobox',{name:'Destination',exact:true}).fill('Madrid');
 await page.getByRole('option',{name:/Madrid.*Spain/}).first().click();
 await page.getByRole('button',{name:'Plan my trip'}).first().click();await page.waitForURL(/journey\/new\?/);
 await page.locator('[data-builder-route-workspace]').waitFor();
 const draftId=new URL(page.url()).searchParams.get('trip')!;
 await page.waitForFunction(id=>Object.keys(localStorage).filter(k=>k.startsWith(`easyt:trip-recovery:v2:guest:${encodeURIComponent(id)}:`)).some(k=>JSON.parse(localStorage.getItem(k)??'null')?.trip?.brief?.intent?.route?.origin?.canonicalPlaceId==='reference:ourairports:3632'),draftId);
 assert.equal(geographicallyReady((await recoveryTrip(page,draftId))?.brief.intent?.route?.origin,'endpoint'),true);
 await page.getByRole('combobox',{name:'Start from',exact:true}).fill('GUA');
 await page.getByRole('option',{name:/La Aurora International Airport.*Guatemala/}).click();
 await page.waitForFunction(id=>Object.keys(localStorage).filter(k=>k.startsWith(`easyt:trip-recovery:v2:guest:${encodeURIComponent(id)}:`)).some(k=>JSON.parse(localStorage.getItem(k)??'null')?.trip?.brief?.intent?.route?.origin?.canonicalPlaceId==='reference:ourairports:4644'),draftId);
 const changed=(await recoveryTrip(page,draftId))!.brief.intent!.route!.origin!;
 assert.equal(changed.country,'Guatemala');assert.deepEqual(changed.coordinates,[-90.527515,14.582896]);assert.equal(changed.geographicBinding?.placeType,'transport_gateway');assert.equal(geographicallyReady(changed,'endpoint'),true);
 await page.getByRole('button',{name:/Build trip/}).click();await page.waitForURL(/journey\/trip-[^/]+\?created=1/,{timeout:25_000});
 const tripId=new URL(page.url()).pathname.split('/')[2]!;await page.getByRole('region',{name:'Trip overview'}).waitFor();
 assert.deepEqual((await recoveryTrip(page,tripId))!.brief.intent!.route!.origin,changed);
 await page.reload({waitUntil:'domcontentloaded'});await page.getByRole('region',{name:'Trip overview'}).waitFor();
 assert.deepEqual((await recoveryTrip(page,tripId))!.brief.intent!.route!.origin,changed);
}));

test('distinct same-country origin choices show geography and preserve mouse and keyboard selections', {skip:!enabled,timeout:90_000},async()=>withEvidence('same-country-choices',async(page,context)=>{
 await context.unroute('**/api/journey-geocode?*');await page.goto(base,{waitUntil:'domcontentloaded'});
 const input=page.getByRole('combobox',{name:'Start from',exact:true});
 const response=page.waitForResponse(r=>r.url().includes('/api/journey-geocode?')&&new URL(r.url()).searchParams.get('place')==='Xi’an');
 await input.fill('Xi’an');const payload=await (await response).json();
 const expected=payload.candidates.filter((p:any)=>p.name==='Xi’an');assert.equal(expected.length,5);
 const options=page.getByRole('option',{name:/^Xi’an.*China/});await options.first().waitFor();assert.equal(await options.count(),5);
 const labels=await options.allTextContents();assert.equal(new Set(labels).size,5);assert.ok(labels.every((label,index)=>label.includes(`Location ${index+1} of 5`)&&label.includes('City')));
 await options.first().click();
 await page.waitForFunction(id=>JSON.parse(localStorage.getItem('easyt-private:guest:homepage-input')??'null')?.snapshot?.origin?.value?.canonicalPlaceId===id,expected[0].canonicalPlaceId);
 const selected=async()=>page.evaluate(()=>JSON.parse(localStorage.getItem('easyt-private:guest:homepage-input')??'null')?.snapshot.origin.value);
 const first=await selected();assert.equal(first.canonicalPlaceId,expected[0].canonicalPlaceId);assert.deepEqual(first.coordinates,expected[0].coordinates);assert.equal(geographicallyReady(first,'endpoint'),true);
 await input.fill('Xi’an');await options.first().waitFor();await input.press('ArrowDown');await input.press('ArrowDown');await input.press('ArrowDown');await input.press('Enter');
 await page.waitForFunction(id=>JSON.parse(localStorage.getItem('easyt-private:guest:homepage-input')??'null')?.snapshot?.origin?.value?.canonicalPlaceId===id,expected[2].canonicalPlaceId);
 const keyboard=await selected();assert.equal(keyboard.canonicalPlaceId,expected[2].canonicalPlaceId);assert.deepEqual(keyboard.coordinates,expected[2].coordinates);assert.equal(geographicallyReady(keyboard,'endpoint'),true);
}));

test('unseen multi-country destination choices survive actual Plan submission as unresolved areas', {skip:!enabled,timeout:90_000},async()=>withEvidence('multi-country-intake',async(page,context)=>{
 await context.unroute('**/api/journey-geocode?*');await page.goto(base,{waitUntil:'domcontentloaded'});
 await page.getByRole('combobox',{name:'Start from',exact:true}).fill('LHR');await page.getByRole('option',{name:/London Heathrow Airport.*United Kingdom/}).click();
 for(const [index,name] of ['Southeast Asia','Patagonia','Alps','Madrid'].entries()){
  if(index)await page.getByRole('button',{name:'Add destination',exact:true}).click();
  await page.getByRole('combobox',{name:'Destination',exact:true}).fill(name);
  await page.getByRole('option',{name:new RegExp(`^${name}`)}).first().click();
 }
 await page.getByRole('button',{name:'Plan my trip'}).first().click();await page.waitForURL(/journey\/new\?/);
 await page.waitForURL(url=>url.pathname==='/journey/new'&&Boolean(url.searchParams.get('trip')));
 const id=new URL(page.url()).searchParams.get('trip')!;
 await page.waitForFunction(id=>Object.keys(localStorage).filter(k=>k.startsWith(`easyt:trip-recovery:v2:guest:${encodeURIComponent(id)}:`)).some(k=>JSON.parse(localStorage.getItem(k)??'null')?.trip?.brief?.intent?.route?.destinations?.length===4),id);
 const trip=(await recoveryTrip(page,id))!;
 const expected=['southeast-asia','patagonia','alps'];
 assert.deepEqual(trip.brief.intent!.route!.destinations.slice(0,3).map(p=>[p.selectedPlace?.canonicalPlaceId,p.kind,p.stopIds]),expected.map(p=>[p,'planning_area',[]]));
 assert.deepEqual(trip.stops.map(p=>p.name),['Madrid'],'no physical centroid or substitute base is introduced');
 for(const area of expected){const mention=trip.brief.structuredBrief!.placeMentions!.find(m=>m.canonicalPlaceId===area)!;assert.deepEqual(mention.parentCountries,findCatalogPlaceById(area)!.parentCountries);assert.equal(mention.directlyRoutable,false);}
}));

test('selected nonseed origin survives Describe submit, Build and reload', {skip:!enabled,timeout:120_000},async()=>withEvidence('describe-origin-intake',async(page,context)=>{
 await context.unroute('**/api/journey-geocode?*');await page.goto(base,{waitUntil:'domcontentloaded'});
 await page.getByRole('combobox',{name:'Start from',exact:true}).fill('Gubbio');await page.getByRole('option',{name:/Gubbio.*Italy/}).first().click();
 await page.waitForFunction(()=>JSON.parse(localStorage.getItem('easyt-private:guest:homepage-input')??'null')?.snapshot?.origin?.value?.canonicalPlaceId==='reference:geonames:3175687');
 const selected=await page.evaluate(()=>JSON.parse(localStorage.getItem('easyt-private:guest:homepage-input')??'null').snapshot.origin.value);
 assert.equal(selected.canonicalPlaceId,'reference:geonames:3175687');assert.equal(geographicallyReady(selected,'endpoint'),true);
 await page.getByRole('tab',{name:'Describe my trip',exact:true}).click();await page.getByRole('textbox',{name:'Start your plan'}).fill('Visit Madrid and Lisbon for 10 days');
 await page.getByRole('button',{name:'Plan my trip'}).first().click();await page.waitForURL(/journey\/new\?/);
 await page.waitForURL(url=>url.pathname==='/journey/new'&&Boolean(url.searchParams.get('trip')));
 const id=new URL(page.url()).searchParams.get('trip')!;
 await page.locator('[data-builder-route-workspace]').waitFor({timeout:30_000});
 await page.waitForFunction(id=>Object.keys(localStorage).filter(k=>k.startsWith(`easyt:trip-recovery:v2:guest:${encodeURIComponent(id)}:`)).some(k=>JSON.parse(localStorage.getItem(k)??'null')?.trip?.brief?.intent?.route?.origin?.canonicalPlaceId==='reference:geonames:3175687'),id);
 assert.deepEqual((await recoveryTrip(page,id))!.brief.intent!.route!.origin,selected);
 await page.getByRole('button',{name:/Build trip/}).click();await page.waitForURL(/journey\/trip-[^/]+\?created=1/,{timeout:30_000});
 const builtId=new URL(page.url()).pathname.split('/')[2]!;await page.getByRole('region',{name:'Trip overview'}).waitFor();
 await page.reload({waitUntil:'domcontentloaded'});await page.getByRole('region',{name:'Trip overview'}).waitFor();assert.deepEqual((await recoveryTrip(page,builtId))!.brief.intent!.route!.origin,selected);
}));

test('choosing a covered island from a namesake prompt keeps its seven-night base request', {skip:!enabled,timeout:120_000},async()=>withEvidence('tenerife-area-choice',async(page,context)=>{
 await context.unroute('**/api/journey-geocode?*');await page.goto(base,{waitUntil:'domcontentloaded'});
 await page.getByRole('combobox',{name:'Start from',exact:true}).fill('LHR');
 await page.getByRole('option',{name:/London Heathrow Airport.*United Kingdom/}).click();
 await page.getByRole('button',{name:'One way',exact:true}).click();
 await page.getByRole('tab',{name:'Describe my trip',exact:true}).click();
 await page.getByRole('textbox',{name:'Start your plan'}).fill('Tenerife 7 nights.');
 await page.getByRole('button',{name:'Plan my trip'}).first().click();
 await page.waitForURL(url=>url.pathname==='/journey/new'&&Boolean(url.searchParams.get('trip')));
 const id=new URL(page.url()).searchParams.get('trip')!;
 const dialog=page.getByRole('dialog').last();
 const islandChoice=dialog.getByRole('button',{name:/Tenerife, Spain.*Island/});
 await islandChoice.waitFor();
 assert(await dialog.getByRole('button',{name:/Tenerife, Colombia.*City/}).isVisible());
 const before=(await recoveryTrip(page,id))!;
 const original=before.brief.intent!.route!.destinations.find(item=>item.sourceText==='Tenerife')!;
 assert.equal(original.requestedNights,7);
 assert.deepEqual(original.stopIds,[]);
 await islandChoice.click();
 await page.waitForFunction(id=>Object.keys(localStorage).filter(k=>k.startsWith(`easyt:trip-recovery:v2:guest:${encodeURIComponent(id)}:`)).some(k=>{
  const mention=JSON.parse(localStorage.getItem(k)??'null')?.trip?.brief?.structuredBrief?.placeMentions?.find((item:{sourceText:string})=>item.sourceText==='Tenerife');
  return mention?.placeType==='island'&&mention?.status==='partially_resolved';
 }),id);
 const selected=(await recoveryTrip(page,id))!;
 const mention=selected.brief.structuredBrief!.placeMentions!.find(item=>item.mentionId===original.id)!;
 assert.equal(mention.canonicalPlaceId,'open-world:island-snapshot:relation:2108882');
 assert.equal(mention.requiresBaseSelection,true);
 assert.deepEqual(selected.stops,[]);
 assert.equal(selected.brief.intent!.route!.destinations.find(item=>item.id===original.id)?.requestedNights,7);
 const baseDialog=page.getByRole('dialog').last();
 await baseDialog.getByRole('combobox').first().fill('Santa Cruz de Tenerife');
 await baseDialog.getByRole('option',{name:/Santa Cruz de Tenerife.*Spain/}).first().click();
 const done=baseDialog.getByRole('button',{name:/Add places|Add to trip|Finish shaping route/}).last();
 if(await done.isEnabled())await done.click();
 await page.waitForFunction(id=>Object.keys(localStorage).filter(k=>k.startsWith(`easyt:trip-recovery:v2:guest:${encodeURIComponent(id)}:`)).some(k=>{
  const trip=JSON.parse(localStorage.getItem(k)??'null')?.trip;
  return trip?.stops?.some((stop:{name:string;nights:number})=>stop.name==='Santa Cruz de Tenerife'&&stop.nights===7);
 }),id);
 const withBase=(await recoveryTrip(page,id))!;
 assert.equal(withBase.brief.intent!.route!.destinations.find(item=>item.id===original.id)?.requestedNights,7);
 assert.equal(withBase.stops[0]?.canonicalPlaceId,'reference:geonames:2511174');
 assert.equal(await page.getByRole('button',{name:/^Add one night to Santa Cruz de Tenerife;/}).isEnabled(),false,
  'A fully allocated single-stop trip cannot accept an eighth night without changing dates');
},1440));

test('Canary archipelago search accepts a physically verified member base without an outside warning', {skip:!enabled,timeout:120_000},async()=>withEvidence('canary-member-base',async(page,context)=>{
 await context.unroute('**/api/journey-geocode?*');await page.goto(base,{waitUntil:'domcontentloaded'});
 await page.getByRole('combobox',{name:'Start from',exact:true}).fill('LHR');
 await page.getByRole('option',{name:/London Heathrow Airport.*United Kingdom/}).click();
 await page.getByRole('button',{name:'One way',exact:true}).click();
 await page.getByRole('tab',{name:'Describe my trip',exact:true}).click();
 await page.getByRole('textbox',{name:'Start your plan'}).fill('Canary Islands 7 nights.');
 await page.getByRole('button',{name:'Plan my trip'}).first().click();
 await page.waitForURL(url=>url.pathname==='/journey/new'&&Boolean(url.searchParams.get('trip')));
 const id=new URL(page.url()).searchParams.get('trip')!;
 const dialog=page.getByRole('dialog').last();
 await dialog.getByRole('combobox',{name:/Search for somewhere specific/}).fill('Santa Cruz de Tenerife');
 await dialog.getByRole('option',{name:/Santa Cruz de Tenerife.*Spain/}).first().click();
 await dialog.getByRole('button',{name:/Add 1 place/}).waitFor();
 assert.equal(await dialog.getByText(/Santa Cruz de Tenerife is outside Canary Islands/).count(),0);
 await dialog.getByRole('button',{name:/Add 1 place/}).click();
 await page.waitForFunction(id=>Object.keys(localStorage).filter(k=>k.startsWith(`easyt:trip-recovery:v2:guest:${encodeURIComponent(id)}:`)).some(k=>{
  const trip=JSON.parse(localStorage.getItem(k)??'null')?.trip;
  return trip?.stops?.some((stop:{name:string;nights:number})=>stop.name==='Santa Cruz de Tenerife'&&stop.nights===7);
 }),id);
 const trip=(await recoveryTrip(page,id))!;
 assert.equal(trip.brief.intent!.route!.destinations[0]?.requestedNights,7);
 assert.equal(trip.stops[0]?.canonicalPlaceId,'reference:geonames:2511174');
},1440));

test('pending Cusco source confirmation distinguishes real cities and Builds with every original stay', {skip:!enabled,timeout:120_000},async()=>withEvidence('cusco-confirm-build',async(page,context)=>{
 await context.unroute('**/api/journey-geocode?*');await page.goto(base,{waitUntil:'domcontentloaded'});
 await page.getByRole('combobox',{name:'Start from',exact:true}).fill('LHR');
 await page.getByRole('option',{name:/London Heathrow Airport.*United Kingdom/}).click();
 await page.getByRole('tab',{name:'Describe my trip',exact:true}).click();
 await page.getByRole('textbox',{name:'Start your plan'}).fill('12 nights: Lima 2, Arequipa 3, Cusco 5, Ollantaytambo 2.');
 await page.getByRole('button',{name:'Plan my trip'}).first().click();
 await page.waitForURL(url=>url.pathname==='/journey/new'&&Boolean(url.searchParams.get('trip')));
 const id=new URL(page.url()).searchParams.get('trip')!;
 await page.locator('[data-builder-route-workspace]').waitFor();
 const later=page.getByRole('dialog').getByRole('button',{name:'Finish later',exact:true});
 if(await later.waitFor({timeout:5000}).then(()=>true).catch(()=>false))await later.click();
 await page.getByRole('button',{name:'Choose place Cusco',exact:true}).first().click();
 const dialog=page.getByRole('dialog').filter({has:page.getByRole('heading',{name:'Confirm location',exact:true})});
 const intended=dialog.getByRole('button',{name:/Cusco.*Peru.*Location 1 of 2/});
 const other=dialog.getByRole('button',{name:/Cusco.*Peru.*Location 2 of 2/});
 await intended.waitFor();await other.waitFor();
 const before=(await recoveryTrip(page,id))!;assert.deepEqual(before.stops.map(stop=>stop.nights),[2,3,5,2]);
 await intended.click();await dialog.waitFor({state:'detached'});
 await page.waitForFunction(id=>Object.keys(localStorage).filter(k=>k.startsWith(`easyt:trip-recovery:v2:guest:${encodeURIComponent(id)}:`)).some(k=>JSON.parse(localStorage.getItem(k)??'null')?.trip?.stops?.find((s:{name:string})=>s.name==='Cusco')?.geographicBinding?.providerId?.includes('geonames:3941584')),id);
 const confirmed=(await recoveryTrip(page,id))!;
 assert.deepEqual(confirmed.stops.map(stop=>[stop.id,stop.nights]),before.stops.map(stop=>[stop.id,stop.nights]));
 assert.deepEqual(confirmed.brief.intent!.route!.orderedStopIds,before.brief.intent!.route!.orderedStopIds);
 assert.equal(await page.getByRole('button',{name:'Choose place Cusco',exact:true}).count(),0);
 await page.getByRole('button',{name:/Build trip/}).click();
 await page.waitForURL(/journey\/trip-[^/]+\?created=1/,{timeout:30_000});
 const builtId=new URL(page.url()).pathname.split('/')[2]!;await page.getByRole('region',{name:'Trip overview'}).waitFor();
 const built=(await recoveryTrip(page,builtId))!;
 assert.deepEqual(built.stops.map(stop=>[stop.name,stop.nights]),[['Lima',2],['Arequipa',3],['Cusco',5],['Ollantaytambo',2]]);
 const cusco=built.stops.find(stop=>stop.name==='Cusco')!;assert.deepEqual([cusco.longitude,cusco.latitude],[-71.96701,-13.53188]);
 assert.equal(geographicallyReady(stopGeographicPlace(cusco)),true);
 await page.reload({waitUntil:'domcontentloaded'});await page.getByRole('region',{name:'Trip overview'}).waitFor();
 assert.deepEqual((await recoveryTrip(page,builtId))!.stops,built.stops);
 mkdirSync(artifacts,{recursive:true});writeFileSync(`${artifacts}/cusco-confirm-build-result.json`,JSON.stringify({status:'PASS',sourceIntent:confirmed.brief.intent!.route!.destinations.find(item=>item.sourceText==='Cusco'),builtStops:built.stops},null,2));
}));

test('recorded source town choices remain reachable with empty autocomplete and retain original nights through Build', {skip:!enabled,timeout:120_000},async()=>withEvidence('provider-town-build',async(page,context)=>{
 await context.unroute('**/api/journey-geocode?*');
 const towns=[{name:'Aït Benhaddou',country:'Morocco',canonicalPlaceId:'open-world:photon:N:365060850',providerId:'photon:N:365060850',coordinates:[-7.1309706,31.0451536],placeType:'town',kind:'town',routability:'direct_destination',matchQuality:'exact',rankScore:298},
 {name:'Merzouga',country:'Morocco',canonicalPlaceId:'open-world:photon:N:3901504169',providerId:'photon:N:3901504169',coordinates:[-4.0140878,31.0999166],placeType:'town',kind:'town',routability:'direct_destination',matchQuality:'exact',rankScore:298}];
 await context.route('**/api/journey-geocode?*',async route=>{
  const params=new URL(route.request().url()).searchParams,q=(params.get('place')??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const town=towns.find(t=>q===t.name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase());if(!town)return route.fallback();
  const candidates=params.get('mode')==='autocomplete'?[]:[town,{...town,canonicalPlaceId:town.canonicalPlaceId+'-landmark',providerId:town.providerId+'-landmark',placeType:'landmark',kind:'landmark',routability:'anchor_or_poi'}];
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({candidates})});
 });
 await page.goto(base,{waitUntil:'domcontentloaded'});await page.getByRole('combobox',{name:'Start from',exact:true}).fill('LHR');await page.getByRole('option',{name:/London Heathrow Airport.*United Kingdom/}).click();
 await page.getByRole('button',{name:'One way',exact:true}).click();await page.getByRole('tab',{name:'Describe my trip',exact:true}).click();await page.getByRole('textbox',{name:'Start your plan'}).fill('10 nights: Marrakech 3, Aït Benhaddou 1, Merzouga 2, Fes 4.');await page.getByRole('button',{name:'Plan my trip'}).first().click();
 await page.waitForURL(url=>url.pathname==='/journey/new'&&Boolean(url.searchParams.get('trip')));const id=new URL(page.url()).searchParams.get('trip')!;await page.locator('[data-builder-route-workspace]').waitFor();
 const before=(await recoveryTrip(page,id))!;const sourceIds=before.brief.intent!.route!.destinations.filter(i=>towns.some(t=>i.sourceText===t.name)).map(i=>[i.id,i.requestedNights]);
 for(const town of towns){let dialog=page.getByRole('dialog').last();const choice=dialog.getByRole('button',{name:new RegExp('^'+town.name+', Morocco')});if(!await choice.isVisible().catch(()=>false)){const later=dialog.getByRole('button',{name:'Finish later',exact:true});if(await later.isVisible().catch(()=>false))await later.click();await page.getByRole('button',{name:'Choose place '+town.name,exact:true}).first().click();dialog=page.getByRole('dialog').last();}await dialog.getByRole('button',{name:new RegExp('^'+town.name+', Morocco')}).first().click();}
 await page.waitForFunction(id=>Object.keys(localStorage).filter(k=>k.startsWith(`easyt:trip-recovery:v2:guest:${encodeURIComponent(id)}:`)).some(k=>JSON.parse(localStorage.getItem(k)??'null')?.trip?.stops?.length===4),id);
 const confirmed=(await recoveryTrip(page,id))!;assert.deepEqual(confirmed.stops.map(s=>[s.name,s.nights]),[['Marrakech',3],['Aït Benhaddou',1],['Merzouga',2],['Fes',4]]);assert.deepEqual(confirmed.brief.intent!.route!.destinations.filter(i=>sourceIds.some(([id])=>id===i.id)).map(i=>[i.id,i.requestedNights]),sourceIds);
 await page.getByRole('button',{name:/Build trip/}).click();await page.waitForURL(/journey\/trip-[^/]+\?created=1/,{timeout:30_000});const builtId=new URL(page.url()).pathname.split('/')[2]!;await page.getByRole('region',{name:'Trip overview'}).waitFor();const built=(await recoveryTrip(page,builtId))!;assert.deepEqual(built.stops.map(s=>[s.name,s.nights]),confirmed.stops.map(s=>[s.name,s.nights]));
 // Fresh guests receive the real Overview guide. Complete its normal dismissal
 // before testing signup, so its focus and scroll do not race the link click.
 await page.getByRole('button',{name:'Skip workspace guide',exact:true}).click();
 await page.locator('[role="dialog"][data-workspace-orientation-ui="true"]').waitFor({state:'hidden'});
 assert.deepEqual((await recoveryTrip(page,builtId))!.stops,built.stops);
 await page.reload({waitUntil:'domcontentloaded'});await page.getByRole('region',{name:'Trip overview'}).waitFor();assert.deepEqual((await recoveryTrip(page,builtId))!.stops,built.stops);
 await page.getByRole('link',{name:'Sign up to keep this route across devices',exact:true}).click();
 await page.getByRole('textbox',{name:'Your name',exact:true}).waitFor();
 const authURL=new URL(page.url());assert.equal(authURL.searchParams.get('mode'),'sign-up');assert.equal(authURL.searchParams.get('next'),`/journey/${builtId}?created=1&saved=1`);
 assert.deepEqual((await recoveryTrip(page,builtId))!.stops,built.stops);
 await page.goBack({waitUntil:'domcontentloaded'});await page.getByRole('region',{name:'Trip overview'}).waitFor();assert.deepEqual((await recoveryTrip(page,builtId))!.stops,built.stops);
 await page.getByRole('link',{name:'Sign up to keep this route across devices',exact:true}).click();await page.getByRole('textbox',{name:'Your name',exact:true}).waitFor();
 await page.getByRole('link',{name:'← Back to this trip',exact:true}).click();await page.getByRole('region',{name:'Trip overview'}).waitFor();assert.deepEqual((await recoveryTrip(page,builtId))!.stops,built.stops);
},1440));

test("Tier 1 guest journey keeps three canonical stops and edits through Build and recovery", { skip: !enabled, timeout: 180_000 }, async () => withEvidence("guest-core-journey", async (page) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto(base, { waitUntil: "domcontentloaded" });
  await page.getByRole("combobox", { name: "Start from", exact: true }).fill("Paris");
  await page.getByRole("option", { name: /Paris.*France/ }).first().click();
  const choose = async (name: string, country: string) => {
    await page.getByRole("combobox", { name: "Destination", exact: true }).fill(name);
    await page.getByRole("option", { name: new RegExp(`${name}.*${country}`) }).first().click();
  };
  await choose("Madrid", "Spain");
  for (const [name, country] of [["Lisbon", "Portugal"], ["Porto", "Portugal"]] as const) {
    await page.getByRole("button", { name: "Add destination", exact: true }).click();
    await choose(name, country);
  }
  await page.getByRole("button", { name: "Plan my trip" }).first().click();
  await page.waitForURL(/\/journey\/new\?/);
  const homepage = await page.evaluate(() => JSON.parse(localStorage.getItem("easyt-private:guest:homepage-input") ?? "null"));
  assert.deepEqual(homepage.snapshot.entries.map((entry: { selection: { canonicalPlaceId: string } }) => entry.selection.canonicalPlaceId), ["madrid", "lisbon", "porto"]);
  assert.equal(homepage.receipt.version, 1);
  assertOrigin(homepage.snapshot.origin.value, origins.Paris);
  const builder = page.locator("[data-builder-route-workspace]");
  await builder.waitFor({ state: "visible", timeout: 20_000 });
  const rows = builder.locator("[data-builder-stop-index]");
  assert.deepEqual(await rows.evaluateAll((items) => items.map((row) => row.querySelector("[role='cell'] strong")?.textContent)), ["Madrid", "Lisbon", "Porto"]);
  const nights = await rows.evaluateAll((items) => items.map((row) => Number(row.querySelector('[aria-label^="Add one night"]')?.getAttribute("aria-label")?.match(/; (\d+) nights/)?.[1])));
  assert.equal(nights.length, 3);
  assert.ok(nights.every((night) => night > 0));
  const draftTripId = new URL(page.url()).searchParams.get("trip");
  assert.ok(draftTripId);
  await page.waitForFunction((id) => Object.keys(localStorage)
    .filter((key) => key.startsWith(`easyt:trip-recovery:v2:guest:${encodeURIComponent(id)}:`))
    .some((key) => {
      try { return JSON.parse(localStorage.getItem(key) ?? "null")?.trip?.brief?.intent?.route?.origin?.canonicalPlaceId === "reference:geonames:2988507"; }
      catch { return false; }
    }), draftTripId);
  const initialDraft = await recoveryTrip(page, draftTripId);
  assertOrigin(initialDraft?.brief.intent?.route?.origin, origins.Paris);
  assert.equal(initialDraft?.brief.intent?.route?.tripType, "return_to_start");
  await page.getByRole("combobox", { name: "Start from" }).fill("London");
  await page.getByRole("option", { name: /London.*United Kingdom/ }).first().click();
  await page.waitForFunction((id) => Object.keys(localStorage)
    .filter((key) => key.startsWith(`easyt:trip-recovery:v2:guest:${encodeURIComponent(id)}:`))
    .some((key) => {
      try { return JSON.parse(localStorage.getItem(key) ?? "null")?.trip?.brief?.intent?.route?.origin?.canonicalPlaceId === "reference:geonames:2643743"; }
      catch { return false; }
    }), draftTripId);
  await page.getByRole("button", { name: /Build trip/ }).click();
  await page.waitForURL(/\/journey\/trip-[^/]+\?created=1/, { timeout: 20_000 });
  const tripId = new URL(page.url()).pathname.split("/")[2]!;
  await page.getByRole("region", { name: "Trip overview" }).waitFor({ state: "visible", timeout: 20_000 });
  const built = await recoveryTrip(page, tripId);
  assert.ok(built, "Build leaves a recoverable guest trip on this device");
  assertOrigin(built.brief.intent?.route?.origin, origins.London);
  assertDestinationGeography(built);
  assert.deepEqual(built.stops.map((stop) => stop.canonicalPlaceId), ["madrid", "lisbon", "porto"]);
  assert.deepEqual(built.stops.map((stop) => stop.nights), nights);
  assert.equal(built.stops.some((stop) => stop.name === "London"), false);

  await page.goto(`${base}/journey/${tripId}/itinerary`, { waitUntil: "domcontentloaded" });
  await page.getByRole("region", { name: "Trip itinerary" }).waitFor();
  await page.getByText("SKIP WORKSPACE GUIDE").click({ timeout: 2_000 }).catch(() => {});
  const planner = page.locator("section[aria-label='Day 1 planner']");
  assert.equal(await page.getByRole("button", { name: "Day by day", exact: true }).getAttribute("aria-pressed"), "true");
  await page.getByRole("button", { name: "Calendar", exact: true }).click();
  assert.equal(await page.getByRole("button", { name: "Calendar", exact: true }).getAttribute("aria-pressed"), "true");
  await page.getByRole("button", { name: "Open full day", exact: true }).click();
  await planner.waitFor();
  await planner.getByRole("button", { name: /Add plan to .* morning/i }).click();
  const dialog = page.getByRole("dialog", { name: /Add to morning on Day 1/i });
  await dialog.getByRole("textbox", { name: "Add your own", exact: true }).fill("Morning walk fixture");
  await dialog.getByRole("button", { name: "Add to Morning" }).click();
  await planner.locator('[data-day-part="morning"]').getByText("Morning walk fixture", { exact: true }).waitFor();
  await page.getByRole("textbox", { name: "Add day note" }).fill("Remember train tickets fixture");
  await page.getByRole("button", { name: "Add note", exact: true }).click();
  await page.getByText("Remember train tickets fixture", { exact: true }).waitFor();
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator("section[aria-label='Day 1 planner']").waitFor();
  const recovered = await recoveryTrip(page, tripId);
  assert.ok(recovered);
  assertOrigin(recovered.brief.intent?.route?.origin, origins.London);
  assertDestinationGeography(recovered);
  const firstDay = recovered.planItems.find((day) => day.dayNumber === 1);
  assert.ok(firstDay);
  assert.equal(firstDay.notes.filter((note) => note === "Morning walk fixture").length, 1);
  assert.equal(recovered.brief.dayNotes?.[1]?.filter((note) => note === "Remember train tickets fixture").length, 1);

  await page.goto(`${base}/journey/${tripId}/map`, { waitUntil: "domcontentloaded" });
  const map = page.locator(".planner-map").first();
  await map.waitFor({ timeout: 20_000 });
  await map.locator("canvas.maplibregl-canvas").waitFor();
  await map.locator(".planner-map__stop").first().waitFor();
  // Async card enrichment rebuilds marker nodes. Read both live elements in
  // one browser turn, retrying only the transient absent/zero-size state.
  const boxes = await page.waitForFunction(() => {
    const map = document.querySelector('.planner-map');
    const marker = map?.querySelector('.planner-map__stop');
    const canvas = map?.querySelector('canvas.maplibregl-canvas');
    if (!marker?.isConnected || !canvas?.isConnected) return null;
    const before = marker.getBoundingClientRect(), surface = canvas.getBoundingClientRect();
    return before.width > 0 && before.height > 0 && surface.width > 0 && surface.height > 0
      ? { before: before.toJSON(), canvas: surface.toJSON() } : null;
  }, undefined, { timeout: 5_000 });
  const measured = await boxes.jsonValue();
  assert.ok(measured);
  const { before, canvas } = measured;
  assert.ok(before && canvas);
  await page.mouse.move(canvas.x + canvas.width / 2, canvas.y + canvas.height / 2);
  await page.mouse.down();
  await page.mouse.move(canvas.x + canvas.width / 2 + 70, canvas.y + canvas.height / 2 + 35, { steps: 6 });
  await page.mouse.up();
  await page.waitForFunction(({ x, y }) => {
    const rect = document.querySelector(".planner-map .planner-map__stop")?.getBoundingClientRect();
    return Boolean(rect && (Math.abs(rect.x - x) > 5 || Math.abs(rect.y - y) > 5));
  }, { x: before.x, y: before.y }, { timeout: 5_000 });
  for (const width of [390, 430, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await map.locator("canvas.maplibregl-canvas").waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, `Map horizontal overflow at ${width}px`);
  }

  await page.goto(`${base}/journey/${tripId}/prep`, { waitUntil: "domcontentloaded" });
  await page.waitForURL(`${base}/journey/${tripId}`);
  await page.getByRole("region", { name: "Trip overview" }).waitFor();
  await page.getByRole("heading", { name: /Practical prep|Before you go/i }).first().waitFor();
  for (const width of [390, 430, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${base}/journey/${tripId}`, { waitUntil: "domcontentloaded" });
    await page.getByRole("region", { name: "Trip overview" }).waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, `horizontal overflow at ${width}px`);
  }
  assert.deepEqual(pageErrors, []);
}));

test("Tier 1 Discovery resolves a landmark as a visit with a canonical overnight base", { skip: !enabled, timeout: 90_000 }, async () => withEvidence("guest-discovery", async (page) => {
  await page.goto(`${base}/journey/new`, { waitUntil: "domcontentloaded" });
  await page.getByRole("tab", { name: "Describe my trip" }).click();
  await page.getByPlaceholder("Where would you like to go, for how long?").fill("Taj Mahal");
  await page.getByRole("button", { name: /Plan my trip/ }).click();
  await page.getByRole("button", { name: "Continue shaping your route" }).waitFor({ timeout: 20_000 });
  await page.getByRole("button", { name: "Continue shaping your route" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("heading", { name: "Choose a base", exact: true }).waitFor();
  await dialog.getByText("Stay in Agra", { exact: true }).click();
  await dialog.getByRole("button", { name: "Add to trip", exact: true }).click();
  await dialog.waitFor({ state: "detached", timeout: 15_000 });
  await page.locator("[data-builder-route-workspace] [data-builder-stop-index]").first().waitFor();
  assert.equal(await page.locator("[data-builder-route-workspace] [data-builder-stop-index]").first().innerText().then((text) => text.includes("Agra")), true);
  const discovered = await page.evaluate(() => Object.keys(localStorage)
    .filter((key) => key.startsWith("easyt:trip-recovery:v2:guest:"))
    .map((key) => { try { return JSON.parse(localStorage.getItem(key) ?? "null")?.trip; } catch { return null; } })
    .find((trip) => trip?.stops?.some((stop: { canonicalPlaceId?: string }) => stop.canonicalPlaceId === "agra")) ?? null) as {
      stops: Array<{ id: string; name: string; canonicalPlaceId?: string }>;
      brief: { structuredBrief?: { placeSelections?: Array<{ kind: string; mentionId: string; routeStopId?: string }>; completedPlanningAreaMentionIds?: string[] } };
    } | null;
  assert.ok(discovered);
  assert.deepEqual(discovered.stops.map((stop) => stop.canonicalPlaceId), ["agra"]);
  assert.equal(discovered.stops.some((stop) => stop.name === "Taj Mahal"), false);
  assert.equal(discovered.brief.structuredBrief?.placeSelections?.filter((selection) => selection.kind === "visit" && selection.mentionId === "place-taj-mahal-0" && selection.routeStopId === discovered.stops[0]?.id).length, 1);
}));
for (const [width,type] of [[1440,'return_to_start'],[390,'one_way']] as const) test(`actual multi-area Discovery ${width}px ${type} stays responsive, allocates generated nights and survives rapid edits and reload`,{skip:!enabled,timeout:90000},async()=>withEvidence(`multi-area-${width}`,async(page,context)=>{
 await context.unroute('**/api/journey-geocode?*');
 await page.addInitScript(()=>{
  const tasks:Array<{start:number;duration:number}>=[];(window as unknown as {__routeTasks:typeof tasks}).__routeTasks=tasks;
  new PerformanceObserver(list=>tasks.push(...list.getEntries().map(entry=>({start:entry.startTime,duration:entry.duration})))).observe({type:'longtask',buffered:true});
 });
 await page.goto(base,{waitUntil:'domcontentloaded'});
 await page.getByRole('combobox',{name:'Start from',exact:true}).fill('LAX');
 await page.getByRole('option',{name:/Los Angeles International Airport.*United States/}).click();
 if(type==='one_way')await page.getByRole('button',{name:'One way',exact:true}).click();
 await page.getByRole('button',{name:/Travel dates/}).first().click();
 await page.getByRole('dialog').locator('[data-date="2026-10-14"]').click();await page.getByRole('dialog').locator('[data-date="2026-10-28"]').click();
 for(const name of ['Tokyo','South Korea','Africa']){
  await page.getByRole('combobox',{name:'Destination',exact:true}).fill(name);
  await page.getByRole('option',{name:new RegExp('^'+name)}).first().click();
  if(name!=='Africa')await page.getByRole('button',{name:'Add destination',exact:true}).click();
 }
 await page.getByRole('button',{name:'Plan my trip',exact:true}).first().click();
 await page.getByRole('dialog').getByRole('heading',{name:'Explore places',exact:true}).waitFor({timeout:20000});
 const id=new URL(page.url()).searchParams.get('trip')!;assert.ok(id);
 const timings:Array<{area:string;acceptMs:number;driverMs:number}>=[];
 const selections:Array<{area:string;place:string;visibleMs:number;driverMs:number}>=[];
 for(const [area,names] of [['South Korea',['Seoul','Busan']],['Africa',['Marrakech','Fes','Chefchaouen']]] as const){
  const dialog=page.getByRole('dialog');await dialog.getByText(area,{exact:true}).first().waitFor();
  if(await dialog.locator('[data-discovery-step="directions"]').count())await dialog.getByRole('button',{name:/Morocco/}).click();
  for(const name of names){
   const button=dialog.getByRole('button',{name:`Add to shortlist: ${name}`,exact:true});
   await armBrowserInteractionTiming(page,{trigger:`Add to shortlist: ${name}`,selected:`Remove from shortlist: ${name}`});
   const started=Date.now();await button.click();
   const selected=dialog.getByRole('button',{name:`Remove from shortlist: ${name}`,exact:true});await selected.waitFor();
   const driverMs=Date.now()-started,visibleMs=await browserInteractionElapsed(page);selections.push({area,place:name,visibleMs,driverMs});
   assert.ok(visibleMs<1500,`${name} selection responds within 1.5 seconds (${visibleMs.toFixed(1)}ms browser, ${driverMs}ms driver)`);
   assert.equal(await selected.getAttribute('aria-pressed'),'true');
   for(const state of ['default','hover','focus']){
    if(state==='hover')await selected.hover();if(state==='focus')await selected.focus();
    const style=await selected.evaluate(button=>({color:getComputedStyle(button).color,background:getComputedStyle(button).backgroundColor,transition:getComputedStyle(button).transitionProperty}));
    const luminance=(color:string)=>color.match(/\d+(?:\.\d+)?/g)!.slice(0,3).map(Number).map(v=>{const channel=v/255;return channel<=.04045?channel/12.92:((channel+.055)/1.055)**2.4}).reduce((sum,v,index)=>sum+v*[.2126,.7152,.0722][index],0);
    const [bright,dark]=[luminance(style.color),luminance(style.background)].sort((a,b)=>b-a);
    assert.ok((bright+.05)/(dark+.05)>=4.5,`${name} ${state} selected text meets 4.5:1 contrast`);
    assert.ok(!style.transition.includes('color'),`${name} selected foreground and background change atomically`);
   }
  }
  await armBrowserInteractionTiming(page,{trigger:`Add ${names.length} places`,leavingArea:area});
  const started=Date.now();await dialog.getByRole('button',{name:`Add ${names.length} places`,exact:true}).click();
  await page.waitForFunction(area=>!document.querySelector('[role="dialog"]')?.textContent?.includes(area),area,{timeout:15000});
  const driverMs=Date.now()-started,acceptMs=await browserInteractionElapsed(page);timings.push({area,acceptMs,driverMs});
  assert.ok(acceptMs<2500,`${area} multi-add responds within 2.5 seconds (${acceptMs.toFixed(1)}ms browser, ${driverMs}ms driver)`);
 }
 let trip=await recoveryTrip(page,id);assert.ok(trip);
 assert.equal(trip.brief.intent?.route?.tripType,type);assert.equal(trip.stops.length,6);
 assert.equal(trip.stops.reduce((sum,stop)=>sum+(stop.nights??0),0),14);assert.ok(trip.stops.every(stop=>(stop.nights??0)>0));
 assert.deepEqual(trip.brief.manualNightStopIds,[]);
 for(const area of ['South Korea','Africa']){
  const intent:DestinationIntent=trip.brief.intent!.route!.destinations.find(item=>item.sourceText===area)!;
  assert.equal(intent.resolution,'resolved');assert.ok(trip.brief.structuredBrief?.completedPlanningAreaMentionIds?.includes(intent.id));
  assert.equal(await page.getByRole('button',{name:`Remove ${area}`,exact:true}).count(),0);
  assert.equal(await page.getByRole('button',{name:`Edit ${area}`,exact:true}).count(),0);
 }
 const target=trip.stops.find(stop=>stop.name==='Seoul')!,initial=target.nights!;
 const editStart=await page.evaluate(()=>performance.now());
 // Two genuine button activations in one event turn expose stale-render arithmetic.
 await page.getByRole('button',{name:/Add one night to Seoul/}).evaluate(button=>{(button as HTMLButtonElement).click();(button as HTMLButtonElement).click();});
 await page.waitForFunction(({id,nights})=>Object.keys(localStorage).filter(key=>key.startsWith(`easyt:trip-recovery:v2:guest:${encodeURIComponent(id)}:`)).some(key=>JSON.parse(localStorage.getItem(key)??'null')?.trip?.stops?.find((stop:{name:string})=>stop.name==='Seoul')?.nights===nights),{id,nights:initial+2});
 await page.getByRole('button',{name:/Remove one night from Seoul/}).evaluate(button=>{(button as HTMLButtonElement).click();(button as HTMLButtonElement).click();});
 await page.waitForFunction(({id,nights})=>Object.keys(localStorage).filter(key=>key.startsWith(`easyt:trip-recovery:v2:guest:${encodeURIComponent(id)}:`)).some(key=>JSON.parse(localStorage.getItem(key)??'null')?.trip?.stops?.find((stop:{name:string})=>stop.name==='Seoul')?.nights===nights),{id,nights:initial});
 trip=await recoveryTrip(page,id);assert.ok(trip);assert.equal(trip.stops.find(stop=>stop.id===target.id)!.nights,initial);
 assert.deepEqual(trip.brief.manualNightStopIds,[target.id]);assert.equal(trip.brief.intent!.route!.tripType,type);
 const tasks=await page.evaluate(start=>(window as unknown as {__routeTasks:Array<{start:number;duration:number}>}).__routeTasks.filter(task=>task.start>=start),editStart);
 assert.ok(tasks.every(task=>task.duration<1000),'rapid night edits have no one-second main-thread freeze');
 mkdirSync(artifacts,{recursive:true});writeFileSync(`${artifacts}/multi-area-${width}-timing.json`,JSON.stringify({width,type,timings,selections,nightTasks:tasks},null,2));
 await page.screenshot({path:`${artifacts}/multi-area-${width}-builder.png`,fullPage:true});
 const before=trip;await page.reload({waitUntil:'domcontentloaded'});await page.locator('[data-builder-top-controls]').waitFor();
 trip=await recoveryTrip(page,id);assert.ok(trip);assert.deepEqual(trip.stops.map(stop=>[stop.id,stop.canonicalPlaceId,stop.nights]),before.stops.map(stop=>[stop.id,stop.canonicalPlaceId,stop.nights]));
 assert.equal(trip.brief.intent!.route!.tripType,type);assert.deepEqual(trip.brief.structuredBrief!.completedPlanningAreaMentionIds,before.brief.structuredBrief!.completedPlanningAreaMentionIds);
 await page.getByRole('button',{name:type==='one_way'?'Return to start':'One way',exact:true}).click();
 await page.reload({waitUntil:'domcontentloaded'});await page.locator('[data-builder-top-controls]').waitFor();
 assert.equal((await recoveryTrip(page,id))!.brief.intent!.route!.tripType,type==='one_way'?'return_to_start':'one_way');
 // Existing saved workspace URLs own orientation; no new browser preference.
 await page.goto(`${base}/journey/${id}/itinerary`,{waitUntil:'domcontentloaded'});
 await page.getByRole('region',{name:'Trip itinerary',exact:true}).waitFor();
 await page.getByRole('button',{name:'Calendar',exact:true}).waitFor();
 assert.equal(await page.getByRole('button',{name:'Day by day',exact:true}).getAttribute('aria-pressed'),'true');
 await page.getByRole('button',{name:'Calendar',exact:true}).click();
 const calendar=page.locator('#itinerary-calendar');
 const dayHeader=calendar.locator('..').locator('header').first();
 const headingBox=await dayHeader.boundingBox(),calendarBox=await calendar.boundingBox();assert(headingBox&&calendarBox&&headingBox.y+headingBox.height<=calendarBox.y);
 assert.equal(await page.locator('[aria-label^="Selected day summary"]').count(),0);
 const stayLinks=calendar.getByRole('link',{name:/Find a stay/});assert(await stayLinks.count()>0);
 const targetURL=new URL((await stayLinks.first().getAttribute('href'))!,base);assert.equal(targetURL.pathname,`/journey/${id}/stay`);assert(targetURL.searchParams.get('stop'));
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth),false);
 await page.screenshot({path:`${artifacts}/multi-area-${width}-calendar.png`,fullPage:true});
 await page.getByRole('button',{name:'Open full day',exact:true}).click();
 assert.equal(new URL(page.url()).searchParams.get('itineraryView'),'days');
 await page.reload({waitUntil:'domcontentloaded'});
 await page.getByRole('button',{name:'Day by day',exact:true}).waitFor();
 assert.equal(await page.getByRole('button',{name:'Day by day',exact:true}).getAttribute('aria-pressed'),'true');
 await page.goto(`${base}/journey/${id}/itinerary?day=2`,{waitUntil:'domcontentloaded'});
 await page.locator('section[aria-label="Day 2 planner"]').waitFor();
 await page.getByRole('button',{name:'Calendar',exact:true}).click();await page.reload({waitUntil:'domcontentloaded'});
 assert.equal(await page.getByRole('button',{name:'Calendar',exact:true}).getAttribute('aria-pressed'),'true');

},width));
for (const [area,names] of [['Japan',['Kyoto','Takayama','Hiroshima']],['South Korea',['Seoul','Busan']],['Africa',['Marrakech','Fes','Chefchaouen']]] as const) for (const width of [1440,390]) test(`actual ${area} only multi-add ${width}px completes Discovery, Build and reload`,{skip:!enabled,timeout:60000},async()=>withEvidence(`single-area-${area.replaceAll(' ','-')}-${width}`,async(page,context)=>{
 await context.unroute('**/api/journey-geocode?*');await page.goto(base,{waitUntil:'domcontentloaded'});
 await page.getByRole('combobox',{name:'Start from',exact:true}).fill('LAX');await page.getByRole('option',{name:/Los Angeles International Airport.*United States/}).click();
 await page.getByRole('button',{name:/Travel dates/}).first().click();await page.getByRole('dialog').locator('[data-date="2026-10-14"]').click();await page.getByRole('dialog').locator('[data-date="2026-10-28"]').click();
 await page.getByRole('combobox',{name:'Destination',exact:true}).fill(area);await page.getByRole('option',{name:new RegExp('^'+area)}).first().click();
 await page.getByRole('button',{name:'Plan my trip',exact:true}).first().click();const dialog=page.getByRole('dialog');await dialog.getByRole('heading',{name:/^(Explore places|Choose a direction)$/}).waitFor({timeout:20000});
 const id=new URL(page.url()).searchParams.get('trip')!;
 assert.equal(await page.getByRole('button',{name:/^Build trip/}).evaluateAll(buttons=>buttons.some(button=>!(button as HTMLButtonElement).disabled)),false,'an unresolved area without an accepted base has no enabled Build control');
 if(await dialog.locator('[data-discovery-step="directions"]').count())await dialog.getByRole('button',{name:/Morocco/}).click();
 for(const name of names)await dialog.getByRole('button',{name:`Add to shortlist: ${name}`,exact:true}).click();
 await dialog.getByRole('button',{name:`Add ${names.length} places`,exact:true}).click();await dialog.waitFor({state:'hidden'});
 const trip=(await recoveryTrip(page,id))!;assert.ok(trip);assert.equal(trip.stops.length,names.length);assert.deepEqual(new Set(trip.stops.map(stop=>stop.name)),new Set(names));
 assert.ok(trip.stops.every(stop=>stop.nights!>0&&geographicallyReady(stopGeographicPlace(stop))));assert.equal(trip.stops.reduce((sum,stop)=>sum+stop.nights!,0),14);
 assert.equal(await page.getByRole('button',{name:`Remove ${area}`,exact:true}).count(),0);
 await page.screenshot({path:`${artifacts}/single-area-${area.replaceAll(' ','-')}-${width}-builder.png`,fullPage:true});
 await page.reload({waitUntil:'domcontentloaded'});await page.locator('[data-builder-top-controls]').waitFor();assert.deepEqual((await recoveryTrip(page,id))!.stops,trip.stops);
 const build=page.getByRole('button',{name:/^Build trip/});
 assert.equal(await build.isDisabled(),false,'completed Discovery must supersede the original no-base intake blocker');
 await build.click();await page.waitForURL(/journey\/trip-[^/]+\?created=1/,{timeout:25000});
 const builtId=new URL(page.url()).pathname.split('/')[2]!;await page.getByRole('region',{name:'Trip overview',exact:true}).waitFor();
 const built=(await recoveryTrip(page,builtId))!;assert.equal(built.status,'planned');
 assert.deepEqual(built.stops.map(stop=>[stop.id,stop.canonicalPlaceId,stop.nights]),trip.stops.map(stop=>[stop.id,stop.canonicalPlaceId,stop.nights]));
 await page.reload({waitUntil:'domcontentloaded'});await page.getByRole('region',{name:'Trip overview',exact:true}).waitFor();
 assert.deepEqual((await recoveryTrip(page,builtId))!.stops,built.stops);
 await page.goto(`${base}/journey/${builtId}/itinerary`,{waitUntil:'domcontentloaded'});await page.getByRole('region',{name:'Trip itinerary',exact:true}).waitFor();
 assert.equal(await page.getByRole('button',{name:'Day by day',exact:true}).getAttribute('aria-pressed'),'true');
 await page.reload({waitUntil:'domcontentloaded'});await page.getByRole('region',{name:'Trip itinerary',exact:true}).waitFor();
 assert.deepEqual((await recoveryTrip(page,builtId))!.stops,built.stops);
},width));
test('fresh Return default and disabled selected trip types retain readable production styling',{skip:!enabled,timeout:30000},async()=>withEvidence('disabled-trip-type',async(page)=>{
 await page.goto(base,{waitUntil:'domcontentloaded'});
 const selected=page.getByRole('button',{name:'Return to start',exact:true});await selected.waitFor();assert.equal(await selected.getAttribute('aria-pressed'),'true');
 for(const name of ['Return to start','One way']){
  const button=page.getByRole('button',{name,exact:true});if(name==='One way')await button.click();
  const style=await button.evaluate(element=>{(element as HTMLButtonElement).disabled=true;const s=getComputedStyle(element);return {color:s.color,background:s.backgroundColor,opacity:s.opacity}});
  const luminance=(color:string)=>color.match(/\d+(?:\.\d+)?/g)!.slice(0,3).map(Number).map(v=>{const channel=v/255;return channel<=.04045?channel/12.92:((channel+.055)/1.055)**2.4}).reduce((sum,v,index)=>sum+v*[.2126,.7152,.0722][index],0);
  const [bright,dark]=[luminance(style.color),luminance(style.background)].sort((a,b)=>b-a);assert.ok((bright+.05)/(dark+.05)>=4.5,name);assert.equal(style.opacity,'1');
  mkdirSync(artifacts,{recursive:true});await page.screenshot({path:`${artifacts}/disabled-${name.replaceAll(' ','-')}.png`});
  await button.evaluate(element=>{(element as HTMLButtonElement).disabled=false});
 }
}));

// These controls validate the performance gate itself. Delayed automation must
// not fail a responsive page, and actual slow feedback must still fail budgets.
test('browser interaction timing excludes delayed automation after responsive feedback',{skip:!enabled,timeout:30000},async()=>withEvidence('timing-driver-overhead',async page=>{
 await page.setContent(`<button aria-label="Add to shortlist: Fixture" aria-pressed="false" onclick="setTimeout(()=>{this.setAttribute('aria-label','Remove from shortlist: Fixture');this.setAttribute('aria-pressed','true')},30)">Fixture</button>`);
 await armBrowserInteractionTiming(page,{trigger:'Add to shortlist: Fixture',selected:'Remove from shortlist: Fixture'});
 const started=Date.now();await page.getByRole('button',{name:'Add to shortlist: Fixture',exact:true}).click();
 await page.waitForTimeout(1750);const visibleMs=await browserInteractionElapsed(page);
 assert.ok(Date.now()-started>=1750,'old driver-inclusive timer would fail the 1.5 second budget');
 assert.ok(visibleMs>=20&&visibleMs<1500,'browser records actual responsive feedback despite later driver delay');
}));
test('browser interaction timing preserves rejection of genuinely slow selection and acceptance',{skip:!enabled,timeout:30000},async()=>withEvidence('timing-slow-feedback',async page=>{
 for(const [kind,budget,delay] of [['selection',1500,1600],['acceptance',2500,2600]] as const){
  const condition=kind==='selection'?{trigger:'Add to shortlist: Slow',selected:'Remove from shortlist: Slow'}:{trigger:'Add 3 places',leavingArea:'Africa'};
  await page.setContent(kind==='selection'
   ?`<button aria-label="Add to shortlist: Slow" aria-pressed="false" onclick="setTimeout(()=>{this.setAttribute('aria-label','Remove from shortlist: Slow');this.setAttribute('aria-pressed','true')},${delay})">Slow</button>`
   :`<section data-builder-top-controls>Accepted route</section><div role="dialog">Africa <button onclick="setTimeout(()=>this.parentElement.remove(),${delay})">Add 3 places</button></div>`);
  await armBrowserInteractionTiming(page,condition);await page.getByRole('button',{name:condition.trigger,exact:true}).click();
  const visibleMs=await browserInteractionElapsed(page);assert.ok(visibleMs>=budget,`${kind} delayed feedback still exceeds the unchanged ${budget}ms limit`);
 }
}));

for(const kind of ['selection','acceptance'] as const)for(const variant of ['hidden-feedback','post-mutation-microtask','pre-click-mousedown','post-ready-frame'] as const)
test(`visible interaction timing rejects ${kind} ${variant}`,{skip:!enabled,timeout:30000},async()=>withEvidence(`timing-${kind}-${variant}`,async page=>{
 const budget=kind==='selection'?1500:2500,delay=budget+200;
 await page.setContent(kind==='selection'
  ?'<button aria-label="Add to shortlist: Adversary" aria-pressed="false">Adversary</button>'
  :'<section data-builder-top-controls>Accepted route</section><div role="dialog">Africa <button>Add 3 places</button></div>');
 await page.evaluate(({kind,variant,delay})=>{
  const state:{tasks:Array<{start:number;duration:number}>;input:number|null;click:number|null;visible:number|null}={tasks:[],input:null,click:null,visible:null};
  (window as unknown as {__timingAdversary:typeof state}).__timingAdversary=state;
  new PerformanceObserver(list=>state.tasks.push(...list.getEntries().map(entry=>({start:entry.startTime,duration:entry.duration})))).observe({type:'longtask'});
  const button=document.querySelector('button')!,feedback=kind==='selection'?button:document.querySelector<HTMLElement>('[data-builder-top-controls]')!;
  const freeze=()=>{const start=performance.now();while(performance.now()-start<delay){/* Deliberate page-side adversary, not driver delay. */}};
  button.addEventListener('pointerdown',event=>{state.input=event.timeStamp},{capture:true});
  if(variant==='pre-click-mousedown')button.addEventListener('mousedown',freeze);
  button.addEventListener('click',()=>{
   state.click=performance.now();
   if(kind==='selection'){button.setAttribute('aria-label','Remove from shortlist: Adversary');button.setAttribute('aria-pressed','true');}
   else button.parentElement!.remove();
   if(variant==='hidden-feedback'){feedback.style.visibility='hidden';setTimeout(()=>{feedback.style.visibility='visible';state.visible=performance.now();},delay);}
   if(variant==='post-mutation-microtask')queueMicrotask(freeze);
   if(variant==='post-ready-frame')requestAnimationFrame(freeze);
  });
 },{kind,variant,delay});
 const condition=kind==='selection'?{trigger:'Add to shortlist: Adversary',selected:'Remove from shortlist: Adversary'}:{trigger:'Add 3 places',leavingArea:'Africa'};
 await armBrowserInteractionTiming(page,condition);await page.getByRole('button',{name:condition.trigger,exact:true}).click();
 const elapsed=await browserInteractionElapsed(page);await page.waitForTimeout(50);
 const state=await page.evaluate(()=>(window as unknown as {__timingAdversary:{tasks:Array<{start:number;duration:number}>;input:number|null;click:number|null;visible:number|null}}).__timingAdversary);
 mkdirSync(artifacts,{recursive:true});writeFileSync(`${artifacts}/timing-${kind}-${variant}.json`,JSON.stringify({kind,variant,budget,delay,elapsed,wouldPassBudget:elapsed<budget,...state},null,2));
 assert.ok(elapsed>=budget,`${kind} ${variant}: ${elapsed.toFixed(1)}ms must reject the unchanged ${budget}ms budget`);
 if(variant!=='hidden-feedback')assert.ok(state.tasks.some(task=>task.duration>=budget),'the deliberate page freeze is recorded as a long task');
}));


test('browser interaction timing supports keyboard and programmatic activation',{skip:!enabled,timeout:30000},async()=>withEvidence('timing-activation',async page=>{
 for(const activation of ['Enter','Space','programmatic'] as const){
  await page.setContent(`<button aria-label="Add to shortlist: Activation" aria-pressed="false" onclick="this.setAttribute('aria-label','Remove from shortlist: Activation');this.setAttribute('aria-pressed','true')">Activation</button>`);
  await armBrowserInteractionTiming(page,{trigger:'Add to shortlist: Activation',selected:'Remove from shortlist: Activation'});
  const button=page.getByRole('button',{name:'Add to shortlist: Activation',exact:true});
  if(activation==='programmatic')await button.evaluate(element=>(element as HTMLButtonElement).click());
  else{await button.focus();await page.keyboard.press(activation);}
  const elapsed=await browserInteractionElapsed(page);
  assert.ok(elapsed>=0&&elapsed<1500,`${activation} records responsive visible feedback`);
 }
}));
