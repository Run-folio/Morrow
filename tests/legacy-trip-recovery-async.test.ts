import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { Script } from 'node:vm';
import test from 'node:test';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const settle = () => new Promise<void>((resolve) => setImmediate(resolve));
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

type Node = { type?: unknown; props?: Record<string, any> };
function nodes(value: any): Node[] {
  if (Array.isArray(value)) return value.flatMap(nodes);
  if (!value || typeof value !== 'object') return [];
  return [value, ...nodes(value.props?.children)];
}

/** Execute production effects with synthetic hooks and storage, without a browser or network. */
function componentHarness(file: string, storageOverrides: Record<string, any> = {}) {
  const slots: any[] = [];
  let cursor = 0;
  let effects: (() => void)[] = [];
  let props: Record<string, unknown> = {};
  let sessionOwner: string | null = 'owner-a';
  let tree: any;
  let notFoundCalls = 0;
  const listeners = new Set<() => void>();
  const react = {
    useState(initial: any) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial;
      return [slots[index], (next: any) => { slots[index] = typeof next === 'function' ? next(slots[index]) : next; }];
    },
    useRef(initial: any) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = { current: initial };
      return slots[index];
    },
    useEffect(effect: () => (() => void) | undefined, dependencies: unknown[]) {
      const index = cursor++;
      const previous = slots[index];
      if (previous && dependencies?.length === previous.dependencies?.length
        && dependencies.every((value, key) => Object.is(value, previous.dependencies[key]))) return;
      effects.push(() => {
        previous?.cleanup?.();
        slots[index] = { dependencies, cleanup: effect() };
      });
    },
    useMemo: (factory: () => unknown) => factory(),
    useCallback: (callback: unknown) => callback,
  };
  const storage = {
    canUseHydratedTripScope: (hydrated: string | null | undefined, owner: string | null) => hydrated !== undefined && hydrated === owner,
    loadRememberedOwner: () => null,
    loadActiveTrip: async () => null,
    loadLocalTrip: async () => null,
    loadTripRecovery: async () => null,
    loadTripFromEasyT: async () => null,
    subscribeToTripStorage: (_owner: string | null, _id: string, listener: () => void) => {
      listeners.add(listener); return () => listeners.delete(listener);
    },
    cacheCanonicalTrip: async () => ({ stored: true }),
    markTripRecoveryState: async () => true,
    deferNewTripNavigation: () => undefined,
    EASYT_BEFORE_NEW_TRIP_EVENT: 'before-new-trip',
    EasyTTripAuthError: class extends Error {},
    EasyTTripPromotionConflictError: class extends Error {},
    EasyTTripSaveConflictError: class extends Error {},
    ...storageOverrides,
  };
  const generic = new Proxy({ __esModule: true, default: 'stub' }, { get: (target, name) => name in target ? target[name as keyof typeof target] : String(name) });
  const modules: Record<string, any> = {
    react,
    'react/jsx-runtime': { jsx: (type: unknown, attributes: any) => ({ type, props: attributes }), jsxs: (type: unknown, attributes: any) => ({ type, props: attributes }), Fragment: 'Fragment' },
    'next/navigation': { useSearchParams: () => new URLSearchParams(), notFound: () => { notFoundCalls += 1; throw new Error('NOT_FOUND'); } },
    '@/lib/auth-client': { authClient: { useSession: () => ({ data: sessionOwner ? { user: { id: sessionOwner } } : null, isPending: false }) } },
    '@/lib/easyt/storage': storage,
    '@/lib/easyt/personal-route': { personalRoutePresentation: (trip: any) => ({ id: trip.id }), personalRouteHref: (id: string) => `/journey/my-routes/${id}` },
    '@/lib/easyt/trip-id-resolution': { requestedTripMatch: (_id: string, trip: any) => trip },
    '@/lib/easyt/trip-display': { tripDisplayTitle: (trip: any) => trip.title },
    '@/lib/easyt/trip-lifecycle': { isoDateKey: () => '2026-10-12', formatIsoDate: () => 'Date', tripLifecycle: () => ({ state: 'upcoming', daysUntilStart: 2 }) },
    '@/lib/easyt/trip-workspace-links': { mapWorkspaceHref: () => '/journey/plan' },
    '@/lib/easyt/trip-continuity': { tripEditorSyncAction: () => 'retry', tripSyncSignInPath: () => '/sign-in', tripSyncRecoveryPath: () => '/recovery' },
    '@/lib/easyt/trip-persistence-error': { isTripPersistenceAuthenticationError: () => false, tripRecoveryStateForPersistenceError: () => 'network' },
    '@/lib/easyt/review': { tripHealth: () => ({ issues: [] }) },
  };
  const module = { exports: {} as any };
  const source = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  new Script(source, { filename: file }).runInNewContext({
    module, exports: module.exports,
    require: (name: string) => modules[name] ?? generic,
    window: new EventTarget(), URLSearchParams, Date, Intl, Promise, structuredClone,
    fetch: () => { throw new Error('Unexpected network request'); },
  });
  const render = () => {
    cursor = 0; effects = [];
    tree = module.exports.default(props);
    const currentEffects = effects; effects = [];
    currentEffects.forEach((effect) => effect());
    return tree;
  };
  return {
    render,
    text: () => JSON.stringify(tree),
    nodes: () => nodes(tree),
    setProps: (value: Record<string, unknown>) => { props = value; },
    owner: (value: string | null) => { sessionOwner = value; },
    changeSource: () => listeners.forEach((listener) => listener()),
    unmount: () => slots.forEach((slot) => slot?.cleanup?.()),
    notFoundCalls: () => notFoundCalls,
  };
}

