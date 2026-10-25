import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
import { canonicalRouteFixture } from './fixtures/batch14-route-documents.ts';
import { requireReadableTripDocument } from '../lib/easyt/trip-document.ts';
import { createBuilderInputDraft, updateBuilderInputDraft } from '../lib/easyt/trip-builder-input-draft.ts';
import { builderChipOccurrenceOrder } from '../lib/easyt/trip-builder-order.ts';
import * as destinationPresentation from '../lib/easyt/destination-intent-presentation.ts';
import type { CanonicalEasyTTrip, DestinationIntent } from '../lib/easyt/trip.ts';
import type { CanonicalPlaceSuggestion } from '../lib/easyt/place-intelligence.ts';

const require = createRequire(import.meta.url);
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function harness(editGate?: { promise: Promise<unknown> }) {
  let trip = requireReadableTripDocument(canonicalRouteFixture()), draft = createBuilderInputDraft(trip);
  const intentA = trip.brief.intent.route.destinations[0]!, intentB = trip.brief.intent.route.destinations[1]!;
  const states: any[] = [], cleanups: Array<() => void> = [], effects: Array<() => void> = [], mountEffects: Array<() => void | (() => void)> = [];
  let cursor = 0;
  const hooks = {
    useState(initial: any) {
      const index = cursor++;
      if (!(index in states)) states[index] = typeof initial === 'function' ? initial() : initial;
      return [states[index], (value: any) => { states[index] = typeof value === 'function' ? value(states[index]) : value; }];
    },
    useRef(value: any) { return states[cursor++] ??= { current: value }; },
    useEffect(effect: () => void | (() => void), dependencies: unknown[]) {
      const index = cursor++, previous = states[index] as unknown[] | undefined;
      if (!previous || previous.length !== dependencies.length || dependencies.some((value, i) => value !== previous[i])) {
        states[index] = dependencies;
        if (!dependencies.length) mountEffects.push(effect);
        effects.push(() => { const cleanup = effect(); if (cleanup) cleanups.push(cleanup); });
      }
    },
  };
  const Tag = () => null, Autocomplete = () => null;
  const requests: Array<{ intentId: string; place: CanonicalPlaceSuggestion }> = [], edits: string[] = [], focus: string[] = [];
  let acceptance = deferred<unknown>();
  const noop = () => {};
  const imports: Record<string, any> = {
    react: hooks, 'lucide-react': {},
    '@/components/easyt/easyt-controls': { EasyTButton: noop, EasyTSelect: noop, EasyTSegmentedControl: noop },
    '@/components/easyt/canonical-place-autocomplete': { CanonicalPlaceAutocomplete: Autocomplete },
    '@/components/easyt/morrovia-date-picker': { MorroviaDatePicker: noop },
    '@/components/easyt/morrovia-quantity-selector': { MorroviaQuantitySelector: noop },
    '@/components/easyt/morrovia-destination-field': { MorroviaDestinationField: noop, MorroviaDestinationTag: Tag },
    '@/lib/easyt/trip-builder-order': { builderChipOccurrenceOrder },
    '@/lib/easyt/destination-intent-presentation': destinationPresentation,
    './use-builder-stop-reorder': { useBuilderStopReorder: () => ({ gripProps: () => ({}) }) },
    './trip-builder-top-controls.module.css': { default: {} }, '@/components/easyt/morrovia-planner-controls.module.css': { default: {} },
  };
  const source = readFileSync('app/journey/new/trip-builder-top-controls.tsx', 'utf8');
  const js = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} as any };
  new Function('require', 'module', 'exports', js)((id: string) => id in imports ? imports[id] : require(id), module, module.exports);
  let disabled = false;
  function find(node: any, predicate: (node: any) => boolean): any {
    if (!node) return null;
    if (Array.isArray(node)) return node.map(child => find(child, predicate)).find(Boolean);
    if (typeof node !== 'object') return null;
    if (predicate(node)) return node;
    return find(node.props?.children, predicate) ?? find(node.props?.editor, predicate);
  }
  const render = () => {
    cursor = 0;
    const tree = module.exports.TripBuilderTopControls({ trip, draft, language: 'en', disabled,
      onType: noop, onOriginInput: noop, onOriginSelect: noop, onOriginClear: noop, onDates: noop, onDateInput: noop,
      onTravellers: noop, onBudget: noop, onAdd: noop, onRemoveIntent: noop,
      onEditIntent: (intent: DestinationIntent) => { edits.push(intent.id); return editGate?.promise ?? true; },
      onIntentInput: (id: string, raw: string) => { draft = updateBuilderInputDraft(draft, trip, { kind: 'destination', intentId: id }, raw); },
      onIntentSelect: (intent: DestinationIntent, place: CanonicalPlaceSuggestion) => { requests.push({ intentId: intent.id, place }); return acceptance.promise; },
    });
    for (const intent of trip.brief.intent.route.destinations) {
      find(tree, node => node.type === Tag && node.props.id === intent.id)?.props.ref?.({ querySelector: () => ({ focus: () => focus.push(intent.id) }) });
    }
    effects.splice(0).forEach(effect => effect());
    return tree;
  };
  const tag = (id: string, tree = render()) => {
    const found = find(tree, node => node.type === Tag && node.props.id === id);
    assert.ok(found); return found;
  };
  const input = (id: string, tree = render()) => find(tag(id, tree).props.editor, node => node.type === Autocomplete);
  const escape = (id: string) => tag(id).props.editor.props.onKeyDown({ key: 'Escape', preventDefault: noop });
  const place = { id: 'replacement-tokyo', name: 'Replacement Tokyo', country: 'Japan', coordinates: [139.7, 35.7] } as unknown as CanonicalPlaceSuggestion;
  return { render, find, tag, input, escape, place, intentA, intentB, requests, edits, focus, acceptance,
    configureIntents: (intents: DestinationIntent[]) => { trip.brief.intent.route.destinations = intents; },
    open: async (id: string) => { await tag(id).props.onEdit(); return render(); },
    switchTrip: (patch: Partial<CanonicalEasyTTrip>) => { trip = requireReadableTripDocument({ ...trip, ...patch }); draft = createBuilderInputDraft(trip); },
    setDisabled: (value: boolean) => { disabled = value; },
    unmount: () => cleanups.forEach(dispose => dispose()),
    replayMount: () => { cleanups.forEach(dispose => dispose()); mountEffects.forEach(effect => { const cleanup = effect(); if (cleanup) cleanups.push(cleanup); }); },
    useAcceptance: (gate: ReturnType<typeof deferred<unknown>>) => { acceptance = gate; },
  };
}

