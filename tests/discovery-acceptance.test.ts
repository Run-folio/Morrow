import assert from 'node:assert/strict';
import test from 'node:test';
import { discoveryEntryForBrief } from '../lib/easyt/discovery-entry.ts';
import { createDiscoveryDraft, readDiscoveryDraft, reduceDiscoveryDraft, selectCanonicalSearchResult } from '../lib/easyt/discovery-draft.ts';
import { projectDiscovery, type DiscoveryProjectionContext } from '../lib/easyt/discovery-projection.ts';
import { discoveryPlaceForId, type DiscoveryPlace } from '../lib/easyt/discovery-content.ts';
import { discoveryMapTarget } from '../lib/easyt/discovery-map-target.ts';
import { buildDiscoveryReview } from '../lib/easyt/discovery-review.ts';
import { commitDiscoveryReview, type DiscoveryCommitPorts } from '../lib/easyt/discovery-commit.ts';
import { extractStructuredTripBrief } from '../lib/easyt/structured-trip-brief.ts';
import { canonicalPlaceSuggestionsForQuery, confirmedAttractionVisitSelection, inferAttractionVisitSelections } from '../lib/easyt/place-intelligence.ts';
import { discoveryConfirmLabel } from '../lib/easyt/i18n.ts';
import { fixture, applyDiscoveryAddSideEffects } from './helpers/discovery-fixture.ts';

const context = { interests: [] as string[], existingPlaceIds: [] as string[] };
const entryAndProjection = (name: string) => {
  const brief = extractStructuredTripBrief(name);
  const entry = discoveryEntryForBrief(brief, []);
  const mention = brief.placeMentions!.find(item => item.mentionId === entry.mentionId)!;
  const draft = readDiscoveryDraft(brief, mention.mentionId).draft;
  return { brief, entry, mention, draft, projection: projectDiscovery({ mention, draft, context }) };
};

// Catches shell routing by collection size and unsupported travel defaults.
for (const [name, kind, count] of [
  ['Tajikistan', 'country', 3], ['Africa', 'continent', 1],
  ['Taj Mahal', 'landmark', 0], ['Kruger National Park', 'clarification', 0],
  ['Lake Atitlán', 'natural-area', 0], ['Philippines', 'country', 2], ['Eritrea', 'country', 0],
] as const) test(`${name}: adaptive entry retains original intent at evidenced depth`, () => {
  const { entry, mention, draft, projection } = entryAndProjection(name);
  assert.equal(entry.kind, kind);
  assert.equal(mention.sourceText, name);
  assert.equal(projection.counts.source, count);
  assert.equal(projection.counts.eligible, count);
  assert.deepEqual(projection.recommendedIds, []);
  assert.deepEqual(draft.shortlistIds, []);
  assert.equal(buildDiscoveryReview({ ...fixture(name, []), mention, draft, projection }).canConfirm, false);
});

test('Australia: entry → evidenced broad projection → exact map IDs → explicit review → durable Builder ports', async () => {
  const { entry, mention, projection } = entryAndProjection('Australia');
  assert.equal(entry.kind, 'country'); assert.equal(entry.step, 'directions');
  assert.ok(projection.counts.source >= 20);
  assert.equal(projection.counts.eligible, projection.counts.source);
  assert.equal(projection.counts.ranked, projection.places.length);
  assert.equal(projection.counts.displayed, 6);
  assert.ok(projection.recommendedIds.length < projection.counts.displayed);
  assert.ok(projection.directions.length >= 4);
  for (const place of projection.places) {
    assert.ok(discoveryPlaceForId(place.id));
    assert.ok(place.relevance.en && place.relevance.es && place.relevance.sources.length);
    assert.deepEqual(discoveryMapTarget(place.id, projection.places), { id: place.id, coordinates: [...place.coordinates] });
  }
  const input = fixture('Australia', []);
  const before = structuredClone(input.trip);
  const search = canonicalPlaceSuggestionsForQuery('Melbourne', ['Australia']).find(item => item.canonicalPlaceId === 'melbourne')!;
  assert.ok(search);
  let draft = selectCanonicalSearchResult(input.draft, { canonicalPlaceId: search.canonicalPlaceId!, country: search.country }, projection.places);
  assert.deepEqual(draft.shortlistIds, ['melbourne']);
  assert.deepEqual(draft, reduceDiscoveryDraft(input.draft, { type: 'add-shortlist', placeId: 'melbourne' }));
  draft = reduceDiscoveryDraft(draft, { type: 'change-direction', directionId: 'australia-west' });
  draft = reduceDiscoveryDraft(draft, { type: 'set-step', step: 'places' });
  const review = buildDiscoveryReview({ ...input, mention, draft, projection });
  assert.deepEqual(review.newBaseIds, ['melbourne']);
  assert.deepEqual(input.trip, before);
  let durable = structuredClone(before);
  const ports: DiscoveryCommitPorts = {
    currentTrip: () => input.trip,
    addBase: async choice => { applyDiscoveryAddSideEffects(input.trip, mention, choice); return true; },
    linkVisit: async () => false,
    persist: async () => { durable = structuredClone(input.trip); return true; },
    completeMention: async () => true,
  };
  assert.equal((await commitDiscoveryReview(review, ports)).ok, true);
  assert.equal((await commitDiscoveryReview(review, ports)).ok, true);
  assert.equal(durable.stops.filter(stop => stop.canonicalPlaceId === 'melbourne').length, 1);
  assert.equal(durable.stops.find(stop => stop.id === 'existing-sydney-stop')?.nights, 5);
  assert.deepEqual(durable.brief.scheduleLocks, before.brief.scheduleLocks);
});

