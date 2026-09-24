import assert from 'node:assert/strict';
import test from 'node:test';
import { commitDiscoveryReview, type DiscoveryCommitPorts } from '../lib/easyt/discovery-commit.ts';
import { buildDiscoveryReview } from '../lib/easyt/discovery-review.ts';
import { confirmedAttractionVisitSelection } from '../lib/easyt/place-intelligence.ts';
import { fixture, applyDiscoveryAddSideEffects } from './helpers/discovery-fixture.ts';

test('partial failure keeps durable per-ID progress; reload retry and double confirmation never duplicate a stop', async () => {
  const input = fixture('Australia', ['sydney', 'melbourne', 'airlie-beach']);
  const review = buildDiscoveryReview(input);
  const added: string[] = [];
  let durable = structuredClone(input.trip);
  let current = structuredClone(durable);
  let fail = true;
  let completed = 0;
  const ports: DiscoveryCommitPorts = {
    currentTrip: () => current,
    addBase: async choice => {
      if (choice.id === 'airlie-beach' && fail) return false;
      if (!current.stops.some(stop => stop.canonicalPlaceId === choice.id)) added.push(choice.id);
      applyDiscoveryAddSideEffects(current, input.mention, choice);
      return true;
    },
    linkVisit: async () => false,
    persist: async () => { durable = structuredClone(current); return true; },
    completeMention: async () => { completed++; return true; },
  };
  const first = await commitDiscoveryReview(review, ports);
  assert.equal(first.ok, false);
  assert.deepEqual(first.committedIds, ['sydney', 'melbourne']);
  assert.deepEqual(first.pendingIds, ['airlie-beach']);
  assert.equal(completed, 0);
  current = structuredClone(durable); fail = false;
  assert.equal((await commitDiscoveryReview(review, ports)).ok, true);
  assert.equal((await commitDiscoveryReview(review, ports)).ok, true);
  assert.deepEqual(added, ['melbourne', 'airlie-beach']);
  assert.deepEqual(current.brief.structuredBrief?.placeSelections?.map(selection => selection.selectedCanonicalPlaceId).sort(), ['airlie-beach', 'melbourne', 'sydney']);
  assert.equal(current.stops.find(stop => stop.id === 'existing-sydney-stop')?.nights, 5);
  assert.deepEqual(current.brief.scheduleLocks, input.trip.brief.scheduleLocks);
});
test('failed durable write records no success and never completes; unresolved review calls no ports', async () => {
  const input = fixture(); const review = buildDiscoveryReview(input);
  let completed = false;
  const ports: DiscoveryCommitPorts = { currentTrip: () => input.trip, addBase: async choice => { applyDiscoveryAddSideEffects(input.trip, input.mention, choice); return true; }, linkVisit: async () => true,
    persist: async () => false, completeMention: async () => { completed = true; return true; } };
  const result = await commitDiscoveryReview(review, ports);
  assert.equal(result.ok, false); assert.deepEqual(result.committedIds, []); assert.equal(completed, false);
  let touched = false;
  const blocked = buildDiscoveryReview(fixture('Australia', ['uluru-kata-tjuta']));
  assert.equal((await commitDiscoveryReview(blocked, { ...ports, currentTrip: () => { touched = true; return input.trip; } })).ok, false);
  assert.equal(touched, false);
});

