import assert from 'node:assert/strict';
import test from 'node:test';
import { clearLocalFinderBaseCacheForTests, peekLocalFinderBaseResult } from '../lib/easyt/local-finder-base-cache.ts';
import { cities, deferred, finderHarness, flush, place, ready, response } from './helpers/local-finder-effect.mjs';

test.beforeEach(t => {
  clearLocalFinderBaseCacheForTests();
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 0 });
});

for (const [name, city] of Object.entries(cities)) {
  for (const stage of ['fetch', 'body']) test(`${name}: stalled ${stage} ignoring abort fails at the shared ten second deadline`, async t => {
    const pending = deferred();
    const h = finderHarness({ city, fetch: () => stage === 'fetch' ? pending.promise : Promise.resolve({ ok: true, json: () => pending.promise }) });
    await flush();
    assert.equal(h.calls.length, 1);
    t.mock.timers.tick(9_999); await flush();
    assert.equal(h.state.loading, true);
    t.mock.timers.tick(1); await flush();
    assert.equal(h.calls[0].options.signal.aborted, true);
    assert.equal(h.state.loading, false, 'deadline must settle independently of abort cooperation');
    assert.equal(h.state.unavailable, true);
    assert.equal(h.view().status, 'failed');
    assert.equal(h.state.inventory, 'not-requested');
    assert.equal(h.calls.length, 1, 'no automatic retry');
    h.close();
  });
}

test('same-key remount shares one attempt and cannot restart its deadline', async t => {
  const old = finderHarness({ fetch: () => new Promise(() => {}) });
  await flush(); t.mock.timers.tick(6_000); old.close();
  const current = finderHarness({ fetch: () => { throw Error('Must share'); } });
  await flush(); assert.equal(current.calls.length, 0);
  const oldPublications = old.publication.length;
  t.mock.timers.tick(3_999); await flush(); assert.equal(current.state.loading, true);
  t.mock.timers.tick(1); await flush();
  assert.equal(current.state.loading, false);
  assert.equal(current.state.unavailable, true);
  assert.equal(old.publication.length, oldPublications, 'inactive mount cannot publish timeout');
  current.close();
});

for (const stage of ['fetch', 'body']) test(`expired ${stage} cannot cache or publish after late success without a replacement`, async t => {
  const pending = deferred();
  const h = finderHarness({ fetch: () => stage === 'fetch' ? pending.promise : Promise.resolve({ ok: true, json: () => pending.promise }) });
  await flush(); t.mock.timers.tick(10_000); await flush();
  assert.equal(h.state.unavailable, true);
  const publications = h.publication.length;
  pending.resolve(stage === 'fetch' ? ready('late') : { places: [{ ...place, id: 'late' }], searchStatus: 'ready' });
  await flush();
  assert.equal(peekLocalFinderBaseResult(h.env.baseResultKey), null);
  assert.equal(h.publication.length, publications);
  h.close();
});

test('explicit retry may overlap an ignored old transport but old completion cannot evict or replace new work', async t => {
  const stale = deferred(), fresh = deferred();
  const refs = { lastBaseRequestRef: { current: null }, loadedBaseResultKeyRef: { current: null } };
  const old = finderHarness({ refs, fetch: () => stale.promise });
  await flush(); t.mock.timers.tick(10_000); await flush();
  assert.equal(old.state.unavailable, true);
  old.view().retry(); old.close();
  assert.equal(old.retryVersion(), 1);
  const retry = finderHarness({ refs, searchVersion: old.retryVersion(), fetch: () => fresh.promise });
  await flush(); assert.equal(retry.calls.length, 1); assert.match(retry.calls[0].url, /refresh=1/);
  // The old controlled transport still exists: two transports have now started,
  // but only the explicit retry starts the second logical attempt.
  assert.equal(old.calls.length + retry.calls.length, 2);
  stale.resolve(ready('expired')); await flush();
  const remount = finderHarness({ fetch: () => { throw Error('Must join fresh'); } });
  await flush(); assert.equal(remount.calls.length, 0); assert.equal(retry.state.loading, true);
  fresh.resolve(ready('fresh')); await flush();
  assert.equal(retry.state.core[0].id, 'fresh'); assert.equal(remount.state.core[0].id, 'fresh');
  assert.equal(peekLocalFinderBaseResult(retry.env.baseResultKey).places[0].id, 'fresh');
  retry.close(); remount.close();
});