test('actual Builder chips distinguish country and capital while editing retains raw names and IDs', async () => {
  const h=harness();
  const country={...h.intentA,id:'country-sm',sourceText:'San Marino',kind:'planning_area' as const,stopIds:[],resolution:'needs_base' as const,selectedPlace:{name:'San Marino',country:'San Marino',canonicalPlaceId:'san-marino'}};
  const city={...h.intentB,id:'city-sm',sourceText:'San Marino',selectedPlace:{name:'San Marino',country:'San Marino',canonicalPlaceId:'reference:geonames:3168070'}};
  h.configureIntents([country,city]);
  assert.equal(h.tag(country.id).props.label,'San Marino · Country');
  assert.equal(h.tag(city.id).props.label,'San Marino · City');
  assert.equal(h.tag(country.id).props.removeLabel,'Remove San Marino · Country');
  await h.open(city.id);
  assert.equal(h.input(city.id).props.value,'San Marino');
  assert.equal(country.selectedPlace.canonicalPlaceId,'san-marino');
  assert.equal(city.selectedPlace.canonicalPlaceId,'reference:geonames:3168070');
});

test('Builder destination selection waits for accepted true before closing and focusing its own editor', async () => {
  const h = harness(); await h.open(h.intentA.id); h.focus.length = 0;
  const pending = h.input(h.intentA.id).props.onSelect(h.place);
  assert.ok(h.input(h.intentA.id)); assert.equal(h.focus.length, 0);
  h.acceptance.resolve(true); await pending; h.render();
  assert.equal(h.input(h.intentA.id), null); assert.deepEqual(h.focus, [h.intentA.id]);
});

test('Builder false or rejected selection retains the exact current destination editor and typed raw input', async () => {
  for (const rejected of [false, true]) {
    const h = harness(); await h.open(h.intentA.id);
    h.input(h.intentA.id).props.onChange('  unresolved Tokyo text  '); h.render(); h.focus.length = 0;
    const pending = h.input(h.intentA.id).props.onSelect(h.place);
    if (rejected) h.acceptance.reject(new Error('fixture durable refusal')); else h.acceptance.resolve(false);
    await pending;
    assert.equal(h.input(h.intentA.id).props.value, '  unresolved Tokyo text  '); assert.deepEqual(h.focus, []);
  }
});

