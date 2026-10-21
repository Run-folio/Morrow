import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { builderBrowserTestsEnabled, renderBuilder } from './helpers/builder-render.ts';
const islandCandidates = JSON.parse(readFileSync(new URL('./fixtures/import-island-candidates.json', import.meta.url), 'utf8'));
const evidenceDir = process.env.MORROVIA_IMPORT_RETRY_ARTIFACT_DIR ?? '/tmp/morrovia-import-retry-evidence';
const itemFor = (page: any, name: string) => page.getByRole('heading', { name: `Which ${name} do you mean?`, exact: true }).locator('..').locator('..');

test('an unresolved import place can explicitly retry the existing resolver and select its verified result', { skip: !builderBrowserTestsEnabled, timeout: 30000 }, async () => {
  const fixture = await renderBuilder({ path: '/journey/new/import', styled: true });
  const { page } = fixture;
  try {
    await page.getByText('Paste table', { exact: true }).click();
    await page.getByRole('textbox', { name: 'Spreadsheet rows' }).fill('Journey origin,Destination,Arrival date,Departure date\n"Tokyo, Japan","Manila, Philippines",2026-12-11,2026-12-13');
    await page.getByRole('button', { name: 'Review pasted table' }).click();
    const item = page.getByRole('heading', { name: 'Which Manila, Philippines do you mean?', exact: true }).locator('..').locator('..');
    // Initial automatic resolution can remount this item. The action below
    // waits through that transition instead of sampling a transient count.
    const requests: URL[] = [];
    await page.route('**/api/journey-geocode?**', async (route: any) => {
      const url = new URL(route.request().url()); requests.push(url);
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ candidates: url.searchParams.get('mode') === 'resolve'
        ? [{ name: 'Manila', country: 'Philippines', canonicalPlaceId: 'fixture:manila', providerId: 'fixture:manila', coordinates: [120.9803621, 14.5904492], placeType: 'city', routability: 'direct_destination' }] : [] }) });
    });
    await item.getByRole('button', { name: 'Search places', exact: true }).click();
    await item.getByRole('combobox', { name: 'Search results for Manila, Philippines', exact: true }).selectOption({ label: 'Manila · city · Philippines' });
    await page.getByRole('heading', { name: 'Which Manila, Philippines do you mean?', exact: true }).waitFor({ state: 'detached' });
    assert.ok(requests.some(url => url.searchParams.get('mode') === 'resolve' && url.searchParams.get('place') === 'Manila, Philippines'));
    assert.equal(await page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('easyt:trip-recovery:')).length), 0);
    assert.deepEqual(fixture.errors, []);
  } finally { await fixture.close(); }
});