test('a failed second checkpoint survives reload with only the first durable choice and retries the pending choice', async () => {
  const input = fixture('Australia', ['melbourne', 'airlie-beach']);
  const review = buildDiscoveryReview(input);
  let current = structuredClone(input.trip);
  let durable = structuredClone(current);
  let writes = 0;
  let fail = true;
  const ports: DiscoveryCommitPorts = {
    currentTrip: () => current,
    addBase: async choice => { applyDiscoveryAddSideEffects(current, input.mention, choice); return true; },
    linkVisit: async () => false,
    persist: async () => { if (++writes === 2 && fail) return false; durable = structuredClone(current); return true; },
    completeMention: async () => true,
  };
  const first = await commitDiscoveryReview(review, ports);
  assert.deepEqual(first.committedIds, ['melbourne']);
  assert.deepEqual(first.pendingIds, ['airlie-beach']);
  assert.equal(durable.stops.some(stop => stop.canonicalPlaceId === 'airlie-beach'), false);
  current = structuredClone(durable); fail = false;
  const retry = await commitDiscoveryReview(review, ports);
  assert.equal(retry.ok, true);
  assert.equal(durable.stops.filter(stop => stop.canonicalPlaceId === 'melbourne').length, 1);
  assert.equal(durable.stops.filter(stop => stop.canonicalPlaceId === 'airlie-beach').length, 1);
});

test('visit confirmation persists the canonical PlaceSelection and does not relink after reload', async () => {
  const input = fixture('Taj Mahal', []);
  const source = fixture().projection.places.find(place => place.id === 'sydney')!;
  input.projection.places.push({ ...source, id: 'agra', name: 'Agra', country: 'India', coordinates: [78.008, 27.176] });
  input.draft.visitBaseByIntentId[input.mention.mentionId] = 'agra';
  const review = buildDiscoveryReview(input);
  let current = structuredClone(input.trip);
  let durable = structuredClone(current);
  let links = 0;
  const ports: DiscoveryCommitPorts = {
    currentTrip: () => current,
    addBase: async choice => { applyDiscoveryAddSideEffects(current, input.mention, choice, [78.008, 27.176]); return true; },
    linkVisit: async (visit, stopId) => {
      links++;
      current.brief.structuredBrief!.placeSelections = [confirmedAttractionVisitSelection(input.mention, visit.proposal,
        { routeStopId: stopId, name: 'Agra', canonicalPlaceId: 'agra', country: 'India' })];
      return true;
    },
    persist: async () => { durable = structuredClone(current); return true; }, completeMention: async () => true,
  };
  assert.equal((await commitDiscoveryReview(review, ports)).ok, true);
  current = structuredClone(durable);
  assert.equal((await commitDiscoveryReview(review, ports)).ok, true);
  assert.equal(links, 1);
  assert.equal(current.stops.some(stop => stop.canonicalPlaceId === 'taj-mahal'), false);
  assert.equal(current.brief.structuredBrief?.placeSelections?.[0]?.routeStopId, 'agra');
});

test('existing-only Sydney acquires durable parent ownership and resolves Australia after reload', async () => {
  const { applyDiscoveryAddSideEffects } = await import('./helpers/discovery-fixture.ts');
  const input = fixture('Australia', ['sydney']);
  let current = structuredClone(input.trip);
  let durable = structuredClone(current);
  let adds = 0;
  const ports: DiscoveryCommitPorts = { currentTrip: () => current,
    addBase: async choice => { adds++; applyDiscoveryAddSideEffects(current, input.mention, choice); return true; },
    linkVisit: async () => false, persist: async () => { durable = structuredClone(current); return true; },
    completeMention: async () => {
      current.brief.structuredBrief!.completedPlanningAreaMentionIds = [input.mention.mentionId];
      return ports.persist();
    },
  };
  assert.equal((await commitDiscoveryReview(buildDiscoveryReview(input), ports)).ok, true);
  current = structuredClone(durable);
  assert.equal(current.brief.structuredBrief?.placeSelections?.some(selection => selection.mentionId === input.mention.mentionId
    && selection.routeStopId === 'existing-sydney-stop' && selection.kind === 'base'), true);
  assert.ok(current.brief.structuredBrief?.completedPlanningAreaMentionIds?.includes(input.mention.mentionId));
  assert.equal(current.stops.filter(stop => stop.canonicalPlaceId === 'sydney').length, 1);
  assert.equal(current.stops[0]?.nights, 5);
  assert.equal((await commitDiscoveryReview(buildDiscoveryReview({ ...input, trip: current }), ports)).ok, true);
  assert.equal(adds, 1);
});