test('duration, Sydney anchors and interests never collapse Australia browse; removed proposal stays removed after reload', () => {
  const { mention } = entryAndProjection('Australia');
  const variants: DiscoveryProjectionContext[] = [context, { ...context, durationDays: 6 }, { ...context, durationDays: 84 },
    { ...context, existingPlaceIds: ['sydney'] }, { ...context, existingPlaceIds: ['sydney', 'melbourne'] },
    { ...context, existingPlaceIds: ['tokyo'] }, { ...context, interests: ['nature', 'coast'] }];
  for (const value of variants) {
    const draft = reduceDiscoveryDraft(createDiscoveryDraft(), { type: 'remove-shortlist', placeId: 'airlie-beach' });
    const brief = extractStructuredTripBrief('Australia');
    brief.discoveryDraftByMentionId = { [mention.mentionId]: draft };
    const resumed = readDiscoveryDraft(JSON.parse(JSON.stringify(brief)), mention.mentionId).draft;
    const projection = projectDiscovery({ mention, draft: resumed, context: value });
    assert.ok(projection.places.length >= 20); assert.equal(projection.counts.displayed, 6);
    assert.ok(projection.recommendedIds.length <= (value.durationDays && value.durationDays >= 14 ? 2 : 1));
    assert.ok(!projection.recommendedIds.includes('airlie-beach'));
    assert.ok(value.existingPlaceIds.every(id => !projection.recommendedIds.includes(id)));
    assert.deepEqual(resumed.shortlistIds, []); assert.deepEqual(resumed.removedIds, ['airlie-beach']);
  }
});

test('migration preserves absent/empty/chosen/unsupported drafts and resume step without inventing choices', () => {
  const brief = extractStructuredTripBrief('Australia'); const id = brief.placeMentions![0]!.mentionId;
  assert.equal(readDiscoveryDraft(brief, id).status, 'new');
  for (const ids of [[], ['sydney', 'melbourne']]) {
    brief.countryDiscoveryChoices = { [id]: ids };
    const migrated = readDiscoveryDraft(brief, id);
    assert.equal(migrated.status, 'migrated'); assert.deepEqual(migrated.draft.shortlistIds, ids);
    const draft = { ...migrated.draft, step: 'review' as const, directionId: 'australia-west', removedIds: ['broome'] };
    const resumed = JSON.parse(JSON.stringify({ ...brief, discoveryDraftByMentionId: { [id]: draft } }));
    assert.deepEqual(readDiscoveryDraft(resumed, id).draft, draft);
    assert.equal(discoveryEntryForBrief(resumed, []).step, 'review');
  }
  const unknown = { version: 99, shortlistIds: ['retired-place'], originalIntent: 'Australia' };
  const future = JSON.parse(JSON.stringify({ ...brief, discoveryDraftByMentionId: { [id]: unknown } }));
  assert.equal(discoveryEntryForBrief(future, []).kind, 'legacy-recovery');
  assert.deepEqual(readDiscoveryDraft(future, id).draft, unknown);
});

