import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import * as discovery from '../lib/easyt/trip-builder-recommendations.ts';
import { createAbortableEffectScope } from '../lib/easyt/abortable-effect.ts';

const stop = { id: 'occurrence-1', name: 'Tokyo', country: 'Japan', canonicalPlaceId: 'reference:geonames:1850147', providerId: 'current-source-pin', coordinates: [139.69, 35.68] as [number, number] };
const place = { title: 'Museum', area: 'Centre', type: 'Museum', cost: 0.5, tags: ['Cities'], description: 'A museum visit.' };
const scope = { ownerId: null, tripId: 'preview-1' };

test('Builder preview forwards selected pins without fabricating identity or mutating saved points', async () => {
  const load = (discovery as any).loadBuilderDiscoveryPlaces;
  assert.equal(typeof load, 'function');
  const before = structuredClone(stop), original = globalThis.fetch;
  let url = '';
  try {
    globalThis.fetch = async input => { url = String(input); return Response.json({ places: [place] }); };
    assert.deepEqual(await load(stop, new AbortController().signal), [place]);
    const params = new URL(url, 'http://localhost').searchParams;
    assert.equal(params.get('canonicalPlaceId'), stop.canonicalPlaceId);
    assert.equal(params.get('providerId'), stop.providerId);
    assert.equal(params.get('lat'), String(stop.coordinates[1]));
    assert.equal(params.get('lon'), String(stop.coordinates[0]));
    assert.deepEqual(stop, before);
    const { canonicalPlaceId, providerId, ...legacy } = stop;
    await load(legacy, new AbortController().signal);
    const legacyParams = new URL(url, 'http://localhost').searchParams;
    assert.equal(legacyParams.has('canonicalPlaceId'), false);
    assert.equal(legacyParams.has('providerId'), false);
  } finally { globalThis.fetch = original; }
});

test('Builder preview rejects settled failures and incomplete retrieval while retaining genuine empty compatibility', async () => {
  const load = (discovery as any).loadBuilderDiscoveryPlaces;
  assert.equal(typeof load, 'function');
  const original = globalThis.fetch;
  try {
    for (const retrieval of ['blocked', 'unavailable', 'checking', 'not-attempted']) {
      globalThis.fetch = async () => Response.json({ places: [], assessment: { retrieval, evidence: 'insufficient', retryable: false } });
      await assert.rejects(load(stop, new AbortController().signal));
    }
    for (const body of [{ places: [], unavailable: true }, {}, { places: [null] }]) {
      globalThis.fetch = async () => Response.json(body);
      await assert.rejects(load(stop, new AbortController().signal));
    }
    globalThis.fetch = async () => Response.json({ places: [] }, { status: 503 });
    await assert.rejects(load(stop, new AbortController().signal));
    for (const body of [{ places: [] }, { places: [], assessment: { retrieval: 'completed', evidence: 'insufficient', retryable: false, reason: 'successful_empty' } }]) {
      globalThis.fetch = async () => Response.json(body);
      assert.deepEqual(await load(stop, new AbortController().signal), []);
    }
  } finally { globalThis.fetch = original; }
});

test('Builder preview results cannot cross changed selected identity, coordinates, owner or document scopes', () => {
  const key = (discovery as any).builderDiscoveryInputKey, current = (discovery as any).currentBuilderDiscoveredPlaces;
  assert.equal(typeof key, 'function'); assert.equal(typeof current, 'function');
  const cache = { [stop.id]: { key: key(scope, stop), places: [place] } };
  assert.deepEqual(current([stop], cache, scope), { [stop.id]: [place] });
  for (const changed of [{ ...stop, name: 'Other' }, { ...stop, providerId: 'stale-pin' }, { ...stop, canonicalPlaceId: 'other' }, { ...stop, country: 'Other' }, { ...stop, coordinates: [139.7, 35.68] }]) {
    assert.deepEqual(current([changed], cache, scope), {});
  }
  assert.deepEqual(current([stop], cache, { ...scope, ownerId: 'different-owner' }), {});
  assert.deepEqual(current([stop], cache, { ...scope, tripId: 'different-trip' }), {});
  assert.deepEqual(current([], cache, scope), {});
});

test('Builder preview cancellation rejects a late response even when fetch ignores the signal', async () => {
  const load = (discovery as any).loadBuilderDiscoveryPlaces;
  assert.equal(typeof load, 'function');
  const effect = createAbortableEffectScope('preview'), original = globalThis.fetch;
  try {
    globalThis.fetch = async () => { effect.dispose(); return Response.json({ places: [place] }); };
    await assert.rejects(load(stop, effect.signal), { name: 'AbortError' });
    let committed = false; effect.commit(() => { committed = true; }); assert.equal(committed, false);
  } finally { globalThis.fetch = original; effect.dispose(); }
  const source = readFileSync(new URL('../app/journey/new/trip-builder.tsx', import.meta.url), 'utf8');
  assert.match(source, /currentBuilderDiscoveredPlaces\(/);
  assert.match(source, /loadBuilderDiscoveryPlaces\(stop, scope\.signal\)/);
  assert.match(source, /scope\.commit\(\(\) => setPreviewDiscovery/);
});
