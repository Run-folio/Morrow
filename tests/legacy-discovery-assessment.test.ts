import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import ts from 'typescript';
import { defaultTripIntent, type EasyTTrip } from '../lib/easyt/trip.ts';
import { exploreDiscoveryRequestKey } from '../lib/easyt/explore.ts';

const require = createRequire(import.meta.url);
const Status = () => null;
const Button = () => null;
function fixture(): EasyTTrip {
  return { schemaVersion: 1, id: 'controlled-legacy-trip', ownerId: null, title: 'Tokyo', status: 'draft', startDate: '2026-10-01', endDate: '2026-10-01', travellers: 2, currency: 'GBP',
    brief: { origin: 'London', mustDo: '', pace: 'slow', hotelChanges: 'few', budgetBand: 'mid', selectedPlaces: {}, intent: defaultTripIntent({ stopIds: ['tokyo-stop'], durationDays: 1 }) },
    stops: [{ id: 'tokyo-stop', canonicalPlaceId: 'reference:geonames:1850147', providerId: 'reference:controlled-current-pin', order: 0, name: 'Tokyo', country: 'Japan', countryCode: 'JP', latitude: 35.6896, longitude: 139.6917, arrivalDate: '2026-10-01', departureDate: '2026-10-02', nights: 1 }],
    legs: [], planItems: [{ id: 'day-1', stopId: 'tokyo-stop', dayNumber: 1, date: '2026-10-01', type: 'activity', title: 'Tokyo', reason: '', notes: [], startsAt: null, endsAt: null, bookingUrl: null, latitude: null, longitude: null }],
    recommendations: [], createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z' };
}
const assessment = (retrieval: string, reason?: string, retryable = false, stage?: string) => ({ retrieval, evidence: retrieval === 'blocked' ? 'unqualified' : 'insufficient', ...(reason ? { reason } : {}), retryable,
  diagnostics: { attemptedSources: stage === 'provider' ? ['commercial-inventory'] : [], elapsedMs: 1, cacheOutcome: 'not-used', ...(stage ? { stage } : {}) } });
const place = { id: 'tokyo-museum', title: 'Tokyo Museum', area: 'Tokyo', type: 'Museum', tags: ['Culture'], description: 'A major museum and visitor gallery.', qualityScore: 15, coordinates: [139.69171, 35.6895] };
const activity = { provider: 'viator', source: 'viator', providerProductId: 'TOKYO-MUSEUM', title: 'Tokyo Museum tour', destination: { canonicalPlaceId: 'reference:geonames:1850147', label: 'Tokyo' }, provenance: { kind: 'live_provider_search', provider: 'viator', checkedAt: '2026-10-01T00:00:00.000Z' } };
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }

// Execute the real component effects and request boundaries with a deterministic
// hook scheduler. Only browser, analytics and child UI boundaries are replaced.
function mount(t: any, path: string, props: any, respond: (url: string, init: any) => Promise<Response> | Response, auth: { data: any; isPending: boolean } = { data: null, isPending: false }) {
  const values: any[] = [], cleanups = new Map<number, (() => void) | undefined>();
  let cursor = 0, dirty = false, pending: Array<() => void> = [], tree: any;
  const same = (a: any[], b: any[]) => a?.length === b?.length && a.every((value, index) => Object.is(value, b[index]));
  const memo = (factory: () => any, deps: any[]) => { const index = cursor++; if (!values[index] || !same(values[index].deps, deps)) values[index] = { deps, value: factory() }; return values[index].value; };
  const hooks = {
    useState(initial: any) { const index = cursor++; if (!(index in values)) values[index] = typeof initial === 'function' ? initial() : initial; return [values[index], (next: any) => { const value = typeof next === 'function' ? next(values[index]) : next; if (!Object.is(value, values[index])) { values[index] = value; dirty = true; } }]; },
    useRef(initial: any) { const index = cursor++; return values[index] ??= { current: initial }; },
    useMemo: memo,
    useCallback(callback: any, deps: any[]) { return memo(() => callback, deps); },
    useEffect(effect: () => any, deps: any[]) { const index = cursor++; if (!(index in values) || !same(values[index], deps)) { values[index] = deps; pending.push(() => { cleanups.get(index)?.(); cleanups.set(index, effect()); }); } },
  };
  const calls: Array<{ url: string; init: any }> = [], events: any[] = [];
  const before = { fetch: globalThis.fetch, window: (globalThis as any).window, sessionStorage: (globalThis as any).sessionStorage };
  globalThis.fetch = (async (input: any, init: any) => { calls.push({ url: String(input), init }); return respond(String(input), init); }) as typeof fetch;
  (globalThis as any).window = { requestAnimationFrame: (fn: any) => fn(), location: { assign() {} } };
  (globalThis as any).sessionStorage = { getItem: () => 'already-seen', setItem() {} };
  const stub = new Proxy({ default: () => null }, { get(target, key) { return key === '__esModule' ? true : (target as any)[key] ?? (() => null); } });
  const source = readFileSync(resolve(path), 'utf8');
  const output = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const mod = { exports: {} as any };
  new Function('require', 'module', 'exports', output)((id: string) => {
    if (id === 'react') return hooks;
    if (id === '@/lib/auth-client') return { authClient: { useSession: () => auth } };
    if (id === '@/lib/analytics') return { trackEvent: (...args: any[]) => events.push(args) };
    if (id.endsWith('/trip-shell-client') || id === './trip-shell-client') return { useTripShellMutation: () => ({ trip: props.trip, error: null, isPending: () => false, mutateTrip: () => true }) };
    if (id.endsWith('/morrovia-loading-states') || id === './morrovia-loading-states') return { MorroviaSectionStatus: Status, MorroviaSkeleton: () => null };
    if (id.endsWith('/easyt-controls') || id === './easyt-controls') return { EasyTButton: Button, EasyTLinkButton: Button, EasyTSelect: Button };
    if (id.endsWith('/journey-local-place-photo') || id === './journey-local-place-photo') return { JourneyLocalPlacePhotoMedia: () => null, useJourneyLocalPlacePhotos: () => ({}) };
    if (id === 'lucide-react' || id.startsWith('@/components/') || id.startsWith('./') || id.endsWith('.css')) return stub;
    if (id.startsWith('@/lib/')) return require(resolve(`${id.slice(2)}.ts`));
    return require(id);
  }, mod, mod.exports);
  const Component = mod.exports.default ?? mod.exports.JourneyItineraryRefinement;
  const render = () => { for (let attempt = 0; attempt < 20; attempt++) { cursor = 0; dirty = false; tree = Component(props); const effects = pending; pending = []; effects.forEach(effect => effect()); if (!dirty) return tree; } assert.fail('component did not settle'); };
  const walk = (node: any): any[] => Array.isArray(node) ? node.flatMap(item => walk(item)) : node && typeof node === 'object' ? [node, ...walk(node.props?.children)] : [];
  const nodes = () => walk(tree);
  const statuses = () => nodes().filter(node => node.type === Status).map(node => node.props);
  const content = (node: any): string => Array.isArray(node) ? node.map(item => content(item)).join(' ') : node && typeof node === 'object' ? content(node.props?.children) : typeof node === 'string' ? node : '';
  const text = () => content(tree).replace(/\s+/g, ' ').trim();
  const settle = async () => { for (let i = 0; i < 12; i++) { await Promise.resolve(); render(); } };
  t.after(() => { cleanups.forEach(cleanup => cleanup?.()); globalThis.fetch = before.fetch; (globalThis as any).window = before.window; (globalThis as any).sessionStorage = before.sessionStorage; });
  render();
  return { calls, events, render, settle, statuses, text, nodes, props, auth };
}
function refinementProps(base = fixture()) { return { trip: base, stop: base.stops[0], day: base.planItems[0], onSelectionChange() {}, activityAction: null }; }
function inventoryProps(base = fixture()) { return { trip: base, stop: base.stops[0], day: base.planItems[0], workspace: 'map', placement: 'controlled', onSave: () => true, onSchedule: () => true, fallback: 'Generic provider handoff' }; }

