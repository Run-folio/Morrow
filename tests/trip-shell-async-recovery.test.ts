import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
import { canonicalRouteFixture } from './fixtures/batch14-route-documents.ts';
import { canonicalTripRevisionCanReplace } from '../lib/easyt/trip-continuity.ts';
import { createTripMutationPersistenceQueue, newestTripMutationCanonical } from '../lib/easyt/trip-mutation-persistence.ts';
import * as tripDisplay from '../lib/easyt/trip-display.ts';
import { workspaceViewFromPathname } from '../lib/easyt/trip-workspace-links.ts';
import * as workspaceDiagnostic from '../lib/easyt/workspace-recovery-diagnostic.ts';
import {BrowserRecoveryReadError as ActualBrowserRecoveryReadError} from '../lib/easyt/browser-recovery-persistence.ts';

const require = createRequire(import.meta.url);
const tick = async () => { for (let index = 0; index < 20; index++) await Promise.resolve(); };
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (value: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function scheduler() {
  const values: any[] = [];
  let cursor = 0;
  const effects: Array<() => void> = [];
  const cleanups = new Map<number, () => void>();
  const same = (a: unknown[], b: unknown[]) => a?.length === b?.length && a.every((value, index) => Object.is(value, b[index]));
  return {
    hooks: {
      useState(initial: any) { const index = cursor++; if (!(index in values)) values[index] = typeof initial === 'function' ? initial() : initial; return [values[index], (value: any) => { values[index] = typeof value === 'function' ? value(values[index]) : value; }]; },
      useReducer(reducer: any, initial: any) { const index = cursor++; if (!(index in values)) values[index] = initial; return [values[index], (action: any) => { values[index] = reducer(values[index], action); }]; },
      useRef(initial: any) { const index = cursor++; return values[index] ??= { current: initial }; },
      useCallback(callback: any, dependencies: any[]) { const index = cursor++; if (!values[index] || !same(values[index].dependencies, dependencies)) values[index] = { callback, dependencies }; return values[index].callback; },
      useEffect(callback: any, dependencies: any[]) { const index = cursor++; if (!values[index] || !same(values[index], dependencies)) { values[index] = dependencies; effects.push(() => { cleanups.get(index)?.(); const cleanup = callback(); if (cleanup) cleanups.set(index, cleanup); else cleanups.delete(index); }); } },
    },
    render(component: any, ...args: any[]) { cursor = 0; const value = component(...args); for (const effect of effects.splice(0)) effect(); return value; },
    unmount() { for (const cleanup of cleanups.values()) cleanup(); },
  };
}
function load(path: string, imports: Record<string, unknown>) {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8');
  const output = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} as any };
  new Function('require', 'module', 'exports', output)((id: string) => id in imports ? imports[id] : require(id), module, module.exports);
  return module.exports;
}
class BrowserRecoveryReadError extends Error {
  readonly reason: string;
  readonly kind: 'protected' | 'unavailable';
  constructor(reason: string) { super(reason); this.reason = reason; this.kind = reason === 'protected' ? 'protected' : 'unavailable'; }
}
function mutationHarness(overrides: Record<string, any> = {}) {
  const schedule = scheduler();
  let owner: string | null = 'owner-a';
  let initial = { ...canonicalRouteFixture(), id: 'async-shell-trip', ownerId: owner };
  let recovery: any = null;
  const cloud: any[] = [], written: any[] = [];
  const storage: any = {
    BrowserRecoveryReadError,
    loadCachedTrip: async () => null,
    loadTripRecovery: async () => recovery,
    classifyTripRecovery: ({ recovery: value }: any) => value ? 'active-local-document' : 'no-recovery',
    saveTripRecovery: async (trip: any, options: any) => { const handle = { tripId: trip.id, ownerId: options.ownerId, writeId: `write-${written.length + 1}` }; written.push(trip); recovery = { ...handle, trip, state: 'pending' }; return { stored: true, handle }; },
    cacheCanonicalTrip: async () => { recovery = null; return { stored: true, recoveryResolved: true, accountAcknowledged: true }; },
    acknowledgeTripBuildSave: async (...args: any[]) => { const result = await storage.cacheCanonicalTrip(args[1], args[2]); return { ...result, remainingRecovery: recovery }; },
    markTripRecoveryState: async () => true,
    expectCanonicalSave: () => undefined,
    saveTripRecoveryToEasyT: async (trip: any) => { cloud.push(trip); return { ...trip, updatedAt: '2026-10-12T00:01:00.000Z' }; },
    EasyTTripAuthError: class extends Error {},
    EasyTTripPromotionConflictError: class extends Error {},
    EasyTTripSaveConflictError: class extends Error {},
    ...overrides,
  };
  const hook = load('../components/easyt/use-trip-mutation-persistence.ts', {
    react: schedule.hooks,
    '@/lib/auth-client': { authClient: { useSession: () => ({ data: owner ? { user: { id: owner } } : null, isPending: false }) } },
    '@/lib/easyt/storage': storage,
    '@/lib/easyt/itinerary-mutations': { cloneItineraryMutationDocument: structuredClone },
    '@/lib/easyt/trip-mutation-persistence': { createTripMutationPersistenceQueue, newestTripMutationCanonical },
    '@/lib/easyt/trip-continuity': { canonicalTripRevisionCanReplace },
    '@/lib/easyt/feedback-survey': { isMeaningfulFeedbackAcknowledgement: () => true },
  }).useTripMutationPersistence;
  return { render: () => schedule.render(hook, initial, true), cloud, written, storage, unmount: () => schedule.unmount(), setOwner: (next: string | null) => { owner = next; }, setInitial: (trip: any) => { initial = trip; }, setRecovery: (value: any) => { recovery = value; } };
}