test('accepted destination A cannot close or focus away from editor B opened after Escape', async () => {
  const h = harness(); await h.open(h.intentA.id);
  const pending = h.input(h.intentA.id).props.onSelect(h.place);
  h.escape(h.intentA.id); await h.open(h.intentB.id); h.focus.length = 0;
  h.acceptance.resolve(true); await pending; h.render();
  assert.ok(h.input(h.intentB.id)); assert.equal(h.input(h.intentA.id), null); assert.deepEqual(h.focus, []);
});

test('Escape without a replacement editor permanently cancels stale accepted selection focus', async () => {
  const h = harness(); await h.open(h.intentA.id);
  const pending = h.input(h.intentA.id).props.onSelect(h.place);
  h.escape(h.intentA.id); h.render(); h.focus.length = 0;
  h.acceptance.resolve(true); await pending;
  h.switchTrip({ updatedAt: '2026-10-13T01:00:00.000Z' }); h.render();
  assert.equal(h.input(h.intentA.id), null); assert.deepEqual(h.focus, []);
});

test('opening the same destination again creates a fresh editor lifecycle', async () => {
  const h = harness(); await h.open(h.intentA.id);
  const oldInput = h.input(h.intentA.id);
  h.escape(h.intentA.id); h.render(); await h.open(h.intentB.id); h.escape(h.intentB.id); h.render();
  await h.open(h.intentA.id); h.focus.length = 0;
  assert.equal(await oldInput.props.onSelect(h.place), false); assert.equal(h.requests.length, 0);
  assert.ok(h.input(h.intentA.id)); assert.deepEqual(h.focus, []);
  const pending = h.input(h.intentA.id).props.onSelect(h.place);
  h.acceptance.resolve(true); assert.equal(await pending, true);
});

for (const transition of ['owner', 'document', 'unmount'] as const) {
  test(`pending Builder acceptance cannot modify editor or focus after ${transition} changes`, async () => {
    const h = harness(); await h.open(h.intentA.id);
    const oldInput = h.input(h.intentA.id), pending = oldInput.props.onSelect(h.place);
    if (transition === 'owner') h.switchTrip({ ownerId: 'owner-b' });
    if (transition === 'document') h.switchTrip({ id: 'different-canonical-trip' });
    if (transition === 'unmount') h.unmount(); else h.render();
    h.focus.length = 0; h.acceptance.resolve(true); await pending; h.render();
    assert.deepEqual(h.focus, []);
    if (transition !== 'unmount') assert.equal(h.input(h.intentA.id), null, 'foreign scope cannot retain the previous document editor');
  });
}

test('Builder destination selection blocks an immediate duplicate request and shows existing disabled state', async () => {
  const h = harness(); await h.open(h.intentA.id);
  const choose = h.input(h.intentA.id).props.onSelect, pending = choose(h.place);
  choose(h.place); assert.equal(h.requests.length, 1); assert.equal(h.input(h.intentA.id).props.disabled, true);
  h.acceptance.resolve(false); await pending;
  assert.equal(h.input(h.intentA.id).props.disabled, false);
});

test('an old autocomplete callback cannot select against a later active editor or protected scope', async () => {
  const h = harness(); await h.open(h.intentA.id);
  const oldInput = h.input(h.intentA.id);
  h.escape(h.intentA.id); await h.open(h.intentB.id);
  oldInput.props.onSelect(h.place); assert.equal(h.requests.length, 0);
  h.setDisabled(true); h.render(); h.input(h.intentB.id).props.onSelect(h.place); assert.equal(h.requests.length, 0);
});

test('delayed editor opening handles false, rejection, cancellation and duplicate clicks', async () => {
  for (const outcome of ['false', 'rejected', 'unmounted', 'owner'] as const) {
    const gate = deferred<boolean>(), h = harness(gate), click = h.tag(h.intentA.id).props.onEdit, pending = click();
    click(); assert.equal(h.edits.length, 1);
    if (outcome === 'unmounted') h.unmount();
    if (outcome === 'owner') { h.switchTrip({ ownerId: 'owner-b' }); h.render(); }
    if (outcome === 'rejected') gate.reject(new Error('fixture edit refusal')); else gate.resolve(outcome !== 'false');
    await pending; h.render(); assert.equal(h.input(h.intentA.id), null); assert.deepEqual(h.focus, []);
  }
});

