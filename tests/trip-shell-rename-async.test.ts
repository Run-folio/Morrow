import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
import { canonicalRouteFixture } from './fixtures/batch14-route-documents.ts';
import { requireReadableTripDocument } from '../lib/easyt/trip-document.ts';
import * as display from '../lib/easyt/trip-display.ts';
import type { EasyTTrip } from '../lib/easyt/trip.ts';

const require = createRequire(import.meta.url);
const tick = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function harness(queued = false) {
  let trip = requireReadableTripDocument(canonicalRouteFixture()), pathname = `/journey/${trip.id}`;
  trip = requireReadableTripDocument(display.renameTripIdentity(trip, 'Original name'));
  const states: any[] = [], cleanups: Array<() => void> = [], mountEffects: Array<() => void | (() => void)> = [], queuedState: Array<() => void> = [];
  let cursor = 0, deferredState = false, renderOnAcceptance = false;
  const hooks = {
    createContext: () => ({ Provider: () => null }), useContext: () => mutation,
    useState(initial: any) {
      const index = cursor++;
      if (!(index in states)) states[index] = typeof initial === 'function' ? initial() : initial;
      return [states[index], (value: any) => {
        const apply = () => { states[index] = typeof value === 'function' ? value(states[index]) : value; };
        if (deferredState) queuedState.push(apply); else apply();
      }];
    },
    useRef(value: any) { return states[cursor++] ??= { current: value }; },
    useEffect(effect: () => void | (() => void), deps: unknown[]) {
      const index = cursor++;
      if (!(index in states)) { states[index] = true; if (!deps.length) { mountEffects.push(effect); const cleanup = effect(); if (cleanup) cleanups.push(cleanup); } }
    },
  };
  let accepted = deferred<unknown>(); const firstAcceptance = accepted, updateGate = deferred<void>();
  const requests: Array<{ key: string; outgoing: EasyTTrip | null }> = [];
  const mutation = {
    get trip() { return trip; }, error: '', saveState: 'idle', isPending: () => false,
    async mutateTrip(update: (current: EasyTTrip) => EasyTTrip, key: string) {
      const gate = accepted, before = structuredClone(trip), request = { key, outgoing: null as EasyTTrip | null }; requests.push(request);
      if (queued) await updateGate.promise;
      const next = update(structuredClone(trip)); request.outgoing = next;
      const result = await gate.promise;
      if (result === true && trip.id === before.id && trip.ownerId === before.ownerId) {
        trip = requireReadableTripDocument(next);
        if (renderOnAcceptance) render();
      }
      return result;
    },
  };
  const Form = () => null, Field = () => null, Launcher = () => null;
  const source = readFileSync('components/easyt/trip-shell-client.tsx', 'utf8');
  const imports: Record<string, any> = {};
  for (const match of source.matchAll(/from "([^"]+)"/g)) imports[match[1]!] = {};
  Object.assign(imports, {
    react: hooks, 'next/navigation': { usePathname: () => pathname },
    '@/lib/easyt/trip-display': display,
    '@/lib/easyt/trip-facts': { deriveTripDateFacts: () => ({ durationDays: 10, rangeLabel: 'Fixture dates' }) },
    '@/lib/easyt/trip-legs': { tripRouteDisplayLabel: () => 'Fixture route' },
    '@/lib/easyt/accommodation': { overnightAccommodationStops: () => trip.stops },
    '@/lib/easyt/trip-workspace-links': { tripBuilderHref: () => '/fixture/builder', mapWorkspaceHref: () => '/fixture/map', tripWorkspaceHref: () => '/fixture/trip', workspaceViewFromPathname: (path: string, id: string) => path === `/journey/${id}` ? 'overview' : 'map' },
    '@/lib/easyt/personal-route': { personalRouteHref: () => '/fixture/route' },
    './workspace-orientation': { useWorkspaceOrientationBlocker: () => {}, WorkspaceOrientationLauncher: Launcher },
    './trip-overview-library-actions': { TripOverviewLibraryActions: Launcher },
    './easyt-controls': { EasyTButton: () => null, EasyTLinkButton: () => null, EasyTField: Field },
    './morrovia-feedback': { MorroviaFormDialog: Form, MorroviaSaveStatus: () => null },
    './trip-shell.module.css': { default: {} },
  });
  const js = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} as any };
  new Function('require', 'module', 'exports', js)((id: string) => id in imports ? imports[id] : require(id), module, module.exports);
  const render = () => { cursor = 0; return module.exports.TripShellIdentityAndActions(); };
  function find(node: any, type: any): any {
    if (!node) return null;
    if (Array.isArray(node)) return node.map(child => find(child, type)).find(Boolean);
    if (node.type === type) return node;
    return find(node.props?.children, type);
  }
  const form = (tree = render()) => find(tree, Form), field = (tree = render()) => find(tree, Field);
  return { render, form, field, requests, accepted: firstAcceptance, updateGate,
    open: () => find(render(), Launcher).props.onRenameTrip(),
    type: (value: string) => field().props.onChange({ target: { value } }),
    submit: () => form().props.onSubmit(), cancel: () => form().props.onCancel(),
    switchTrip: (patch: Partial<EasyTTrip>) => { trip = requireReadableTripDocument({ ...trip, ...patch }); },
    switchView: (path: string) => { pathname = path; }, trip: () => trip,
    deferState: () => { deferredState = true; }, flushState: () => { deferredState = false; queuedState.splice(0).forEach(apply => apply()); },
    unmount: () => cleanups.forEach(cleanup => cleanup()),
    replayMount: () => { cleanups.forEach(cleanup => cleanup()); mountEffects.forEach(effect => { const cleanup = effect(); if (cleanup) cleanups.push(cleanup); }); },
    useAcceptance: (gate: ReturnType<typeof deferred<unknown>>) => { accepted = gate; },
    renderAcceptedSource: () => { renderOnAcceptance = true; },
  };
}