test('mutation does not apply, acknowledge, or queue a cloud save before durable device completion', async () => {
  const stored = deferred<any>();
  const h = mutationHarness({ saveTripRecovery: () => stored.promise });
  const base = h.render().trip;
  await tick();
  const pending = h.render().mutateTrip((trip: any) => ({ ...trip, title: 'Pending edit' }), 'rename');
  await tick();
  assert.equal(h.render().trip.title, base.title);
  assert.equal(h.render().isPending('rename'), true);
  assert.equal(h.render().hasPendingSaves(), true);
  assert.equal(h.cloud.length, 0);
  stored.resolve({ stored: true, handle: { ownerId: base.ownerId, tripId: base.id, writeId: 'verified' } });
  assert.equal(await pending, true);
  await h.render().waitForPending();
  assert.equal(h.render().trip.title, 'Pending edit');
  assert.equal(h.render().saveState, 'saved');
});

test('an account switch rejects a pending local completion and cannot queue it into the new account', async () => {
  const stored = deferred<any>();
  let operationIsCurrent: (() => boolean) | undefined;
  const h = mutationHarness({ saveTripRecovery: (_trip: any, options: any) => { operationIsCurrent = options.isCurrent; return stored.promise; } });
  const base = h.render().trip;
  await tick();
  const pending = h.render().mutateTrip((trip: any) => ({ ...trip, title: 'Old account edit' }), 'rename');
  await tick();
  h.setOwner('owner-b'); h.render();
  assert.equal(operationIsCurrent?.(), false);
  stored.resolve({ stored: true, handle: { ownerId: base.ownerId, tripId: base.id, writeId: 'stale' } });
  assert.equal(await pending, false);
  assert.equal(h.render().trip.title, base.title);
  assert.equal(h.cloud.length, 0);
});

test('unmount rejects a durable completion without accepting the edit or starting account persistence', async () => {
  const stored = deferred<any>();
  const h = mutationHarness({ saveTripRecovery: () => stored.promise });
  const base = h.render().trip;
  await tick();
  const pending = h.render().mutateTrip((trip: any) => ({ ...trip, title: 'Unmounted edit' }), 'rename');
  await tick(); h.unmount();
  stored.resolve({ stored: true, handle: { ownerId: base.ownerId, tripId: base.id, writeId: 'unmounted' } });
  assert.equal(await pending, false);
  assert.equal(h.cloud.length, 0);
});

test('unavailable hydration stays protected and does not accept a fresh mutation', async () => {
  const h = mutationHarness({ loadTripRecovery: async () => { throw new BrowserRecoveryReadError('unavailable'); } });
  h.render(); await tick();
  assert.equal(h.render().recoveryClassifiedFor, null);
  assert.equal(await h.render().mutateTrip((trip: any) => ({ ...trip, title: 'Unsafe edit' }), 'rename'), false);
  assert.equal(h.written.length, 0);
  assert.equal(h.render().failure, 'recovery');
});

test('a signed-in session does not implicitly claim or promote a guest mutation', async () => {
  const h = mutationHarness();
  h.setInitial({ ...canonicalRouteFixture(), id: 'async-shell-trip', ownerId: null });
  h.render(); await tick();
  assert.equal(await h.render().mutateTrip((trip: any) => ({ ...trip, title: 'Guest changes' }), 'rename'), true);
  await h.render().waitForPending();
  assert.equal(h.cloud.length, 0);
  assert.equal(h.render().trip.ownerId, null);
  assert.equal(h.render().saveState, 'device');
  assert.match(h.render().error, /claim it for your account/);
});

test('an ended session cannot accept an edit in an account-owned recovery scope', async () => {
  const h = mutationHarness();
  h.setOwner(null); h.render(); await tick();
  assert.equal(await h.render().mutateTrip((trip: any) => ({ ...trip, title: 'Expired-session edit' }), 'rename'), false);
  assert.equal(h.written.length, 0);
  assert.equal(h.cloud.length, 0);
  assert.equal(h.render().failure, 'auth');
});

test('local mutation continuations serialize and evaluate each update from the accepted preceding document', async () => {
  const first = deferred<any>();
  const h = mutationHarness({ saveTripRecovery: async (trip: any, options: any) => { h.written.push(trip); return h.written.length === 1 ? first.promise : { stored: true, handle: { ownerId: options.ownerId, tripId: trip.id, writeId: 'second' } }; } });
  h.setOwner(null); h.setInitial({ ...canonicalRouteFixture(), id: 'async-shell-trip', ownerId: null });
  h.render(); await tick();
  const a = h.render().mutateTrip((trip: any) => ({ ...trip, title: 'first' }), 'one');
  const b = h.render().mutateTrip((trip: any) => ({ ...trip, title: `${trip.title} second` }), 'two');
  await tick(); assert.equal(h.written.length, 1);
  first.resolve({ stored: true, handle: { ownerId: null, tripId: 'async-shell-trip', writeId: 'first' } });
  assert.equal(await a, true); assert.equal(await b, true);
  assert.equal(h.render().trip.title, 'first second');
});

test('exact account authority survives an optional cache refusal after the recovery was acknowledged', async () => {
  const h = mutationHarness({ cacheCanonicalTrip: async () => { h.setRecovery(null); return { stored: false, cacheStored: false, recoveryResolved: true, accountAcknowledged: true, deviceOutcome: 'acknowledged' }; } });
  h.render(); await tick();
  assert.equal(await h.render().mutateTrip((trip: any) => ({ ...trip, title: 'Acknowledged' }), 'rename'), true);
  await h.render().waitForPending();
  assert.equal(h.render().saveState, 'saved');
  assert.equal(h.render().trip.title, 'Acknowledged');
});

