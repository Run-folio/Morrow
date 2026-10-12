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
function componentHarness(file: string, storageOverrides: Record<string, any> = {}, moduleOverrides: Record<string, any> = {}, request?: (url: string) => Promise<any>) {
  const slots: any[] = [];
  let cursor = 0;
  let effects: (() => void)[] = [];
  let props: Record<string, unknown> = {};
  let sessionOwner: string | null = 'owner-a';
  let tree: any;
  let notFoundCalls = 0;
  const listeners = new Set<() => void>();
  const navigations: string[] = [];
  const window = Object.assign(new EventTarget(), { location: { assign: (href: string) => navigations.push(href) } });
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
    BrowserRecoveryReadError: class extends Error {},
    EasyTTripAuthError: class extends Error {},
    EasyTTripPromotionConflictError: class extends Error {},
    EasyTTripSaveConflictError: class extends Error {},
    ...storageOverrides,
  };
  const generic = new Proxy({ __esModule: true, default: 'stub' }, { get: (target, name) => name in target ? target[name as keyof typeof target] : String(name) });
  const modules: Record<string, any> = {
    react,
    'react/jsx-runtime': { jsx: (type: unknown, attributes: any) => ({ type, props: attributes }), jsxs: (type: unknown, attributes: any) => ({ type, props: attributes }), Fragment: 'Fragment' },
    'next/navigation': { useRouter: () => ({ refresh() {} }), useSearchParams: () => new URLSearchParams(), notFound: () => { notFoundCalls += 1; throw new Error('NOT_FOUND'); } },
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
    ...moduleOverrides,
  };
  const module = { exports: {} as any };
  const source = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  new Script(source, { filename: file }).runInNewContext({
    module, exports: module.exports,
    require: (name: string) => modules[name] ?? generic,
    window, URLSearchParams, Date, Intl, Promise, structuredClone, crypto: { randomUUID: () => "synthetic-import-id" },
    fetch: request ?? (() => { throw new Error('Unexpected network request'); }),
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
    changeSource: () => { listeners.forEach((listener) => listener()); window.dispatchEvent(new Event("easyt-trip-storage-change")); },
    navigations: () => [...navigations],
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


const dashboardFile = 'app/journey/dashboard/dashboard-client.tsx';
const dashboardModules = {
  '@/lib/easyt/private-browser-context': { ownerBoundaryState: () => 'current' },
  '@/lib/easyt/i18n': { languageFromStorage: () => 'en', easytCopy: { en: { dashboard: {} } } },
  '@/lib/easyt/trip-status': { dashboardHeroTrip: () => null },
  '@/lib/easyt/dashboard-library': { dashboardLibraryTrips: () => [] },
  '@/components/easyt/use-dashboard-trip-photos': { useDashboardTripPhotos: () => ({ photos: new Map(), markFailed() {} }) },
  '@/lib/easyt/stamps': { summarizeStampRows: () => ({ visited: 0, want: 0 }) },
  '@/lib/easyt/route-images': { routeDestinationPhoto: () => null },
};

test('Dashboard pending and unavailable device discovery do not invite creating a fresh trip', async () => {
  const read = deferred<any>();
  const harness = componentHarness(dashboardFile, {
    listTripRecoveries: () => read.promise,
    EASYT_TRIP_STORAGE_CHANGE_EVENT: 'easyt-trip-storage-change',
  }, dashboardModules);
  harness.setProps({ trips: [], stamps: [], ownerId: 'owner-a' }); harness.render();
  assert.match(harness.text(), /Checking for a saved trip/);
  assert.doesNotMatch(harness.text(), /Plan a trip|Start another trip/);
  read.reject(new Error('Storage unavailable')); await settle(); harness.render();
  assert.match(harness.text(), /Device copies could not be checked/);
  assert.doesNotMatch(harness.text(), /Plan a trip|Start another trip/);
});

test('Dashboard accepts only the latest owner/source discovery result', async () => {
  const first = deferred<any>(), changedOwner = deferred<any>(), latestSource = deferred<any>();
  let reads = 0;
  const harness = componentHarness(dashboardFile, {
    listTripRecoveries: () => [first, changedOwner, latestSource][reads++]!.promise,
    EASYT_TRIP_STORAGE_CHANGE_EVENT: 'easyt-trip-storage-change',
    tripRecoveryIsAwaitingCanonicalSave: () => false,
  }, dashboardModules);
  harness.setProps({ trips: [], stamps: [], ownerId: 'owner-a' }); harness.render();
  harness.owner('owner-b'); harness.setProps({ trips: [], stamps: [], ownerId: 'owner-b' }); harness.render();
  first.resolve([{ tripId: 'old', trip: { title: 'Old private trip' } }]); await settle(); harness.render();
  assert.doesNotMatch(harness.text(), /Old private trip/);
  harness.changeSource();
  changedOwner.resolve([{ tripId: 'stale', trip: { title: 'Stale device trip' } }]); await settle(); harness.render();
  assert.doesNotMatch(harness.text(), /Stale device trip/);
  latestSource.resolve([]); await settle(); harness.render();
  assert.match(harness.text(), /Plan a trip/);
});

const importFile = 'app/journey/new/import/spreadsheet-import-client.tsx';
const importProposal = { sourceName: 'Synthetic table', canConfirmStructure: true, origin: 'London', stops: [{ id: 'stop-a', name: 'Tokyo', country: 'Japan' }] };
const importModules = {
  '@/lib/easyt/spreadsheet-import': {
    buildSpreadsheetImportProposal: () => importProposal,
    parseDelimitedText: () => ({ name: 'Synthetic table', headers: ['Destination'], rows: [['Tokyo']] }),
    spreadsheetColumnMappings: () => [],
    canonicalTripFromSpreadsheetProposal: ({ id }: { id: string }) => ({ ...structuredClone(trip), id, ownerId: null }),
    SPREADSHEET_IMPORT_LIMITS: { fileBytes: 1000 },
  },
  '@/lib/easyt/spreadsheet-import-submission': { pendingSpreadsheetImportForRetry: (pending: any) => pending },
  '@/lib/easyt/trip-workspace-links': { firstTripWorkspaceHref: (id: string) => `/journey/${id}?created=1` },
};
const syntheticPlaceRequest = async (url: string) => ({ ok: true, json: async () => ({ result: { name: new URL(url, 'https://synthetic.invalid').searchParams.get('place'), country: 'Synthetic', coordinates: [1, 2] } }) });
async function prepareImport(harness: ReturnType<typeof componentHarness>) {
  harness.render();
  harness.nodes().find((node) => node.type === 'EasyTSegmentedControl')!.props!.onChange('paste'); harness.render();
  harness.nodes().find((node) => node.type === 'EasyTTextArea')!.props!.onChange({ target: { value: 'Synthetic table' } }); harness.render();
  harness.nodes().find((node) => node.type === 'EasyTButton' && node.props?.children === 'Review pasted table')!.props!.onClick();
  harness.render(); await settle(); harness.render(); await settle(); harness.render();
  assert.equal(harness.nodes().find((node) => node.type === 'SpreadsheetImportReview')!.props!.canConfirm, true);
}

test('spreadsheet import waits for device durability and exact ACK, preserving account success with a failed cache', async () => {
  const local = deferred<any>(), account = deferred<any>(), ack = deferred<any>();
  let outgoing: any, acknowledgedOutgoing: any, creates = 0;
  const sentDocument = () => outgoing;
  const harness = componentHarness(importFile, {
    saveTripRecovery: (_trip: any, options: any) => { creates += 1; assert.equal(options.newTripOrClone, true); return local.promise; },
    saveTripRecoveryToEasyT: (body: any) => { outgoing = body; return account.promise; },
    acknowledgeTripBuildSave: (body: any) => { acknowledgedOutgoing = body; return ack.promise; },
  }, importModules, syntheticPlaceRequest);
  await prepareImport(harness);
  harness.nodes().find((node) => node.type === 'SpreadsheetImportReview')!.props!.onConfirm();
  await settle();
  assert.equal(outgoing, undefined);
  assert.deepEqual(harness.navigations(), []);
  local.resolve({ stored: true, pointerAcknowledged: true, blockedByExistingRecovery: false, handle: { ownerId: 'owner-a', tripId: 'trip-synthetic-import-id', writeId: 'write-a' } });
  await settle();
  const submitted = sentDocument();
  assert.ok(submitted);
  assert.equal(submitted.id, 'trip-synthetic-import-id');
  account.resolve({ ...submitted, ownerId: 'owner-a' }); await settle();
  assert.deepEqual(acknowledgedOutgoing, submitted);
  assert.deepEqual(harness.navigations(), []);
  ack.resolve({ accountAcknowledged: true, outcome: 'storage-failed', cacheStored: false, deviceOutcome: 'native-write-failed' });
  await settle(); harness.render();
  assert.match(harness.text(), /Saved to your account/);
  assert.doesNotMatch(harness.text(), /The trip was not created/);
  assert.equal(harness.nodes().find((node) => node.type === 'SpreadsheetImportReview')!.props!.canConfirm, false);
  assert.equal(creates, 1);
  assert.deepEqual(harness.navigations(), []);
});

test('spreadsheet import cannot navigate after its owner changes during device save', async () => {
  const local = deferred<any>();
  let guard!: () => boolean;
  let accountSaves = 0;
  const harness = componentHarness(importFile, {
    saveTripRecovery: (_trip: any, options: any) => { guard = options.isCurrent; return local.promise; },
    saveTripRecoveryToEasyT: async () => { accountSaves += 1; throw new Error('Unexpected account write'); },
  }, importModules, syntheticPlaceRequest);
  await prepareImport(harness);
  harness.nodes().find((node) => node.type === 'SpreadsheetImportReview')!.props!.onConfirm(); await settle();
  assert.equal(guard(), true);
  harness.owner('owner-b'); harness.render();
  assert.equal(guard(), false);
  local.resolve({ stored: true, pointerAcknowledged: true, handle: { ownerId: 'owner-a', tripId: 'trip-synthetic-import-id', writeId: 'write-a' } });
  await settle(); harness.render();
  assert.equal(accountSaves, 0);
  assert.deepEqual(harness.navigations(), []);
});


test('an unavailable retry read cannot create a second spreadsheet import', async () => {
  let creates = 0, sends = 0, reads = 0;
  const harness = componentHarness(importFile, {
    saveTripRecovery: async (value: any) => { creates += 1; return { stored: true, pointerAcknowledged: true, handle: { ownerId: 'owner-a', tripId: value.id, writeId: 'write-a' } }; },
    saveTripRecoveryToEasyT: async () => { sends += 1; throw new Error('Synthetic account failure'); },
    loadTripRecovery: async () => { reads += 1; throw new Error('Synthetic unavailable storage'); },
  }, importModules, syntheticPlaceRequest);
  await prepareImport(harness);
  harness.nodes().find((node) => node.type === 'SpreadsheetImportReview')!.props!.onConfirm(); await settle(); harness.render();
  assert.equal(creates, 1); assert.equal(sends, 1);
  harness.nodes().find((node) => node.type === 'SpreadsheetImportReview')!.props!.onConfirm(); await settle(); harness.render();
  assert.equal(reads, 1); assert.equal(creates, 1); assert.equal(sends, 1);
  assert.deepEqual(harness.navigations(), []);
});

test('spreadsheet import navigates only after exact account acknowledgement succeeds', async () => {
  const ack = deferred<any>();
  const harness = componentHarness(importFile, {
    saveTripRecovery: async (value: any) => ({ stored: true, pointerAcknowledged: true, handle: { ownerId: 'owner-a', tripId: value.id, writeId: 'write-a' } }),
    saveTripRecoveryToEasyT: async (body: any) => ({ ...body, ownerId: 'owner-a' }),
    acknowledgeTripBuildSave: () => ack.promise,
  }, importModules, syntheticPlaceRequest);
  await prepareImport(harness);
  harness.nodes().find((node) => node.type === 'SpreadsheetImportReview')!.props!.onConfirm(); await settle();
  assert.deepEqual(harness.navigations(), []);
  ack.resolve({ accountAcknowledged: true, outcome: 'acknowledged', cacheStored: true, deviceOutcome: 'account-acknowledged' });
  await settle();
  assert.deepEqual(harness.navigations(), ['/journey/trip-synthetic-import-id?created=1']);
});

function importReview(harness: ReturnType<typeof componentHarness>) {
  return harness.nodes().find((node) => node.type === 'SpreadsheetImportReview')!.props!;
}
function deferredCsv(harness: ReturnType<typeof componentHarness>, content: ReturnType<typeof deferred<string>>) {
  const input = harness.nodes().find((node) => node.type === 'input' && node.props?.type === 'file')!;
  const event = { target: { files: [{ name: 'deferred.csv', size: 12, text: () => content.promise }], value: 'deferred.csv' } };
  return input.props!.onChange(event) as Promise<void>;
}

test('a deferred file read cannot select a table after switching to the pasted source', async () => {
  const content = deferred<string>();
  const harness = componentHarness(importFile, {}, importModules, syntheticPlaceRequest);
  harness.render(); const reading = deferredCsv(harness, content);
  harness.nodes().find((node) => node.type === 'EasyTSegmentedControl')!.props!.onChange('paste'); harness.render();
  content.resolve('Old file content'); await reading; harness.render();
  assert.equal(harness.nodes().some((node) => node.type === 'SpreadsheetImportReview'), false);
  assert.equal(harness.nodes().find((node) => node.type === 'EasyTSegmentedControl')!.props!.value, 'paste');
  assert.deepEqual(harness.navigations(), []);
});

test('a queued pasted-text edit retires a file read started after the mode switch', async () => {
  const content = deferred<string>();
  const harness = componentHarness(importFile, {}, importModules, syntheticPlaceRequest);
  harness.render();
  harness.nodes().find((node) => node.type === 'EasyTSegmentedControl')!.props!.onChange('paste'); harness.render();
  const editRawText = harness.nodes().find((node) => node.type === 'EasyTTextArea')!.props!.onChange;
  harness.nodes().find((node) => node.type === 'EasyTSegmentedControl')!.props!.onChange('file'); harness.render();
  const reading = deferredCsv(harness, content);
  editRawText({ target: { value: 'Newer pasted content' } });
  content.resolve('Old file content'); await reading; harness.render();
  assert.equal(harness.nodes().some((node) => node.type === 'SpreadsheetImportReview'), false);
  harness.nodes().find((node) => node.type === 'EasyTSegmentedControl')!.props!.onChange('paste'); harness.render();
  assert.equal(harness.nodes().find((node) => node.type === 'EasyTTextArea')!.props!.value, 'Newer pasted content');
});

test('a deferred file read remains retired when the owner switches away and back', async () => {
  const content = deferred<string>();
  const harness = componentHarness(importFile, {}, importModules, syntheticPlaceRequest);
  harness.render(); const reading = deferredCsv(harness, content);
  harness.owner('owner-b'); harness.render(); harness.owner('owner-a'); harness.render();
  content.resolve('Old owner file'); await reading; harness.render();
  assert.equal(harness.nodes().some((node) => node.type === 'SpreadsheetImportReview'), false);
  assert.deepEqual(harness.navigations(), []);
});

test('an older file completion cannot clear the pending state of a newer file read', async () => {
  const older = deferred<string>(), newer = deferred<string>();
  const harness = componentHarness(importFile, {}, importModules, syntheticPlaceRequest);
  harness.render(); const olderRead = deferredCsv(harness, older);
  harness.render(); const newerRead = deferredCsv(harness, newer);
  older.resolve('Old file'); await olderRead; harness.render();
  assert.equal(harness.nodes().find((node) => node.type === 'input' && node.props?.type === 'file')!.props!.disabled, true);
  assert.equal(harness.nodes().some((node) => node.type === 'SpreadsheetImportReview'), false);
  newer.resolve('New file'); await newerRead; harness.render();
  assert.equal(harness.nodes().some((node) => node.type === 'SpreadsheetImportReview'), true);
});

for (const retirement of ['typed-origin', 'owner', 'owner-return', 'unmount'] as const) {
  test(`manual origin response is ignored after ${retirement}`, async () => {
    const response = deferred<any>();
    const request = (url: string) => new URL(url, 'https://synthetic.invalid').searchParams.get('place') === 'Paris'
      ? response.promise : syntheticPlaceRequest(url);
    const harness = componentHarness(importFile, {}, importModules, request);
    await prepareImport(harness);
    importReview(harness).onOriginValueChange('Paris'); harness.render();
    importReview(harness).onResolveOrigin();
    if (retirement === 'typed-origin') importReview(harness).onOriginValueChange('Madrid');
    else if (retirement === 'owner' || retirement === 'owner-return') {
      harness.owner('owner-b'); harness.render();
      if (retirement === 'owner-return') { harness.owner('owner-a'); harness.render(); }
    } else harness.unmount();
    response.resolve({ ok: true, json: async () => ({ result: { name: 'Old Paris result', country: 'France', coordinates: [2, 3] } }) });
    await settle(); harness.render();
    assert.equal(importReview(harness).originValue, retirement === 'typed-origin' ? 'Madrid' : 'Paris');
    assert.equal(importReview(harness).resolvedOrigin, null);
    assert.equal(Array.isArray(importReview(harness).originOptions), true);
    assert.equal(importReview(harness).originOptions.length, 0);
    assert.equal(importReview(harness).originError, '');
  });
}


test('manual origin resolution accepts the current request and ignores an older response for the same input', async () => {
  const older = deferred<any>(), newer = deferred<any>();
  let requests = 0;
  const request = (url: string) => new URL(url, 'https://synthetic.invalid').searchParams.get('place') === 'Paris'
    ? [older, newer][requests++]!.promise : syntheticPlaceRequest(url);
  const harness = componentHarness(importFile, {}, importModules, request);
  await prepareImport(harness);
  importReview(harness).onOriginValueChange('Paris'); harness.render();
  importReview(harness).onResolveOrigin(); importReview(harness).onResolveOrigin();
  newer.resolve({ ok: true, json: async () => ({ result: { name: 'Current Paris result', country: 'France', coordinates: [2, 3] } }) });
  await settle(); harness.render();
  assert.equal(importReview(harness).originValue, 'Current Paris result');
  assert.equal(importReview(harness).resolvedOrigin.name, 'Current Paris result');
  older.resolve({ ok: true, json: async () => ({ result: { name: 'Old Paris result', country: 'France', coordinates: [2, 3] } }) });
  await settle(); harness.render();
  assert.equal(importReview(harness).originValue, 'Current Paris result');
  assert.equal(importReview(harness).resolvedOrigin.name, 'Current Paris result');
});