test('precise Tokyo → Kyoto → Hiroshima → Osaka route skips Discovery', () => {
  assert.equal(discoveryEntryForBrief(extractStructuredTripBrief('Tokyo → Kyoto → Hiroshima → Osaka'), ['tokyo', 'kyoto', 'hiroshima', 'osaka']).kind, 'skip');
});

// Synthetic contract rows are not production evidence or travel recommendations.
const contractPlace = (id: string, name: string, country: string, coordinates: readonly [number, number], actionability: DiscoveryPlace['actionability'] = 'overnight-base'): DiscoveryPlace => {
  const source = { id: `test:${id}`, label: 'Synthetic contract only', kind: 'official' as const, url: 'https://example.test/contract', reviewedAt: '2026-09-24', supports: 'Test-only relationship fixture.' };
  return { id, name, country, coordinates, actionability, placeType: actionability === 'overnight-base' ? 'town' : 'natural_area',
    group: country, groupIds: [], tags: [], imageKey: null, relevance: { en: 'Contract only', es: 'Solo contrato', sources: [source] },
    stayEvidence: actionability === 'overnight-base' ? [source] : [], accessEvidence: [] };
};

test('Taj Mahal contract links a reused canonical Agra base; production still invents no base', async () => {
  const input = fixture('Taj Mahal', []);
  assert.equal(input.projection.places.length, 0);
  input.projection.places.push(contractPlace('agra', 'Agra', 'India', [78.008, 27.176]));
  input.trip.stops.push({ ...input.trip.stops[0]!, id: 'existing-agra', canonicalPlaceId: 'agra', name: 'Agra', country: 'India', longitude: 78.008, latitude: 27.176, nights: 3 });
  input.draft = reduceDiscoveryDraft(input.draft, { type: 'choose-visit-base', intentId: input.mention.mentionId, baseId: 'agra' });
  const review = buildDiscoveryReview(input);
  assert.equal(review.originalIntent, 'Taj Mahal'); assert.deepEqual(review.newBaseIds, []);
  assert.deepEqual(review.reusedStopIds, ['existing-agra']); assert.equal(review.visits[0]?.baseId, 'agra');
  let links = 0;
  const ports: DiscoveryCommitPorts = { currentTrip: () => input.trip,
    addBase: async choice => { applyDiscoveryAddSideEffects(input.trip, input.mention, choice); return true; },
    linkVisit: async (visit, stopId) => { links++; input.trip.brief.structuredBrief!.placeSelections = [confirmedAttractionVisitSelection(input.mention, visit.proposal,
      { routeStopId: stopId, canonicalPlaceId: 'agra', name: 'Agra', country: 'India' })]; return true; },
    persist: async () => true, completeMention: async () => true };
  assert.equal((await commitDiscoveryReview(review, ports)).ok, true);
  assert.equal((await commitDiscoveryReview(review, ports)).ok, true);
  assert.equal(links, 1); assert.equal(input.trip.stops.find(stop => stop.id === 'existing-agra')?.nights, 3);
  assert.ok(!input.trip.stops.some(stop => stop.canonicalPlaceId === 'taj-mahal'));
});

test('Kruger park, camp and gateway remain distinct; equal coordinates authorize no access', () => {
  const input = fixture('Kruger National Park', []);
  const rows = [contractPlace('fixture-kruger-park', 'Park', 'South Africa', [31.5, -25], 'browse-only'),
    contractPlace('fixture-kruger-camp', 'Camp', 'South Africa', [31.5, -25]),
    contractPlace('fixture-kruger-gateway', 'Gateway', 'South Africa', [31.5, -25])];
  const mention = { ...input.mention, status: 'resolved' as const, placeType: 'natural_area' as const, canonicalPlaceId: 'fixture-kruger-park' };
  const projection = projectDiscovery({ mention, draft: input.draft, context, evidence: { places: rows, directions: [] } });
  assert.equal(new Set(projection.places.map(place => place.id)).size, 3);
  for (const baseId of ['fixture-kruger-camp', 'fixture-kruger-gateway']) {
    const draft = reduceDiscoveryDraft(input.draft, { type: 'choose-visit-base', intentId: mention.mentionId, baseId });
    const review = buildDiscoveryReview({ ...input, mention, draft, projection });
    assert.equal(review.canConfirm, false); assert.deepEqual(review.visits, []);
  }
});