test('a newer recovery arriving during account ACK is preserved and blocks further editing', async () => {
  const ack = deferred<any>();
  const h = mutationHarness({ cacheCanonicalTrip: () => ack.promise });
  h.render(); await tick();
  await h.render().mutateTrip((trip: any) => ({ ...trip, title: 'Submitted' }), 'rename');
  await tick();
  const current = h.render().trip;
  h.setRecovery({ ownerId: current.ownerId, tripId: current.id, writeId: 'newer', trip: { ...current, title: 'Newer device edit' } });
  ack.resolve({ stored: false, accountAcknowledged: true, recoveryResolved: false, deviceOutcome: 'device-newer' });
  await h.render().waitForPending();
  assert.equal(h.render().historicalRecovery, true);
  assert.equal(await h.render().mutateTrip((trip: any) => ({ ...trip, title: 'Unsafe replacement' }), 'later'), false);
  assert.equal(h.written.length, 1);
});

test('the next queued account request waits for exact ACK and uses its canonical CAS revision', async () => {
  const ack = deferred<any>();
  const h = mutationHarness({ acknowledgeTripBuildSave: async (_submitted: any, _saved: any, handle: any) => handle.writeId === 'write-1' ? ack.promise : { accountAcknowledged: true, outcome: 'acknowledged', remainingRecovery: null } });
  h.render(); await tick();
  await h.render().mutateTrip((trip: any) => ({ ...trip, title: 'First' }), 'one');
  await h.render().mutateTrip((trip: any) => ({ ...trip, title: 'Second' }), 'two');
  await tick(); assert.equal(h.cloud.length, 1, 'pending ACK holds the account queue');
  ack.resolve({ accountAcknowledged: true, outcome: 'device-newer', remainingRecovery: { writeId: 'write-2' } });
  await h.render().waitForPending();
  assert.equal(h.cloud.length, 2);
  assert.equal(h.cloud[1].updatedAt, '2026-10-12T00:01:00.000Z');
  assert.equal(h.render().trip.title, 'Second');
});

test('an unconfirmed device ACK retains account authority but holds further account requests', async () => {
  const ack = deferred<any>();
  const h = mutationHarness({ acknowledgeTripBuildSave: () => ack.promise });
  h.render(); await tick();
  await h.render().mutateTrip((trip: any) => ({ ...trip, title: 'Confirmed account body' }), 'one');
  await h.render().mutateTrip((trip: any) => ({ ...trip, title: 'Later device body' }), 'two');
  await tick();
  ack.resolve({ accountAcknowledged: true, outcome: 'storage-failed', remainingRecovery: null, deviceOutcome: 'unknown' });
  await h.render().waitForPending().catch(() => undefined);
  assert.equal(h.cloud.length, 1, 'the unknown durable ACK does not admit another account request');
  assert.equal(h.render().saveState, 'error');
  assert.equal(h.render().failure, 'recovery');
});

function resolverHarness(overrides: Record<string, any> = {}) {
  const schedule = scheduler();
  let props = { tripId: 'async-shell-trip', ownerId: 'owner-a' as string | undefined, children: null };
  let search = new URLSearchParams();
  const cloud: any[] = [];
  let missing = 0;
  const Shell = () => null, Banner = () => null;
  const storage = {
    BrowserRecoveryReadError,
    loadTripRecovery: async (tripId: string, ownerId: string | null) => ({ tripId, ownerId, writeId: 'recovery', trip: { ...canonicalRouteFixture(), id: tripId, ownerId } }),
    loadTripWorkspaceDocument: async (tripId: string, ownerId: string | null) => { const recovery = await storage.loadTripRecovery(tripId, ownerId); return recovery ? { trip: recovery.trip, recovery } : null; },
    claimGuestTripRecoveryForOwner: async () => null,
    tripForRecoveryScope: (trip: any) => trip,
    saveTripToEasyT: async (trip: any) => { cloud.push(trip); return trip; },
    saveTripRecoveryToEasyT: async (trip: any) => { cloud.push(trip); return trip; },
    acknowledgeTripBuildSave: async () => ({ accountAcknowledged: true, outcome: 'acknowledged', remainingRecovery: null, cacheStored: true }),
    cacheCanonicalTrip: async () => ({ stored: true }),
    markTripRecoveryState: async () => true,
    EasyTTripAuthError: class extends Error {}, EasyTTripPromotionConflictError: class extends Error {}, EasyTTripSaveConflictError: class extends Error {},
    ...overrides,
  };
  const component = load('../components/easyt/trip-shell-resolver.tsx', {
    react: schedule.hooks,
    'next/navigation': { useSearchParams: () => search, notFound: () => { missing += 1; throw new Error('not found'); } },
    '@/lib/easyt/storage': storage,
    '@/lib/easyt/workspace-recovery-diagnostic': workspaceDiagnostic,
    '@/lib/analytics': { trackEvent: () => undefined },
    '@/lib/easyt/trip-continuity': { tripSyncRecoveryPath: () => '/recovery' },
    '@/lib/easyt/trip-workspace-links': { tripSaveSignInHref: () => '/sign-in' },
    './easyt-controls': { EasyTButton: () => null, EasyTLinkButton: () => null },
    './morrovia-feedback': { MorroviaBriefNotice: () => null, MorroviaStatusBanner: Banner },
    './morrovia-loading-states': { MorroviaSectionStatus: () => null },
    './trip-shell': { default: Shell }, './trip-shell.module.css': { default: {} },
  }).default;
  return { render: () => schedule.render(component, props), unmount: () => schedule.unmount(), search, Shell, Banner, cloud,
    setSearch: (query: string) => { search = new URLSearchParams(query); },
    setOwner: (ownerId: string | undefined) => { props = { ...props, ownerId }; }, missing: () => missing };
}
function findNode(node: any, type: any): any {
  if (!node) return null;
  if (Array.isArray(node)) return node.map(child => findNode(child, type)).find(Boolean);
  if (node.type === type) return node;
  return findNode(node.props?.children, type);
}

