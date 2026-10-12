import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { canonicalRouteFixture } from './fixtures/batch14-route-documents.ts';
import { requireReadableTripDocument } from '../lib/easyt/trip-document.ts';
import { insertItineraryActivity } from '../lib/easyt/itinerary-mutations.ts';
import { itineraryIdeaForPlace, removeItineraryIdea, saveItineraryIdea } from '../lib/easyt/itinerary-ideas.ts';
import { legacyItineraryIdeas, type EasyTTrip } from '../lib/easyt/trip.ts';

const file = 'components/journey-map-planner-workspace.tsx';
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
  assert.ok(declaration?.initializer, `actual ${name} handler exists`);
  return evaluate(`return ${declaration.initializer.getText(source)};`, scope);
}
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const tick = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };
type Action = 'addActivity' | 'addPin' | 'savePinEdit' | 'removeSelectedRecommendation' | 'removeSelectedPin';

/** Executes the production handlers and updatePlannerTrip. Only the mutation
 * storage boundary is deferred; no browser, provider or native store runs. */
function harness(queued = false, queuedUi = false, callerResult?: unknown, nativeResult?: { stored: unknown }) {
  let trip = requireReadableTripDocument(canonicalRouteFixture());
  const idea = itineraryIdeaForPlace({ stopId: trip.stops[0]!.id, place: {
    id: 'synthetic-museum', title: 'Synthetic museum', area: 'Tokyo', type: 'Culture', tags: ['Culture'],
    description: 'Deterministic place', coordinates: [139.7, 35.7], qualityScore: 10,
  }, reasons: [] });
  trip = requireReadableTripDocument(saveItineraryIdea(trip, idea));
  const pinA = { id: 'pin-a', title: 'Pin A', category: 'activity', dayNumber: 2, longitude: 139.7, latitude: 35.7 };
  const pinB = { ...pinA, id: 'pin-b', title: 'Pin B' };
  trip = { ...trip, brief: { ...trip.brief, mapPins: [pinA, pinB] } } as typeof trip;
  const state: Record<string, any> = {
    activityDraft: 'Old activity', pinDraft: 'Old pin', pinCoordinates: [139.8, 35.8], pinCategory: 'activity',
    pinPlacementMode: false, selectedPlannerPin: pinA, pinEditDraft: 'Renamed A',
    selectedPlanItem: trip.planItems.find(day => day.dayNumber === 2)!,
    selectedDayId: `${trip.id}-calendar-2`,
    selectedLocalPlace: { selectionId: 'result-a', kind: 'see', sourceId: 'synthetic-museum', canonicalItemId: idea.id, stopId: trip.stops[0]!.id },
    selectedRouteLegId: null, workspacePlaceSelection: { kind: 'none' }, shapeDayTab: 'plan', mapMode: 'detail',
    mobileShapeDayOpen: true, mobileMapDrawerOpen: false,
  };
  const accepted = deferred<boolean>(), updateGate = deferred<void>();
  const mountedRef = { current: true }, documentIdentityRef = { current: '' }, tripRef = { current: trip as EasyTTrip | null };
  const pendingPlannerWriteRef = { current: null as Promise<boolean> | null };
  const plannerActionRevisionRef = { current: 0 };
  const plannerActionLifetimeRef = { current: 0 };
  const requests: EasyTTrip[] = [], feedback: string[] = [];
  const uiQueue: Array<{ name: string; next: any }> = [];
  const hookRefs: any[] = []; let cursor = 0;
  const effects: Array<{ setup: () => void | (() => void); cleanup: void | (() => void) }> = [];
  const hooks = {
    useRef: (value: unknown) => hookRefs[cursor++] ??= { current: value }, useCallback: (callback: unknown) => callback,
    useEffect: (setup: () => void | (() => void)) => {
      const index = cursor++;
      if (!(index in hookRefs)) { const effect = { setup, cleanup: setup() }; hookRefs[index] = effect; effects.push(effect); }
    },
  };
  const scopeHook = find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'useMapPlannerActionScope');
  const useMapPlannerActionScope = scopeHook
    ? evaluate(`${scopeHook.getText(source)}\nreturn useMapPlannerActionScope;`, hooks)
    : undefined;
  const setterHook = find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'useMapPlannerIntentSetter');
  const useMapPlannerIntentSetter = setterHook
    ? evaluate(`${setterHook.getText(source)}\nreturn useMapPlannerIntentSetter;`, hooks)
    : undefined;
  const set = (name: string) => (next: any) => {
    if (queuedUi) uiQueue.push({ name, next });
    else state[name] = typeof next === 'function' ? next(state[name]) : next;
  };
  function render() {
    cursor = 0;
    const plannerDocumentIdentity = JSON.stringify([trip.ownerId, trip.id]);
    documentIdentityRef.current = plannerDocumentIdentity; tripRef.current = trip;
    const scope: Record<string, any> = {
      ...state, selectedMapResult: state.selectedLocalPlace, ...hooks, useMapPlannerActionScope, useMapPlannerIntentSetter, plannerActionRevisionRef, plannerActionLifetimeRef, plannerDocumentIdentity, mountedRef, documentIdentityRef,
      customTrip: trip, tripRef, pendingPlannerWriteRef, activeBrowserOwnerId: trip.ownerId,
      session: { user: { id: trip.ownerId } }, cloudConflictTrip: null,
      canonicalMutation: nativeResult ? null : { async mutateTrip(update: (current: EasyTTrip) => EasyTTrip) {
        if (queued) await updateGate.promise;
        const next = update(structuredClone(trip)); requests.push(next);
        const stored = await accepted.promise;
        if (stored === true) trip = requireReadableTripDocument(next);
        return stored;
      } },
      customBriefFromEasyT: () => ({}), insertItineraryActivity, legacyItineraryIdeas, removeItineraryIdea,
      setCustomTrip: (next: EasyTTrip) => { trip = requireReadableTripDocument(next); }, setCustomBrief: () => {},
      setLastPlannerTrip: () => feedback.push('undo'), setUndoMessage: () => {},
      setCloudSaveError: (message: string) => { if (message) feedback.push('error'); }, setCloudSaveState: () => {},
      setCloudAuthInterrupted: () => {}, setHasUnsavedChanges: () => {},
      savePlannerRecovery: nativeResult ? async () => nativeResult : () => { throw new Error('Unexpected native persistence'); }, persistPlannerMutation: () => {},
      drawerScrollResetRef: { current: false },
      setActivityDraft: set('activityDraft'), setPinDraft: set('pinDraft'), setPinCoordinates: set('pinCoordinates'),
      setPinPlacementMode: set('pinPlacementMode'), setSelectedPlannerPin: set('selectedPlannerPin'),
      setSelectedMapResult: set('selectedLocalPlace'), setSelectedRouteLegId: set('selectedRouteLegId'),
      setMapMode: set('mapMode'), setMobileShapeDayOpen: set('mobileShapeDayOpen'), setMobileMapDrawerOpen: set('mobileMapDrawerOpen'),
      clearSelectedLocalPlace: () => { state.selectedLocalPlace = null; },
      removeMappedStayForStop: () => { throw new Error('Unexpected stay action'); },
    };
    for (const name of ['activityDraft', 'pinDraft', 'pinCoordinates', 'pinCategory', 'pinPlacementMode', 'selectedPlannerPin', 'pinEditDraft',
      'selectedMapResult', 'selectedDayId', 'selectedRouteLegId', 'workspacePlaceSelection', 'shapeDayTab', 'mapMode', 'mobileShapeDayOpen', 'mobileMapDrawerOpen']) {
      const setter = `set${name[0]!.toUpperCase()}${name.slice(1)}`, declaration = variable(setter);
      const raw = name === 'selectedMapResult' ? set('selectedLocalPlace') : set(name);
      scope[setter + 'State'] = raw;
      scope[setter] = declaration?.initializer ? evaluate(`return ${declaration.initializer.getText(source)};`, scope) : raw;
    }
    const capture = variable('capturePlannerActionScope');
    scope.capturePlannerActionScope = capture?.initializer ? evaluate(`return ${capture.initializer.getText(source)};`, scope) : () => () => true;
    scope.updatePlannerTrip = handler('updatePlannerTrip', scope);
    if (callerResult !== undefined) scope.updatePlannerTrip = async () => callerResult;
    scope.removeSelectedRecommendation = handler('removeSelectedRecommendation', scope);
    const actions: Record<string, () => Promise<unknown>> = {};
    for (const name of ['addActivity', 'addPin', 'savePinEdit'] as const) actions[name] = handler(name, scope);
    const oldRemoval = find(node => ts.isJsxAttribute(node) && node.name.getText(source) === 'onRemove'
      && node.getText(source).includes('clearSelectedLocalPlace()')) as ts.JsxAttribute | undefined;
    const oldRemoveArrow = oldRemoval && findWithin(oldRemoval, node => ts.isArrowFunction(node) && node.getText(source).includes('clearSelectedLocalPlace()'));
    actions.removeSelectedRecommendation = oldRemoveArrow ? evaluate(`return ${oldRemoveArrow.getText(source)};`, scope) : scope.removeSelectedRecommendation;
    const pinRemoval = variable('removeSelectedPin')?.initializer
      ?? find(node => ts.isArrowFunction(node) && node.getText(source).includes('Map pin removed') && node.getText(source).includes('setSelectedPlannerPin(null)'));
    assert.ok(pinRemoval, 'actual pin removal handler exists');
    actions.removeSelectedPin = evaluate(`return ${pinRemoval.getText(source)};`, scope);
    const toggle = find(node => ts.isArrowFunction(node) && node.getText(source).includes('setMobileMapDrawerOpen((open) => !open)'));
    assert.ok(toggle, 'actual functional drawer toggle exists');
    return Object.assign(actions, {
      change: (name: string, value: unknown) => scope[`set${name[0]!.toUpperCase()}${name.slice(1)}`](value),
      toggleDrawer: evaluate(`return ${toggle.getText(source)};`, { ...scope, suppressDrawerClickRef: { current: false } }),
    });
  }
  return { render, state, accepted, updateGate, requests, feedback, pinA, pinB, trip: () => trip,
    queuedUi: () => uiQueue.length,
    flushUi: (count = uiQueue.length) => { for (const { name, next } of uiQueue.splice(0, count)) state[name] = typeof next === 'function' ? next(state[name]) : next; },
    switchOwner: () => { trip = { ...trip, ownerId: 'owner-b' }; },
    switchDocument: () => { trip = { ...trip, id: 'other-trip' }; },
    patchTrip: (patch: (current: typeof trip) => typeof trip) => { trip = patch(trip); },
    replayEffects: () => { effects.forEach(effect => { if (effect.cleanup) effect.cleanup(); }); effects.forEach(effect => { effect.cleanup = effect.setup(); }); },
    unmount: () => { mountedRef.current = false; effects.forEach(effect => { if (effect.cleanup) effect.cleanup(); }); },
  };
}
function findWithin(parent: ts.Node, predicate: (node: ts.Node) => boolean) {
  let found: ts.Node | undefined;
  function visit(node: ts.Node) { if (!found && predicate(node)) found = node; ts.forEachChild(node, visit); }
  visit(parent); return found;
}
function view(h: ReturnType<typeof harness>) {
  const { activityDraft, pinDraft, pinCoordinates, pinPlacementMode, selectedPlannerPin, pinEditDraft, selectedLocalPlace,
    mapMode, mobileShapeDayOpen, mobileMapDrawerOpen } = h.state;
  return structuredClone({ activityDraft, pinDraft, pinCoordinates, pinPlacementMode, selectedPlannerPin, pinEditDraft,
    selectedLocalPlace, mapMode, mobileShapeDayOpen, mobileMapDrawerOpen });
}
const actions: Action[] = ['addActivity', 'addPin', 'savePinEdit', 'removeSelectedRecommendation', 'removeSelectedPin'];
for (const action of actions) {
  test(`${action} waits for accepted persistence before resetting its original UI intent`, async () => {
    const h = harness(), before = view(h), recommendationId = h.state.selectedLocalPlace.canonicalItemId, pending = h.render()[action]!();
    await tick(); assert.deepEqual(view(h), before); assert.deepEqual(h.feedback, []);
    h.accepted.resolve(true); await pending;
    assert.notDeepEqual(view(h), before);
    assert.deepEqual(h.feedback, ['undo']);
    if (action === 'addActivity') assert.ok(h.trip().planItems.find(day => day.dayNumber === 2)!.notes.includes('Old activity'));
    if (action === 'addPin') assert.ok(h.trip().brief.mapPins!.some(pin => pin.title === 'Old pin'));
    if (action === 'savePinEdit') assert.equal(h.trip().brief.mapPins!.find(pin => pin.id === 'pin-a')!.title, 'Renamed A');
    if (action === 'removeSelectedPin') assert.equal(h.trip().brief.mapPins!.some(pin => pin.id === 'pin-a'), false);
    if (action === 'removeSelectedRecommendation') assert.equal(legacyItineraryIdeas(h.trip().brief.itineraryIdeas).some(idea => idea.id === recommendationId), false);
  });
  for (const outcome of ['false', 'rejection'] as const) test(`${action} retains input/selection on ${outcome} without Undo`, async () => {
    const h = harness(), before = view(h), document = JSON.stringify(h.trip()), pending = h.render()[action]!();
    if (outcome === 'false') h.accepted.resolve(false); else h.accepted.reject(new Error('Synthetic persistence refusal'));
    await pending; assert.deepEqual(view(h), before); assert.equal(JSON.stringify(h.trip()), document);
    assert.equal(h.feedback.includes('undo'), false);
  });
  for (const transition of ['owner', 'document', 'day', 'unmount'] as const) test(`${action} publishes no stale view change after ${transition}`, async () => {
    const h = harness(), pending = h.render()[action]!();
    if (transition === 'owner') h.switchOwner();
    if (transition === 'document') h.switchDocument();
    if (transition === 'day') h.state.selectedPlanItem = { ...h.state.selectedPlanItem, id: 'other-day', dayNumber: 3 };
    if (transition === 'unmount') h.unmount(); else h.render();
    const before = view(h); h.accepted.resolve(true); await pending; assert.deepEqual(view(h), before);
  });
  test(`${action} repeat clicks use the existing single pending planner write`, async () => {
    const h = harness(), callback = h.render()[action]!, first = callback(), second = callback();
    await tick(); assert.equal(h.requests.length, 1); h.accepted.resolve(true); await Promise.all([first, second]);
    assert.equal(h.feedback.filter(event => event === 'undo').length, 1);
  });
}
for (const action of actions) test(`${action} cannot overwrite newer input or a newer selection`, async () => {
  const h = harness(), pending = h.render()[action]!();
  h.state.activityDraft = 'New activity'; h.state.pinDraft = 'New pin'; h.state.pinCoordinates = [9, 10];
  h.state.pinPlacementMode = true; h.state.selectedPlannerPin = h.pinB; h.state.pinEditDraft = 'New B draft';
  h.state.selectedLocalPlace = { ...h.state.selectedLocalPlace, selectionId: 'result-b', sourceId: 'other-place', canonicalItemId: 'other-idea' };
  h.render(); const before = view(h); h.accepted.resolve(true); await pending; assert.deepEqual(view(h), before);
});
for (const action of actions) test(`${action} old render callback cannot start after an input/selection cycle`, async () => {
  const h = harness(), old = h.render()[action]!, original = view(h);
  h.state.activityDraft = 'Different input'; h.state.selectedPlannerPin = h.pinB; h.render();
  Object.assign(h.state, original); h.render(); const pending = old(); await tick();
  assert.equal(h.requests.length, 0); h.accepted.resolve(true); await pending;
});
test('queued activity projection retains the submitted title/day while newer text stays untouched', async () => {
  const h = harness(true), pending = h.render().addActivity!();
  h.state.activityDraft = 'New text'; h.state.selectedPlanItem = { ...h.state.selectedPlanItem, id: 'other-day', dayNumber: 3 }; h.render();
  h.updateGate.resolve(); h.accepted.resolve(true); await pending;
  assert.equal(h.state.activityDraft, 'New text');
  assert.ok(h.trip().planItems.find(day => day.dayNumber === 2)!.notes.includes('Old activity'));
  assert.equal(h.trip().planItems.find(day => day.dayNumber === 3)!.notes.includes('Old activity'), false);
});