test('Lake Atitlán preserves stay versus visit base choices and blocks an unsupported relationship', () => {
  const input = fixture('Lake Atitlán', []);
  const stay = reduceDiscoveryDraft(input.draft, { type: 'choose-base', intentId: input.mention.mentionId, baseId: 'panajachel' });
  assert.equal(stay.baseByIntentId[input.mention.mentionId], 'panajachel');
  const visit = reduceDiscoveryDraft(stay, { type: 'choose-visit-base', intentId: input.mention.mentionId, baseId: 'panajachel' });
  assert.deepEqual(visit.baseByIntentId, {}); assert.equal(visit.visitBaseByIntentId[input.mention.mentionId], 'panajachel');
  const review = buildDiscoveryReview({ ...input, draft: visit });
  assert.equal(review.originalIntent, 'Lake Atitlán'); assert.equal(review.canConfirm, false);
  assert.deepEqual(review.newBaseIds, []); assert.deepEqual(review.visits, []);
});

test('partial checkpoint failure → reload → retry → double confirm preserves fixed anchors and manual nights', async () => {
  const input = fixture('Australia', ['sydney', 'melbourne', 'airlie-beach']);
  const review = buildDiscoveryReview(input);
  let current = structuredClone(input.trip); let durable = structuredClone(current); let fail = true;
  const ports: DiscoveryCommitPorts = { currentTrip: () => current,
    addBase: async choice => { applyDiscoveryAddSideEffects(current, input.mention, choice); return true; },
    linkVisit: async () => false,
    persist: async () => { if (fail && current.stops.some(stop => stop.canonicalPlaceId === 'airlie-beach')) return false; durable = structuredClone(current); return true; },
    completeMention: async () => true };
  const partial = await commitDiscoveryReview(review, ports);
  assert.equal(partial.ok, false); assert.deepEqual(partial.committedIds, ['sydney', 'melbourne']); assert.deepEqual(partial.pendingIds, ['airlie-beach']);
  current = JSON.parse(JSON.stringify(durable)); fail = false;
  for (let attempt = 0; attempt < 2; attempt++) assert.equal((await commitDiscoveryReview(review, ports)).ok, true);
  assert.equal(durable.stops.length, 4);
  assert.equal(durable.stops.find(stop => stop.id === 'existing-sydney-stop')?.nights, 5);
  assert.deepEqual(durable.brief.scheduleLocks, input.trip.brief.scheduleLocks);
  const before = structuredClone(durable);
  const blocked = buildDiscoveryReview(fixture('Australia', ['adelaide', 'uluru-kata-tjuta']));
  assert.equal(blocked.canConfirm, false);
  assert.equal((await commitDiscoveryReview(blocked, ports)).ok, false); assert.deepEqual(durable, before);
  assert.equal(discoveryConfirmLabel('en', 2, 1), 'Add 2 bases and 1 visit');
  assert.equal(discoveryConfirmLabel('es', 2, 1), 'Añadir 2 bases y 1 visita');
});

