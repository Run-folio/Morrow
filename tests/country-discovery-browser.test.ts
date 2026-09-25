import assert from 'node:assert/strict';
import test from 'node:test';
import { captureJourneyBrief } from '../lib/easyt/journey-capture.ts';
import { createHomeTripDraft, handoffRouteStops, homepageSubmissionFingerprint, projectHomepageInput } from '../lib/easyt/home-trip-handoff.ts';
import type { CanonicalPlaceSuggestion, PlaceType } from '../lib/easyt/place-intelligence.ts';
import { emptyHomepageInput } from './fixtures/homepage-dual-entry.ts';
import { builderBrowserTestsEnabled, renderBuilder } from './helpers/builder-render.ts';

const homeDraft = (destination: string) => {
  const capture = captureJourneyBrief(`Starting from Madrid, 10 days in ${destination}`);
  const draft = createHomeTripDraft({ capture, handoffId: `discovery-${destination}`, datesExplicit: true,
    startDate: '2026-10-06', endDate: '2026-10-16', travellers: 2, travellersExplicit: true, interests: ['nature'],
    origin: { name: 'Madrid', country: 'Spain', canonicalPlaceId: 'madrid', coordinates: [-3.7038, 40.4168] } });
  draft.destinations = handoffRouteStops(capture.mentions, capture.journeyEnd);
  return draft;
};

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
    await dialog.getByRole('heading', { name: 'Tokyo', exact: true }).waitFor();
    assert.ok(await dialog.locator('[data-discovery-card="true"]').count() > 0);
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

test('provider-selected Africa retains reviewed cross-country Discovery evidence', { skip: !builderBrowserTestsEnabled, timeout: 45_000 }, async () => {
  const draft = providerHomepageDraft({
    name: 'Africa', country: '', canonicalPlaceId: 'open-world:nominatim:continent:africa',
    placeType: 'continent', routability: 'planning_area', coordinates: [20, 2],
  });
  const view = await renderBuilder({ query: '?homeDraft=1', draft });
  try {
    const dialog = view.page.getByRole('dialog');
    await dialog.getByRole('heading', { name: 'Explore places', exact: true }).waitFor();
    assert.ok(await dialog.locator('[data-discovery-card="true"]').count() > 1);
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
    await dialog.getByRole('button', { name: /^Add to shortlist:/ }).first().click();
    await dialog.getByRole('button', { name: /^Remove from shortlist:/ }).first().click();
    const search = dialog.getByRole('combobox', { name: 'Search for somewhere specific: Tajikistan' });
    await search.fill('Dushanbe');
    await dialog.getByRole('option', { name: /Dushanbe/ }).first().click();
    await dialog.getByRole('alert').filter({ hasText: /cannot confirm Dushanbe/ }).waitFor();
    await dialog.getByRole('button', { name: 'Continue', exact: true }).click();
    await dialog.getByRole('heading', { name: 'Review choices', exact: true }).waitFor();
    assert.equal(await dialog.getByRole('button', { name: 'Confirm existing places', exact: true }).isDisabled(), true);
    await dialog.getByRole('button', { name: 'Back', exact: true }).click();
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
    await dialog.getByRole('heading', { name: 'Explore places', exact: true }).waitFor();
    assert.ok(await dialog.locator('[data-discovery-card="true"]').count() > 1);
    assert.equal(await dialog.getByRole('button', { name: /^Explore direction:/ }).count(), 0);
    await dialog.getByRole('button', { name: /^Add to shortlist:/ }).first().click();
    await dialog.getByRole('button', { name: /^Remove from shortlist:/ }).first().click();
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
    await dialog.getByRole('button', { name: 'Continuar', exact: true }).click();
    assert.equal(await dialog.getByRole('button', { name: 'Confirmar lugares existentes', exact: true }).isDisabled(), true);
    await dialog.getByRole('button', { name: 'Atrás', exact: true }).click();
    await dialog.getByRole('heading', { name: 'Explora lugares', exact: true }).waitFor();
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
