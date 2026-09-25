import assert from 'node:assert/strict';
import test from 'node:test';
import { captureJourneyBrief } from '../lib/easyt/journey-capture.ts';
import { createHomeTripDraft, handoffRouteStops } from '../lib/easyt/home-trip-handoff.ts';
import { builderBrowserTestsEnabled, renderBuilder } from './helpers/builder-render.ts';

const homeDraft = (destination: string) => {
  const capture = captureJourneyBrief(`Starting from Madrid, 10 days in ${destination}`);
  const draft = createHomeTripDraft({ capture, handoffId: `discovery-${destination}`, datesExplicit: true,
    startDate: '2026-10-06', endDate: '2026-10-16', travellers: 2, travellersExplicit: true, interests: ['nature'],
    origin: { name: 'Madrid', country: 'Spain', canonicalPlaceId: 'madrid', coordinates: [-3.7038, 40.4168] } });
  draft.destinations = handoffRouteStops(capture.mentions, capture.journeyEnd);
  return draft;
};

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

test('Africa retains its continent intent and sparse reviewed place without a default country or overnight stop', { skip: !builderBrowserTestsEnabled, timeout: 45_000 }, async () => {
  const view = await renderBuilder({ query: '?homeDraft=1', draft: homeDraft('Africa') });
  await view.page.setViewportSize({ width: 390, height: 844 });
  try {
    const dialog = view.page.getByRole('dialog');
    await dialog.getByRole('heading', { name: 'Explore places', exact: true }).waitFor();
    assert.equal(await dialog.getByRole('heading', { name: 'Arusha', exact: true }).count(), 1);
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
