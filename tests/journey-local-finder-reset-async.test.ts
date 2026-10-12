import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const file = 'components/journey-local-finder.tsx';
const text = readFileSync(file, 'utf8');
const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function find(predicate: (node: ts.Node) => boolean) {
  let found: ts.Node | undefined;
  function visit(node: ts.Node) { if (!found && predicate(node)) found = node; ts.forEachChild(node, visit); }
  visit(source); return found;
}
function variable(name: string) {
  return find(node => ts.isVariableDeclaration(node) && node.name.getText(source) === name) as ts.VariableDeclaration | undefined;
}
function evaluate(code: string, scope: Record<string, unknown>) {
  const js = ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  return new Function('scope', `with(scope){${js}}`)(scope);
}
function handler(name: string, scope: Record<string, unknown>) {
  const declaration = variable(name);
  assert.ok(declaration?.initializer, `actual ${name} exists`);
  return evaluate(`return ${declaration.initializer.getText(source)};`, scope);
}
function callback(predicate: (node: ts.ArrowFunction) => boolean, scope: Record<string, unknown>) {
  const node = find(node => ts.isArrowFunction(node) && predicate(node)) as ts.ArrowFunction | undefined;
  assert.ok(node, 'actual UI/effect callback exists');
  return evaluate(`return ${node.getText(source)};`, scope);
}
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const placeA = { id: 'synthetic-a', name: 'Synthetic A' };
const placeB = { id: 'synthetic-b', name: 'Synthetic B' };
type Action = 'reset' | 'save';
type Field = 'chosen' | 'saved' | 'meal' | 'pace' | 'mood' | 'moment';

/** Actual production handlers, setter hooks and UI callbacks, with deferred
 * acceptance and a synthetic React queue. No provider or browser store runs. */