function enableWorkspaceDiagnostic(t: {after:(cleanup:()=>void)=>void}) {
  const env=process.env.MORROVIA_QA_PERSISTENCE_DIAGNOSTICS, descriptor=Object.getOwnPropertyDescriptor(globalThis,'window');
  process.env.MORROVIA_QA_PERSISTENCE_DIAGNOSTICS='1';
  Object.defineProperty(globalThis,'window',{configurable:true,value:{location:{origin:'https://staging.morrovia.com'}}});
  t.after(()=>{if(env===undefined)delete process.env.MORROVIA_QA_PERSISTENCE_DIAGNOSTICS;else process.env.MORROVIA_QA_PERSISTENCE_DIAGNOSTICS=env;
    if(descriptor)Object.defineProperty(globalThis,'window',descriptor);else Reflect.deleteProperty(globalThis,'window');});
}
for(const phase of ['guest-read','explicit-save','owner-workspace-read']) test(`workspace diagnostic identifies actual resolver ${phase} refusal without saving`,async t=>{
  enableWorkspaceDiagnostic(t); let attempts=0;
  const error=new ActualBrowserRecoveryReadError('protected','homepage-trip-mismatch');
  const refuse=async()=>{attempts++;throw error;};
  const h=resolverHarness({BrowserRecoveryReadError:ActualBrowserRecoveryReadError,
    ...(phase==='guest-read'?{loadTripRecovery:refuse}:phase==='explicit-save'?{saveExplicitGuestTripForOwner:refuse}:{loadTripWorkspaceDocument:refuse})});
  if(phase!=='owner-workspace-read')h.search.set('saved','1');
  h.render();await tick();const banner=findNode(h.render(),h.Banner);
  assert.equal(banner.props.title,'Device changes need review');assert.ok(banner.props.detail.endsWith(`Support code: ${phase} / homepage-trip-mismatch`));
  assert.equal(findNode(h.render(),h.Shell),null);assert.equal(h.cloud.length,0);assert.equal(h.missing(),0);assert.equal(attempts,1);
  await tick();h.render();assert.equal(attempts,1,'diagnostics must not retry automatically');
  await banner.props.actions.props.onClick();await tick();assert.equal(attempts,2,'existing user retry remains available');
});
for(const retirement of ['owner','owner-roundtrip','generation','unmount'])test(`workspace diagnostic cannot publish after ${retirement} retirement`,async t=>{
  enableWorkspaceDiagnostic(t);const read=deferred<any>();let reads=0;
  const h=resolverHarness({BrowserRecoveryReadError:ActualBrowserRecoveryReadError,loadTripWorkspaceDocument:()=>++reads===1?read.promise:Promise.reject(new ActualBrowserRecoveryReadError('protected','destination-exists'))});
  h.render();await tick();
  if(retirement==='owner')h.setOwner('owner-b');
  if(retirement==='owner-roundtrip'){h.setOwner('owner-b');h.render();await tick();h.setOwner('owner-a');}
  if(retirement==='generation')h.setSearch('day=2');
  if(retirement==='unmount')h.unmount();else {h.render();await tick();}
  read.reject(new ActualBrowserRecoveryReadError('protected','homepage-trip-mismatch'));await tick();
  const banner=findNode(h.render(),h.Banner);
  if(retirement==='unmount')assert.equal(banner,null);
  else {assert.ok(banner.props.detail.includes('destination-exists'));assert.ok(!banner.props.detail.includes('homepage-trip-mismatch'));}
  assert.equal(h.cloud.length,0);assert.equal(h.missing(),0);
});
test('workspace diagnostic is absent from the actual banner without build opt-in',async t=>{
  enableWorkspaceDiagnostic(t);process.env.MORROVIA_QA_PERSISTENCE_DIAGNOSTICS='0';
  const h=resolverHarness({BrowserRecoveryReadError:ActualBrowserRecoveryReadError,loadTripWorkspaceDocument:async()=>{throw new ActualBrowserRecoveryReadError('protected','homepage-trip-mismatch')}});
  h.render();await tick();const banner=findNode(h.render(),h.Banner);
  assert.equal(banner.props.title,'Device changes need review');
  assert.equal(banner.props.detail,'Separate device copies remain protected. Review them before continuing.');
  assert.equal(h.cloud.length,0);
});
test('workspace diagnostic never renders exception content and vanishes after successful explicit retry',async t=>{
  enableWorkspaceDiagnostic(t);let refused=true;
  const trip={...canonicalRouteFixture(),id:'async-shell-trip',ownerId:'owner-a'};
  const h=resolverHarness({BrowserRecoveryReadError:ActualBrowserRecoveryReadError,loadTripWorkspaceDocument:async()=>{
    if(refused)throw new ActualBrowserRecoveryReadError('protected','PRIVATE-ACCOUNT-CONTENT');return {trip,recovery:null};}});
  h.render();await tick();const banner=findNode(h.render(),h.Banner);assert.ok(banner.props.detail.endsWith('owner-workspace-read / other-protected'));
  assert.ok(!JSON.stringify(h.render()).includes('PRIVATE-ACCOUNT-CONTENT'));refused=false;banner.props.actions.props.onClick();await tick();
  assert.equal(findNode(h.render(),h.Banner)??null,null);assert.ok(findNode(h.render(),h.Shell));assert.equal(h.cloud.length,0);
});

