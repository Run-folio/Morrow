import assert from 'node:assert/strict';
import test from 'node:test';
import { commitDiscoveryReview, type DiscoveryCommitPorts } from '../lib/easyt/discovery-commit.ts';
import { buildDiscoveryReview } from '../lib/easyt/discovery-review.ts';
import { fixture } from './helpers/discovery-fixture.ts';

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
      added.push(choice.id);
      current.stops.push({ ...current.stops[0]!, id: choice.id, canonicalPlaceId: choice.id, name: choice.name });
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
  assert.equal(current.stops.find(stop => stop.id === 'existing-sydney-stop')?.nights, 5);
  assert.deepEqual(current.brief.scheduleLocks, input.trip.brief.scheduleLocks);
});
test('failed durable write records no success and never completes; unresolved review calls no ports', async () => {
  const input = fixture(); const review = buildDiscoveryReview(input);
  let completed = false;
  const ports: DiscoveryCommitPorts = { currentTrip: () => input.trip, addBase: async () => true, linkVisit: async () => true,
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
    addBase: async choice => { current.stops.push({ ...current.stops[0]!, id: choice.id, canonicalPlaceId: choice.id, name: choice.name }); return true; },
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
    addBase: async choice => { current.stops.push({ ...current.stops[0]!, id: choice.id, name: choice.name, canonicalPlaceId: choice.id }); return true; },
    linkVisit: async (visit, stopId) => {
      links++;
      current.brief.structuredBrief!.placeSelections = [{ mentionId: visit.intentId, kind: 'visit', selectedCanonicalPlaceId: visit.baseId,
        selectedName: 'Agra', routeStopId: stopId, relationshipType: visit.proposal.relationshipType,
        provenance: { id: 'explicit-test-visit', kind: 'builder', label: 'Test selection', supports: 'Explicit visit confirmation.' } }];
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