for (const [action, field, value] of [
  ['addActivity', 'activityDraft', 'Only newer activity text'],
  ['addPin', 'pinDraft', 'Only newer pin text'],
  ['addPin', 'pinCoordinates', [9, 10]],
  ['addPin', 'pinCategory', 'stay'],
  ['addPin', 'pinPlacementMode', true],
  ['addPin', 'mobileMapDrawerOpen', true],
  ['savePinEdit', 'pinEditDraft', 'Only newer rename text'],
  ['removeSelectedRecommendation', 'selectedMapResult', { selectionId: 'result-b', sourceId: 'other-result' }],
] as const) test(`${action} preserves an isolated ${field} change, including before a render`, async () => {
  for (const commit of [false, true]) {
    const h = harness(), callbacks = h.render(), pending = callbacks[action]!();
    callbacks.change(field, value); if (commit) h.render();
    const before = view(h); h.accepted.resolve(true); await pending; assert.deepEqual(view(h), before);
  }
});
for (const action of ['savePinEdit', 'removeSelectedPin'] as const) test(`${action} cannot replace selection changed before the next render`, async () => {
  const h = harness(), callbacks = h.render(), pending = callbacks[action]!();
  callbacks.change('selectedPlannerPin', h.pinB); const before = view(h);
  h.accepted.resolve(true); await pending; assert.deepEqual(view(h), before);
});
for (const action of actions) test(`${action} remains usable after a no-op drawer reconciliation`, async () => {
  for (const beforeRequest of [false, true]) {
    const h = harness(), callbacks = h.render(), before = view(h);
    let pending: Promise<unknown>;
    if (beforeRequest) { callbacks.change('mobileMapDrawerOpen', h.state.mobileMapDrawerOpen); pending = callbacks[action]!(); }
    else { pending = callbacks[action]!(); callbacks.change('mobileMapDrawerOpen', h.state.mobileMapDrawerOpen); }
    await tick(); assert.equal(h.requests.length, 1); h.accepted.resolve(true); await pending;
    assert.notDeepEqual(view(h), before);
  }
});
test('a queued pin rename preserves the current pin coordinates and category', async () => {
  const h = harness(true), pending = h.render().savePinEdit!();
  h.patchTrip(trip => ({ ...trip, brief: { ...trip.brief, mapPins: trip.brief.mapPins!.map(pin => pin.id === 'pin-a'
    ? { ...pin, longitude: 7, latitude: 8, category: 'stay' } : pin) } }));
  h.state.selectedPlannerPin = { ...h.pinA, longitude: 7, latitude: 8, category: 'stay' }; h.render();
  h.updateGate.resolve(); h.accepted.resolve(true); await pending;
  const pin = h.trip().brief.mapPins!.find(pin => pin.id === 'pin-a')!;
  assert.equal(pin.longitude, 7); assert.equal(pin.latitude, 8); assert.equal(pin.category, 'stay'); assert.equal(pin.title, 'Renamed A');
  assert.deepEqual(h.state.selectedPlannerPin, pin);
});