function harness(options: { queued?: boolean; legacy?: boolean; absentPort?: boolean; empty?: boolean; stay?: boolean } = {}) {
  const state: Record<Field, any> = {
    chosen: options.empty ? null : placeA, saved: options.empty ? null : placeA,
    meal: 'dinner', pace: 'relaxed', mood: 'local', moment: 'now',
  };
  const props: Record<string, any> = {
    ownerId: 'owner-a', contextOwnerId: 'owner-a', tripId: 'trip-a', stopId: 'stop-a', dayId: 'day-a',
    kind: options.stay ? 'stay' : 'restaurant', canonicalPlaceId: 'canonical-a', selectedPlaceId: null,
    city: 'Synthetic city', country: 'Synthetic country', longitude: 1, latitude: 2, locale: 'en',
    staySearch: undefined, autoSelectFirst: true,
    savedPlaceIds: options.legacy ? undefined : [placeA.id],
  };
  const accepted = deferred<unknown>(), requests: Array<{ action: Action; place: any; kind: string; replaced?: any }> = [];
  const actionScopeRef = { current: '' }, actionVersionRef = { current: 0 }, mountedRef = { current: true };
  const finderIntentRevisionRef = { current: 0 }, actionLifetimeRef = { current: 0 };
  const pendingActionRef = { current: null as null | { version: number; isCurrent: () => boolean } };
  const reportedSaveRef = { current: '' }, autoSelectedRef = { current: false };
  const refs: any[] = [], effects: Array<{ setup: () => void | (() => void); cleanup: void | (() => void) }> = [];
  let cursor = 0;
  const queue: Array<{ field: Field; next: any }> = [];
  let rawStore = JSON.stringify({ 'day-a': placeA }), writes = 0;
  const hooks = {
    useRef: (value: unknown) => refs[cursor++] ??= { current: value },
    useCallback: (value: unknown) => value,
    useEffect: (setup: () => void | (() => void)) => {
      const index = cursor++;
      if (!(index in refs)) { const effect = { setup, cleanup: setup() }; refs[index] = effect; effects.push(effect); }
    },
  };
  const scopeHook = find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'useLocalFinderActionScope');
  const setterHook = find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'useLocalFinderIntentSetter');
  const useLocalFinderActionScope = scopeHook ? evaluate(`${scopeHook.getText(source)}\nreturn useLocalFinderActionScope;`, hooks) : undefined;
  const useLocalFinderIntentSetter = setterHook ? evaluate(`${setterHook.getText(source)}\nreturn useLocalFinderIntentSetter;`, hooks) : undefined;
  const rawSet = (field: Field) => (next: any) => {
    if (options.queued) queue.push({ field, next });
    else state[field] = typeof next === 'function' ? next(state[field]) : next;
  };
  let oldMountEffectInstalled = false;
  function render() {
    cursor = 0;
    const scope: Record<string, any> = {
      ...props, ...state, ...hooks, actionScopeRef, actionVersionRef, finderIntentRevisionRef, actionLifetimeRef,
      pendingActionRef, mountedRef, reportedSaveRef, autoSelectedRef, useLocalFinderActionScope, useLocalFinderIntentSetter,
      canonicalSavedState: !options.legacy, storageKey: 'synthetic-local-key', onPlaceSelect: () => {},
      displayPlaces: [placeA, placeB], candidates: [{ place: placeB }],
      onSavePlace: options.absentPort ? undefined : (place: any, kind: string, replaced?: any) => { requests.push({ action: 'save', place, kind, replaced }); return accepted.promise; },
      onRemovePlace: options.absentPort ? undefined : (place: any, kind: string) => { requests.push({ action: 'reset', place, kind }); return accepted.promise; },
      window: { localStorage: { getItem: () => rawStore, setItem: (_key: string, value: string) => { rawStore = value; writes++; } } },
    };
    for (const field of ['meal', 'pace', 'mood', 'moment', 'chosen', 'saved'] as const) {
      const name = `set${field[0]!.toUpperCase()}${field.slice(1)}`;
      scope[name] = rawSet(field); scope[`${name}State`] = scope[name];
      if (variable(name)) scope[name] = handler(name, scope);
    }
    scope.actionScope = handler('actionScope', scope);
    if (text.includes('actionScopeRef.current = actionScope')) actionScopeRef.current = scope.actionScope;
    if (variable('captureFinderActionScope')) scope.captureFinderActionScope = handler('captureFinderActionScope', scope);
    if (!scopeHook && !oldMountEffectInstalled) {
      const setup = callback(node => node.getText(source).includes('mountedRef.current = true'), scope);
      effects.push({ setup, cleanup: setup() }); oldMountEffectInstalled = true;
    }
    const filters = Object.fromEntries(['meal', 'pace', 'mood', 'moment'].map(field => {
      const name = `set${field[0]!.toUpperCase()}${field.slice(1)}`;
      const fn = (option: string) => callback(node => ts.isJsxExpression(node.parent)
        && ts.isJsxAttribute(node.parent.parent) && node.parent.parent.name.getText(source) === 'onClick'
        && node.body.getText(source) === `${name}(option${field === 'moment' ? '.value' : ''})`,
      { ...scope, option: field === 'moment' ? { value: option } : option })();
      return [field, fn];
    }));
    return {
      reset: handler('reset', scope), save: handler('save', scope), choose: handler('choosePlace', scope), filters,
      clear: callback(node => ts.isPropertyAssignment(node.parent) && node.parent.name.getText(source) === 'clearSelection', scope),
      selectEffect: callback(node => node.body.getText(source).includes('if (!selectedPlaceId) return;'), scope),
      autoEffect: callback(node => node.body.getText(source).includes('if (!autoSelectFirst'), scope),
      setters: Object.fromEntries(['meal', 'pace', 'mood', 'moment', 'chosen', 'saved'].map(field => [field, scope[`set${field[0]!.toUpperCase()}${field.slice(1)}`]])),
    };
  }
  function flush(count = queue.length) {
    for (let i = 0; i < count && queue.length; i++) { const { field, next } = queue.shift()!; state[field] = typeof next === 'function' ? next(state[field]) : next; }
  }
  return { state, props, accepted, requests, render, flush, queue, reportedSaveRef,
    store: () => ({ rawStore, writes }),
    unmount: () => effects.forEach(effect => { if (effect.cleanup) effect.cleanup(); }),
    replay: () => { effects.forEach(effect => { if (effect.cleanup) effect.cleanup(); }); effects.forEach(effect => { effect.cleanup = effect.setup(); }); },
  };
}
const view = (h: ReturnType<typeof harness>) => structuredClone(h.state);