test('provisional Add visit is upgraded to the approved relationship before durable confirmation, including partial retry', async () => {
  const { applyDiscoveryAddSideEffects } = await import('./helpers/discovery-fixture.ts');
  const input = fixture('Taj Mahal', []);
  input.projection.places.push({ ...fixture().projection.places.find(place => place.id === 'sydney')!,
    id: 'agra', name: 'Agra', country: 'India', coordinates: [78.008, 27.176] });
  input.draft.visitBaseByIntentId[input.mention.mentionId] = 'agra';
  let current = structuredClone(input.trip);
  let durable = structuredClone(current);
  let failVisit = true;
  let links = 0;
  const ports: DiscoveryCommitPorts = { currentTrip: () => current,
    addBase: async choice => { applyDiscoveryAddSideEffects(current, input.mention, choice, [78.008, 27.176]); return true; },
    linkVisit: async (visit, stopId) => {
      if (failVisit) return false;
      links++;
      const { confirmedAttractionVisitSelection } = await import('../lib/easyt/place-intelligence.ts');
      current.brief.structuredBrief!.placeSelections = [confirmedAttractionVisitSelection(input.mention, visit.proposal,
        { routeStopId: stopId, name: 'Agra', canonicalPlaceId: 'agra', country: 'India' })];
      return true;
    },
    persist: async () => { durable = structuredClone(current); return true; }, completeMention: async () => true,
  };
  const review = buildDiscoveryReview(input);
  assert.equal(review.visits[0]?.proposal.relationshipType, 'within-stop');
  assert.equal((await commitDiscoveryReview(review, ports)).ok, false);
  assert.equal(durable.brief.structuredBrief?.placeSelections?.[0]?.relationshipType, 'visit-from-base');
  current = structuredClone(durable); failVisit = false;
  assert.equal(buildDiscoveryReview({ ...input, trip: current }).primaryAction.visitCount, 1);
  assert.equal((await commitDiscoveryReview(buildDiscoveryReview({ ...input, trip: current }), ports)).ok, true);
  current = structuredClone(durable);
  const selection = current.brief.structuredBrief!.placeSelections![0]!;
  assert.equal(selection.relationshipType, 'within-stop');
  assert.equal(selection.provenance.id, `builder-attraction-visit:${input.mention.mentionId}:agra`);
  assert.equal(selection.confidence?.level, 'high');
  assert.equal(selection.confidence?.sources[0]?.id, `attraction-visit:${input.mention.mentionId}:agra`);
  assert.equal((await commitDiscoveryReview(buildDiscoveryReview({ ...input, trip: current }), ports)).ok, true);
  assert.equal(links, 1);
});

test('completion save failure rolls completion back but retains durable canonical choices for retry', async () => {
  const { completeDiscoveryMention } = await import('../lib/easyt/discovery-commit.ts');
  const input = fixture();
  const originalDraft = structuredClone(input.draft);
  let draft = structuredClone(originalDraft);
  let completed: string[] = [];
  let durableDraft = structuredClone(draft);
  let fail = true;
  const complete = () => completeDiscoveryMention({
    stage: () => { completed = [input.mention.mentionId]; draft = { ...draft, reviewState: 'confirmed' }; },
    rollback: () => { completed = []; draft = structuredClone(originalDraft); },
    persist: async () => { if (fail) throw new Error('Storage failed'); durableDraft = structuredClone(draft); return true; },
  });
  assert.equal(await complete(), false);
  assert.deepEqual(completed, []); assert.equal(draft.reviewState, 'editing'); assert.equal(durableDraft.reviewState, 'editing');
  fail = false; assert.equal(await complete(), true);
  assert.deepEqual(completed, [input.mention.mentionId]); assert.equal(durableDraft.reviewState, 'confirmed');
});