function clientHarness(t: { after: (callback: () => void) => void }, storageOverrides: Record<string, any> = {}, mutationOverrides: Record<string, any> = {}) {
  const schedule = scheduler();
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', { configurable: true, value: Object.assign(new EventTarget(), { location: { pathname: '/journey/async-shell-trip', search: '', hash: '' } }) });
  t.after(() => { schedule.unmount(); if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow); else Reflect.deleteProperty(globalThis, 'window'); });
  let pathname = '/journey/async-shell-trip';
  let sessionOwner = 'owner-a';
  let props = { trip: { ...canonicalRouteFixture(), id: 'async-shell-trip', ownerId: sessionOwner }, children: null };
  let remaining: any = { ownerId: props.trip.ownerId, tripId: props.trip.id, writeId: 'reviewed', trip: { ...props.trip, title: 'Device edits' } };
  const Dialog = () => null, Form = () => null, Field = () => null, Launcher = () => null, Button = () => null;
  const mutation: any = { trip: props.trip, recoveryReady: true, currentRecoveryWrite: null, historicalRecovery: true,
    conflictTrip: null, saveState: 'idle', hasPendingSaves: () => false, isPending: () => false, adoptCanonicalTrip: async () => true,
    adoptDeviceTrip: async () => true, mutateTrip: async () => true, ...mutationOverrides };
  const storage = { BrowserRecoveryReadError, loadRememberedOwner: () => null, loadTripRecovery: async () => remaining,
    observeRememberedOwner: (publish: (owner: string | null) => void) => ({ refresh: () => publish(sessionOwner), dispose: () => undefined }),
    cacheCanonicalTrip: async () => ({ stored: true }), loadCachedTrip: async () => props.trip,
    resolveCanonicalEquivalentTripRecovery: async () => ({ recoveryResolved: false }),
    subscribeToTripStorage: () => () => undefined, tripRecoveryIsAwaitingCanonicalSave: () => false,
    classifyTripRecovery: () => 'genuine-divergence', discardTripRecovery: async () => { remaining = null; return true; }, ...storageOverrides };
  const source = readFileSync(new URL('../components/easyt/trip-shell-client.tsx', import.meta.url), 'utf8');
  const imports: Record<string, any> = {};
  for (const match of source.matchAll(/from "([^"]+)"/g)) imports[match[1]] = {};
  Object.assign(imports, {
    react: { ...schedule.hooks, createContext: () => ({ Provider: () => null }), useContext: () => mutation },
    'next/navigation': { usePathname: () => pathname, useRouter: () => ({}), useSelectedLayoutSegment: () => null },
    '@/lib/auth-client': { authClient: { useSession: () => ({ data: { user: { id: sessionOwner } }, isPending: false }) } },
    '@/lib/analytics': { trackEvent: () => undefined }, '@/lib/easyt/storage': storage,
    '@/lib/easyt/trip': { isEasyTTrip: () => true },
    '@/lib/easyt/trip-continuity': { canonicalTripRevisionCanReplace, tripConflictResolutionActions: () => ({}), journeyReauthenticationPath: () => '/sign-in' },
    '@/lib/easyt/private-browser-context': { ownerBoundaryState: () => 'current' },
    '@/lib/easyt/trip-workspace-links': { workspaceVisitKey: (path: string) => path, workspaceViewFromPathname, tripBuilderHref: () => '/builder', mapWorkspaceHref: () => '/map', tripWorkspaceHref: () => '/trip' },
    '@/lib/easyt/trip-display': tripDisplay,
    '@/lib/easyt/trip-facts': { deriveTripDateFacts: () => ({ durationDays: 2, rangeLabel: 'Dates' }) },
    '@/lib/easyt/trip-legs': { tripRouteDisplayLabel: () => 'Route' },
    '@/lib/easyt/accommodation': { overnightAccommodationStops: () => [] },
    '@/lib/easyt/personal-route': { personalRouteHref: () => '/route' },
    '@/lib/easyt/imported-trip-hydration': { importedLegacyRepairContextAllows: () => false },
    './workspace-orientation': { useWorkspaceOrientationBlocker: () => undefined, WorkspaceOrientationLauncher: Launcher },
    './easyt-controls': { EasyTButton: Button, EasyTLinkButton: () => null, EasyTField: Field },
    './morrovia-feedback': { MorroviaConfirmationDialog: Dialog, MorroviaFormDialog: Form, MorroviaSaveStatus: () => null, MorroviaStatusBanner: () => null },
    './trip-shell.module.css': { default: {} },
  });
  const client = load('../components/easyt/trip-shell-client.tsx', imports);
  return { render: () => schedule.render(client.TripShellTripProvider, props), renderIdentity: () => schedule.render(client.TripShellIdentityAndActions),
    Dialog, Form, Field, Launcher, Button, mutation, setPathname: (value: string) => { pathname = value; }, setRemaining: (value: any) => { remaining = value; },
    setOwner: (value: string) => { sessionOwner = value; props = { ...props, trip: { ...props.trip, ownerId: value } }; mutation.trip = props.trip; } };
}

