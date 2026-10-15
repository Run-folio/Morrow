import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import * as explore from '../lib/easyt/explore.ts';
import { tripIntentForTrip } from '../lib/easyt/trip.ts';
import { createAbortableEffectScope } from '../lib/easyt/abortable-effect.ts';
import { localSearchPayload } from '../lib/easyt/local-place.ts';
import * as presentation from '../lib/easyt/planning-evidence-presentation.ts';
import { requireReadableTripDocument } from '../lib/easyt/trip-document.ts';
import { canonicalRouteFixture } from './fixtures/batch14-route-documents.ts';

const text = readFileSync(new URL('../components/easyt/trip-explore-workspace.tsx', import.meta.url), 'utf8');
const tree = ts.createSourceFile('workspace.tsx', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function extract(kind: 'function' | 'variable' | 'effect', name: string) {
  let found = '';
  function visit(node: ts.Node) {
    if (kind === 'function' && ts.isFunctionDeclaration(node) && node.name?.text === name) found = node.getText(tree);
    if (kind === 'variable' && ts.isVariableDeclaration(node) && node.name.getText(tree) === name && node.initializer) found = node.initializer.getText(tree);
    if (kind === 'effect' && ts.isCallExpression(node) && node.expression.getText(tree) === 'useEffect' && node.arguments[0]?.getText(tree).includes(name)) found = node.arguments[0].getText(tree);
    ts.forEachChild(node, visit);
  }
  visit(tree); assert.ok(found, `execute actual ${kind} ${name}`); return found;
}
function evaluate(code: string, scope: Record<string, any>) {
  const script = ts.transpileModule(`return (${code});`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return new Function('scope', `with(scope){${script}}`)(scope);
}
function deferred<T>() { let resolve!: (value: T) => void, reject!: (reason: unknown) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
const tick = async () => { for (let i = 0; i < 60; i++) await Promise.resolve(); };
function harness(category = 'food') {
  const trip = requireReadableTripDocument(canonicalRouteFixture());
  const requests: Array<{ url: URL; response: ReturnType<typeof deferred<any>> }> = [];
  const snapshots: Promise<unknown>[] = [];
  const state: Record<string, any> = { organicResults: [], commercialResults: [], organicStatus: 'idle', restaurantStatus: 'idle', commercialStatus: 'idle' };
  const scope: Record<string, any> = { ...explore, ...presentation, localSearchPayload, tripIntentForTrip, URLSearchParams,
    initialResults: undefined, category, createAbortableEffectScope, discoveryTripRef: { current: trip },
    destinationId: trip.stops[0]!.id, discoveryRequestKey: 'synthetic-route', requestScopeRef: { current: null },
    laneResultsRef: { current: state }, trackEvent: () => {}, recommendationDurationMs: (a: number, b: number) => b - a,
    replaceOrganicResults: (value: unknown[]) => { state.organicResults = value; },
    replaceCommercialResults: (value: unknown[]) => { state.commercialResults = value; },
    fetch: async (value: string) => { const request = { url: new URL(value, 'https://fixture.invalid'), response: deferred<any>() }; requests.push(request); return request.response.promise; },
    streamExploreDiscoveryLane: (...args: Parameters<typeof explore.streamExploreDiscoveryLane>) => { const pending = explore.streamExploreDiscoveryLane(...args); snapshots.push(pending); return pending; },
  };
  for (const key of ['organicStatus', 'restaurantStatus', 'commercialStatus', 'organicAssessment', 'restaurantAssessment', 'commercialAssessment']) {
    Object.defineProperty(scope, key, { configurable: true, enumerable: true, get: () => state[key] });
    scope['set' + key[0]!.toUpperCase() + key.slice(1)] = (value: unknown) => { state[key] = value; };
  }
  for (const name of ['providerRequestBody', 'loadMappedPlaces', 'loadRestaurants', 'loadTours', 'loadDayTrips', 'loadOutdoors']) scope[name] = evaluate(extract('function', name), scope);
  let cleanup: (() => void) | undefined;
  const mount = () => { cleanup?.(); cleanup = evaluate(extract('effect', 'Explore organic and commercial discovery'), scope)(); };
  const reply = async (index: number, payload: unknown) => { requests[index]!.response.resolve({ ok: true, json: async () => payload }); await tick(); };
  const fail = async (index: number) => { requests[index]!.response.reject(new Error('synthetic provider unavailable')); await tick(); };
  const mapped = () => ({ places: [{ id: 'museum', title: 'Synthetic museum', area: 'Tokyo', type: 'Museum', tags: ['Culture'], description: 'A museum for visitors', qualityScore: 10, coordinates: [139.7, 35.7] }], assessment: { retrieval: 'completed', evidence: 'conditional', retryable: false } });
  const food = () => ({ places: [{ id: 'restaurant', name: 'Synthetic restaurant', address: 'Tokyo', category: 'restaurant', coordinates: [139.7, 35.7], mapsUrl: 'https://example.invalid/restaurant', provider: 'openstreetmap' }], searchStatus: 'ready' });
  const retry = () => {
    let callback = '';
    function visit(node: ts.Node) {
      if (ts.isJsxAttribute(node) && node.name.getText(tree) === 'onRetry' && node.initializer && ts.isJsxExpression(node.initializer)
        && node.initializer.expression?.getText(tree).includes('setRetryVersion')) callback = node.initializer.expression.getText(tree);
      ts.forEachChild(node, visit);
    }
    visit(tree); assert.ok(callback);
    const action = evaluate(callback, { canRetry: Boolean(view().canRetry), setRetryVersion: (update: (value: number) => number) => { scope.retryVersion = update(scope.retryVersion ?? 0); } });
    assert.equal(typeof action, 'function', 'actual rendered error exposes retry'); action(); mount();
  };
  const view = () => {
    const visibleResults = explore.filterExploreResults(trip, state.organicResults, scope.destinationId, scope.category);
    const renderScope: Record<string, any> = { ...scope, visibleResults, activeSourcePlan: explore.exploreSourcePlan(scope.category, trip) };
    for (const name of ['relevantStatuses', 'relevantAssessments', 'resultsPresentation', 'canRetry']) renderScope[name] = evaluate(extract('variable', name), renderScope);
    return { ...renderScope, visibleResults } as { visibleResults: explore.ExploreResult[]; resultsPresentation: string; canRetry: unknown };
  };
  return { scope, state, requests, mount, retry, reply, fail, mapped, food, view, dispose: () => cleanup?.() };
}

for (const first of ['mapped', 'restaurant'] as const) test(`Food exposes restaurant failure and retry when ${first} settles first`, async () => {
  const h = harness(); h.mount(); await tick(); assert.equal(h.requests.length, 2);
  if (first === 'mapped') { await h.reply(0, h.mapped()); assert.equal(h.view().resultsPresentation, 'loading'); await h.fail(1); }
  else { await h.fail(1); await h.reply(0, h.mapped()); }
  assert.equal(h.view().visibleResults.length, 0); assert.equal(h.view().resultsPresentation, 'unavailable'); assert.equal(Boolean(h.view().canRetry), true); h.dispose();
});
test('Food keeps completed genuine empty honest without presenting a museum as food', async () => {
  const h = harness(); h.mount(); await tick(); await h.reply(0, h.mapped()); await h.reply(1, { places: [], searchStatus: 'empty' });
  assert.equal(h.view().resultsPresentation, 'empty'); assert.equal(h.view().visibleResults.length, 0); h.dispose();
});
test('Food rejects a malformed local response instead of claiming successful empty', async () => {
  const h = harness(); h.mount(); await tick(); await h.reply(0, h.mapped()); await h.reply(1, {});
  assert.equal(h.view().resultsPresentation, 'unavailable'); assert.equal(Boolean(h.view().canRetry), true); h.dispose();
});
test('a failed mapped source cannot suppress usable Food or block its retry', async () => {
  const h = harness(); h.mount(); await tick(); await h.reply(0, { places: [], assessment: { retrieval: 'blocked', evidence: 'unqualified', reason: 'identity_required', retryable: false } }); await h.fail(1);
  assert.equal(h.view().resultsPresentation, 'unavailable'); assert.equal(Boolean(h.view().canRetry), true);
  h.retry(); await tick(); assert.equal(h.scope.retryVersion, 1); assert.equal(h.requests.length, 4); await h.reply(2, h.mapped()); await h.reply(3, h.food());
  assert.equal(h.view().resultsPresentation, 'results'); assert.equal(h.view().visibleResults.length, 1); h.dispose();
});
test('missing restaurant coordinates are unavailable with a destination action, never silent empty', async () => {
  const h = harness(); h.scope.discoveryTripRef.current.stops[0].latitude = null; h.scope.discoveryTripRef.current.stops[0].longitude = null;
  h.mount(); await tick(); await h.reply(0, h.mapped());
  assert.equal(h.requests.length, 1); assert.equal(h.view().resultsPresentation, 'unavailable');
  assert.equal(h.state.restaurantAssessment?.reason, 'identity_required'); assert.equal(Boolean(h.view().canRetry), false); h.dispose();
});
test('late old Food failure/results cannot replace a newer selected destination', async () => {
  const h = harness(); h.mount(); await tick(); h.scope.destinationId = h.scope.discoveryTripRef.current.stops[1].id; h.mount(); await tick();
  await h.reply(2, { places: [], assessment: { retrieval: 'completed', evidence: 'insufficient', retryable: false } }); await h.reply(3, h.food());
  const current = h.view().visibleResults.map((r: explore.ExploreResult) => r.stopId); assert.deepEqual(current, [h.scope.destinationId]);
  await h.reply(0, h.mapped()); await h.fail(1);
  assert.deepEqual(h.view().visibleResults.map((r: explore.ExploreResult) => r.stopId), current); assert.equal(h.view().resultsPresentation, 'results'); h.dispose();
});
test('late Food failure cannot change successful Activities after a category switch', async () => {
  const h = harness(); h.mount(); await tick(); h.scope.category = 'must-see'; h.mount(); await tick();
  await h.reply(2, h.mapped()); await h.reply(3, { activities: [], assessment: { retrieval: 'completed', evidence: 'insufficient', retryable: false } });
  assert.equal(h.view().resultsPresentation, 'results'); await h.fail(1); await h.reply(0, { places: [], unavailable: true });
  assert.equal(h.view().resultsPresentation, 'results'); assert.equal(h.requests.filter(r => r.url.pathname === '/api/journey-local-search').length, 1); h.dispose();
});

test('completed Food empty stays empty when the mapped sibling failed', async () => {
  const h = harness(); h.mount(); await tick(); await h.fail(0); await h.reply(1, { places: [], searchStatus: 'empty' });
  assert.equal(h.view().resultsPresentation, 'empty'); h.dispose();
});
test('usable restaurants remain visible when the mapped sibling fails', async () => {
  const h = harness(); h.mount(); await tick(); await h.fail(0); await h.reply(1, h.food());
  assert.equal(h.view().resultsPresentation, 'results'); assert.equal(h.view().visibleResults[0]?.kind, 'restaurant'); h.dispose();
});
test('a late pre-retry source cannot change the newer Food outcome', async () => {
  const h = harness(); h.mount(); await tick(); await h.fail(1);
  assert.equal(h.view().resultsPresentation, 'unavailable'); h.retry(); await tick();
  await h.reply(2, h.mapped()); await h.reply(3, h.food());
  await h.reply(0, { places: [], unavailable: true });
  assert.equal(h.view().resultsPresentation, 'results'); assert.equal(h.view().visibleResults.length, 1); h.dispose();
});
for (const payload of [{places: [], searchStatus: 'failed'}, {places: [42], searchStatus: 'ready'}]) test(`invalid or failed venue response cannot become empty: ${JSON.stringify(payload)}`, async () => {
  const h = harness(); h.mount(); await tick(); await h.reply(0, h.mapped()); await h.reply(1, payload);
  assert.equal(h.view().resultsPresentation, 'unavailable'); assert.equal(Boolean(h.view().canRetry), true); h.dispose();
});
