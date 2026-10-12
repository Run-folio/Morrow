import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

// Execute the production helper and all live cancel callbacks, with deferred
// acceptance. These are source-level interaction tests, not browser evidence.
const source = readFileSync(new URL('../app/journey/new/trip-builder.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('builder.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function expression(name: string) {
  let found: string | undefined;
  function visit(node: ts.Node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === name) found = node.initializer?.getText(ast);
    ts.forEachChild(node, visit);
  }
  visit(ast); return found;
}
function actual(text: string, bindings: Record<string, unknown>) {
  const js = ts.transpileModule(`const actual = ${text};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return new Function('bindings', `with(bindings){${js}return actual;}`)(bindings);
}
const callbacks: string[] = [];
const baseChanges: string[] = [];
const allBaseChanges: string[] = [];
function findCallbacks(node: ts.Node) {
  if (ts.isArrowFunction(node) && ts.isJsxExpression(node.parent) && ts.isJsxAttribute(node.parent.parent)
    && node.parent.parent.name.getText(ast) === 'onClick' && node.getText(ast).includes('await cancelTransientPlanningClarification(')) {
    callbacks.push(node.getText(ast));
  }
  if (ts.isArrowFunction(node) && node.getText(ast).includes('setBaseSearchInputs(')
    && ((ts.isPropertyAssignment(node.parent) && node.parent.name.getText(ast) === 'onChange')
      || (ts.isJsxExpression(node.parent) && ts.isJsxAttribute(node.parent.parent) && node.parent.parent.name.getText(ast) === 'onChange'))) {
    allBaseChanges.push(node.getText(ast));
  }
  if (ts.isJsxSelfClosingElement(node)) {
    const attributes = node.attributes.properties.filter(ts.isJsxAttribute);
    const value = attributes.find(item => item.name.getText(ast) === 'value')?.initializer?.getText(ast);
    const change = attributes.find(item => item.name.getText(ast) === 'onChange')?.initializer;
    if ((value === '{baseSearchInputs[inlineOriginPlanningMention.mentionId] ?? ""}'
      || value === '{baseSearchInputs[inlineStopBaseMention.mentionId] ?? ""}') && change && ts.isJsxExpression(change) && change.expression) {
      baseChanges.push(change.expression.getText(ast));
    }
  }
  ts.forEachChild(node, findCallbacks);
}
findCallbacks(ast);
assert.equal(callbacks.length, 3, 'exercise both live origin twins and the live stop callback');
assert.equal(baseChanges.length, 3, 'exercise their actual base-search input handlers');
assert.equal(allBaseChanges.length, 7, 'exercise every live base-search input handler');
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: unknown) => void;
  return { promise: new Promise<T>((yes, no) => { resolve = yes; reject = no; }), resolve, reject };
}
type UIState = {
  origin: Record<string, unknown>; originTouched: boolean; originError: string;
  originPlanningMentionId: string | null; resolvingPlaceMentionId: string | null;
  showStopEditor: boolean; stopInput: string; stopError: string;
  transientPlanningMentionId: string | null; baseSearchInputs: Record<string, string>; baseSearchErrors: Record<string, string>;
  capturedStructuredBrief: { placeMentions: Array<{ mentionId: string }>; placeIssues: unknown[]; placeSelections: Array<{ mentionId: string }> };
  intakeMentions: Array<{ mentionId: string }>; placeSelections: Array<{ mentionId: string }>;
  completedPlanningAreaMentionIds: string[]; removedPlaceMentionIds: string[];
};
function fixture(index: number, persistence: Promise<unknown>, options: { transient?: boolean; editor?: boolean; pinned?: boolean; missing?: boolean } = {}) {
  const target = index === 2 ? 'stop' : 'origin', mentionId = 'mention-a';
  const previousOrigin = { name: 'Previous origin', coordinates: [12, 34], canonicalPlaceId: 'previous-pin',
    country: 'Previous country', providerId: 'previous-provider', touched: false };
  const mention = { mentionId };
  let tripId = 'trip-a', tripOwnerId = 'owner-a', revision = 7;
  const state: UIState = {
    origin: { name: 'Old planning origin' }, originTouched: true, originError: 'Old origin error',
    originPlanningMentionId: target === 'origin' ? mentionId : null,
    resolvingPlaceMentionId: target === 'stop' ? mentionId : null, showStopEditor: true, stopInput: '  old stop raw  ', stopError: 'Old stop error',
    transientPlanningMentionId: options.transient === false ? 'another-transient' : mentionId,
    baseSearchInputs: { [mentionId]: '  old base raw  ', unrelated: 'Keep this search' },
    baseSearchErrors: { [mentionId]: 'Old base error', unrelated: 'Keep this error' },
    capturedStructuredBrief: { placeMentions: options.missing ? [] : [mention], placeIssues: ['old issue'], placeSelections: [mention] },
    intakeMentions: [mention], placeSelections: [mention], completedPlanningAreaMentionIds: [mentionId], removedPlaceMentionIds: [mentionId],
  };
  const calls: Array<{ edits: Array<Record<string, unknown>>; options?: { expectedInputRevision?: number } }> = [];
  const editor = { getSnapshot: () => ({ browserOwnerId: 'owner-a', inputRevision: revision,
    trip: { id: tripId, ownerId: tripOwnerId, brief: { intent: { route: { destinations: target === 'stop' ? [{ id: mentionId, stopIds: options.pinned ? ['stop-a'] : [] }] : [] } } } } }) };
  const bindings: Record<string, any> = {
    get tripId() { return tripId; }, get tripOwnerId() { return tripOwnerId; },
    get activeBrowserOwnerId() { return bindings.activeBrowserOwnerIdRef.current; },
    get origin() { return state.origin.name; }, get originTouched() { return state.originTouched; }, get originError() { return state.originError; },
    builderMountedRef: { current: true }, builderEditSessionRef: { current: options.editor === false ? null : editor },
    activeBrowserOwnerIdRef: { current: 'owner-a' }, originResolutionVersionRef: { current: 0 },
    originBeforePlanningClarificationRef: { current: previousOrigin }, handoffLookupSessionRef: { current: { handled: new Set<string>() } },
    inlineOriginPlanningMention: mention, inlineStopBaseMention: mention,
    mention, activeClarificationMention: mention, discoverySearchVersionRef: { current: 0 },
    setOutsideDiscoveryChoice: () => {}, setPendingDiscoveryBase: () => {},
    useRef: (value: unknown) => ({ current: value }), placeResolutionIssuesForMentions: () => [],
    dispatchAcceptedBuilderEdits: async (edits: Array<Record<string, unknown>>, options?: { expectedInputRevision?: number }) => {
      calls.push({ edits, options }); const accepted = await persistence; if (accepted === true) revision++; return accepted;
    },
    replaceJourneyOrigin: (place: Record<string, unknown>) => { state.origin = structuredClone(place); bindings.originResolutionVersionRef.current++; },
  };
  for (const key of Object.keys(state) as Array<keyof UIState>) {
    if (!Object.getOwnPropertyDescriptor(bindings, key)) Object.defineProperty(bindings, key, { get: () => state[key], configurable: true });
    const setter = `set${key[0].toUpperCase()}${key.slice(1)}`;
    bindings[setter] = (value: unknown) => { (state as any)[key] = typeof value === 'function' ? value(state[key]) : value; };
  }
  for (const name of ['planningBaseSearchIntentVersionRef', 'planningBaseSearchUserIntentVersionRef', 'planningClarificationCancelScopeRef', 'planningClarificationCancelPendingRef']) {
    const declaration = expression(name); if (declaration) bindings[name] = actual(declaration, bindings);
  }
  for (const name of ['setBaseSearchInputs', 'setBaseSearchErrors']) {
    const declaration = expression(name);
    if (declaration) { bindings[`${name}State`] = bindings[name]; bindings[name] = actual(declaration, bindings); }
  }
  const sync = expression('syncPlanningClarificationCancelScope');
  function render() { if (sync) actual(sync, bindings)(); }
  render();
  bindings.cancelTransientPlanningClarification = actual(expression('cancelTransientPlanningClarification')!, bindings);
  const cancel = actual(callbacks[index], bindings) as () => Promise<boolean | void>;
  return {
    bindings, state, calls, previousOrigin, editor, render, cancel,
    typeBase(value: string) { actual(baseChanges[index], bindings)(value); },
    read: () => ({ state: structuredClone(state), previousOrigin: structuredClone(bindings.originBeforePlanningClarificationRef.current),
      handled: [...bindings.handoffLookupSessionRef.current.handled] }),
    change(kind: string) {
      if (kind === 'raw') state.stopInput = 'Newer stop raw';
      if (kind === 'stop-error') state.stopError = 'Newer stop error';
      if (kind === 'base-raw') state.baseSearchInputs = { ...state.baseSearchInputs, [mentionId]: 'Newer base raw' };
      if (kind === 'base-error') state.baseSearchErrors = { ...state.baseSearchErrors, [mentionId]: 'Newer base error' };
      if (kind === 'origin') { state.origin = { name: 'Newer typed origin' }; bindings.originResolutionVersionRef.current++; }
      if (kind === 'previous-origin') bindings.originBeforePlanningClarificationRef.current = { name: 'Newer previous origin', touched: true };
      if (kind === 'editor-intent') { state.originPlanningMentionId = 'mention-b'; state.resolvingPlaceMentionId = 'mention-b'; }
      if (kind === 'editor-closed') state.showStopEditor = false;
      if (kind === 'input-revision') revision++;
      if (kind === 'owner') bindings.activeBrowserOwnerIdRef.current = 'owner-b';
      if (kind === 'document') tripId = 'trip-b';
      if (kind === 'document-owner') tripOwnerId = 'owner-b';
      if (kind === 'editor') bindings.builderEditSessionRef.current = { getSnapshot: editor.getSnapshot };
      if (kind === 'unmount') bindings.builderMountedRef.current = false;
      render();
    },
    restore(kind: string) {
      if (kind === 'base-raw') state.baseSearchInputs = { ...state.baseSearchInputs, [mentionId]: '  old base raw  ' };
      if (kind === 'owner') bindings.activeBrowserOwnerIdRef.current = 'owner-a';
      if (kind === 'document') tripId = 'trip-a';
      if (kind === 'document-owner') tripOwnerId = 'owner-a';
      if (kind === 'editor') bindings.builderEditSessionRef.current = editor;
      render();
    },
  };
}

for (const index of [0, 1, 2]) {
  const label = index === 2 ? 'stop' : `origin twin ${index + 1}`;
  test(`actual ${label} cancellation keeps all input on deferred false`, async () => {
    const gate = deferred<boolean>(), ui = fixture(index, gate.promise), before = ui.read(), run = ui.cancel();
    assert.deepEqual(ui.read(), before); gate.resolve(false); await run; assert.deepEqual(ui.read(), before);
  });
  test(`actual ${label} cancellation handles rejection without cleanup`, async () => {
    const gate = deferred<boolean>(), ui = fixture(index, gate.promise), before = ui.read(), run = ui.cancel();
    gate.reject(new Error('synthetic acceptance failure')); await assert.doesNotReject(async () => { await run; }); assert.deepEqual(ui.read(), before);
  });
  for (const accepted of [undefined, null, 'unknown']) test(`actual ${label} cancellation keeps input on ${String(accepted)} admission`, async () => {
    const ui = fixture(index, Promise.resolve(accepted)), before = ui.read(); await ui.cancel(); assert.deepEqual(ui.read(), before);
  });
  test(`actual ${label} cancellation completes only after accepted transient edit`, async () => {
    const gate = deferred<boolean>(), ui = fixture(index, gate.promise), before = ui.read(), run = ui.cancel();
    assert.deepEqual(ui.read(), before); assert.equal(ui.calls.length, 1);
    assert.equal(ui.calls[0].options?.expectedInputRevision, 7); gate.resolve(true); assert.equal(await run, true);
    assert.equal(ui.state.transientPlanningMentionId, null); assert.deepEqual(ui.state.capturedStructuredBrief.placeMentions, []);
    assert.deepEqual(ui.state.intakeMentions, []); assert.deepEqual(ui.state.placeSelections, []);
    assert.deepEqual(ui.state.completedPlanningAreaMentionIds, []); assert.deepEqual(ui.state.removedPlaceMentionIds, []);
    assert.deepEqual(ui.state.baseSearchInputs, { unrelated: 'Keep this search' });
    assert.deepEqual(ui.state.baseSearchErrors, { unrelated: 'Keep this error' });
    if (index === 2) { assert.equal(ui.state.showStopEditor, false); assert.equal(ui.state.resolvingPlaceMentionId, null); assert.equal(ui.state.stopInput, ''); assert.equal(ui.state.stopError, ''); }
    else { assert.deepEqual(ui.state.origin, ui.previousOrigin); assert.equal(ui.state.originPlanningMentionId, null); assert.equal(ui.state.originTouched, false); assert.equal(ui.bindings.originBeforePlanningClarificationRef.current, null); }
  });
  for (const accepted of [false, true]) for (const kind of ['raw', 'stop-error', 'base-raw', 'base-error', 'origin', 'previous-origin', 'editor-intent', 'editor-closed', 'input-revision', 'owner', 'document', 'document-owner', 'editor', 'unmount']) {
    test(`actual ${label} ${accepted} cancellation preserves newer ${kind}`, async () => {
      const gate = deferred<boolean>(), ui = fixture(index, gate.promise), run = ui.cancel(); ui.change(kind); const current = ui.read();
      gate.resolve(accepted); await run; assert.deepEqual(ui.read(), current);
    });
  }
  for (const kind of ['base-raw', 'owner', 'document', 'document-owner', 'editor']) test(`actual ${label} cancellation rejects ${kind} A to B to A`, async () => {
    const gate = deferred<boolean>(), ui = fixture(index, gate.promise), run = ui.cancel(); ui.change(kind); ui.restore(kind); const current = ui.read();
    gate.resolve(true); await run; assert.deepEqual(ui.read(), current);
  });
  for (const cycle of [false, true]) test(`actual ${label} cancellation preserves ${cycle ? 'cycled' : 'new'} base typing before render`, async () => {
    const gate = deferred<boolean>(), ui = fixture(index, gate.promise), run = ui.cancel();
    ui.typeBase('New base typed before rendering'); if (cycle) ui.typeBase('  old base raw  '); const current = ui.read();
    gate.resolve(true); await run; assert.deepEqual(ui.read(), current);
  });
  test(`actual ${label} cancellation blocks immediate duplicate and permits retry after false`, async () => {
    const gate = deferred<boolean>(), ui = fixture(index, gate.promise), first = ui.cancel(), duplicate = ui.cancel();
    assert.equal(ui.calls.length, 1); gate.resolve(false); await Promise.all([first, duplicate]); await ui.cancel(); assert.equal(ui.calls.length, 2);
  });
  test(`actual ${label} cancellation keeps nontransient mention and closes only its editor`, async () => {
    const ui = fixture(index, Promise.resolve(false), { transient: false }); assert.equal(await ui.cancel(), true);
    assert.equal(ui.calls.length, 0); assert.equal(ui.state.transientPlanningMentionId, 'another-transient');
    assert.equal(ui.state.capturedStructuredBrief.placeMentions.length, 1); assert.equal(ui.bindings.originBeforePlanningClarificationRef.current, ui.previousOrigin);
    if (index === 2) assert.equal(ui.state.showStopEditor, false); else assert.equal(ui.state.originPlanningMentionId, null);
  });
  test(`actual ${label} cancellation preserves a missing transient mention`, async () => {
    const ui = fixture(index, Promise.resolve(true), { missing: true }), before = ui.read(); await ui.cancel(); assert.deepEqual(ui.read(), before); assert.equal(ui.calls.length, 0);
  });
  test(`actual ${label} local transient cancellation keeps the original completion`, async () => {
    const ui = fixture(index, Promise.resolve(false), { editor: false }); assert.equal(await ui.cancel(), true);
    assert.equal(ui.calls.length, 0); assert.equal(ui.state.transientPlanningMentionId, null); assert.equal(ui.state.capturedStructuredBrief.placeMentions.length, 0);
  });
}
test('actual stop cancellation preserves a transient destination that already owns a stop', async () => {
  const ui = fixture(2, Promise.resolve(true), { pinned: true }), before = ui.read(); await ui.cancel(); assert.deepEqual(ui.read(), before); assert.equal(ui.calls.length, 0);
});
for (const [index, handler] of allBaseChanges.entries()) test(`actual base-search input ${index + 1} advances user intent immediately`, () => {
  const ui = fixture(0, Promise.resolve(false)), userVersion = ui.bindings.planningBaseSearchUserIntentVersionRef.current;
  const version = ui.bindings.planningBaseSearchIntentVersionRef.current;
  actual(handler, ui.bindings)('New user search');
  assert.equal(ui.state.baseSearchInputs['mention-a'], 'New user search'); assert.equal(ui.state.baseSearchErrors['mention-a'], '');
  assert.equal(ui.bindings.planningBaseSearchUserIntentVersionRef.current, userVersion + 1);
  assert.equal(ui.bindings.planningBaseSearchIntentVersionRef.current, version + 2);
});
test('programmatic base-search clears advance generic intent and preserve user intent generation', () => {
  const ui = fixture(0, Promise.resolve(false)), userVersion = ui.bindings.planningBaseSearchUserIntentVersionRef.current;
  const version = ui.bindings.planningBaseSearchIntentVersionRef.current;
  ui.bindings.setBaseSearchInputs((current: Record<string, string>) => ({ ...current, 'mention-a': '' }));
  ui.bindings.setBaseSearchErrors((current: Record<string, string>) => ({ ...current, 'mention-a': '' }));
  assert.equal(ui.bindings.planningBaseSearchUserIntentVersionRef.current, userVersion);
  assert.equal(ui.bindings.planningBaseSearchIntentVersionRef.current, version + 2);
});