for (const width of [1440, 390]) test(`exact workbook ${width}px keeps every occurrence and note while explicit base checking fails and recovers`, { skip: !builderBrowserTestsEnabled, timeout: 40000 }, async () => {
  const fixture = await renderBuilder({ path: '/journey/new/import', styled: true });
  const { page } = fixture;
  try {
    await page.setViewportSize({ width, height: 900 });
    const baseOrigin = new URL(page.url()).origin;
    let accountWrites = 0;
    await page.context().route('**/*', (route: any) => {
      const request = route.request(), url = new URL(request.url());
      if (url.origin !== baseOrigin) return route.abort();
      if (url.pathname.startsWith('/api/easyt/trips') && !['GET', 'HEAD'].includes(request.method())) { accountWrites++; return route.abort(); }
      return route.continue();
    });
    let baseAttempts = 0;
    const tagbilaran = { name: 'Tagbilaran City', country: 'Philippines', canonicalPlaceId: 'reference:geonames:1684497', providerId: 'reference:geonames:1684497@699b595afdba9be6994e:PH:city:123.85219:9.65556', referenceSnapshotId: '699b595afdba9be6994e', coordinates: [123.85219, 9.65556], placeType: 'city', routability: 'direct_destination', region: 'Bohol', normalizationReason: 'Physical island verified: OSM relation:3625899; result=strict-inside/outside-holes' };
    const settlement = (name: string, coordinates: number[], region?: string) => ({ name, country: 'Philippines', coordinates, region, canonicalPlaceId: `fixture:${name}`, providerId: `fixture:${name}`, placeType: 'city', routability: 'direct_destination' });
    await page.route('**/api/journey-geocode?**', async (route: any) => {
      const url = new URL(route.request().url());
      const place = url.searchParams.get('place')!;
      let candidates: unknown[] = [];
      if (url.searchParams.get('parentName') === 'Bohol') {
        if (url.searchParams.get('mode') === 'resolve' && ++baseAttempts === 1) {
          await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ result: null }) }); return;
        }
        if (url.searchParams.get('mode') !== 'autocomplete') candidates = [tagbilaran];
      } else if (url.searchParams.get('parentName') === 'Siquijor') {
        if (url.searchParams.get('mode') === 'resolve') candidates = [islandCandidates['Siquijor, Philippines'][0]];
      } else if (url.searchParams.get('mode') !== 'autocomplete') {
        candidates = place.startsWith('Manila') ? [settlement('Manila', [120.9803621, 14.5904492])]
          : place.startsWith('El Nido') ? [settlement('El Nido', [119.39, 11.18], 'Palawan')]
            : place.startsWith('Cebu City') ? [settlement('Cebu City', [123.9018183, 10.2934946])]
              : islandCandidates[place] ?? [];
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ candidates }) });
    });
    await page.locator('input[type="file"]').setInputFiles(fileURLToPath(new URL('./fixtures/workbooks/philippines_route_morrovia_import_v2.xlsx', import.meta.url)));
    await page.getByRole('heading', { name: 'Which Bohol, Philippines do you mean?', exact: true }).waitFor();
    await itemFor(page, 'Siquijor, Philippines').getByRole('combobox', { name: 'Meaning of Siquijor, Philippines', exact: true }).selectOption({ label: 'Siquijor · region · Philippines' });
    const siquijor = itemFor(page, 'Siquijor, Philippines');
    await siquijor.getByRole('combobox', { name: 'Overnight base in Siquijor', exact: true }).fill('Siquijor');
    await siquijor.getByRole('button', { name: 'Search bases', exact: true }).click();
    await siquijor.getByRole('combobox', { name: 'Search results for Siquijor', exact: true }).selectOption({ label: 'Siquijor · town · Siquijor · Philippines' });
    const bohol = itemFor(page, 'Bohol, Philippines');
    await bohol.getByRole('combobox', { name: 'Meaning of Bohol, Philippines', exact: true }).selectOption({ label: 'Bohol · island · Bohol · Philippines' });
    await bohol.getByRole('combobox', { name: 'Overnight base in Bohol', exact: true }).fill('Tagbilaran');
    await bohol.getByRole('button', { name: 'Search bases', exact: true }).click();
    await bohol.getByRole('alert').filter({ hasText: 'Place checking is unavailable' }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Create trip', exact: true }).isEnabled(), false);
    assert.equal(await page.getByRole('region', { name: 'Your route', exact: true }).getByText('Manila, Philippines', { exact: true }).count(), 2);
    assert.match(await page.getByRole('region', { name: 'Your route', exact: true }).innerText(), /18–22 Dec 2026 · 4 nights/);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
    mkdirSync(evidenceDir, { recursive: true });
    await page.screenshot({ path: join(evidenceDir, `${width}-provider-unavailable.png`), fullPage: true });
    await bohol.getByRole('button', { name: 'Search bases', exact: true }).click();
    const baseResults = bohol.getByRole('combobox', { name: 'Search results for Tagbilaran', exact: true });
    await baseResults.waitFor();
    await baseResults.focus();
    await bohol.getByRole('listbox').waitFor({ state: 'hidden' });
    await bohol.getByRole('link', { name: 'GeoNames', exact: true }).waitFor({ state: 'visible' });
    await bohol.getByRole('link', { name: '© OpenStreetMap contributors', exact: true }).waitFor({ state: 'visible' });
    await page.screenshot({ path: join(evidenceDir, `${width}-base-result-credit.png`), fullPage: true });
    await baseResults.selectOption({ label: 'Tagbilaran City · city · Bohol · Philippines' });
    await page.getByText('IMPORT READY', { exact: true }).waitFor();
    await page.getByRole('region', { name: 'Trip details', exact: true }).getByText('Notes', { exact: true }).click();
    await page.getByText('Trip starts in Manila', { exact: true }).waitFor();
    await page.getByText('Final Manila occurrence', { exact: true }).waitFor();
    await page.screenshot({ path: join(evidenceDir, `${width}-review-ready.png`), fullPage: true });
    await page.getByRole('button', { name: 'Create trip', exact: true }).click();
    await page.waitForURL(/\/journey\/trip-[^/]+/);
    const trips = await page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('easyt:trip-recovery:v2:')).map(key => JSON.parse(localStorage.getItem(key)!)).map(record => record.trip));
    assert.equal(trips.length, 1);
    assert.equal(trips[0].stops.length, 6);
    assert.equal(new Set(trips[0].stops.map((stop: any) => stop.id)).size, 6);
    assert.deepEqual(trips[0].stops.map((stop: any) => stop.nights), [2, 5, 4, 5, 3, 1]);
    assert.equal(trips[0].legs.length, 5);
    assert.equal(trips[0].planItems.length, 21);
    assert.deepEqual(trips[0].stops.map((stop: any) => [stop.arrivalDate, stop.departureDate]), [
      ['2026-12-11', '2026-12-13'], ['2026-12-13', '2026-12-18'], ['2026-12-18', '2026-12-22'],
      ['2026-12-22', '2026-12-27'], ['2026-12-27', '2026-12-30'], ['2026-12-30', '2026-12-31'],
    ]);
    assert.ok(trips[0].legs.every((leg: any) => leg.mode === 'unknown' && leg.durationMinutes === null));
    assert.equal(trips[0].brief.bookings?.length ?? 0, 0);
    await page.reload();
    await page.getByRole('region', { name: 'Trip overview', exact: true }).waitFor();
    const reopened = await page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('easyt:trip-recovery:v2:')).map(key => JSON.parse(localStorage.getItem(key)!)).map(record => record.trip));
    assert.deepEqual(reopened[0].stops.map((stop: any) => stop.id), trips[0].stops.map((stop: any) => stop.id));
    assert.equal(reopened[0].planItems.length, 21);
    assert.equal(accountWrites, 0);
    assert.deepEqual(fixture.errors, []);
  } finally { await fixture.close(); }
});

