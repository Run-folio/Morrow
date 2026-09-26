import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { captureJourneyBrief } from '../lib/easyt/journey-capture.ts';
import { createHomeTripDraft, handoffRouteStops, homepageSubmissionFingerprint, projectHomepageInput } from '../lib/easyt/home-trip-handoff.ts';
import { tripFromBuilder } from '../lib/easyt/trip.ts';
import type { CanonicalPlaceSuggestion, PlaceType } from '../lib/easyt/place-intelligence.ts';
import { emptyHomepageInput } from './fixtures/homepage-dual-entry.ts';
import { builderBrowserTestsEnabled, renderBuilder } from './helpers/builder-render.ts';

const homeDraft = (destination: string, originName = 'Madrid') => {
  const origin = originName === 'London'
    ? { name: 'London', country: 'United Kingdom', canonicalPlaceId: 'london', coordinates: [-0.1276, 51.5072] as [number, number] }
    : { name: 'Madrid', country: 'Spain', canonicalPlaceId: 'madrid', coordinates: [-3.7038, 40.4168] as [number, number] };
  const capture = captureJourneyBrief(`Starting from ${origin.name}, 10 days in ${destination}`);
  const draft = createHomeTripDraft({ capture, handoffId: `discovery-${destination}`, datesExplicit: true,
    startDate: '2026-10-06', endDate: '2026-10-16', travellers: 2, travellersExplicit: true, interests: ['nature'],
    origin });
  draft.destinations = handoffRouteStops(capture.mentions, capture.journeyEnd);
  return draft;
};

test('Discovery completion restores the standard Builder stop editing state', () => {
  const builder = readFileSync(new URL('../app/journey/new/trip-builder.tsx', import.meta.url), 'utf8');
  assert.match(builder, /completePlanningArea\(mention, true\);\s*setShowStopEditor\(true\);/,
    'successful Discovery must restore the existing Builder stop editor after its canonical commit');
});

const providerHomepageDraft = (input: {
  name: string;
  country: string;
  canonicalPlaceId: string;
  placeType: PlaceType;
  routability: CanonicalPlaceSuggestion['routability'];
  coordinates: [number, number];
}) => {
  const snapshot = emptyHomepageInput();
  snapshot.entries = [{ id: `provider-${input.name}`, text: input.name, selection: {
    canonicalPlaceId: input.canonicalPlaceId,
    name: input.name,
    label: input.name,
    country: input.country,
    placeType: input.placeType,
    routability: input.routability,
    coordinates: input.coordinates,
    provenance: [{
      id: input.canonicalPlaceId,
      label: 'OpenStreetMap contributors',
      kind: 'provider',
      supports: 'The homepage place picker returned this typed provider candidate.',
    }],
  } }];
  const result = projectHomepageInput({ snapshot, profile: null, handoffId: `provider-${input.name}` });
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error(`Expected ${input.name} homepage input to project`);
  return {
    ...result.draft,
    homepage: { ...result.draft.homepage!, receipt: {
      version: 1 as const,
      ownerId: null,
      handoffId: `provider-${input.name}`,
      inputFingerprint: homepageSubmissionFingerprint(result.draft),
      tripId: `trip-provider-${input.name.toLocaleLowerCase()}`,
    } },
  };
};

test('provider-selected Japan reaches production Discovery evidence through the real homepage handoff', { skip: !builderBrowserTestsEnabled, timeout: 45_000 }, async () => {
  const draft = providerHomepageDraft({
    name: 'Japan', country: 'Japan', canonicalPlaceId: 'open-world:nominatim:relation:382313',
    placeType: 'country', routability: 'planning_area', coordinates: [138, 37],
  });
  const view = await renderBuilder({ query: '?homeDraft=1', draft });
  try {
    const dialog = view.page.getByRole('dialog');
    await view.page.setViewportSize({ width: 1024, height: 768 });
    await dialog.getByRole('heading', { name: 'Explore places', exact: true }).waitFor();
    await dialog.getByRole('heading', { name: 'Tokyo', exact: true }).waitFor();
    assert.ok(await dialog.locator('[data-discovery-card="true"]').count() > 0);
    const text = await dialog.innerText();
    assert.doesNotMatch(text, /Review choices|Chosen base|Stay here|Split stay|Route and timing checks|No licensed photo yet/);
    assert.equal(await dialog.locator('[data-photo="unavailable"]').count(), 0);
    assert.equal(await dialog.getByText('Shortlist', { exact: true }).count(), 1, 'country exploration retains its shortlist');
    const kanazawa = dialog.getByRole('heading', { name: 'Kanazawa', exact: true }).locator('..').locator('..');
    assert.equal(await kanazawa.getByRole('button').count(), 1, 'normal place cards expose one visible mutation action');
    const footer = dialog.locator('footer');
    assert.equal(await footer.isVisible(), true);
    assert.deepEqual(view.errors, []);
  } finally { await view.close(); }
});