for (const action of ['reset', 'save'] as const) {
  test(`${action}: unchanged deferred true completes once`, async () => {
    const h = harness({ legacy: true }), pending = h.render()[action]();
    assert.equal(h.requests.length, 1); h.accepted.resolve(true); await pending;
    if (action === 'reset') { assert.equal(h.state.chosen, null); assert.equal(h.state.saved, null); assert.equal(h.store().writes, 1); }
    else { assert.equal(h.reportedSaveRef.current, 'restaurant:day-a:synthetic-a'); assert.equal(h.store().writes, 1); }
  });
  for (const result of [false, undefined, null, {}, 'accepted', 1]) test(`${action}: only literal true acknowledges ${String(result)}`, async () => {
    const h = harness({ legacy: true }), before = view(h), pending = h.render()[action]();
    h.accepted.resolve(result); await pending;
    assert.deepEqual(view(h), before); assert.equal(h.store().writes, 0); assert.equal(h.reportedSaveRef.current, '');
  });
  test(`${action}: rejected port preserves state and permits retry`, async () => {
    const h = harness({ legacy: true }), before = view(h), pending = h.render()[action]();
    h.accepted.reject(new Error('Synthetic refusal')); await pending;
    assert.deepEqual(view(h), before); assert.equal(h.store().writes, 0);
    await h.render()[action](); assert.equal(h.requests.length, 2);
  });
  for (const transition of ['choose', 'clear', 'meal', 'pace', 'mood', 'moment'] as const) {
    test(`${action}: actual ${transition} callback before render retires older completion`, async () => {
      const h = harness({ legacy: true }), ui = h.render(), pending = ui[action]();
      if (transition === 'choose') ui.choose(placeB);
      else if (transition === 'clear') ui.clear();
      else ui.filters[transition]!({ meal: 'lunch', pace: 'quick', mood: 'comfort', moment: 'free-hour' }[transition]);
      const before = view(h); h.accepted.resolve(true); await pending;
      assert.deepEqual(view(h), before); assert.equal(h.store().writes, 0); assert.equal(h.reportedSaveRef.current, '');
    });
  }
  for (const transition of ['ownerId', 'contextOwnerId', 'tripId', 'stopId', 'dayId', 'kind', 'selectedPlaceId', 'unmount', 'replay'] as const) {
    test(`${action}: ${transition} rejects stale view and storage publication`, async () => {
      const h = harness({ legacy: true }), pending = h.render()[action]();
      if (transition === 'unmount') h.unmount();
      else if (transition === 'replay') h.replay();
      else { h.props[transition] = `changed-${transition}`; h.render(); }
      const before = view(h); h.accepted.resolve(true); await pending;
      assert.deepEqual(view(h), before); assert.equal(h.store().writes, 0); assert.equal(h.reportedSaveRef.current, '');
    });
  }
  test(`${action}: document A to B to A cannot revive an old callback`, async () => {
    const h = harness({ legacy: true }), pending = h.render()[action]();
    h.props.tripId = 'trip-b'; h.render(); h.props.tripId = 'trip-a'; h.render();
    const before = view(h); h.accepted.resolve(true); await pending;
    assert.deepEqual(view(h), before); assert.equal(h.store().writes, 0);
  });
  test(`${action}: repeated clicks invoke one pending port`, async () => {
    const h = harness({ legacy: true }), ui = h.render(), first = ui[action](), second = ui[action]();
    assert.equal(h.requests.length, 1); h.accepted.resolve(true); await Promise.all([first, second]);
    assert.equal(h.store().writes, 1);
  });
  test(`${action}: fresh action after effect replay remains usable`, async () => {
    const h = harness({ legacy: true }), oldUi = h.render(); h.replay();
    const pending = oldUi[action](); h.accepted.resolve(true); await pending;
    assert.equal(h.requests.length, 1); assert.equal(h.store().writes, 1);
  });
  for (const transition of ['document', 'selection', 'replay'] as const) test(`${action}: fresh ${transition} action can proceed while old scope awaits`, async () => {
    const h = harness({ legacy: true }), oldUi = h.render(), first = oldUi[action]();
    if (transition === 'document') h.props.tripId = 'trip-b';
    else if (transition === 'selection') oldUi.choose(placeB);
    else h.replay();
    const nextUi = h.render(), second = nextUi[action]();
    assert.equal(h.requests.length, 2);
    h.accepted.resolve(true); await Promise.all([first, second]); assert.equal(h.store().writes, 1);
    if (action === 'save' && transition === 'selection') assert.equal(h.reportedSaveRef.current, 'restaurant:day-a:synthetic-b');
  });
  for (const result of ['false', 'rejection'] as const) test(`${action}: refused older result preserves actual newer selection and filters`, async () => {
    const h = harness({ legacy: true }), ui = h.render(), pending = ui[action]();
    ui.choose(placeB); ui.filters.meal!('lunch'); ui.filters.mood!('comfort'); const before = view(h);
    if (result === 'false') h.accepted.resolve(false); else h.accepted.reject(new Error('Synthetic refused old action'));
    await pending; assert.deepEqual(view(h), before); assert.equal(h.store().writes, 0);
    assert.equal(h.requests[0]!.place.id, placeA.id);
  });
  test(`${action}: absent callback retains explicit local fallback`, async () => {
    const h = harness({ legacy: true, absentPort: true }); await h.render()[action]();
    assert.equal(h.requests.length, 0); assert.equal(h.store().writes, 1);
  });
}