for (const action of ['change area', 'change owner']) test(`late base search cannot reappear after ${action}`, { skip: !builderBrowserTestsEnabled, timeout: 30000 }, async () => {
  const fixture = await renderBuilder({ path: '/journey/new/import', ownerId: 'owner-a' });
  const { page } = fixture;
  let release!: () => void;
  const responseReady = new Promise<void>(resolve => { release = resolve; });
  let started!: () => void;
  const requestStarted = new Promise<void>(resolve => { started = resolve; });
  try {
    const city = { name: 'Valencia', country: 'Spain', region: 'Valencia', coordinates: [-0.3763, 39.4699], canonicalPlaceId: 'fixture:valencia', providerId: 'fixture:valencia', placeType: 'city', routability: 'direct_destination' };
    const region = { ...city, canonicalPlaceId: 'fixture:valencia-region', providerId: 'fixture:valencia-region', placeType: 'region', routability: 'planning_area' };
    await page.route('**/api/journey-geocode?**', async (route: any) => {
      const url = new URL(route.request().url());
      if (url.searchParams.get('parentName') && url.searchParams.get('mode') === 'resolve') {
        started(); await responseReady;
        try { await route.fulfill({ json: { candidates: [city] } }); } catch { /* The real fetch was cancelled by the scope change. */ }
        return;
      }
      await route.fulfill({ json: { candidates: url.searchParams.get('mode') === 'autocomplete' ? [] : url.searchParams.get('place')?.startsWith('Valencia') ? [city, region]
        : [{ ...city, name: 'Madrid', canonicalPlaceId: 'fixture:madrid', providerId: 'fixture:madrid', region: 'Madrid', coordinates: [-3.7038, 40.4168] }] } });
    });
    await page.getByText('Paste table', { exact: true }).click();
    await page.getByRole('textbox', { name: 'Spreadsheet rows' }).fill('Journey origin,Destination,Country,Arrival date,Departure date\nMadrid,"Valencia, Spain",Spain,2026-12-11,2026-12-13');
    await page.getByRole('button', { name: 'Review pasted table' }).click();
    const item = itemFor(page, 'Valencia, Spain');
    await item.getByRole('combobox', { name: 'Meaning of Valencia, Spain', exact: true }).selectOption({ label: 'Valencia · region · Valencia · Spain' });
    await item.getByRole('combobox', { name: 'Overnight base in Valencia', exact: true }).fill('Valencia');
    await item.getByRole('button', { name: 'Search bases', exact: true }).click();
    await requestStarted;
    if (action === 'change area') await item.getByRole('button', { name: 'Change area', exact: true }).click();
    else await page.evaluate(() => {
      (window as unknown as { __BUILDER_TEST_OWNER__: string }).__BUILDER_TEST_OWNER__ = 'owner-b';
      window.dispatchEvent(new Event('builder-test-owner'));
    });
    release();
    await page.getByRole('combobox', { name: 'Meaning of Valencia, Spain', exact: true }).waitFor();
    assert.equal(await page.getByRole('combobox', { name: 'Search results for Valencia', exact: true }).count(), 0);
    assert.equal(await page.getByRole('button', { name: 'Create trip', exact: true }).isEnabled(), false);
    assert.equal(await page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('easyt:trip-recovery:')).length), 0);
    assert.deepEqual(fixture.errors, []);
  } finally { release(); await fixture.close(); }
});