test('the actual shared mutation rejects an unchanged canonical rename before persistence', async () => {
  const trip = requireReadableTripDocument(display.renameTripIdentity(requireReadableTripDocument(canonicalRouteFixture()), 'Original name'));
  const source = readFileSync('components/easyt/use-trip-mutation-persistence.ts', 'utf8');
  const start = source.indexOf('  const mutateTrip = useCallback('), end = source.indexOf('\n  useEffect(', start);
  assert.ok(start >= 0 && end > start);
  let writes = 0;
  const scope = {
    useCallback: (callback: unknown) => callback, enabled: true,
    liveScopeRef: { current: 'exact-owner-document' }, scopeIsCurrent: () => true,
    recoveryReadyRef: { current: true }, conflictRef: { current: false },
    localWriteTailRef: { current: Promise.resolve() }, tripRef: { current: trip },
    session: { user: { id: trip.ownerId } }, cloneItineraryMutationDocument: structuredClone,
    pendingLocalWritesRef: { current: new Set() }, updatePending: () => {},
    enqueueAccountSave: () => { writes++; throw new Error('No-op must not queue an account save'); },
    reportRecoveryReadFailure: () => {},
    saveTripRecovery: () => { writes++; throw new Error('No-op must not write device recovery'); },
  };
  const js = ts.transpileModule(source.slice(start, end) + '\nreturn mutateTrip;', { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const mutate = new Function('scope', `with(scope){${js}}`)(scope);
  const before = JSON.stringify(trip);
  assert.equal(await mutate((current: EasyTTrip) => display.renameTripIdentity(current, 'Original name'), 'trip-title'), false);
  assert.equal(writes, 0); assert.equal(JSON.stringify(trip), before);
});

test('Save of the exact current canonical title closes as a verified no-op without invoking persistence', async () => {
  const h = harness(); h.open(); const before = JSON.stringify(h.trip()); h.submit(); await tick();
  assert.equal(h.requests.length, 0); assert.equal(h.form().props.open, false); assert.equal(JSON.stringify(h.trip()), before);
});

test('a normalized exact-current title is a pre-submit no-op rather than a false acknowledgement', async () => {
  const h = harness(); h.open(); h.type('  Original   name  '); h.submit(); await tick();
  assert.equal(h.requests.length, 0); assert.equal(h.form().props.open, false);
  assert.equal(display.tripCustomTitle(h.trip()), 'Original name');
});

test('rename waits for literal true, then closes its current dialog after the source title prop updates', async () => {
  const h = harness(); h.open(); h.type('  Accepted   name  '); h.renderAcceptedSource(); h.submit();
  assert.equal(h.form().props.open, true); h.accepted.resolve(true); await tick();
  assert.equal(display.tripCustomTitle(h.trip()), 'Accepted name'); assert.equal(h.form().props.open, false);
});

test('a matching later source title cannot turn a refused mutation into accepted dialog completion', async () => {
  const h = harness(); h.open(); h.type('Name A'); h.submit();
  h.switchTrip(display.renameTripIdentity(h.trip(), 'Name A')); h.render(); h.accepted.resolve(false); await tick();
  assert.equal(h.form().props.open, true); assert.equal(h.field().props.value, 'Name A');
});

for (const result of ['false', 'rejection', 'object', 'string', 'number', 'undefined'] as const) {
  test(`rename preserves its exact current draft on ${result} acceptance`, async () => {
    const h = harness(); h.open(); h.type('  Pending name  '); h.submit();
    if (result === 'rejection') h.accepted.reject(new Error('fixture rejection'));
    else h.accepted.resolve({ false: false, object: { stored: true }, string: 'accepted', number: 1, undefined }[result]);
    await tick(); assert.equal(h.form().props.open, true); assert.equal(h.field().props.value, '  Pending name  ');
    assert.equal(display.tripCustomTitle(h.trip()), 'Original name');
  });
}

test('typing a newer title before React applies the state queue retires an old accepted rename', async () => {
  const h = harness(); h.open(); h.type('Name A'); h.submit();
  const field = h.field(); h.deferState(); field.props.onChange({ target: { value: '  Newer name B  ' } });
  h.accepted.resolve(true); await tick(); h.flushState();
  assert.equal(h.form().props.open, true); assert.equal(h.field().props.value, '  Newer name B  ');
  h.open(); assert.equal(h.field().props.value, '  Newer name B  ', 'opening an already open rename cannot replace the newer raw draft');
});

test('queued old rename does not apply after a newer raw edit before render', async () => {
  const h = harness(true); h.open(); h.type('Name A'); h.submit();
  const before = JSON.stringify(h.trip()), field = h.field(); h.deferState(); field.props.onChange({ target: { value: 'Name B' } });
  h.updateGate.resolve(); h.accepted.resolve(true); await tick(); h.flushState();
  assert.equal(JSON.stringify(h.trip()), before); assert.equal(h.form().props.open, true); assert.equal(h.field().props.value, 'Name B');
});

test('same raw text is a no-op during rename acceptance', async () => {
  const h = harness(); h.open(); h.type('Name A'); h.submit();
  const field = h.field(); h.deferState(); field.props.onChange({ target: { value: 'Name A' } });
  h.accepted.resolve(true); await tick(); h.flushState(); assert.equal(h.form().props.open, false);
});

test('a changed raw value remains newer even when it normalizes to the submitted title', async () => {
  const h = harness(); h.open(); h.type('Name A'); h.submit();
  const field = h.field(); h.deferState(); field.props.onChange({ target: { value: ' Name A  ' } });
  h.accepted.resolve(true); await tick(); h.flushState(); assert.equal(h.form().props.open, true); assert.equal(h.field().props.value, ' Name A  ');
});

test('cancel and reopen creates a new dialog session that old acceptance and old input callbacks cannot close or replace', async () => {
  const h = harness(); h.open(); h.type('Name A'); const oldField = h.field(); h.submit();
  h.cancel(); h.open(); h.type('Name B'); oldField.props.onChange({ target: { value: 'Obsolete raw' } });
  h.accepted.resolve(true); await tick(); assert.equal(h.form().props.open, true); assert.equal(h.field().props.value, 'Name B');
});

for (const transition of ['owner', 'document', 'view', 'owner-cycle', 'view-cycle'] as const) {
  test(`rename session cannot revive after a ${transition} scope transition`, async () => {
    const h = harness(); h.open(); h.type('Name A'); h.submit(); const original = h.trip();
    if (transition === 'owner' || transition === 'owner-cycle') h.switchTrip({ ownerId: 'owner-b' });
    if (transition === 'document') h.switchTrip({ id: 'different-document' });
    if (transition === 'view' || transition === 'view-cycle') h.switchView(`/journey/${original.id}/explore`);
    h.render(); assert.equal(h.form().props.open, false);
    if (transition === 'owner-cycle') { h.switchTrip({ ownerId: original.ownerId }); h.render(); }
    if (transition === 'view-cycle') { h.switchView(`/journey/${original.id}`); h.render(); }
    h.open(); h.type('Name B'); h.accepted.resolve(true); await tick();
    assert.equal(h.form().props.open, true); assert.equal(h.field().props.value, 'Name B');
  });
}

test('rename rejects an unmounted continuation and a pending continuation revived by effect replay', async () => {
  for (const replay of [false, true]) {
    const h = harness(); h.open(); h.type('Name A'); h.submit();
    if (replay) h.replayMount(); else h.unmount();
    h.accepted.resolve(true); await tick(); assert.equal(h.form().props.open, true);
  }
});

test('a fresh rename after effect replay stays pending when the obsolete request finishes', async () => {
  const h = harness(); h.open(); h.type('Name A'); h.submit(); h.replayMount();
  const fresh = deferred<unknown>(); h.useAcceptance(fresh); h.submit(); assert.equal(h.requests.length, 2);
  h.accepted.resolve(true); await tick(); assert.equal(h.form().props.open, true); assert.equal(h.form().props.submitting, true);
  fresh.resolve(true); await tick(); assert.equal(h.form().props.open, false);
});

test('rename deduplicates immediate submissions and releases its own pending state on refusal', async () => {
  const h = harness(); h.open(); h.type('Name A'); const submit = h.form().props.onSubmit;
  submit(); submit(); assert.equal(h.requests.length, 1); assert.equal(h.form().props.submitting, true);
  h.accepted.resolve(false); await tick(); assert.equal(h.form().props.submitting, false); assert.equal(h.form().props.open, true);
});

test('rename validation retains Unicode raw text and never starts an overlong mutation', async () => {
  const h = harness(); h.open(); const raw = '日'.repeat(81); h.type(raw); h.submit();
  assert.equal(h.requests.length, 0); assert.equal(h.form().props.open, true); assert.equal(h.field().props.value, raw);
  assert.equal(h.form().props.error, 'Use 80 characters or fewer.');
});
