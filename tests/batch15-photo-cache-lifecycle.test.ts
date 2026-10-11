import assert from 'node:assert/strict';
import test from 'node:test';
import { readRoutePhotoSelection, resolveRoutePhotoCandidates, type CachedRoutePhoto, type RoutePhotoLookup } from '../lib/easyt/route-photo-cache.ts';

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, value); }
}
const photo = (id: string): CachedRoutePhoto => ({ id, src: `https://example.test/${id}.jpg`, sourceUrl: `https://example.test/${id}`, sourceLabel: 'Photo credit' });
const lookup = (value: CachedRoutePhoto): RoutePhotoLookup => ({ configured: true, status: 'resolved', candidates: [value] });
function deferred() {
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  return { pending, release };
}
for (const aborted of [true, false]) test(`a late obsolete lookup cannot replace a newer exclusion-specific positive (${aborted ? 'aborted' : 'active'} old consumer)`, async () => {
  const storage = new MemoryStorage(), controller = new AbortController(), delay = deferred();
  const candidate = { cacheKey: `lifecycle-obsolete-${aborted}`, occurrenceIds: ['stop'], queries: ['destination'] };
  const oldPhoto = photo('old'), newerPhoto = photo('newer');
  const oldCommits: string[] = [], newCommits: string[] = [], tracked: string[] = [];
  const old = resolveRoutePhotoCandidates([candidate], (_, selection) => {
    if (selection.kind === 'photo') oldCommits.push(selection.photo.id!);
  }, { storage, signal: controller.signal, trackPhoto: p => tracked.push(p.id!), findPhotos: async () => { await delay.pending; return lookup(oldPhoto); } });
  if (aborted) controller.abort();
  await resolveRoutePhotoCandidates([{ ...candidate, excludedSources: [oldPhoto.src] }], (_, selection) => {
    if (selection.kind === 'photo') newCommits.push(selection.photo.id!);
  }, { storage, trackPhoto: p => tracked.push(p.id!), findPhotos: async () => lookup(newerPhoto) });
  delay.release(); await old;
  assert.deepEqual(readRoutePhotoSelection(candidate.cacheKey, storage), { kind: 'photo', photo: newerPhoto });
  assert.deepEqual(newCommits, ['newer']);
  assert.deepEqual(oldCommits, []);
  assert.deepEqual(tracked, ['newer']);
});
test('navigation reuses the same shared lookup after retiring its first consumer', async () => {
  const storage = new MemoryStorage(), delay = deferred(), controller = new AbortController();
  const candidate = { cacheKey: 'lifecycle-shared-navigation', occurrenceIds: ['repeat'], queries: ['destination'] };
  let requests = 0, oldCommits = 0, currentCommits = 0;
  const findPhotos = async () => { requests++; await delay.pending; return lookup(photo('shared')); };
  const old = resolveRoutePhotoCandidates([candidate], () => { oldCommits++; }, { storage, signal: controller.signal, findPhotos, trackPhoto: () => {} });
  controller.abort();
  const current = resolveRoutePhotoCandidates([candidate], () => { currentCommits++; }, { storage, findPhotos, trackPhoto: () => {} });
  delay.release(); await Promise.all([old, current]);
  assert.equal(requests, 1); assert.equal(oldCommits, 0); assert.equal(currentCommits, 1);
  assert.deepEqual(readRoutePhotoSelection(candidate.cacheKey, storage), { kind: 'photo', photo: photo('shared') });
});

test('a lookup whose only consumer was cancelled cannot populate or track a cache positive', async () => {
  const storage = new MemoryStorage(), delay = deferred(), controller = new AbortController();
  const candidate = { cacheKey: 'lifecycle-lone-cancelled', occurrenceIds: ['stop'], queries: ['destination'] };
  let commits = 0, tracked = 0;
  const task = resolveRoutePhotoCandidates([candidate], () => { commits++; }, {
    storage, signal: controller.signal, trackPhoto: () => { tracked++; },
    findPhotos: async () => { await delay.pending; return lookup(photo('cancelled')); },
  });
  controller.abort(); delay.release(); await task;
  assert.equal(readRoutePhotoSelection(candidate.cacheKey, storage), null);
  assert.equal(tracked, 0); assert.equal(commits, 0);
});