test('an import without a country can explicitly choose a non-first-country homonym', { skip: !builderBrowserTestsEnabled, timeout: 30000 }, async () => {
  const fixture = await renderBuilder({ path: '/journey/new/import' });
  const { page } = fixture;
  try {
    const granada = (country: string, coordinates: number[]) => ({ name: 'Granada', country, region: 'Granada', coordinates, canonicalPlaceId: `fixture:granada:${country}`, providerId: `fixture:granada:${country}`, placeType: 'town', routability: 'direct_destination' });
    await page.route('**/api/journey-geocode?**', async (route: any) => {
      const place = new URL(route.request().url()).searchParams.get('place') ?? '';
      await route.fulfill({ json: { candidates: place.startsWith('Granada') ? [granada('Spain', [-3.5986, 37.1773]), granada('Nicaragua', [-85.956, 11.9299])]
        : [{ name: 'Madrid', country: 'Spain', coordinates: [-3.7038, 40.4168], canonicalPlaceId: 'fixture:madrid', providerId: 'fixture:madrid', placeType: 'city', routability: 'direct_destination' }] } });
    });
    await page.getByText('Paste table', { exact: true }).click();
    await page.getByRole('textbox', { name: 'Spreadsheet rows' }).fill('Journey origin,Destination,Arrival date,Departure date\n"Madrid, Spain",Granada,2026-12-11,2026-12-13');
    await page.getByRole('button', { name: 'Review pasted table' }).click();
    const item = itemFor(page, 'Granada');
    await item.getByRole('combobox', { name: 'Meaning of Granada', exact: true }).selectOption({ label: 'Granada · town · Granada · Nicaragua' });
    assert.equal(await page.getByRole('heading', { name: 'Which Granada do you mean?', exact: true }).count(), 0);
    await page.getByRole('region', { name: 'Your route', exact: true }).getByText('Granada, Nicaragua', { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('easyt:trip-recovery:')).length), 0);
    assert.deepEqual(fixture.errors, []);
  } finally { await fixture.close(); }
});