const deviceFile = 'app/journey/my-routes/[tripId]/personal-route-access.tsx';
const mapFile = 'app/journey/plan-next/map-plan-next.tsx';
const modeFile = 'app/journey/trip/trip-mode-client.tsx';
const trip = { id: 'trip-a', ownerId: 'owner-a', title: 'Synthetic trip', startDate: '2026-10-14', endDate: '2026-10-20', travellers: 2, stops: [], legs: [], planItems: [], brief: { bookings: [], checklist: [] } };

test('private device route keeps pending and unknown recovery separate from not-found', async () => {
  const read = deferred<any>();
  const harness = componentHarness(deviceFile, { loadTripRecovery: () => read.promise });
  harness.setProps({ tripId: trip.id, ownerId: trip.ownerId, navigation: null });
  harness.render();
  assert.match(harness.text(), /Opening your journey/);
  assert.equal(harness.notFoundCalls(), 0);
  read.reject(new Error('protected device data'));
  await settle(); harness.render();
  assert.match(harness.text(), /Device copy could not be opened/);
  assert.equal(harness.notFoundCalls(), 0);
});

test('only a confirmed absent private route produces not-found', async () => {
  const harness = componentHarness(deviceFile);
  harness.setProps({ tripId: trip.id, ownerId: trip.ownerId, navigation: null });
  harness.render(); await settle();
  assert.throws(() => harness.render(), /NOT_FOUND/);
  assert.equal(harness.notFoundCalls(), 1);
});

test('private device route rejects a late owner result and a superseded source result', async () => {
  const old = deferred<any>(), newer = deferred<any>(), latest = deferred<any>();
  let reads = 0;
  const harness = componentHarness(deviceFile, { loadTripRecovery: () => [old, newer, latest][reads++]!.promise });
  harness.setProps({ tripId: 'trip-old', ownerId: 'owner-a' }); harness.render();
  harness.setProps({ tripId: 'trip-new', ownerId: 'owner-b' }); harness.render();
  old.resolve({ trip: { id: 'trip-old' } }); await settle(); harness.render();
  assert.doesNotMatch(harness.text(), /Private device copy/);
  harness.changeSource();
  newer.resolve({ trip: { id: 'superseded' } }); await settle(); harness.render();
  assert.doesNotMatch(harness.text(), /superseded/);
  latest.resolve({ trip: { id: 'trip-new' } }); await settle(); harness.render();
  assert.match(harness.text(), /Private device copy/);
  assert.match(harness.text(), /trip-new/);
});

for (const file of [mapFile, modeFile]) {
  test(`${file} does not expose an empty/fresh view while storage is pending or unavailable`, async () => {
    const read = deferred<any>();
    const harness = componentHarness(file, { loadActiveTrip: () => read.promise });
    harness.render();
    assert.match(harness.text(), /Loading your map plan|Opening your trip/);
    assert.doesNotMatch(harness.text(), /Open a trip first|Your trip will live here/);
    read.reject(new Error('unavailable'));
    await settle(); harness.render();
    assert.match(harness.text(), /device copy could not be checked/);
    assert.doesNotMatch(harness.text(), /Open a trip first|Your trip will live here/);
  });
}