test('a shared lookup with every consumer cancelled cannot populate or track a positive', async () => {
  const storage = new MemoryStorage(), delay = deferred(), first = new AbortController(), second = new AbortController();
  const candidate = { cacheKey: 'lifecycle-shared-all-cancelled', occurrenceIds: ['stop'], queries: ['destination'] };
  let requests = 0, tracked = 0, commits = 0;
  const findPhotos = async () => { requests++; await delay.pending; return lookup(photo('all-cancelled')); };
  const options = { storage, trackPhoto: () => { tracked++; }, findPhotos };
  const a = resolveRoutePhotoCandidates([candidate], () => { commits++; }, { ...options, signal: first.signal });
  const b = resolveRoutePhotoCandidates([candidate], () => { commits++; }, { ...options, signal: second.signal });
  first.abort(); second.abort(); delay.release(); await Promise.all([a, b]);
  assert.equal(requests, 1); assert.equal(readRoutePhotoSelection(candidate.cacheKey, storage), null);
  assert.equal(tracked, 0); assert.equal(commits, 0);
});

for (const cancelNewer of [true, false]) test(`an active consumer rejoins an older lookup with a ${cancelNewer ? 'cancelled' : 'live'} newer lookup`, async () => {
  const storage = new MemoryStorage(), oldDelay = deferred(), newDelay = deferred();
  const oldController = new AbortController(), newerController = new AbortController();
  const candidate = { cacheKey: `lifecycle-rejoin-${cancelNewer}`, occurrenceIds: ['stop'], queries: ['destination'] };
  const oldPhoto = photo('rejoined-old'), newerPhoto = photo('active-newer');
  let requests = 0; const rejoinedCommits: string[] = [], newerCommits: string[] = [], tracked: string[] = [];
  const oldOptions = { storage, trackPhoto: (p: CachedRoutePhoto) => tracked.push(p.id!), findPhotos: async () => { requests++; await oldDelay.pending; return lookup(oldPhoto); } };
  const old = resolveRoutePhotoCandidates([candidate], () => {}, { ...oldOptions, signal: oldController.signal });
  oldController.abort();
  const newer = resolveRoutePhotoCandidates([{ ...candidate, excludedSources: [oldPhoto.src] }], (_, value) => {
    if (value.kind === 'photo') newerCommits.push(value.photo.id!);
  }, { storage, signal: newerController.signal, trackPhoto: p => tracked.push(p.id!), findPhotos: async () => { requests++; await newDelay.pending; return lookup(newerPhoto); } });
  if (cancelNewer) newerController.abort();
  const rejoined = resolveRoutePhotoCandidates([candidate], (_, value) => {
    if (value.kind === 'photo') rejoinedCommits.push(value.photo.id!);
  }, oldOptions);
  newDelay.release(); await newer;
  oldDelay.release(); await Promise.all([old, rejoined]);
  assert.equal(requests, 2);
  assert.deepEqual(readRoutePhotoSelection(candidate.cacheKey, storage), { kind: 'photo', photo: cancelNewer ? oldPhoto : newerPhoto });
  assert.deepEqual(rejoinedCommits, cancelNewer ? ['rejoined-old'] : []);
  assert.deepEqual(newerCommits, cancelNewer ? [] : ['active-newer']);
  assert.deepEqual(tracked, cancelNewer ? ['rejoined-old'] : ['active-newer']);
});

test('rejoining an older lookup does not overtake a newer lookup that still has a live consumer', async () => {
  const storage = new MemoryStorage(), oldDelay = deferred(), newDelay = deferred(), controller = new AbortController();
  const candidate = { cacheKey: 'lifecycle-newer-still-pending', occurrenceIds: ['stop'], queries: ['destination'] };
  const oldPhoto = photo('pending-old'), newerPhoto = photo('pending-newer');
  const commits: string[] = [], tracked: string[] = [];
  const oldOptions = { storage, trackPhoto: (p: CachedRoutePhoto) => tracked.push(p.id!), findPhotos: async () => { await oldDelay.pending; return lookup(oldPhoto); } };
  const old = resolveRoutePhotoCandidates([candidate], () => {}, { ...oldOptions, signal: controller.signal });
  controller.abort();
  const newer = resolveRoutePhotoCandidates([{ ...candidate, excludedSources: [oldPhoto.src] }], (_, value) => {
    if (value.kind === 'photo') commits.push(value.photo.id!);
  }, { storage, trackPhoto: p => tracked.push(p.id!), findPhotos: async () => { await newDelay.pending; return lookup(newerPhoto); } });
  const rejoined = resolveRoutePhotoCandidates([candidate], (_, value) => {
    if (value.kind === 'photo') commits.push(value.photo.id!);
  }, oldOptions);
  oldDelay.release(); await Promise.all([old, rejoined]);
  const intermediate = { cached: readRoutePhotoSelection(candidate.cacheKey, storage), commits: [...commits], tracked: [...tracked] };
  newDelay.release(); await newer;
  assert.deepEqual(intermediate, { cached: null, commits: [], tracked: [] });
  assert.deepEqual(readRoutePhotoSelection(candidate.cacheKey, storage), { kind: 'photo', photo: newerPhoto });
  assert.deepEqual(commits, ['pending-newer']); assert.deepEqual(tracked, ['pending-newer']);
});