test('rename dialog stays open until the scoped durable mutation is accepted', async t => {
  const saved = deferred<boolean>();
  const h = clientHarness(t, {}, { mutateTrip: () => saved.promise });
  const renameOwner = (node: any): any => !node ? null : Array.isArray(node)
    ? node.map(renameOwner).find(Boolean) : typeof node.props?.onRenameTrip === 'function'
      ? node : renameOwner(node.props?.children);
  const action = renameOwner(h.renderIdentity()); assert.ok(action, 'current workspace exposes the shared rename callback');
  action.props.onRenameTrip();
  findNode(h.renderIdentity(), h.Field).props.onChange({ target: { value: 'Accepted name' } });
  findNode(h.renderIdentity(), h.Form).props.onSubmit();
  await tick(); assert.equal(findNode(h.renderIdentity(), h.Form).props.open, true);
  saved.resolve(true); await tick();
  assert.equal(findNode(h.renderIdentity(), h.Form).props.open, false);
});

test('discard dialog remains pending until exact discard and the remaining recovery read finish', async t => {
  const discard = deferred<boolean>();
  const h = clientHarness(t, { discardTripRecovery: () => discard.promise });
  h.render(); await tick();
  // The banner uses the existing discard button to open the exact reviewed handle.
  const findDiscard = (node: any): any => {
    if (!node) return null;
    if (Array.isArray(node)) return node.map(findDiscard).find(Boolean);
    if (node.type === h.Button) return node;
    return findDiscard(node.props?.children) || findDiscard(node.props?.actions);
  };
  findDiscard(h.render()).props.onClick();
  findNode(h.render(), h.Dialog).props.onConfirm();
  await tick();
  assert.equal(findNode(h.render(), h.Dialog).props.open, true);
  assert.equal(findNode(h.render(), h.Dialog).props.confirming, true);
  h.setRemaining(null); discard.resolve(true); await tick();
  assert.equal(findNode(h.render(), h.Dialog).props.open, false);
  assert.equal(findNode(h.render(), h.Dialog).props.confirming, false);
});

test('resolver keeps hydration pending and never decides missing before device read completion', async () => {
  const read = deferred<any>();
  const h = resolverHarness({ loadTripRecovery: () => read.promise });
  assert.equal(findNode(h.render(), h.Shell), null);
  await tick(); assert.equal(h.missing(), 0); assert.equal(h.cloud.length, 0);
  read.resolve({ tripId: 'async-shell-trip', ownerId: 'owner-a', writeId: 'found', trip: { ...canonicalRouteFixture(), id: 'async-shell-trip', ownerId: 'owner-a' } });
  await tick(); assert.ok(findNode(h.render(), h.Shell)); assert.equal(h.missing(), 0);
});

test('resolver reports protected and unavailable reads without treating them as a missing trip', async () => {
  for (const reason of ['protected', 'unavailable']) {
    const h = resolverHarness({ loadTripRecovery: async () => { throw new BrowserRecoveryReadError(reason); } });
    h.render(); await tick(); const node = h.render();
    assert.equal(h.missing(), 0); assert.equal(h.cloud.length, 0);
    assert.equal(findNode(node, h.Shell), null);
    assert.equal(findNode(node, h.Banner)?.props.title, reason === 'protected' ? 'Device changes need review' : 'Device storage unavailable');
  }
});

test('resolver ignores an old-owner read and cannot promote it after the route owner changes', async () => {
  const old = deferred<any>();
  const h = resolverHarness({ loadTripRecovery: (tripId: string, ownerId: string) => ownerId === 'owner-a' ? old.promise : Promise.resolve({ tripId, ownerId, writeId: 'b', trip: { ...canonicalRouteFixture(), id: tripId, ownerId } }) });
  h.render(); h.setOwner('owner-b'); h.render(); await tick();
  old.resolve({ tripId: 'async-shell-trip', ownerId: 'owner-a', writeId: 'a', trip: { ...canonicalRouteFixture(), id: 'async-shell-trip', ownerId: 'owner-a' } });
  await tick();
  assert.equal(findNode(h.render(), h.Shell)?.props.trip.ownerId, 'owner-b');
  assert.deepEqual(h.cloud.map(trip => trip.ownerId), ['owner-b']);
});

test('resolver does not start promotion when the explicit guest save is protected', async () => {
  let attempts = 0;
  const h = resolverHarness({ saveExplicitGuestTripForOwner: async (tripId: string, ownerId: string, isCurrent: () => boolean) => {
    attempts += 1;
    assert.equal(tripId, 'async-shell-trip'); assert.equal(ownerId, 'owner-a'); assert.equal(isCurrent(), true);
    throw new BrowserRecoveryReadError('protected');
  } });
  h.search.set('saved', '1'); h.render(); await tick();
  assert.equal(attempts, 1, 'the current guarded explicit-save boundary must actually run');
  assert.equal(findNode(h.render(), h.Banner)?.props.title, 'Device changes need review');
  assert.equal(h.cloud.length, 0); assert.equal(h.missing(), 0);
});

test('resolver retains account Saved truth after optional cache refusal and keeps protected device work visible', async () => {
  const h = resolverHarness({ acknowledgeTripBuildSave: async () => ({ accountAcknowledged: true, outcome: 'storage-failed', cacheStored: false, deviceOutcome: 'protected-conflict', remainingRecovery: null }) });
  h.render(); await tick();
  const node = h.render();
  assert.equal(findNode(node, h.Banner)?.props.title, 'Saved to your account');
  assert.equal(findNode(node, h.Shell)?.props.cacheTrip, true);
});