test('switching live inventory to outdoors clears commercial results and feedback without requesting a provider', async t => {
  const view = mount(t, 'components/easyt/live-activity-inventory.tsx', inventoryProps(), () => Response.json({ activities: [activity] }));
  await view.settle(); assert.match(view.text(), /Tokyo Museum tour/);
  const calls = view.calls.length;
  view.props.discoveryCategory = 'outdoors'; view.render(); await view.settle();
  assert.equal(view.calls.length, calls);
  assert.doesNotMatch(view.text(), /Tokyo Museum tour|Generic provider handoff/);
  assert.equal(view.statuses().length, 0);
});

test('a provider-pin-only correction invalidates Explore discovery without editing itinerary', () => {
  const base = fixture(), next = structuredClone(base); next.stops[0]!.providerId = 'reference:corrected-pin';
  assert.notEqual(exploreDiscoveryRequestKey(base), exploreDiscoveryRequestKey(next));
});
for (const [name, path, getProps] of [
  ['refinement', 'components/journey-itinerary-refinement.tsx', refinementProps],
  ['Explore', 'components/easyt/trip-explore-workspace.tsx', (base = fixture()) => ({ trip: base, initialCategory: 'must-see' })],
] as const) {
  test(`${name} forwards an existing canonical/provider pin even with unavailable caller coordinates`, async t => {
    const base = fixture(); base.stops[0]!.latitude = null; base.stops[0]!.longitude = null;
    const view = mount(t, path, getProps(base), () => Response.json({ places: [], assessment: assessment('completed', 'successful_empty') }));
    await view.settle();
    const discoveryCalls = view.calls.filter(call => call.url.includes('/journey-discover?'));
    assert.equal(discoveryCalls.length, 1); const query = new URL(discoveryCalls[0]!.url, 'http://controlled.test').searchParams;
    assert.equal(query.get('canonicalPlaceId'), 'reference:geonames:1850147'); assert.equal(query.get('providerId'), 'reference:controlled-current-pin');
    assert.equal(query.has('lat'), false); assert.equal(query.has('lon'), false);
  });
  for (const retrieval of ['blocked', 'unavailable', 'checking', 'not-attempted']) test(`${name} never presents settled ${retrieval} retrieval as empty success`, async t => {
    const reason = retrieval === 'blocked' ? 'identity_required' : retrieval === 'unavailable' ? 'timeout' : undefined;
    const view = mount(t, path, getProps(), () => Response.json({ places: [place], assessment: assessment(retrieval, reason, retrieval === 'unavailable') }));
    await view.settle(); assert.ok(view.statuses().some(status => status.state === 'error'));
    assert.ok(!view.statuses().some(status => !status.state || status.state === 'loading'));
    assert.doesNotMatch(view.text(), /No places|No must-see ideas/);
    assert.doesNotMatch(view.text(), /Tokyo Museum/);
    if (retrieval === 'checking' || retrieval === 'not-attempted') assert.ok(view.statuses().every(status => !status.onRetry));
  });
  test(`${name} preserves completed empty legacy compatibility`, async t => {
    const view = mount(t, path, getProps(), () => Response.json({ places: [] })); await view.settle();
    assert.equal(view.statuses().length, 0); assert.match(view.text(), /No places|No must-see ideas/);
  });
}
test('refinement handles legacy unavailable without claiming empty', async t => {
  const view = mount(t, 'components/journey-itinerary-refinement.tsx', refinementProps(), () => Response.json({ places: [], unavailable: true })); await view.settle();
  assert.ok(view.statuses().some(status => status.state === 'error')); assert.doesNotMatch(view.text(), /No places/);
});
test('refinement preserves useful same-scope suggestions when a retry settles incomplete', async t => {
  let calls = 0;
  const view = mount(t, 'components/journey-itinerary-refinement.tsx', refinementProps(), () => Response.json(++calls === 1 ? { places: [], assessment: assessment('unavailable', 'timeout', true) } : calls === 2 ? { places: [place] } : { places: [], assessment: assessment('checking') }));
  await view.settle(); const retry = view.statuses().find(status => status.onRetry); assert.ok(retry);
  retry.onRetry(); view.render(); await view.settle(); assert.match(view.text(), /Tokyo Museum/);
  retry.onRetry(); view.render(); await view.settle();
  assert.match(view.text(), /Tokyo Museum/); assert.ok(view.statuses().some(status => status.state === 'error')); assert.ok(view.statuses().every(status => !status.onRetry));
});
for (const [name, path, getProps] of [
  ['live inventory', 'components/easyt/live-activity-inventory.tsx', inventoryProps],
  ['Explore tours', 'components/easyt/trip-explore-workspace.tsx', (base = fixture()) => ({ trip: base, initialCategory: 'tours' })],
] as const) {
  for (const [kind, state, status, wantSignIn] of [
    ['legacy guest denial', assessment('blocked', 'auth_required'), 401, false],
    ['provider authentication', assessment('unavailable', 'auth_required', false, 'provider'), 503, false],
    ['identity', assessment('blocked', 'identity_required'), 400, false],
    ['incomplete', assessment('not-attempted'), 200, false],
  ] as const) test(`${name} distinguishes ${kind} from successful empty`, async t => {
    const view = mount(t, path, getProps(), () => Response.json({ activities: [activity], assessment: state }, { status })); await view.settle();
    assert.ok(view.statuses().some(status => status.state === 'error'));
    assert.equal(view.nodes().some(node => node.type === Button && node.props.children === 'Sign in'), wantSignIn);
    assert.ok(view.statuses().every(status => !/sign in/i.test(status.detail ?? '')));
    assert.doesNotMatch(view.text(), /No tours ideas|Tokyo Museum tour/); assert.ok(view.statuses().every(status => !status.onRetry));
  });
  test(`${name} forwards its existing provider pin and completed empty does not show failure`, async t => {
    const view = mount(t, path, getProps(), () => Response.json({ activities: [], assessment: assessment('completed', 'successful_empty') })); await view.settle();
    const body = JSON.parse(view.calls[0]!.init.body); assert.equal(body.destination.providerId, 'reference:controlled-current-pin'); assert.equal(view.statuses().length, 0);
  });
}
test('a delayed old refinement response cannot populate a changed coordinate-less stop', async t => {
  const delayed = deferred<Response>(); const view = mount(t, 'components/journey-itinerary-refinement.tsx', refinementProps(), () => delayed.promise);
  view.props.stop = { ...view.props.stop, id: 'unconfirmed-stop', canonicalPlaceId: undefined, providerId: undefined, name: 'Unconfirmed place', latitude: null, longitude: null };
  view.render(); delayed.resolve(Response.json({ places: [place] })); await view.settle();
  assert.doesNotMatch(view.text(), /Tokyo Museum/); assert.ok(view.statuses().some(status => status.state === 'error'));
});
for (const [name, path, getProps] of [
  ['live inventory', 'components/easyt/live-activity-inventory.tsx', inventoryProps],
  ['Explore tours', 'components/easyt/trip-explore-workspace.tsx', (base = fixture()) => ({ trip: base, initialCategory: 'tours' })],
] as const) {
  test(`${name} keeps useful same-scope items when an explicit retry settles incomplete`, async t => {
    let calls = 0;
    const view = mount(t, path, getProps(), () => Response.json(++calls === 1 ? { assessment: assessment('unavailable', 'timeout', true), activities: [] } : calls === 2 ? { activities: [activity] } : { assessment: assessment('not-attempted'), activities: [] }));
    await view.settle(); const retry = view.statuses().find(status => status.onRetry); assert.ok(retry);
    retry.onRetry(); view.render(); await view.settle(); assert.match(view.text(), /Tokyo Museum tour/);
    retry.onRetry(); view.render(); await view.settle(); assert.match(view.text(), /Tokyo Museum tour/);
    assert.ok(view.statuses().every(status => !status.onRetry));
  });
  test(`${name} cancels and retires a delayed result after a provider-pin-only correction`, async t => {
    const old = deferred<Response>(); let calls = 0;
    const view = mount(t, path, getProps(), () => ++calls === 1 ? old.promise : Response.json({ activities: [{ ...activity, title: 'Current pinned tour', providerProductId: 'CURRENT' }] }));
    view.props.trip = structuredClone(view.props.trip); view.props.trip.stops[0].providerId = 'reference:corrected-pin';
    if ('stop' in view.props) view.props.stop = view.props.trip.stops[0];
    view.render(); await view.settle(); old.resolve(Response.json({ activities: [activity] })); await view.settle();
    assert.equal(view.calls.length, 2); assert.equal(view.calls[0]!.init.signal.aborted, true);
    assert.equal(JSON.parse(view.calls[1]!.init.body).destination.providerId, 'reference:corrected-pin');
    assert.match(view.text(), /Current pinned tour/); assert.doesNotMatch(view.text(), /Tokyo Museum tour/);
  });
}
test('Explore keeps useful organic ideas when guest commercial access is blocked', async t => {
  const view = mount(t, 'components/easyt/trip-explore-workspace.tsx', { trip: fixture() }, url => url.includes('journey-discover')
    ? Response.json({ places: [place], assessment: assessment('completed') })
    : Response.json({ activities: [], assessment: assessment('blocked', 'auth_required') }, { status: 401 }));
  await view.settle(); assert.match(view.text(), /Tokyo Museum/); assert.equal(view.statuses().length, 0); assert.doesNotMatch(view.text(), /No for you ideas/);
});
test('refinement never fabricates a canonical identity for an unpinned legacy stop', async t => {
  const base = fixture(); delete base.stops[0]!.canonicalPlaceId; delete base.stops[0]!.providerId;
  const view = mount(t, 'components/journey-itinerary-refinement.tsx', refinementProps(base), () => Response.json({ places: [], assessment: assessment('completed', 'successful_empty') }));
  await view.settle(); const query = new URL(view.calls[0]!.url, 'http://controlled.test').searchParams;
  assert.equal(query.has('canonicalPlaceId'), false); assert.equal(query.has('providerId'), false); assert.equal(query.get('lat'), '35.6896');
});
for (const [name, path, getProps, commercial] of [
  ['refinement', 'components/journey-itinerary-refinement.tsx', refinementProps, false],
  ['live inventory', 'components/easyt/live-activity-inventory.tsx', inventoryProps, true],
  ['Explore tours', 'components/easyt/trip-explore-workspace.tsx', (base = fixture()) => ({ trip: base, initialCategory: 'tours' }), true],
] as const) for (const field of ['id', 'ownerId']) test(`${name} retires delayed identical-geography feedback when trip ${field} changes`, async t => {
  const old = deferred<Response>(); let calls = 0;
  const view = mount(t, path, getProps(), () => ++calls === 1 ? old.promise : Response.json(commercial ? { activities: [{ ...activity, title: 'Current document tour', providerProductId: 'CURRENT-DOCUMENT' }] } : { places: [{ ...place, id: 'current-document', title: 'Current document museum' }] }));
  view.props.trip = structuredClone(view.props.trip); view.props.trip[field] = field === 'id' ? 'other-trip' : 'other-owner'; view.render(); await view.settle();
  old.resolve(Response.json(commercial ? { activities: [activity] } : { places: [place] })); await view.settle();
  assert.equal(view.calls.length, 2); assert.equal(view.calls[0]!.init.signal.aborted, true);
  assert.match(view.text(), /Current document/); assert.doesNotMatch(view.text(), /Tokyo Museum/);
});
for (const retrieval of ['blocked', 'checking', 'not-attempted']) test(`Explore retry leaves its explicitly nonretryable ${retrieval} commercial sibling unchanged`, async t => {
  let organicCalls = 0;
  const view = mount(t, 'components/easyt/trip-explore-workspace.tsx', { trip: fixture() }, url => url.includes('journey-discover')
    ? Response.json(++organicCalls === 1 ? { places: [], assessment: assessment('unavailable', 'timeout', true) } : { places: [place] })
    : Response.json({ activities: [], assessment: assessment(retrieval, retrieval === 'blocked' ? 'auth_required' : undefined) }, { status: retrieval === 'blocked' ? 401 : 200 }));
  await view.settle(); const retry = view.statuses().find(status => status.onRetry); assert.ok(retry); retry.onRetry(); view.render(); await view.settle();
  assert.equal(view.calls.filter(call => call.url.includes('journey-activity-inventory')).length, 1);
  assert.equal(view.calls.filter(call => call.url.includes('journey-discover')).length, 2);
  assert.match(view.text(), /Tokyo Museum/);
});
test('Explore Food offers timeout recovery when another organic source completed empty', async t => {
  let restaurantCalls = 0;
  const view = mount(t, 'components/easyt/trip-explore-workspace.tsx', { trip: fixture(), initialCategory: 'food' }, url => url.includes('journey-local-search')
    ? ++restaurantCalls === 1 ? Response.json({ places: [], searchStatus: 'failed', unavailable: true }, { status: 504 }) : Response.json({ places: [], searchStatus: 'empty' })
    : Response.json({ places: [], assessment: assessment('completed', 'successful_empty') }));
  await view.settle(); assert.doesNotMatch(view.text(), /No food ideas/); const retry = view.statuses().find(status => status.onRetry); assert.ok(retry);
  retry.onRetry(); view.render(); await view.settle(); assert.equal(restaurantCalls, 2); assert.equal(view.statuses().length, 0); assert.match(view.text(), /No food ideas/);
});
test('Food retry requests fresh venues and clears its failed state when a useful result returns',async t=>{
 let calls=0;const venue={id:'recovered-restaurant',name:'Recovered local restaurant',address:'Tokyo, Japan',category:'restaurant',coordinates:[139.6917,35.6896],mapsUrl:'https://example.invalid/restaurant',provider:'openstreetmap',availability:'check'};
 const view=mount(t,'components/easyt/trip-explore-workspace.tsx',{trip:fixture(),initialCategory:'food'},url=>url.includes('journey-local-search')
  ? Response.json(++calls===1?{places:[],searchStatus:'failed',unavailable:true}:{places:[venue],searchStatus:'ready'})
  : Response.json({places:[],assessment:assessment('completed','successful_empty')}));
 await view.settle();const retry=view.statuses().find(s=>s.onRetry);assert.ok(retry);assert.match(retry.title,/couldn.t load food ideas/i);retry.onRetry();view.render();await view.settle();const requests=view.calls.filter(c=>c.url.includes('journey-local-search'));assert.equal(requests.length,2);assert.equal(new URL(requests[0].url,'http://fixture').searchParams.has('refresh'),false);assert.equal(new URL(requests[1].url,'http://fixture').searchParams.get('refresh'),'1');assert.match(view.text(),/Recovered local restaurant/);assert.equal(view.statuses().length,0);
 view.props.trip=structuredClone(view.props.trip);
 const oldStopId=view.props.trip.stops[0].id;
 view.props.trip.stops[0].id='other-stop';
 for(const day of view.props.trip.planItems)if(day.stopId===oldStopId)day.stopId='other-stop';
 for(const destination of view.props.trip.brief.intent.route?.destinations??[])destination.stopIds=destination.stopIds.map((id:string)=>id===oldStopId?'other-stop':id);
 view.render();await view.settle();
 const nextRequests=view.calls.filter(c=>c.url.includes('journey-local-search'));
 assert.ok(nextRequests.length>requests.length,'the new stop must actually issue its own request');
 assert.equal(new URL(nextRequests.at(-1)!.url,'http://fixture').searchParams.has('refresh'),false);
});