test('mounted Builder keeps Review open on failed canonical checkpoint, resumes durable work and guards double confirmation',
  { skip: process.env.MORROVIA_BUILDER_BROWSER_TESTS !== '1', timeout: 60_000 }, async () => {
  const { renderBuilder } = await import('./helpers/builder-render.ts');
  const input = fixture('Australia', ['sydney', 'melbourne', 'airlie-beach']);
  input.trip.brief.structuredBrief!.discoveryDraftByMentionId = { [input.mention.mentionId]: input.draft };
  const view = await renderBuilder({ query: `?trip=${input.trip.id}&recover=1`, initialTrip: input.trip });
  await view.page.setViewportSize({ width: 390, height: 844 });
  try {
    await view.page.getByRole('button', { name: 'Continue shaping your route' }).click();
    const dialog = view.page.getByRole('dialog');
    await dialog.getByRole('heading', { name: 'Review choices', exact: true }).waitFor();
    await view.page.keyboard.press('Escape');
    const reopen = view.page.getByRole('button', { name: 'Continue shaping your route' });
    await reopen.waitFor();
    assert.equal(await reopen.evaluate((element: HTMLElement) => element === document.activeElement), true, 'Escape returns focus to the opening control');
    await reopen.click();
    await dialog.getByRole('heading', { name: 'Review choices', exact: true }).waitFor();
    const before = await view.page.evaluate(() => Object.values(localStorage).flatMap(raw => {
      try { return JSON.parse(raw).trip ? [JSON.parse(raw).trip] : []; } catch { return []; }
    }));
    assert.ok(before.every((trip: { stops: unknown[] }) => trip.stops.length === 2), 'Review has not added a stop');
    await view.page.evaluate(() => {
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function(key: string, raw: string) {
        if (key.startsWith('easyt:trip-recovery:')) {
          const record = JSON.parse(raw);
          if (record.trip?.stops?.some((stop: { canonicalPlaceId: string }) => stop.canonicalPlaceId === 'airlie-beach'))
            throw new DOMException('Injected checkpoint failure', 'QuotaExceededError');
        }
        return original.call(this, key, raw);
      };
    });
    await dialog.getByRole('button', { name: 'Add 2 bases', exact: true }).click();
    await dialog.getByText(/Some choices still need confirmation/).waitFor();
    assert.equal(await dialog.isVisible(), true, 'failed checkpoint must not dismiss Review');
    const partial = await view.page.evaluate(() => Object.values(localStorage).flatMap(raw => {
      try { const trip = JSON.parse(raw).trip; return trip ? [trip] : []; } catch { return []; }
    }));
    assert.ok(partial.some((trip: { stops: Array<{ canonicalPlaceId: string }> }) => trip.stops.some(stop => stop.canonicalPlaceId === 'melbourne')));
    assert.ok(partial.every((trip: { stops: Array<{ canonicalPlaceId: string }> }) => !trip.stops.some(stop => stop.canonicalPlaceId === 'airlie-beach')));
    await view.page.reload();
    await view.page.getByRole('button', { name: 'Continue shaping your route' }).click();
    await dialog.getByRole('button', { name: 'Add 1 base', exact: true }).waitFor();
    await dialog.getByRole('button', { name: 'Add 1 base', exact: true }).evaluate((button: HTMLButtonElement) => { button.click(); button.click(); });
    await view.page.waitForFunction(() => !document.querySelector('[role="dialog"]'));
    const completed = await view.page.evaluate(() => Object.values(localStorage).flatMap(raw => {
      try { const trip = JSON.parse(raw).trip; return trip?.brief?.structuredBrief?.completedPlanningAreaMentionIds?.includes('place-australia-0') ? [trip] : []; } catch { return []; }
    }));
    assert.ok(completed.length > 0, 'completion is durable before dismissal');
    for (const trip of completed) {
      assert.equal(trip.stops.length, 4);
      assert.equal(new Set(trip.stops.map((stop: { canonicalPlaceId: string }) => stop.canonicalPlaceId)).size, 4);
      assert.equal(trip.stops.find((stop: { canonicalPlaceId: string }) => stop.canonicalPlaceId === 'sydney').nights, 5);
      assert.equal(trip.brief.structuredBrief.discoveryDraftByMentionId['place-australia-0'].reviewState, 'confirmed');
      const londonId = trip.stops.find((stop: { canonicalPlaceId: string }) => stop.canonicalPlaceId === 'london').id;
      assert.ok(trip.brief.scheduleLocks.stopIds.includes(londonId));
      assert.equal(trip.brief.scheduleLocks.arrivalDates[londonId], '2026-10-06');
    }
    assert.deepEqual(view.errors, []);
  } finally { await view.close(); }
});


test('Builder attraction inference retains every explicitly selected country base before the durable checkpoint', () => {
  const input = fixture('Australia', ['sydney', 'melbourne']);
  const review = buildDiscoveryReview(input);
  for (const choice of review.bases) applyDiscoveryAddSideEffects(input.trip, input.mention, choice);
  const selections = inferAttractionVisitSelections([input.mention], input.trip.stops.map(stop => ({
    routeStopId: stop.id, name: stop.name, canonicalPlaceId: stop.canonicalPlaceId, country: stop.country,
  })), input.trip.brief.structuredBrief!.placeSelections);
  assert.deepEqual(selections.map(selection => selection.selectedCanonicalPlaceId).sort(), ['melbourne', 'sydney']);
  assert.equal(selections.find(selection => selection.selectedCanonicalPlaceId === 'sydney')?.routeStopId, 'existing-sydney-stop');
});