test('acknowledged account document remains available after explicit save and ordinary navigation', async () => {
  const trip = { ...canonicalRouteFixture(), id: 'async-shell-trip', ownerId: 'owner-a' };
  let promotions = 0;
  const reads: Array<string | null> = [];
  const h = resolverHarness({
    loadTripRecovery: async (_id: string, owner: string | null) => { reads.push(owner); return owner === null ? { trip: { ...trip, ownerId: null } } : null; },
    loadTripWorkspaceDocument: async (id: string, owner: string | null) => { assert.equal(id, trip.id); assert.equal(owner, trip.ownerId); return { trip, recovery: null }; },
    saveExplicitGuestTripForOwner: async () => { promotions++; return { trip, accountAcknowledged: true, deviceComplete: true }; },
  });
  h.search.set('saved', '1'); h.render(); await tick();
  assert.equal(findNode(h.render(), h.Banner)?.props.title, 'Saved to your account');
  for (const query of ['', 'stop=owned-stop', 'day=2', 'leg=owned-leg', 'mode=plan&returnTo=%2Fjourney%2Fasync-shell-trip']) {
    h.setSearch(query); h.render(); await tick();
    assert.equal(findNode(h.render(), h.Shell)?.props.trip, trip);
    assert.equal(h.missing(), 0);
  }
  assert.equal(promotions, 1, 'ordinary navigation never repeats guest promotion');
  assert.deepEqual(reads.filter(owner => owner === null), [null]);
  assert.equal(h.cloud.length, 0, 'acknowledged document reads do not queue account writes');
});

test('fresh resolver reopen renders an owner-scoped acknowledged document without saving it again', async () => {
  const trip = { ...canonicalRouteFixture(), id: 'async-shell-trip', ownerId: 'owner-a' };
  const h = resolverHarness({ loadTripRecovery: async () => null, loadTripWorkspaceDocument: async () => ({ trip, recovery: null }) });
  h.render(); await tick(); assert.equal(findNode(h.render(), h.Shell)?.props.trip, trip);
  assert.equal(h.missing(), 0); assert.equal(h.cloud.length, 0);
});


test('account ACK without device continuation survives navigation with its incomplete warning', async () => {
  const trip = { ...canonicalRouteFixture(), id: 'async-shell-trip', ownerId: 'owner-a' };
  const h = resolverHarness({loadTripRecovery: async () => ({trip: {...trip, ownerId: null}}), loadTripWorkspaceDocument: async () => null,
    saveExplicitGuestTripForOwner: async () => ({trip, accountAcknowledged: true, deviceComplete: false})});
  h.search.set('saved', '1'); h.render(); await tick(); assert.ok(findNode(h.render(), h.Shell));
  h.setSearch('stop=owned-stop'); h.render(); await tick();
  const node = h.render(); assert.equal(findNode(node, h.Shell)?.props.trip, trip); assert.equal(h.missing(), 0);
  const banners = (function collect(n:any):any[]{return !n?[]:Array.isArray(n)?n.flatMap(collect):[...(n.type===h.Banner?[n]:[]),...collect(n.props?.children)]})(node);
  assert.ok(banners.some(n=>n.props.title==='Device save incomplete'));
  h.setOwner('owner-b'); h.render(); await tick(); assert.throws(()=>h.render(), /not found/);
  h.setOwner('owner-a'); h.render(); await tick(); assert.throws(()=>h.render(), /not found/, 'A→B→A retires earlier in-memory ACK');
});


for (const kind of ['protected', 'unavailable']) test(`acknowledged result cannot bypass a ${kind} document read`, async () => {
  const trip = { ...canonicalRouteFixture(), id: 'async-shell-trip', ownerId: 'owner-a' };
  const h = resolverHarness({loadTripRecovery: async () => ({trip: {...trip, ownerId: null}}), loadTripWorkspaceDocument: async () => {throw new BrowserRecoveryReadError(kind)},
    saveExplicitGuestTripForOwner: async () => ({trip, accountAcknowledged:true,deviceComplete:false})});
  h.search.set('saved','1'); h.render(); await tick(); assert.ok(findNode(h.render(),h.Shell));
  h.setSearch('');h.render();await tick();const node=h.render();
  assert.equal(findNode(node,h.Shell),null);assert.equal(h.missing(),0);
  assert.equal(findNode(node,h.Banner)?.props.title,kind==='protected'?'Device changes need review':'Device storage unavailable');
});

test('one document observation keeps a current pending recovery on its existing save path', async () => {
  const trip = {...canonicalRouteFixture(),id:'async-shell-trip',ownerId:'owner-a'};
  const recovery = {trip,tripId:trip.id,ownerId:trip.ownerId,writeId:'new-pending'};
  let reads=0;
  const h = resolverHarness({loadTripRecovery:async()=>assert.fail('ordinary document read must not split into a separate recovery observation'),
    loadTripWorkspaceDocument: async()=>{reads++;return {trip,recovery}}});
  h.render();await tick();assert.equal(findNode(h.render(),h.Shell)?.props.trip,trip);
  assert.equal(reads,1);assert.deepEqual(h.cloud,[trip]);assert.equal(h.missing(),0);
});

test('late acknowledged-document read cannot cross an owner transition', async () => {
  const read=deferred<any>();const ownerB={...canonicalRouteFixture(),id:'async-shell-trip',ownerId:'owner-b'};
  const h=resolverHarness({loadTripWorkspaceDocument:(_id:string,owner:string)=>owner==='owner-a'?read.promise:Promise.resolve({trip:ownerB,recovery:null})});
  h.render();h.setOwner('owner-b');h.render();await tick();
  read.resolve({trip:{...ownerB,ownerId:'owner-a'},recovery:null});await tick();
  assert.equal(findNode(h.render(),h.Shell)?.props.trip,ownerB);assert.equal(h.cloud.length,0);
});


