import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { deferNewTripNavigation, canUseHydratedTripScope, shouldAllowNewTripNavigation, sameRecoveryDocument,
  tripDocumentsCanonicalEquivalent, EASYT_BEFORE_NEW_TRIP_EVENT, type TripRecoveryWriteResult, type NewTripNavigationPreservation } from '../lib/easyt/storage.ts';
import { authoredContentKey } from '../lib/easyt/trip-retained-authored-content.ts';
import { durableBuilderRecoveryUrl } from '../lib/easyt/builder-durable-url.ts';
import { homepageHandoffMatchesTrip } from '../lib/easyt/home-trip-handoff.ts';
import { builderClosure } from './helpers/qa-persistence-source-fixture.ts';
import { homeRecoveryFixture } from './helpers/home-recovery-fixture.ts';

function actualListener(bindings: Record<string, unknown>) {
  const source = readFileSync(new URL('../app/journey/new/trip-builder.tsx', import.meta.url), 'utf8');
  const ast = ts.createSourceFile('builder.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let expression: string | undefined;
  const visit = (node: ts.Node) => { if (ts.isCallExpression(node) && node.expression.getText(ast) === 'useEffect'
    && node.arguments[0]?.getText(ast).includes('const preserveBeforeNewTrip')) expression = node.arguments[0].getText(ast); ts.forEachChild(node, visit); };
  visit(ast); assert.ok(expression);
  const js = ts.transpileModule(`const listener = ${expression};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return new Function('bindings', `with(bindings){${js}return listener;}`)(bindings) as () => () => void;
}
function deferred<T>() { let resolve!: (value: T) => void; return { promise: new Promise<T>(yes => { resolve = yes; }), resolve }; }
function fixture(actorPending = false) {
  const home = homeRecoveryFixture('owner-a'), gate = deferred<TripRecoveryWriteResult>(), statuses: unknown[] = [];
  const sourceHref = 'https://synthetic.test/journey/new?homeDraft=1&handoff=home-fixture';
  const window = Object.assign(new EventTarget(), { location: { href: sourceHref }, history: { state: null, replaceState(_state: unknown, _title: string, url: URL) { window.location.href = url.href; } } });
  const bindings = { window, hydrated: true, origin: 'London', tripBrief: '', stops: home.trip.stops, activeTripDocument: home.trip,
    useCallback: (callback: unknown) => callback, builderSeed: null, builderMountedRef: { current: true }, builderInitialOverflowRef: { current: false },
    builderCurrentDocumentRef: { current: home.trip }, builderEditSessionRef: { current: null as unknown },
    activeBrowserOwnerId: 'owner-a', activeBrowserOwnerIdRef: { current: 'owner-a' }, language: 'en', hydratedOwnerScopeRef: { current: 'owner-a' },
    pendingNewTripReceiptRef: { current: { snapshot: home.snapshot, draft: home.draft, receipt: home.intake.completed, fromHomepage: true } },
    recoveryHandleRef: { current: null }, receiptAcknowledgementRef: { current: null }, hydratedCanonicalTripRef: { current: null },
    canUseHydratedTripScope, authoredContentKey, durableBuilderRecoveryUrl, homepageHandoffMatchesTrip, sameRecoveryDocument, tripDocumentsCanonicalEquivalent,
    deferNewTripNavigation, shouldAllowNewTripNavigation, EASYT_BEFORE_NEW_TRIP_EVENT,
    recoveryPersistenceOutcome: (result: TripRecoveryWriteResult) => result.stored ? 'confirmed-durable' : 'unknown',
    reportPersistenceOutcome() {}, reportQaPersistenceBoundary() {},
    setDeviceRecoveryBlocked(value: unknown) { statuses.push(value); }, setDevicePersistenceOutcome(value: unknown) { statuses.push(value); },
    setDeviceRecoveryDurable(value: unknown) { statuses.push(value); }, setDeviceStorageBlocked(value: unknown) { statuses.push(value); },
    setSaveState(value: unknown) { statuses.push(value); }, setCloudSaveError(value: unknown) { statuses.push(value); },
    saveTripRecovery: async () => gate.promise,
    persistDeviceRecovery: (_trip: unknown, _caller: unknown) => Promise.resolve({ stored: false } as TripRecoveryWriteResult),
  };
  bindings.persistDeviceRecovery = (trip, caller) => builderClosure('persistDeviceRecovery')(bindings, [trip, caller]) as Promise<TripRecoveryWriteResult>;
  if (actorPending) bindings.builderEditSessionRef.current = { getSnapshot: () => ({ trip: home.trip, browserOwnerId: 'owner-a', saveState: 'device-saving' }) };
  const cleanup = actualListener(bindings)(); let preservation: Promise<NewTripNavigationPreservation> | undefined;
  window.dispatchEvent(new CustomEvent(EASYT_BEFORE_NEW_TRIP_EVENT, { detail: { waitUntil(value: Promise<NewTripNavigationPreservation>) { preservation = value; } } }));
  assert.ok(preservation);
  const result: TripRecoveryWriteResult = { stored: true, recoveryDurable: true, pointerAcknowledged: true, receiptAcknowledged: true,
    blockedByExistingRecovery: false, handle: { ownerId: 'owner-a', tripId: home.trip.id, writeId: 'synthetic-write-a' } };
  return { home, bindings, gate, sourceHref, statuses, preservation, result, cleanup };
}
test('actual Builder listener emits exact source/trip acknowledgement only after canonical pointer and receipt acceptance', async () => {
  const ui = fixture(); assert.deepEqual(ui.statuses, []); assert.equal(ui.bindings.window.location.href, ui.sourceHref);
  ui.gate.resolve(ui.result); const outcome = await ui.preservation;
  assert.deepEqual(outcome, { accepted: true, recoveryNavigation: { sourceHref: ui.sourceHref, tripId: ui.home.trip.id } });
  assert.equal(new URL(ui.bindings.window.location.href).searchParams.get('trip'), ui.home.trip.id);
});
for (const failure of ['canonical', 'pointer', 'receipt']) test(`actual Builder listener cannot acknowledge ${failure} refusal`, async () => {
  const ui = fixture(); ui.gate.resolve({ ...ui.result, ...(failure === 'canonical' ? { stored: false } : failure === 'pointer' ? { pointerAcknowledged: false } : { receiptAcknowledged: false }) });
  assert.equal(await ui.preservation, false); assert.equal(ui.bindings.window.location.href, ui.sourceHref);
});
for (const mismatch of ['owner', 'trip']) test(`actual Builder listener rejects a ${mismatch} recovery handle mismatch`, async () => {
  const ui = fixture(); ui.gate.resolve({ ...ui.result, handle: { ...ui.result.handle,
    ...(mismatch === 'owner' ? { ownerId: 'owner-b' } : { tripId: 'trip-b' }) } });
  assert.equal(await ui.preservation, false);
});
test('actual Builder listener cannot acknowledge an actor whose raw device write remains pending', async () => {
  const ui = fixture(true); assert.equal(await ui.preservation, false); assert.equal(ui.bindings.window.location.href, ui.sourceHref);
});
for (const change of ['owner', 'unmount', 'source', 'body', 'listener-cleanup', 'owner-cycle']) test(`actual Builder listener rejects late ${change} completion before acknowledgement`, async () => {
  const ui = fixture();
  if (change === 'owner') ui.bindings.activeBrowserOwnerIdRef.current = 'owner-b';
  if (change === 'unmount') ui.bindings.builderMountedRef.current = false;
  if (change === 'source') ui.bindings.builderCurrentDocumentRef.current = { ...ui.home.trip, id: 'trip-b' };
  if (change === 'body') ui.bindings.builderCurrentDocumentRef.current = { ...ui.home.trip, brief: { ...ui.home.trip.brief, mustDo: 'newer traveller input' } };
  if (change === 'listener-cleanup') ui.cleanup();
  if (change === 'owner-cycle') { ui.bindings.activeBrowserOwnerIdRef.current = 'owner-b'; ui.cleanup(); ui.bindings.activeBrowserOwnerIdRef.current = 'owner-a'; }
  ui.gate.resolve(ui.result); assert.equal(await ui.preservation, false);
  if (change === 'listener-cleanup' || change === 'owner-cycle') {
    assert.equal(new URL(ui.bindings.window.location.href).searchParams.get('trip'), ui.home.trip.id,
      'an accepted same-body device checkpoint remains recoverable while its retired listener cannot authorize navigation');
  } else assert.equal(ui.bindings.window.location.href, ui.sourceHref);
});
test('actual Builder listener acknowledges its own preserved trip even if a foreign URL was installed while waiting', async () => {
  const ui = fixture(); ui.bindings.window.location.href = 'https://synthetic.test/journey/new?trip=trip-b&recover=1&handoff=home-fixture';
  ui.gate.resolve(ui.result); assert.deepEqual(await ui.preservation,
    { accepted: true, recoveryNavigation: { sourceHref: ui.sourceHref, tripId: ui.home.trip.id } });
  assert.equal(new URL(ui.bindings.window.location.href).searchParams.get('trip'), 'trip-b', 'the acknowledgement never derives trip identity from current URL');
});