for (const category of ['tours', 'for-you']) test(`Explore ${category} recovers guest denial on sign-in without tab switching or organic restart`, async t => {
  const base=fixture(),before=JSON.stringify(base);
  const auth:{data:any;isPending:boolean}={data:null,isPending:false};
  const view=mount(t,'components/easyt/trip-explore-workspace.tsx',{trip:base,initialCategory:category},url=>url.includes('journey-activity-inventory')
    ? auth.data ? Response.json({activities:[activity]}) : Response.json({activities:[],assessment:assessment('blocked','auth_required')},{status:401})
    : Response.json({places:category==='for-you'?[place]:[],assessment:assessment('completed')}),auth);
  await view.settle();assert.equal(view.calls.filter(c=>c.url.includes('activity-inventory')).length,1);
  const organic=view.calls.filter(c=>!c.url.includes('activity-inventory')).length;
  auth.data={user:{id:'owner-a'}};view.render();await view.settle();
  assert.equal(view.calls.filter(c=>c.url.includes('activity-inventory')).length,2,'settled sign-in must replace the guest request');
  assert.match(view.text(),/Tokyo Museum tour/);assert.doesNotMatch(view.text(),/Sign in/);
  assert.equal(view.calls.filter(c=>!c.url.includes('activity-inventory')).length,organic,'auth alone must not restart organic work');
  assert.equal(JSON.stringify(view.props.trip),before);
});
test('Explore pending session leaves local ideas running and starts commercial once authentication settles',async t=>{
  const auth:{data:any;isPending:boolean}={data:null,isPending:true};
  const view=mount(t,'components/easyt/trip-explore-workspace.tsx',{trip:fixture()},url=>url.includes('activity-inventory')?Response.json({activities:[activity]}):Response.json({places:[place],assessment:assessment('completed')}),auth);
  await view.settle();assert.match(view.text(),/Tokyo Museum/);assert.equal(view.calls.filter(c=>c.url.includes('activity-inventory')).length,0);
  auth.data={user:{id:'owner-a'}};auth.isPending=false;view.render();await view.settle();
  assert.equal(view.calls.filter(c=>c.url.includes('activity-inventory')).length,1);assert.match(view.text(),/Tokyo Museum tour/);
});
test('Explore account switch retires old request and ignores its late denial after current results',async t=>{
  const old=deferred<Response>(),auth:{data:any;isPending:boolean}={data:{user:{id:'owner-a'}},isPending:false};let calls=0;
  const view=mount(t,'components/easyt/trip-explore-workspace.tsx',{trip:fixture(),initialCategory:'tours'},()=>++calls===1?old.promise:Response.json({activities:[{...activity,title:'Owner B tour',providerProductId:'OWNER-B'}]}),auth);
  await view.settle();auth.data={user:{id:'owner-b'}};view.render();await view.settle();
  assert.equal(view.calls.length,2);assert.equal(view.calls[0]!.init.signal.aborted,true);assert.match(view.text(),/Owner B tour/);
  old.resolve(Response.json({activities:[],assessment:assessment('blocked','auth_required')},{status:401}));await view.settle();
  assert.match(view.text(),/Owner B tour/);assert.doesNotMatch(view.text(),/Sign in/);
});
test('Explore sign-out clears previous commercial results and rejects late former-account success',async t=>{
  const old=deferred<Response>(),auth:{data:any;isPending:boolean}={data:{user:{id:'owner-a'}},isPending:false};let calls=0;
  const view=mount(t,'components/easyt/trip-explore-workspace.tsx',{trip:fixture(),initialCategory:'tours'},()=>++calls===1?old.promise:Response.json({activities:[],assessment:assessment('blocked','auth_required')},{status:401}),auth);
  await view.settle();auth.data=null;view.render();await view.settle();assert.equal(view.calls.length,2);assert.equal(view.calls[0]!.init.signal.aborted,true);
  old.resolve(Response.json({activities:[activity]}));await view.settle();assert.doesNotMatch(view.text(),/Tokyo Museum tour|Sign in/);
});
test('Explore clears already rendered commercial results while a new auth scope is still pending',async t=>{
  const auth:{data:any;isPending:boolean}={data:{user:{id:'owner-a'}},isPending:false};
  const view=mount(t,'components/easyt/trip-explore-workspace.tsx',{trip:fixture(),initialCategory:'tours'},()=>Response.json({activities:[activity]}),auth);
  await view.settle();assert.match(view.text(),/Tokyo Museum tour/);const count=view.calls.length;
  auth.data=null;auth.isPending=true;view.render();await view.settle();assert.doesNotMatch(view.text(),/Tokyo Museum tour/);assert.equal(view.calls.length,count);
});
test('Explore auth transition does not cancel an independent pending organic request',async t=>{
  const organic=deferred<Response>(),auth:{data:any;isPending:boolean}={data:null,isPending:true};
  const view=mount(t,'components/easyt/trip-explore-workspace.tsx',{trip:fixture()},url=>url.includes('activity-inventory')?Response.json({activities:[activity]}):organic.promise,auth);
  await view.settle();assert.equal(view.calls.length,1);const signal=view.calls[0]!.init.signal;
  auth.data={user:{id:'owner-a'}};auth.isPending=false;view.render();await view.settle();assert.equal(signal.aborted,false);assert.match(view.text(),/Tokyo Museum tour/);
  organic.resolve(Response.json({places:[place],assessment:assessment('completed')}));await view.settle();assert.match(view.text(),/Tokyo Museum/);assert.equal(view.calls.filter(c=>c.url.includes('journey-discover')).length,1);
});
test('Explore ABA account transition cannot accept an older response from the same account id',async t=>{
  const old=deferred<Response>(),auth:{data:any;isPending:boolean}={data:{user:{id:'owner-a'}},isPending:false};let calls=0;
  const view=mount(t,'components/easyt/trip-explore-workspace.tsx',{trip:fixture(),initialCategory:'tours'},()=>++calls===1?old.promise:Response.json({activities:[{...activity,title:'Current auth generation tour',providerProductId:'CURRENT-GENERATION'}]}),auth);
  await view.settle();auth.data={user:{id:'owner-b'}};view.render();await view.settle();auth.data={user:{id:'owner-a'}};view.render();await view.settle();assert.equal(view.calls.length,3);
  old.resolve(Response.json({activities:[activity]}));await view.settle();assert.match(view.text(),/Current auth generation tour/);assert.doesNotMatch(view.text(),/Tokyo Museum tour/);
});

test('Explore seeded commercial results survive category navigation without fetching', async t => {
  const { exploreResultForActivity } = require(resolve('lib/easyt/explore.ts'));
  const base=fixture(),seeded=exploreResultForActivity(base.stops[0],activity,base);
  const view=mount(t,'components/easyt/trip-explore-workspace.tsx',{trip:base,initialResults:[seeded],initialCategory:'for-you'},()=>{throw new Error('seed mode must not fetch');});
  await view.settle();assert.match(view.text(),/Tokyo Museum tour/);
  const tours=view.nodes().find(n=>n.type===Button&&n.props.children==='Tours');assert.ok(tours);
  tours.props.onClick();view.render();await view.settle();
  assert.match(view.text(),/Tokyo Museum tour/);assert.equal(view.calls.length,0);
});
