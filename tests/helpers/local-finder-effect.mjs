import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';
import { localFinderBaseQueryKey, localFinderQueryKey } from '../../lib/easyt/local-finder-query.ts';
import { loadLocalFinderBaseResult, peekLocalFinderBaseResult } from '../../lib/easyt/local-finder-base-cache.ts';
import { streamIndependentRecommendationLanes, recommendationDurationMs } from '../../lib/easyt/recommendation-performance.ts';
import { localSearchPayload, accommodationInventoryPayload } from '../../lib/easyt/local-place.ts';

// Run the actual production loading effect and pure cache/parser/lane helpers.
// Only React setters, transport, analytics and unused browser storage are fake.
const source = readFileSync(new URL('../../components/journey-local-finder.tsx', import.meta.url), 'utf8');
const start = source.indexOf('  useEffect(() => {\n    let active = true;');
const end = source.indexOf('  }, [analyticsSurface, baseResultKey', start);
assert.ok(start > 0 && end > start, 'production loading effect exists');
const body = source.slice(start + '  useEffect(() => {'.length, end);
const script = new vm.Script(stripTypeScriptTypes(`function runEffect() {${body}\n}\nrunEffect();`));
const renderStart = source.indexOf('  if (render) {');
const renderEnd = source.indexOf('  return <section', renderStart);
assert.ok(renderStart > end && renderEnd > renderStart, 'production render contract exists');
const renderScript = new vm.Script(stripTypeScriptTypes(`function renderFinder() {${source.slice(renderStart, renderEnd)}\n}\nrenderFinder();`));

export const cities = {
  hongkong: { city: 'Hong Kong', country: 'China', canonicalPlaceId: 'hong-kong', coordinates: [114.17469, 22.27832] },
  seoul: { city: 'Seoul', country: 'South Korea', canonicalPlaceId: 'seoul', coordinates: [126.9784, 37.566] },
};
export const place = { id: 'synthetic-stay', name: 'Synthetic Hotel', address: 'Synthetic fixture', category: 'hotel', coordinates: [114.17469, 22.27832], mapsUrl: 'https://example.invalid/stay', provider: 'openstreetmap', availability: 'check' };
export const response = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
export const ready = (id = place.id) => response({ places: [{ ...place, id }], searchStatus: 'ready' });
export function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
export async function flush() {
  for (let i = 0; i < 16; i++) await Promise.resolve();
}
export function finderHarness({ city = cities.hongkong, fetch: transport, searchVersion = 0, refs = {}, retained = [], dayId = `synthetic-${city.canonicalPlaceId}`, initialState } = {}) {
  const calls = [], publication = [], analytics = [];
  const state = { loading: true, unavailable: false, core: retained, commercial: [], inventory: 'not-requested' };
  const input = { kind: 'stay', ...city, locale: 'en', mapPresentation: 'maplibre', dayId };
  const baseResultKey = localFinderBaseQueryKey(input);
  const timeoutHandles = [];
  const env = {
    ...input, longitude: city.coordinates[0], latitude: city.coordinates[1], baseResultKey,
    staySearch: undefined, stopId: dayId, initialState, searchVersion,
    analyticsSurface: 'stay', corePlaces: retained, canonicalSavedState: true,
    storageKey: 'synthetic-unused-storage', AbortController,
    AbortSignal: { any: AbortSignal.any, timeout(ms) {
      const controller = new AbortController();
      timeoutHandles.push(setTimeout(() => controller.abort(new DOMException('Controlled timeout', 'TimeoutError')), ms));
      return controller.signal;
    } },
    URLSearchParams, performance, trackEvent: (...args) => analytics.push(args),
    window: { localStorage: { getItem() { return null; } } },
    localFinderQueryKey, loadLocalFinderBaseResult, peekLocalFinderBaseResult,
    streamIndependentRecommendationLanes, recommendationDurationMs,
    localSearchPayload, accommodationInventoryPayload,
    lastBaseRequestRef: refs.lastBaseRequestRef ?? { current: null },
    loadedBaseResultKeyRef: refs.loadedBaseResultKeyRef ?? { current: null },
    performanceRequestRef: { current: null }, reportedAccommodationSearchRef: { current: '' },
    autoSelectedRef: { current: false },
    setChosen() {}, setSaved() {}, setMeal() {}, setPace() {}, setMood() {}, setMoment() {},
    fetch(url, options) { calls.push({ url, options }); return transport(url, options); },
  };
  for (const [setter, field] of [['setLoading', 'loading'], ['setSearchUnavailable', 'unavailable'], ['setCorePlaces', 'core'], ['setCommercialPlaces', 'commercial'], ['setAccommodationInventoryStatus', 'inventory']]) {
    env[setter] = (value) => { state[field] = value; publication.push({ field, value }); };
  }
  const cleanup = script.runInContext(vm.createContext(env));
  let nextSearchVersion = searchVersion;
  return { state, calls, env, cleanup, publication, analytics,
    view() { return renderScript.runInContext(vm.createContext({
      render: (value) => value, candidates: state.core.map(place => ({ place })), chosen: null,
      loading: state.loading, searchUnavailable: state.unavailable, accommodationInventoryStatus: state.inventory,
      choosePlace() {}, setChosen() {}, setSearchVersion: (update) => { nextSearchVersion = update(nextSearchVersion); },
    })); },
    retryVersion: () => nextSearchVersion,
    close() { cleanup?.(); timeoutHandles.forEach(clearTimeout); },
  };
}