test('body parsing uses the remaining fetch budget rather than starting a new deadline', async t => {
  const headers = deferred(), body = deferred();
  const h = finderHarness({ fetch: () => headers.promise });
  await flush(); t.mock.timers.tick(7_000);
  headers.resolve({ ok: true, json: () => body.promise }); await flush();
  t.mock.timers.tick(3_000); await flush();
  assert.equal(h.state.loading, false); assert.equal(h.state.unavailable, true);
  h.close();
});

for (const [cityName, city] of Object.entries(cities)) for (const [name, transport, unavailable] of [
  ['empty', async () => response({ places: [], searchStatus: 'empty' }), false],
  ['provider failure', async () => response({ places: [], searchStatus: 'failed', unavailable: true }), true],
  ['503', async () => response(null, 503), true],
  ['malformed payload', async () => response({ invalid: true }), true],
  ['fetch rejection', async () => { throw Error('Synthetic request failure'); }, true],
  ['body rejection', async () => ({ ok: true, json: async () => { throw SyntaxError('Synthetic malformed JSON'); } }), true],
]) test(`${cityName}: ${name} leaves loading and remains uncached`, async () => {
  const h = finderHarness({ city, fetch: transport }); await flush();
  assert.equal(h.state.loading, false); assert.equal(h.state.unavailable, unavailable);
  assert.equal(h.view().status, unavailable ? 'failed' : 'empty');
  assert.equal(peekLocalFinderBaseResult(h.env.baseResultKey), null);
  assert.equal(h.calls.length, 1); h.close();
});

for (const stage of ['fetch', 'body']) test(`late ${stage} rejection after timeout cannot affect a fresh attempt`, async t => {
  const stale = deferred(), fresh = deferred();
  const old = finderHarness({ fetch: () => stage === 'fetch' ? stale.promise : Promise.resolve({ ok: true, json: () => stale.promise }) });
  await flush(); t.mock.timers.tick(10_000); await flush(); old.close();
  const current = finderHarness({ fetch: () => fresh.promise }); await flush();
  stale.reject(Error('Late controlled transport rejection')); await flush();
  assert.equal(current.state.loading, true);
  fresh.resolve(ready('current')); await flush();
  assert.equal(current.view().status, 'ready'); assert.equal(current.state.core[0].id, 'current'); current.close();
});

test('cooperating transport abort leaves loading with no automatic retry', async t => {
  const h = finderHarness({ fetch: (_url, { signal }) => new Promise((_yes, no) => signal.addEventListener('abort', () => no(signal.reason), { once: true })) });
  await flush(); t.mock.timers.tick(10_000); await flush();
  assert.equal(h.state.loading, false); assert.equal(h.state.unavailable, true); assert.equal(h.calls.length, 1); h.close();
});

test('cancelled mount does not abort shared transport or publish success; same-key remount receives it', async () => {
  const pending = deferred();
  const old = finderHarness({ fetch: () => pending.promise }); await flush(); old.close();
  assert.equal(old.calls[0].options.signal.aborted, false);
  const oldPublications = old.publication.length;
  const current = finderHarness({ fetch: () => { throw Error('Must share'); } });
  pending.resolve(ready()); await flush();
  assert.equal(current.state.loading, false); assert.equal(current.state.core.length, 1);
  assert.equal(current.calls.length, 0); assert.equal(old.publication.length, oldPublications); current.close();
});

test('healthy guest Stay uses safe public cache on return without commercial inventory', async t => {
  const first = finderHarness({ fetch: async () => ready() }); await flush();
  assert.equal(first.state.core.length, 1); assert.equal(first.state.unavailable, false);
  assert.equal(first.state.inventory, 'not-requested'); assert.equal(first.calls.length, 1); first.close();
  t.mock.timers.tick(20_000);
  const back = finderHarness({ fetch: () => { throw Error('Must reuse successful cache'); } }); await flush();
  assert.equal(back.state.loading, false); assert.equal(back.state.core.length, 1); assert.equal(back.calls.length, 0); back.close();
});

test('distinct stops and cities retain separate shared attempts', async () => {
  const pending = deferred();
  const hk = finderHarness({ fetch: () => pending.promise });
  const repeated = finderHarness({ dayId: 'second-hong-kong', fetch: async () => ready('second') });
  const seoul = finderHarness({ city: cities.seoul, fetch: async () => ready('seoul') }); await flush();
  assert.equal(repeated.calls.length, 1); assert.equal(seoul.calls.length, 1);
  assert.equal(hk.state.loading, true); assert.equal(repeated.state.core[0].id, 'second'); assert.equal(seoul.state.core[0].id, 'seoul');
  pending.resolve(ready('first')); await flush(); hk.close(); repeated.close(); seoul.close();
});