test('Trip Mode awaits device durability before accepting a booking or clearing its form', async () => {
  const localSave = deferred<any>();
  let savedOutgoing: any;
  const harness = componentHarness(modeFile, {
    loadActiveTrip: async () => structuredClone(trip),
    saveTripRecovery: () => localSave.promise,
    saveTripRecoveryToEasyT: async (outgoing: any) => { savedOutgoing = outgoing; return { ...outgoing, updatedAt: 'canonical' }; },
    acknowledgeTripBuildSave: async () => ({ accountAcknowledged: true, cacheStored: false, outcome: 'acknowledged', deviceOutcome: 'native-write-failed' }),
  });
  harness.render(); await settle(); harness.render();
  harness.nodes().find((node) => node.type === 'button' && JSON.stringify(node.props?.children).includes('Bookings'))!.props!.onClick();
  harness.render();
  harness.nodes().find((node) => node.type === 'input' && node.props?.['aria-label'] === 'Booking name')!.props!.onChange({ target: { value: 'Synthetic booking' } });
  harness.render();
  harness.nodes().find((node) => node.type === 'form')!.props!.onSubmit({ preventDefault() {} });
  harness.render();
  assert.equal(harness.nodes().some((node) => node.type === 'strong' && node.props?.children === 'Synthetic booking'), false);
  assert.equal(harness.nodes().find((node) => node.type === 'input' && node.props?.['aria-label'] === 'Booking name')!.props!.value, 'Synthetic booking');
  localSave.resolve({ stored: true, blockedByExistingRecovery: false, handle: { ownerId: 'owner-a', tripId: trip.id, writeId: 'write-a' } });
  await settle(); harness.render();
  assert.equal(savedOutgoing.brief.bookings[0].title, 'Synthetic booking');
  assert.equal(harness.nodes().some((node) => node.type === 'strong' && node.props?.children === 'Synthetic booking'), true);
  assert.equal(harness.nodes().find((node) => node.type === 'input' && node.props?.['aria-label'] === 'Booking name')!.props!.value, '');
  assert.match(harness.text(), /Saved to your account.*device copy could not be updated/);
});


test('Trip Mode refused durability keeps the existing booking list and authored form input', async () => {
  const localSave = deferred<any>();
  let cloudSaves = 0;
  const harness = componentHarness(modeFile, {
    loadActiveTrip: async () => structuredClone(trip),
    saveTripRecovery: () => localSave.promise,
    saveTripRecoveryToEasyT: async () => { cloudSaves += 1; throw new Error('Unexpected cloud save'); },
  });
  harness.render(); await settle(); harness.render();
  harness.nodes().find((node) => node.type === 'button' && JSON.stringify(node.props?.children).includes('Bookings'))!.props!.onClick();
  harness.render();
  harness.nodes().find((node) => node.type === 'input' && node.props?.['aria-label'] === 'Booking name')!.props!.onChange({ target: { value: 'Preserved input' } });
  harness.render();
  harness.nodes().find((node) => node.type === 'form')!.props!.onSubmit({ preventDefault() {} });
  localSave.resolve({ stored: false, blockedByExistingRecovery: true, handle: { ownerId: 'owner-a', tripId: trip.id, writeId: 'blocked' } });
  await settle(); harness.render();
  assert.equal(cloudSaves, 0);
  assert.equal(harness.nodes().some((node) => node.type === 'strong' && node.props?.children === 'Preserved input'), false);
  assert.equal(harness.nodes().find((node) => node.type === 'input' && node.props?.['aria-label'] === 'Booking name')!.props!.value, 'Preserved input');
  assert.match(harness.text(), /different device recovery already exists/);
});

test('unmounted private device resolver cannot accept a delayed recovery', async () => {
  const read = deferred<any>();
  const harness = componentHarness(deviceFile, { loadTripRecovery: () => read.promise });
  harness.setProps({ tripId: trip.id, ownerId: trip.ownerId });
  harness.render(); harness.unmount();
  read.resolve({ trip }); await settle();
  assert.match(JSON.stringify(harness.render()), /Opening your journey/);
  assert.equal(harness.notFoundCalls(), 0);
});