test('canonical reset clears unchanged selection without writing native local fallback', async () => {
  const h = harness(), pending = h.render().reset(); h.accepted.resolve(true); await pending;
  assert.equal(h.state.chosen, null); assert.equal(h.state.saved, null); assert.equal(h.store().writes, 0);
  assert.equal(h.requests[0]!.place.id, placeA.id);
});
test('reset with no target needs no removal port and restores defaults', async () => {
  const h = harness({ empty: true }); h.state.meal = 'lunch'; h.state.mood = 'comfort'; await h.render().reset();
  assert.equal(h.state.meal, 'dinner'); assert.equal(h.state.mood, 'local'); assert.equal(h.requests.length, 0);
});
test('external selected-place effect before next render protects new selection', async () => {
  const h = harness(), pending = h.render().reset(); h.props.selectedPlaceId = placeB.id;
  h.render().selectEffect(); const before = view(h); h.accepted.resolve(true); await pending; assert.deepEqual(view(h), before);
});
test('actual stay auto-selection effect retires an older reset', async () => {
  const h = harness({ stay: true }), pending = h.render().reset(); h.state.saved = null;
  h.render().autoEffect(); const before = view(h); h.accepted.resolve(true); await pending; assert.deepEqual(view(h), before);
});
test('direct no-op filters and unchanged selection retain valid reset', async () => {
  const h = harness(), ui = h.render(), pending = ui.reset();
  ui.choose(placeA); ui.filters.meal!('dinner'); ui.filters.pace!('relaxed'); ui.filters.mood!('local'); ui.filters.moment!('now');
  h.accepted.resolve(true); await pending; assert.equal(h.state.chosen, null);
});
test('queued actual choice and filter retire reset synchronously before React applies them', async () => {
  const h = harness({ queued: true }), ui = h.render(), pending = ui.reset();
  ui.choose(placeB); ui.filters.meal!('lunch'); ui.filters.mood!('comfort');
  h.accepted.resolve(true); await pending; h.flush();
  assert.equal(h.state.chosen.id, placeB.id); assert.equal(h.state.meal, 'lunch'); assert.equal(h.state.mood, 'comfort');
});
test('functional setter preserves React queue ordering through stale and partial renders', async () => {
  const h = harness({ queued: true }), ui = h.render(), pending = ui.reset();
  const toggle = (current: string) => current === 'local' ? 'comfort' : 'local';
  ui.setters.mood(toggle); ui.setters.mood(toggle); h.render(); h.flush(1);
  h.render().setters.mood(toggle); h.accepted.resolve(true); await pending; h.flush();
  assert.equal(h.state.mood, 'comfort'); assert.equal(h.state.chosen.id, placeA.id);
});