test('incomplete account continuation retries only after the explicit retry action on an ordinary tab', async()=>{
 const trip={...canonicalRouteFixture(),id:'async-shell-trip',ownerId:'owner-a'};let retries=0;
 const h=resolverHarness({loadTripRecovery:async()=>({trip:{...trip,ownerId:null}}),loadTripWorkspaceDocument:async()=>null,
 saveExplicitGuestTripForOwner:async()=>({trip,accountAcknowledged:true,deviceComplete:++retries>1})});
 h.search.set('saved','1');h.render();await tick();h.setSearch('stop=stop');h.render();await tick();assert.equal(retries,1);
 const banner=(function find(n:any):any{return !n?null:Array.isArray(n)?n.map(find).find(Boolean):n.type===h.Banner&&n.props.title==='Device save incomplete'?n:find(n.props?.children)})(h.render());
 banner.props.actions.props.onClick();await tick();assert.equal(retries,2);assert.ok(findNode(h.render(),h.Shell));assert.equal(h.cloud.length,0);
});

test('a current pending document retires an incomplete earlier ACK before later missing reads',async()=>{
 const trip={...canonicalRouteFixture(),id:'async-shell-trip',ownerId:'owner-a'};let document:any=null;
 const h=resolverHarness({loadTripRecovery:async()=>({trip:{...trip,ownerId:null}}),loadTripWorkspaceDocument:async()=>document,
 saveExplicitGuestTripForOwner:async()=>({trip,accountAcknowledged:true,deviceComplete:false})});
 h.search.set('saved','1');h.render();await tick();
 const newer={...trip,title:'Current device edit'};document={trip:newer,recovery:{trip:newer,ownerId:'owner-a',tripId:trip.id,writeId:'current'}};
 h.setSearch('day=2');h.render();await tick();assert.equal(findNode(h.render(),h.Shell)?.props.trip.title,'Current device edit');
 document=null;h.setSearch('day=3');h.render();await tick();assert.throws(()=>h.render(),/not found/);
});

test('account-owned workspace recovery retries through the owner-pinned exact-conflict acknowledgement path',async()=>{
  let direct=0,recoveryCalls=0,acks=0;
  const h=resolverHarness({saveTripToEasyT:async()=>{direct++;throw Error('Unqualified retry must not run');},
    saveTripRecoveryToEasyT:async(trip:any,handle:any)=>{recoveryCalls++;assert.equal(handle.ownerId,'owner-a');assert.equal(handle.tripId,trip.id);assert.equal(handle.writeId,'recovery');return trip;},
    acknowledgeTripBuildSave:async()=>{acks++;return {accountAcknowledged:true,outcome:'acknowledged',remainingRecovery:null};}});
  h.render();await tick();const view=h.render();
  assert.equal(direct,0);assert.equal(recoveryCalls,1);assert.equal(acks,1);assert.equal(findNode(view,h.Banner)?.props.title,'Saved to your account');assert.ok(findNode(view,h.Shell));
});

test('workspace qualified retry still protects a genuinely different account conflict',async()=>{
  class DifferentAccountConflict extends Error {reason='cloud-changed';canonicalTrip={...canonicalRouteFixture(),id:'async-shell-trip',ownerId:'owner-a',title:'Different account work'};}
  const marked:string[]=[];let acks=0;
  const h=resolverHarness({EasyTTripSaveConflictError:DifferentAccountConflict,
    saveTripRecoveryToEasyT:async()=>{throw new DifferentAccountConflict();},
    markTripRecoveryState:async(_handle:any,state:string)=>{marked.push(state);return true;},
    acknowledgeTripBuildSave:async()=>{acks++;return {accountAcknowledged:true,outcome:'acknowledged'};}});
  h.render();await tick();const view=h.render();
  assert.equal(acks,0);assert.deepEqual(marked,['conflict']);assert.equal(findNode(view,h.Banner)?.props.title,'Cloud copy kept safe');assert.equal(findNode(view,h.Shell)?.props.trip.title,'Different account work');
});

for (const identity of [
  { label: 'explicit automatic', title: 'Stored generated city names', customTitle: null, expected: 'Japan' },
  { label: 'legacy automatic', title: 'London to Tokyo & Kyoto & Hiroshima', expected: 'Japan' },
  { label: 'custom Unicode', title: 'Previous stored name', customTitle: '春の旅 — Japan', expected: '春の旅 — Japan' },
  { label: 'unknown legacy', title: 'Our anniversary by rail', expected: 'Our anniversary by rail' },
]) test(`shared header retains ${identity.label} identity across every workspace tab without writing`, t => {
  let writes = 0;
  const h = clientHarness(t, {}, { mutateTrip: async () => { writes++; return true; } });
  h.mutation.trip.title = identity.title;
  delete h.mutation.trip.brief.customTitle;
  if ('customTitle' in identity) h.mutation.trip.brief.customTitle = identity.customTitle;
  const before = structuredClone(h.mutation.trip);
  const text = (node: any): string => node == null ? '' : typeof node === 'string' ? node
    : Array.isArray(node) ? node.map(text).join('') : text(node.props?.children);
  for (const tab of ['', '/itinerary', '/map', '/calendar', '/explore', '/stay', '/transport']) {
    h.setPathname(`/journey/async-shell-trip${tab}`);
    const button = findNode(h.renderIdentity(), h.Button);
    assert.ok(button, `title disclosure exists on ${tab || '/overview'}`);
    assert.equal(text(button), identity.expected, `same display identity on ${tab || '/overview'}`);
  }
  assert.deepEqual(h.mutation.trip, before, 'presentation cannot rewrite stored identity or content');
  assert.equal(writes, 0);
});