test('provider-selected Namibia reaches its reviewed Discovery set', { skip: !builderBrowserTestsEnabled, timeout: 45_000 }, async () => {
  const draft = providerHomepageDraft({
    name: 'Namibia', country: 'Namibia', canonicalPlaceId: 'open-world:nominatim:relation:195266',
    placeType: 'country', routability: 'planning_area', coordinates: [17, -22],
  });
  const view = await renderBuilder({ query: '?homeDraft=1', draft });
  try {
    const dialog = view.page.getByRole('dialog');
    await dialog.getByRole('heading', { name: 'Windhoek', exact: true }).waitFor();
    assert.ok(await dialog.locator('[data-discovery-card="true"]').count() > 0);
    assert.deepEqual(view.errors, []);
  } finally { await view.close(); }
});

test('provider-selected Africa starts with truthful reviewed route-family directions', { skip: !builderBrowserTestsEnabled, timeout: 45_000 }, async () => {
  const draft = providerHomepageDraft({
    name: 'Africa', country: '', canonicalPlaceId: 'open-world:nominatim:continent:africa',
    placeType: 'continent', routability: 'planning_area', coordinates: [20, 2],
  });
  const view = await renderBuilder({ query: '?homeDraft=1', draft });
  try {
    const dialog = view.page.getByRole('dialog');
    await dialog.getByRole('heading', { name: 'Choose a direction', exact: true }).waitFor();
    await dialog.getByRole('heading', { name: 'Namibia Self-Drive', exact: true }).waitFor();
    await dialog.getByRole('heading', { name: 'Morocco, medinas to mountains', exact: true }).waitFor();
    assert.equal(await dialog.getByRole('button', { name: /^Explore direction:/ }).count(), 2);
    const licensedPhotos = dialog.locator('[data-photo="licensed"]');
    assert.equal(await licensedPhotos.count(), 2, 'each reviewed route direction keeps its licensed route imagery');
    assert.ok(await licensedPhotos.first().locator('details a[href]').count() > 0, 'licensed imagery keeps its attribution links');
    await dialog.getByRole('button', { name: 'Explore direction: Namibia Self-Drive', exact: true }).click();
    await dialog.getByRole('heading', { name: 'Explore places', exact: true }).waitFor();
    await dialog.getByRole('heading', { name: 'Windhoek', exact: true }).waitFor();
    assert.equal(await dialog.getByRole('heading', { name: 'Marrakech', exact: true }).count(), 0);
    assert.equal(await dialog.getByText('Shortlist', { exact: true }).count(), 1, 'continent place exploration retains its shortlist');
    const africaText = await dialog.innerText();
    assert.match(africaText, /A remote desert-and-mountain region between Namibia's major highlights\./);
    assert.match(africaText, /One of Namibia's major wildlife areas, with access depending on the chosen gate and stay\./);
    assert.doesNotMatch(africaText, /flexible regional base|multi-night wildlife chapter/);
    const trips = await view.page.evaluate(() => Object.values(localStorage).flatMap(raw => {
      try { const trip = JSON.parse(raw).trip; return trip ? [trip] : []; } catch { return []; }
    }));
    assert.ok(trips.every((trip: { stops: unknown[] }) => trip.stops.length === 0), 'choosing a direction does not mutate the trip');
    assert.deepEqual(view.errors, []);
  } finally { await view.close(); }
});

test('Japan card focus drives the map, Add stays isolated, and direct commit opens Builder without Review', { skip: !builderBrowserTestsEnabled, timeout: 60_000 }, async () => {
  const view = await renderBuilder({ query: '?homeDraft=1', draft: homeDraft('Japan') });
  await view.page.setViewportSize({ width: 1440, height: 900 });
  try {
    const dialog = view.page.getByRole('dialog');
    await dialog.getByRole('heading', { name: 'Explore places', exact: true }).waitFor();
    const card = dialog.getByRole('heading', { name: 'Kanazawa', exact: true }).locator('..').locator('..');
    await card.click({ position: { x: 12, y: 12 } });
    assert.equal(await card.getAttribute('data-highlighted'), 'true');
    const kyoto = dialog.getByRole('heading', { name: 'Kyoto', exact: true }).locator('..').locator('..');
    const kyotoAdd = kyoto.getByRole('button', { name: 'Add to shortlist: Kyoto' });
    await kyotoAdd.focus();
    await view.page.keyboard.press('Enter');
    assert.equal(await card.getAttribute('data-highlighted'), 'true', 'a primary action does not steal the card/map focus');
    assert.notEqual(await kyoto.getAttribute('data-highlighted'), 'true');
    await kyoto.getByRole('button', { name: 'Remove from shortlist: Kyoto' }).evaluate((button: HTMLButtonElement) => button.click());
    const add = card.getByRole('button', { name: 'Add to shortlist: Kanazawa' });
    await add.evaluate((button: HTMLButtonElement) => button.click());
    assert.equal(await dialog.getByRole('button', { name: 'Add 1 place', exact: true }).isEnabled(), true);
    await dialog.getByRole('button', { name: 'Add 1 place', exact: true }).evaluate((button: HTMLButtonElement) => button.click());
    await view.page.waitForFunction(() => !document.querySelector('[role="dialog"]'));
    assert.equal(await view.page.getByRole('heading', { name: 'Review choices', exact: true }).count(), 0);
    const trips = await view.page.evaluate(() => Object.values(localStorage).flatMap(raw => {
      try { const trip = JSON.parse(raw).trip; return trip ? [trip] : []; } catch { return []; }
    }));
    assert.ok(trips.some((trip: { stops: Array<{ canonicalPlaceId?: string }> }) => trip.stops.some(stop => stop.canonicalPlaceId === 'kanazawa')));
    assert.deepEqual(view.errors, []);
  } finally { await view.close(); }
});

test('Japan Discovery handoff returns to the editable Builder surface', { skip: !builderBrowserTestsEnabled, timeout: 60_000 }, async () => {
  const view = await renderBuilder({ query: '?homeDraft=1', draft: homeDraft('Japan') });
  await view.page.setViewportSize({ width: 1440, height: 900 });
  try {
    const dialog = view.page.getByRole('dialog');
    await dialog.getByRole('heading', { name: 'Explore places', exact: true }).waitFor();
    for (const name of ['Kanazawa', 'Kyoto', 'Osaka']) {
      await dialog.getByRole('button', { name: `Add to shortlist: ${name}` }).evaluate((button: HTMLButtonElement) => button.click());
    }
    await dialog.getByRole('button', { name: 'Add 3 places', exact: true }).evaluate((button: HTMLButtonElement) => button.click());
    await view.page.waitForFunction(() => !document.querySelector('[role="dialog"]'));

    const stops = view.page.locator('#builder-stops');
    await stops.waitFor();
    assert.doesNotMatch(await stops.getAttribute('class') ?? '', /mobileStopSummary/,
      'a completed Discovery handoff must not retain the desktop-hidden summary state');
    await view.page.getByRole('button', { name: 'Add stop', exact: true }).click();
    await view.page.getByRole('combobox', { name: 'Add a destination' }).waitFor();
    assert.equal(await view.page.locator('[data-builder-route-workspace]').count(), 1);
    assert.equal(await view.page.locator('[role="listitem"][draggable="true"]').count(), 3);
    for (const name of ['Kanazawa', 'Kyoto', 'Osaka']) {
      assert.equal(await view.page.getByRole('button', { name: new RegExp(`Remove ${name}`) }).count(), 1);
    }
    const trips = await view.page.evaluate(() => Object.values(localStorage).flatMap(raw => {
      try { const trip = JSON.parse(raw).trip; return trip ? [trip] : []; } catch { return []; }
    }));
    const committed = trips.find((trip: { stops: Array<{ canonicalPlaceId?: string }> }) =>
      ['kanazawa', 'kyoto', 'osaka'].every(id => trip.stops.filter(stop => stop.canonicalPlaceId === id).length === 1));
    assert.ok(committed, 'all three canonical choices must be saved exactly once before Discovery closes');
    assert.deepEqual(view.errors, []);
  } finally { await view.close(); }
});

test('Discovery handoff retains normal Builder controls and persists exercised edits', { skip: !builderBrowserTestsEnabled, timeout: 90_000 }, async () => {
  const normalTrip = tripFromBuilder({
    id: 'trip-builder-capability-baseline', origin: 'Madrid', originCountry: 'Spain', originCanonicalPlaceId: 'madrid', originCoordinates: [-3.7038, 40.4168],
    journeyEnd: { mode: 'same_as_start' },
    stops: [
      { id: 'kanazawa', name: 'Kanazawa', country: 'Japan', canonicalPlaceId: 'kanazawa', coordinates: [136.6562, 36.5613] },
      { id: 'kyoto', name: 'Kyoto', country: 'Japan', canonicalPlaceId: 'kyoto', coordinates: [135.7681, 35.0116] },
      { id: 'osaka', name: 'Osaka', country: 'Japan', canonicalPlaceId: 'osaka', coordinates: [135.5023, 34.6937] },
    ],
    startDate: '2026-10-06', endDate: '2026-10-16', picks: {}, mustDo: 'Japan', pace: 'slow', hotels: 'few', budget: 'mid',
    nightAllocations: { kanazawa: 3, kyoto: 5, osaka: 2 }, draft: [], status: 'planned',
  });
  const normal = await renderBuilder({ query: `?trip=${normalTrip.id}&recover=1`, initialTrip: normalTrip });
  const discovery = await renderBuilder({ query: '?homeDraft=1', draft: homeDraft('Japan') });
  await normal.page.setViewportSize({ width: 1440, height: 900 });
  await discovery.page.setViewportSize({ width: 1440, height: 900 });
  try {
    const dialog = discovery.page.getByRole('dialog');
    await dialog.getByRole('heading', { name: 'Explore places', exact: true }).waitFor();
    for (const name of ['Kanazawa', 'Kyoto', 'Osaka']) {
      await dialog.getByRole('button', { name: `Add to shortlist: ${name}` }).evaluate((button: HTMLButtonElement) => button.click());
    }
    await dialog.getByRole('button', { name: 'Add 3 places', exact: true }).evaluate((button: HTMLButtonElement) => button.click());
    await discovery.page.waitForFunction(() => !document.querySelector('[role="dialog"]'));
    await discovery.page.waitForTimeout(900);

    const snapshot = async (page: typeof normal.page) => {
      const route = page.locator('[data-builder-route-workspace]');
      await route.waitFor();
      await page.getByRole('combobox', { name: 'Starting from', exact: true }).waitFor({ state: 'visible' });
      const base = {
        addStop: await page.getByRole('button', { name: 'Add stop', exact: true }).isVisible(),
        startingFrom: await page.getByRole('combobox', { name: 'Starting from', exact: true }).isVisible(),
        journeyEnd: await page.getByRole('combobox', { name: 'Ending at', exact: true }).isVisible()
          && await page.getByRole('button', { name: 'Same as start', exact: true }).isVisible(),
        removeStop: await page.getByRole('button', { name: 'Remove Kanazawa', exact: true }).isVisible(),
        dragReorder: await route.getByRole('button', { name: /^Reorder Kanazawa/ }).isVisible(),
        nights: await route.getByRole('button', { name: /^Add one night to Kanazawa/ }).isVisible(),
        rowOverflow: await route.getByRole('button', { name: 'Actions for Kanazawa', exact: true }).isVisible(),
        mapSelection: await route.getByRole('button', { name: /Map stop/ }).first().isVisible(),
        routeWorkspace: await route.isVisible(),
        routeCheck: await page.getByText('ROUTE CHECK', { exact: true }).isVisible().catch(() => false),
        earlierLater: false,
        stopNames: await route.locator('[data-builder-stop-index]').allTextContents(),
      };
      const middleMenu = route.locator('summary[aria-label="Actions for Kyoto"]');
      await middleMenu.click();
      base.earlierLater = await route.getByRole('button', { name: 'Earlier', exact: true }).isVisible()
        && await route.getByRole('button', { name: 'Later', exact: true }).isVisible();
      await middleMenu.click();
      return base;
    };

    const normalCapabilities = await snapshot(normal.page);
    const normalRoute = normal.page.locator('[data-builder-route-workspace]');
    await normalRoute.getByRole('button', { name: /^Add one night to Kanazawa/ }).click();
    await normalRoute.getByRole('button', { name: /Add one night to Kanazawa; 4 nights currently/ }).waitFor();
    await normal.page.waitForTimeout(900);
    const normalPersisted = await normal.page.evaluate((tripId: string) => Object.values(localStorage).flatMap(raw => {
      try { const record = JSON.parse(raw); return record.trip?.id === tripId ? [record] : []; } catch { return []; }
    }).sort((left: { savedAt?: string }, right: { savedAt?: string }) => Date.parse(right.savedAt ?? '') - Date.parse(left.savedAt ?? ''))[0]?.trip,
    normalTrip.id);
    assert.equal(normalPersisted?.stops.find((stop: { canonicalPlaceId?: string }) => stop.canonicalPlaceId === 'kanazawa')?.nights, 4,
      `normal Builder night edit persistence: ${JSON.stringify(normalPersisted?.stops.map((stop: { canonicalPlaceId?: string; nights?: number }) => [stop.canonicalPlaceId, stop.nights]))}`);
    const discoveryCapabilities = await snapshot(discovery.page);
    assert.deepEqual(discoveryCapabilities, normalCapabilities, 'Discovery and normal Builder must expose the same visible editing capabilities for equivalent stops');

    const page = discovery.page;
    const route = page.locator('[data-builder-route-workspace]');
    const routeOrder = async () => route.locator('[data-builder-stop-index]').evaluateAll((rows: HTMLElement[]) =>
      rows.map(row => row.querySelector('[role="cell"] strong')?.textContent?.trim() ?? ''));
    await page.getByRole('button', { name: 'Add stop', exact: true }).click();
    await page.getByRole('combobox', { name: 'Add a destination', exact: true }).waitFor({ state: 'visible' });
    await page.getByRole('button', { name: 'Done adding stops', exact: true }).click();

    const kyotoMenu = route.locator('summary[aria-label="Actions for Kyoto"]');
    await kyotoMenu.click();
    await route.getByRole('button', { name: 'Later', exact: true }).click();
    assert.deepEqual(await routeOrder(), ['Kanazawa', 'Osaka', 'Kyoto']);
    const earlier = route.getByRole('button', { name: 'Earlier', exact: true });
    if (!await earlier.isVisible().catch(() => false)) await route.locator('summary[aria-label="Actions for Kyoto"]').click();
    await earlier.click();
    assert.deepEqual(await routeOrder(), ['Kanazawa', 'Kyoto', 'Osaka']);

    const firstNight = route.getByRole('button', { name: /^Add one night to Kanazawa/ });
    await firstNight.click();
    await route.getByRole('button', { name: /Add one night to Kanazawa; 4 nights currently/ }).waitFor();

    await route.getByRole('button', { name: 'Map stop Kyoto', exact: true }).click();
    assert.equal(await route.locator('[data-builder-stop-index="1"]').getAttribute('aria-selected'), 'true', 'map leg selection selects its route stop');

    assert.deepEqual(await routeOrder(), ['Kanazawa', 'Kyoto', 'Osaka']);
    const dragGrip = route.getByRole('button', { name: 'Reorder Kyoto, stop 2' });
    await dragGrip.dragTo(route.locator('[data-builder-stop-index="0"]'));
    await page.waitForFunction(() => [...document.querySelectorAll('[data-builder-route-workspace] [data-builder-stop-index]')]
      .map(row => row.querySelector('[role="cell"] strong')?.textContent?.trim()).join('|') === 'Kyoto|Kanazawa|Osaka');
    assert.deepEqual(await routeOrder(), ['Kyoto', 'Kanazawa', 'Osaka']);
    await page.waitForTimeout(900);

    const savedTrip = await page.evaluate(() => Object.values(localStorage).flatMap(raw => {
      try { const record = JSON.parse(raw); return record.trip ? [record] : []; } catch { return []; }
    }).filter((record: { trip: { id?: string; stops?: Array<{ canonicalPlaceId?: string }> } }) =>
      record.trip.id !== 'trip-builder-capability-baseline'
        && record.trip.stops?.filter(stop => ['kanazawa', 'kyoto', 'osaka'].includes(stop.canonicalPlaceId ?? '')).length === 3)
      .sort((left: { savedAt?: string }, right: { savedAt?: string }) => Date.parse(right.savedAt ?? '') - Date.parse(left.savedAt ?? ''))[0]?.trip);
    assert.ok(savedTrip, 'the discovery-created canonical trip is saved before reload');
    assert.equal(savedTrip.stops.find((stop: { canonicalPlaceId?: string }) => stop.canonicalPlaceId === 'kanazawa')?.nights, 4,
      `persisted Discovery night allocation: ${JSON.stringify(savedTrip.stops.map((stop: { canonicalPlaceId?: string; nights?: number }) => [stop.canonicalPlaceId, stop.nights]))}`);
    assert.deepEqual(savedTrip.stops.map((stop: { canonicalPlaceId?: string }) => stop.canonicalPlaceId), ['kyoto', 'kanazawa', 'osaka']);
    await page.goto(`${new URL(page.url()).origin}/journey/new?trip=${savedTrip.id}&recover=1`);
    await page.waitForFunction(() => Boolean(document.querySelector('[data-builder-route-workspace]')));
    const reloadedRoute = page.locator('[data-builder-route-workspace]');
    await page.getByRole('button', { name: /Add one night to Kanazawa; 4 nights currently/ }).waitFor({ timeout: 5_000 });
    assert.deepEqual(await reloadedRoute.locator('[data-builder-stop-index]').evaluateAll((rows: HTMLElement[]) =>
      rows.map(row => row.querySelector('[role="cell"] strong')?.textContent?.trim() ?? '')), ['Kyoto', 'Kanazawa', 'Osaka']);
    await page.getByRole('button', { name: 'Remove Kanazawa', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Remove Kanazawa', exact: true }).click();
    await page.waitForFunction(() => document.querySelectorAll('[data-builder-route-workspace] [data-builder-stop-index]').length === 2);
    assert.deepEqual(await reloadedRoute.locator('[data-builder-stop-index]').evaluateAll((rows: HTMLElement[]) =>
      rows.map(row => row.querySelector('[role="cell"] strong')?.textContent?.trim() ?? '')), ['Kyoto', 'Osaka']);
    assert.deepEqual(discovery.errors, []);
    assert.deepEqual(normal.errors, []);
  } finally {
    await normal.close();
    await discovery.close();
  }
});

for (const [country, clickOrder] of [
  ['Australia', ['Airlie Beach', 'Sydney', 'Port Douglas']],
  ['Japan', ['Osaka', 'Kanazawa', 'Kyoto']],
] as const) test(`${country} Discovery commits place membership through the normal route-order owner`, { skip: !builderBrowserTestsEnabled, timeout: 90_000 }, async () => {
  const view = await renderBuilder({ query: '?homeDraft=1', draft: homeDraft(country, 'London') });
  const dialog = view.page.getByRole('dialog');
  try {
    await dialog.getByRole('heading', { name: country === 'Australia' ? 'Choose a direction' : 'Explore places' }).waitFor();
    if (country === 'Australia') {
      await dialog.getByRole('button', { name: 'Explore direction: East coast' }).click();
      await dialog.getByRole('heading', { name: 'Explore places' }).waitFor();
      for (const name of ['Byron Bay', 'Cairns']) {
        await dialog.getByRole('button', { name: `Add to shortlist: ${name}`, exact: true }).waitFor();
      }
      const browseOnly = dialog.locator('[data-discovery-card="true"]').filter({ hasText: 'Gold Coast' });
      assert.equal(await browseOnly.getAttribute('data-actionability'), 'browse-only');
      assert.equal(await browseOnly.getByRole('button', { name: 'Add to shortlist: Gold Coast', exact: true }).count(), 0,
        'a visible place without stay evidence does not expose Add');
    }
    for (const name of clickOrder) {
      await dialog.getByRole('button', { name: `Add to shortlist: ${name}`, exact: true }).evaluate((button: HTMLButtonElement) => button.click());
    }
    await dialog.getByRole('button', { name: `Add ${clickOrder.length} places`, exact: true }).evaluate((button: HTMLButtonElement) => button.click());
    await view.page.waitForFunction(() => !document.querySelector('[role="dialog"]'));
    await view.page.waitForFunction(() => {
      const rows = [...document.querySelectorAll('[data-builder-route-workspace] [data-builder-stop-index]')];
      return rows.length === 3 && rows.every(row => row.querySelector('[role="cell"] strong')?.textContent?.trim());
    });
    const route = view.page.locator('[data-builder-route-workspace]');
    const finalOrder = await route.locator('[data-builder-stop-index]').evaluateAll((rows: HTMLElement[]) =>
      rows.map(row => row.querySelector('[role="cell"] strong')?.textContent?.trim() ?? ''));
    assert.deepEqual([...finalOrder].sort(), [...clickOrder].sort(), 'all chosen places remain committed once');
    assert.notDeepEqual(finalOrder, [...clickOrder], 'ordinary geography click order is membership, not route chronology');
    assert.notDeepEqual(finalOrder, ['Port Douglas', 'Sydney', 'Airlie Beach'], 'the canonical scorer must reject the known large reversal');
    assert.equal(await route.getByRole('button', { name: 'Add stop', exact: true }).isVisible()
      || await view.page.getByRole('combobox', { name: 'Add a destination', exact: true }).isVisible(), true,
    'the normal Builder add flow remains available');
    assert.equal(new Set(finalOrder).size, 3, 'the route has no duplicate places');
    const totalAllocatedNights = () => route.getByRole('button', { name: /^Add one night to / }).evaluateAll((buttons: HTMLButtonElement[]) =>
      buttons.reduce((total, button) => total + Number(button.getAttribute('aria-label')?.match(/; (\d+) nights currently/)?.[1] ?? 0), 0));
    const originalNightTotal = await totalAllocatedNights();
    const reorderHandle = route.getByRole('button', { name: new RegExp(`^Reorder ${finalOrder[1]}, stop`) });
    await reorderHandle.dragTo(route.locator('[data-builder-stop-index="0"]'));
    await view.page.waitForFunction((expected: string) =>
      document.querySelector('[data-builder-route-workspace] [data-builder-stop-index] [role="cell"] strong')?.textContent?.trim() === expected,
    finalOrder[1]);
    assert.equal(await route.locator('[data-builder-stop-index]').count(), 3);
    assert.equal(new Set(await route.locator('[data-builder-stop-index]').evaluateAll((rows: HTMLElement[]) =>
      rows.map(row => row.querySelector('[role="cell"] strong')?.textContent?.trim() ?? ''))).size, 3);
    assert.equal(await totalAllocatedNights(), originalNightTotal, 'reordering preserves the trip night budget');
    assert.deepEqual(view.errors, []);
  } finally { await view.close(); }
});

for (const [intent, base] of [['Taj Mahal', 'Agra'], ['Lake Atitlán', 'Panajachel']] as const) test(`${intent} resolves through one supported base action and commits without a visible Review step`,
  { skip: !builderBrowserTestsEnabled, timeout: 60_000 }, async () => {
  const view = await renderBuilder({ query: '?homeDraft=1', draft: homeDraft(intent) });
  try {
    const dialog = view.page.getByRole('dialog');
    await dialog.getByRole('heading', { name: 'Choose a base', exact: true }).waitFor();
    assert.equal(await dialog.locator('[data-discovery-card="true"]').count(), 1);
    assert.equal(await dialog.getByRole('button', { name: `Visit from base: ${base}`, exact: true }).count(), 0);
    assert.equal(await dialog.getByText('Shortlist', { exact: true }).count(), 0);
    const chooseBase = dialog.getByRole('button', {
      name: `Use ${base} as the base for visiting ${intent}`,
      exact: true,
    });
    assert.equal(await chooseBase.count(), 1);
    assert.equal(await chooseBase.textContent(), `Stay in ${base}`);
    await chooseBase.click();
    await dialog.getByRole('button', { name: 'Add to trip', exact: true }).evaluate((button: HTMLButtonElement) => button.click());
    await view.page.waitForFunction(() => !document.querySelector('[role="dialog"]'));
    assert.equal(await view.page.getByRole('heading', { name: 'Review choices', exact: true }).count(), 0);
    const trips = await view.page.evaluate(() => Object.values(localStorage).flatMap(raw => {
      try { const trip = JSON.parse(raw).trip; return trip ? [trip] : []; } catch { return []; }
    }));
    assert.ok(trips.some((trip: { stops: Array<{ name: string }> }) => trip.stops.some(stop => stop.name === base)));
    assert.ok(trips.every((trip: { stops: Array<{ name: string }> }) => !trip.stops.some(stop => stop.name === intent)));
    assert.deepEqual(view.errors, []);
  } finally { await view.close(); }
});

test('390 mobile Discovery keeps the primary action in the modal footer', { skip: !builderBrowserTestsEnabled, timeout: 45_000 }, async () => {
  const view = await renderBuilder({ query: '?homeDraft=1', draft: homeDraft('Japan') });
  await view.page.setViewportSize({ width: 390, height: 844 });
  try {
    const dialog = view.page.getByRole('dialog');
    await dialog.getByRole('heading', { name: 'Explore places', exact: true }).waitFor();
    assert.equal(await dialog.locator('[data-discovery-scroll-owner="true"]').count(), 1);
    assert.equal(await dialog.locator('footer').count(), 1);
    assert.equal(await dialog.getByRole('button', { name: 'Add places', exact: true }).isDisabled(), true);
    assert.deepEqual(view.errors, []);
  } finally { await view.close(); }
});

test('provider-selected Australia retains its rich Discovery directions', { skip: !builderBrowserTestsEnabled, timeout: 45_000 }, async () => {
  const draft = providerHomepageDraft({
    name: 'Australia', country: 'Australia', canonicalPlaceId: 'open-world:nominatim:relation:80500',
    placeType: 'country', routability: 'planning_area', coordinates: [134, -25],
  });
  const view = await renderBuilder({ query: '?homeDraft=1', draft });
  try {
    const dialog = view.page.getByRole('dialog');
    await dialog.getByRole('heading', { name: 'Choose a direction', exact: true }).waitFor();
    assert.ok(await dialog.getByRole('button', { name: /^Explore direction:/ }).count() > 1);
    assert.deepEqual(view.errors, []);
  } finally { await view.close(); }
});

test('provider-selected genuine zero remains unresolved without fabricated places', { skip: !builderBrowserTestsEnabled, timeout: 45_000 }, async () => {
  const draft = providerHomepageDraft({
    name: 'Eritrea', country: 'Eritrea', canonicalPlaceId: 'open-world:nominatim:relation:296961',
    placeType: 'country', routability: 'planning_area', coordinates: [39, 15],
  });
  const view = await renderBuilder({ query: '?homeDraft=1', draft });
  try {
    const dialog = view.page.getByRole('dialog');
    await dialog.getByText("We don't have reviewed places here yet.", { exact: true }).waitFor();
    assert.equal(await dialog.locator('[data-discovery-card="true"]').count(), 0);
    assert.deepEqual(view.errors, []);
  } finally { await view.close(); }
});

test('provider-selected actionable Tokyo still skips Discovery', { skip: !builderBrowserTestsEnabled, timeout: 45_000 }, async () => {
  const draft = providerHomepageDraft({
    name: 'Tokyo', country: 'Japan', canonicalPlaceId: 'open-world:nominatim:relation:1543125',
    placeType: 'city', routability: 'direct_destination', coordinates: [139.6917, 35.6895],
  });
  const view = await renderBuilder({ query: '?homeDraft=1', draft });
  try {
    assert.equal(await view.page.getByRole('dialog').count(), 0);
    assert.equal(await view.page.getByRole('button', { name: 'Continue shaping your route', exact: true }).count(), 0);
    assert.deepEqual(view.errors, []);
  } finally { await view.close(); }
});

test('Tajikistan uses adaptive sparse Discovery, search blocks unreviewed stays, and explicit empty choices survive reload', { skip: !builderBrowserTestsEnabled, timeout: 45_000 }, async () => {
  const view = await renderBuilder({ query: '?homeDraft=1', draft: homeDraft('Tajikistan') });
  await view.page.setViewportSize({ width: 390, height: 844 });
  try {
    const dialog = view.page.getByRole('dialog');
    await dialog.getByRole('heading', { name: 'Explore places', exact: true }).waitFor();
    for (const name of ['Dushanbe', 'Khujand', 'Panjakent']) assert.equal(await dialog.getByRole('heading', { name, exact: true }).count(), 1);
    assert.equal(await dialog.getByRole('button', { name: /^Add to shortlist:/ }).count(), 0);
    const search = dialog.getByRole('combobox', { name: 'Search for somewhere specific: Tajikistan' });
    await search.fill('Dushanbe');
    await dialog.getByRole('option', { name: /Dushanbe/ }).first().click();
    await dialog.getByRole('alert').filter({ hasText: /cannot confirm Dushanbe/ }).waitFor();
    await dialog.getByRole('button', { name: 'Finish later', exact: true }).click();
    await view.page.reload();
    await view.page.getByRole('button', { name: 'Continue shaping your route' }).click();
    await dialog.getByRole('heading', { name: 'Explore places', exact: true }).waitFor();
    const saved = await view.page.evaluate(() => Object.values(localStorage).flatMap(raw => {
      try { const trip = JSON.parse(raw).trip; return trip?.brief?.structuredBrief?.discoveryDraftByMentionId ? [trip] : []; } catch { return []; }
    }));
    assert.ok(saved.length > 0);
    for (const trip of saved) {
      const draft = trip.brief.structuredBrief.discoveryDraftByMentionId['place-tajikistan-0'];
      assert.deepEqual(draft.shortlistIds, []); assert.equal(draft.step, 'places');
      assert.equal(trip.stops.filter((stop: { country: string }) => stop.country === 'Tajikistan').length, 0);
    }
    assert.deepEqual(view.errors, []);
  } finally { await view.close(); }
});

test('Africa aggregates reviewed places while retaining continent intent without a default country or overnight stop', { skip: !builderBrowserTestsEnabled, timeout: 45_000 }, async () => {
  const view = await renderBuilder({ query: '?homeDraft=1', draft: homeDraft('Africa') });
  await view.page.setViewportSize({ width: 390, height: 844 });
  try {
    const dialog = view.page.getByRole('dialog');
    await dialog.getByRole('heading', { name: 'Choose a direction', exact: true }).waitFor();
    await dialog.getByRole('button', { name: 'Explore direction: Namibia Self-Drive', exact: true }).click();
    await dialog.getByRole('heading', { name: 'Explore places', exact: true }).waitFor();
    assert.ok(await dialog.locator('[data-discovery-card="true"]').count() > 1);
    await dialog.getByRole('combobox', { name: 'Search for somewhere specific: Africa' }).fill('Arusha');
    await dialog.getByRole('option', { name: /Arusha/ }).first().click();
    await dialog.getByRole('alert').filter({ hasText: /cannot confirm Arusha/ }).waitFor();
    await dialog.getByRole('button', { name: 'Finish later', exact: true }).click();
    await view.page.waitForFunction(() => !document.querySelector('[role="dialog"]'));
    const trips = await view.page.evaluate(() => Object.values(localStorage).flatMap(raw => {
      try { const trip = JSON.parse(raw).trip; return trip ? [trip] : []; } catch { return []; }
    }));
    assert.ok(trips.length > 0);
    for (const trip of trips) {
      assert.equal(trip.stops.length, 0);
      assert.ok(trip.brief.structuredBrief.placeMentions.some((mention: { canonicalName: string }) => mention.canonicalName === 'Africa'));
      assert.equal(trip.brief.structuredBrief.placeSelections?.length ?? 0, 0);
      assert.equal(trip.brief.structuredBrief.discoveryDraftByMentionId['place-continent-africa-0'].directionId, 'route-family:namibia-self-drive');
    }
    assert.deepEqual(view.errors, []);
  } finally { await view.close(); }
});

test('Spanish sparse Discovery localizes controls and evidence without changing canonical place names', { skip: !builderBrowserTestsEnabled, timeout: 45_000 }, async () => {
  const view = await renderBuilder({ query: '?homeDraft=1', draft: homeDraft('Tajikistan'), language: 'es' });
  await view.page.setViewportSize({ width: 390, height: 844 });
  try {
    const dialog = view.page.getByRole('dialog');
    await dialog.getByRole('heading', { name: 'Explora lugares', exact: true }).waitFor();
    const text = await dialog.innerText();
    assert.match(text, /Museos y parques urbanos/); assert.equal(await dialog.getByRole('combobox', { name: 'Buscar un lugar concreto: Tajikistan' }).count(), 1);
    assert.doesNotMatch(text, /No licensed photo|Explore only|Choose places|Search for somewhere/);
    assert.equal(await dialog.getByText('Tajikistan', { exact: true }).count() > 0, true);
    assert.equal(await dialog.getByRole('heading', { name: 'Dushanbe', exact: true }).count(), 1);
    assert.equal(await dialog.getByRole('button', { name: 'Añadir lugares', exact: true }).isDisabled(), true);
    assert.deepEqual(view.errors, []);
  } finally { await view.close(); }
});

for (const [destination, expectedPlace] of [
  ['Namibia', 'Windhoek'], ['Japan', 'Tokyo'], ['Italy', 'Rome'], ['Madagascar', 'Antananarivo'], ['Thailand', 'Bangkok'],
] as const) test(`${destination} production evidence reaches Adaptive Discovery`, { skip: !builderBrowserTestsEnabled, timeout: 45_000 }, async () => {
  const view = await renderBuilder({ query: '?homeDraft=1', draft: homeDraft(destination) });
  try {
    const dialog = view.page.getByRole('dialog');
    await dialog.getByRole('heading', { name: expectedPlace, exact: true }).waitFor();
    assert.deepEqual(view.errors, []);
  } finally { await view.close(); }
});

test('genuine zero content keeps unresolved intent, renders no empty rails, and creates no stop', { skip: !builderBrowserTestsEnabled, timeout: 45_000 }, async () => {
  const view = await renderBuilder({ query: '?homeDraft=1', draft: homeDraft('Eritrea') });
  try {
    const dialog = view.page.getByRole('dialog');
    await dialog.getByText("We don't have reviewed places here yet.", { exact: true }).waitFor();
    assert.equal(await dialog.locator('[data-discovery-card="true"]').count(), 0);
    assert.equal(await dialog.locator('[data-discovery-map]').count(), 0);
    assert.equal(await dialog.getByText('Shortlist', { exact: true }).count(), 0);
    await dialog.getByRole('button', { name: 'Finish later', exact: true }).click();
    await view.page.getByText('Places still to choose', { exact: true }).waitFor();
    const trips = await view.page.evaluate(() => Object.values(localStorage).flatMap(raw => {
      try { const trip = JSON.parse(raw).trip; return trip ? [trip] : []; } catch { return []; }
    }));
    assert.ok(trips.length > 0);
    assert.ok(trips.every((trip: { stops: unknown[] }) => trip.stops.length === 0));
    assert.ok(trips.every((trip: { brief: { structuredBrief: { placeMentions: Array<{ canonicalName: string }> } } }) =>
      trip.brief.structuredBrief.placeMentions.some(mention => mention.canonicalName === 'Eritrea')));
    assert.deepEqual(view.errors, []);
  } finally { await view.close(); }
});

test('Spanish genuine zero content and pending intent remain localized', { skip: !builderBrowserTestsEnabled, timeout: 45_000 }, async () => {
  const view = await renderBuilder({ query: '?homeDraft=1', draft: homeDraft('Eritrea'), language: 'es' });
  try {
    const dialog = view.page.getByRole('dialog');
    await dialog.getByText('Aún no tenemos lugares revisados aquí.', { exact: true }).waitFor();
    await dialog.getByRole('button', { name: 'Terminar más tarde', exact: true }).click();
    await view.page.getByText('Lugares aún por elegir', { exact: true }).waitFor();
    assert.deepEqual(view.errors, []);
  } finally { await view.close(); }
});