test('the real functional drawer toggle retires a pending pin action before React executes its queue', async () => {
  const h = harness(false, true), callbacks = h.render(), before = view(h), pending = callbacks.addPin!();
  callbacks.toggleDrawer({ detail: 0 });
  assert.equal(h.state.mobileMapDrawerOpen, false); assert.equal(h.queuedUi(), 1);
  h.accepted.resolve(true); await pending;
  assert.equal(h.queuedUi(), 1, 'accepted old pin action cannot queue form reset or drawer changes');
  h.flushUi(); assert.deepEqual(view(h), { ...before, mobileMapDrawerOpen: true });
});
test('two real drawer toggles preserve queued functional ordering and cannot revive an old callback', async () => {
  const h = harness(false, true), old = h.render(), before = view(h);
  old.toggleDrawer({ detail: 0 }); h.render().toggleDrawer({ detail: 0 });
  const pending = old.addPin!(); await tick(); assert.equal(h.requests.length, 0);
  h.accepted.resolve(false); await pending; h.flushUi(); assert.deepEqual(view(h), before);
});
test('a partial React queue flush retains the latest pending drawer value for the next real toggle', () => {
  const h = harness(false, true), old = h.render();
  old.toggleDrawer({ detail: 0 }); old.toggleDrawer({ detail: 0 }); h.render(); h.flushUi(1);
  assert.equal(h.state.mobileMapDrawerOpen, true);
  h.render().toggleDrawer({ detail: 0 }); h.flushUi(); assert.equal(h.state.mobileMapDrawerOpen, true);
});
test('an unexecuted functional intent retires an old pin completion while React preserves a no-op state', async () => {
  const h = harness(false, true), callbacks = h.render(), before = view(h), pending = callbacks.addPin!();
  callbacks.change('mobileMapDrawerOpen', (open: boolean) => open);
  h.accepted.resolve(true); await pending; h.flushUi();
  assert.deepEqual(view(h), before);
});
for (const action of actions) test(`${action} refuses unknown truthy caller results`, async () => {
  for (const unknown of [{ accepted: true }, 'accepted', 1]) {
    const h = harness(false, false, unknown), before = view(h); await h.render()[action]!();
    assert.deepEqual(view(h), before); assert.deepEqual(h.feedback, []);
  }
});
for (const action of actions) test(`${action} helper refuses unknown truthy persistence without Undo or canonical state`, async () => {
  for (const unknown of [{ accepted: true }, 'accepted', 1]) {
    const h = harness(), before = view(h), document = JSON.stringify(h.trip()), pending = h.render()[action]!();
    h.accepted.resolve(unknown as unknown as boolean); await pending;
    assert.deepEqual(view(h), before); assert.equal(JSON.stringify(h.trip()), document); assert.deepEqual(h.feedback, []);
  }
});
test('the actual native recovery helper requires literal stored:true before document changes or Undo', async () => {
  for (const stored of [{ stored: true }, 'stored', 1]) {
    const h = harness(false, false, undefined, { stored }), before = view(h), document = JSON.stringify(h.trip());
    await h.render().addActivity!();
    assert.deepEqual(view(h), before); assert.equal(JSON.stringify(h.trip()), document); assert.deepEqual(h.feedback, ['error']);
  }
});
for (const action of actions) test(`${action} cannot publish a pre-cleanup request after effect replay`, async () => {
  const h = harness(), before = view(h), pending = h.render()[action]!(); h.replayEffects();
  h.accepted.resolve(true); await pending; assert.deepEqual(view(h), before); assert.deepEqual(h.feedback, []);
});
for (const action of actions) test(`${action} can accept a new action after effect replay setup`, async () => {
  const h = harness(), callbacks = h.render(), before = view(h); h.replayEffects();
  const pending = callbacks[action]!(); h.accepted.resolve(true); await pending; assert.notDeepEqual(view(h), before);
});