test('the latest destination edit request owns a delayed editor opening', async () => {
  const gate = deferred<boolean>(), h = harness(gate);
  const first = h.tag(h.intentA.id).props.onEdit(), second = h.tag(h.intentB.id).props.onEdit();
  assert.deepEqual(h.edits, [h.intentA.id, h.intentB.id]); gate.resolve(true);
  assert.equal(await first, false); assert.equal(await second, true);
  h.render(); assert.equal(h.input(h.intentA.id), null); assert.ok(h.input(h.intentB.id));
  assert.deepEqual(h.focus, [h.intentB.id]);
});

test('mount effect replay preserves the live autocomplete handler lifecycle', async () => {
  const h = harness(); await h.open(h.intentA.id);
  const input = h.input(h.intentA.id); h.replayMount();
  const pending = input.props.onSelect(h.place); h.acceptance.resolve(true);
  assert.equal(await pending, true); assert.equal(h.requests.length, 1);
  assert.equal(h.input(h.intentA.id), null);
});

test('protected controls appearing during acceptance preserve the pending editor', async () => {
  const h = harness(); await h.open(h.intentA.id);
  const pending = h.input(h.intentA.id).props.onSelect(h.place);
  h.setDisabled(true); h.render(); h.focus.length = 0;
  h.acceptance.resolve(true); assert.equal(await pending, false);
  assert.ok(h.input(h.intentA.id)); assert.deepEqual(h.focus, []);
});

for (const [label, value] of Object.entries({ object: { accepted: true }, string: 'accepted', number: 1, undefined })) {
  test(`Builder selection preserves input and focus for a dynamic ${label} result`, async () => {
    const h = harness(); await h.open(h.intentA.id);
    h.input(h.intentA.id).props.onChange('  retained raw input  '); h.render(); h.focus.length = 0;
    const pending = h.input(h.intentA.id).props.onSelect(h.place);
    h.acceptance.resolve(value); assert.equal(await pending, false);
    assert.equal(h.input(h.intentA.id).props.value, '  retained raw input  '); assert.deepEqual(h.focus, []);
  });

  test(`Builder opening refuses a dynamic ${label} result instead of literal true`, async () => {
    const gate = deferred<unknown>(), h = harness(gate), pending = h.tag(h.intentA.id).props.onEdit();
    gate.resolve(value); assert.equal(await pending, false); h.render();
    assert.equal(h.input(h.intentA.id), null); assert.deepEqual(h.focus, []);
  });
}

test('pending Builder acceptance started before effect replay remains stale after setup', async () => {
  const h = harness(); await h.open(h.intentA.id);
  const pending = h.input(h.intentA.id).props.onSelect(h.place);
  h.replayMount(); h.focus.length = 0; h.acceptance.resolve(true);
  assert.equal(await pending, false); assert.ok(h.input(h.intentA.id)); assert.deepEqual(h.focus, []);
});

test('stale Builder completion cannot clear a fresh pending operation after effect replay', async () => {
  const h = harness(); await h.open(h.intentA.id);
  const old = h.input(h.intentA.id).props.onSelect(h.place);
  h.replayMount(); const gate = deferred<unknown>(); h.useAcceptance(gate);
  const fresh = h.input(h.intentA.id).props.onSelect(h.place);
  assert.equal(h.requests.length, 2); h.acceptance.resolve(true); assert.equal(await old, false);
  assert.equal(h.input(h.intentA.id).props.disabled, true);
  gate.resolve(true); assert.equal(await fresh, true); assert.equal(h.input(h.intentA.id), null);
});

test('Builder range preview is scoped to account trip and canonical date source',()=>{
 const h=harness();const picker=(tree:any)=>h.find(tree,(node:any)=>node.props?.mode==='range'&&node.props?.commitRangeOnEnd===true);
 const a=picker(h.render());assert.ok(a);const key=a.key;
 h.switchTrip({ownerId:'owner-b'});const ownerKey=picker(h.render()).key;assert.notEqual(ownerKey,key);
 h.switchTrip({id:'another-trip'});const tripKey=picker(h.render()).key;assert.notEqual(tripKey,ownerKey);
 h.switchTrip({endDate:'2026-10-20'});const dateKey=picker(h.render()).key;assert.notEqual(dateKey,tripKey);
 h.switchTrip({title:'Unrelated title'});assert.equal(picker(h.render()).key,dateKey);h.unmount();
});
