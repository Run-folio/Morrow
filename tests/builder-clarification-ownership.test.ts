import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

// Source interaction regression: execute the production chooser continuation,
// navigation callbacks and generation guard. Only durable acceptance is deferred.
// Removing its navigation ownership check must reopen the stale-index failure.
const source = readFileSync(new URL('../app/journey/new/trip-builder.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('builder.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function expression(name: string) {
  let found: string | undefined;
  function visit(node: ts.Node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === name) found = node.initializer?.getText(ast);
    ts.forEachChild(node, visit);
  }
  visit(ast); assert.ok(found, `production declaration ${name}`); return found;
}
function actual(text: string, bindings: Record<string, unknown>) {
  const js = ts.transpileModule(`const actual = ${text};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return new Function('bindings', `with(bindings){${js}return actual;}`)(bindings);
}
let syncView = '';
function findSync(node: ts.Node) {
  if (ts.isIfStatement(node) && node.expression.getText(ast).startsWith('planningAreaViewRef.current.key !==')) syncView = node.getText(ast);
  ts.forEachChild(node, findSync);
}
findSync(ast); assert.ok(syncView);
function fixture(index = 0) {
  const mentions = [{ mentionId: 'ait' }, { mentionId: 'merzouga' }];
  const state = { clarificationOpen: true, clarificationSessionIds: ['ait', 'merzouga'], clarificationIndex: index,
    clarificationDismissed: false, clarificationAutoOpened: true, locationChoices: mentions.map(mention => ({ mention })),
    handoffResolutionStatuses: {} as Record<string, string> };
  let resolve!: (accepted: boolean) => void;
  const acceptance = new Promise<boolean>(yes => { resolve = yes; });
  const trip = { id: 'trip-a', stops: [{ id: 'stop-ait' }, { id: 'stop-merzouga' }], brief: { intent: { route: {
    destinations: mentions.map(mention => ({ id: mention.mentionId, kind: 'unresolved', stopIds: ['stop-' + mention.mentionId] })),
  } } } };
  let revision = 7;
  const editor = { getSnapshot: () => ({ trip, browserOwnerId: 'guest', inputRevision: revision }) };
  const durable = new Set<string>();
  const refs = {
    builderEditSessionRef: { current: editor as typeof editor | null }, builderMountedRef: { current: true },
    activeBrowserOwnerIdRef: { current: 'guest' }, builderCurrentDocumentRef: { current: trip },
    planningAreaViewRef: { current: { key: '', editor, generation: 0 } }, discoverySearchVersionRef: { current: 0 },
    activeDiscoveryRef: { current: { open: true, mentionId: mentions[index].mentionId as string | undefined } },
    restoreClarificationResumeFocusRef: { current: false },
    handoffLookupSessionRef: { current: { handled: new Set<string>(), statuses: new Map<string, string>() } },
  };
  function render() {
    const id = state.clarificationSessionIds[state.clarificationIndex];
    refs.activeDiscoveryRef.current = { open: state.clarificationOpen, mentionId: id };
    const bindings: Record<string, any> = {
      ...state, ...refs, tripId: trip.id, activeBrowserOwnerId: refs.activeBrowserOwnerIdRef.current,
      pendingClarificationIds: state.locationChoices.map(item => item.mention.mentionId), activePlaceMentions: mentions,
      providerClarificationScope: { tripId: trip.id, ownerId: 'guest', revision, mentionId: id },
      requiresPhysicalIslandVerification: () => false, isOriginMention: () => false,
      acceptedGeographicPlace: (place: unknown) => place,
      builderPlaceCommand: (_trip: unknown, value: unknown) => ({ kind: 'place', value }),
      dispatchAcceptedBuilderEdits: async () => { const ok = await acceptance; if (ok) { durable.add(id); revision++; } return ok; },
    };
    for (const key of Object.keys(state)) bindings['set' + key[0].toUpperCase() + key.slice(1)] = (value: unknown) => {
      (state as any)[key] = typeof value === 'function' ? value((state as any)[key]) : value;
    };
    bindings.planningAreaViewKey = actual(expression('planningAreaViewKey'), bindings);
    actual(`() => { ${syncView} }`, bindings)();
    for (const name of ['capturePlanningAreaView', 'advanceClarificationSession', 'dismissClarificationSession', 'openClarificationSession', 'chooseProviderClarification']) {
      bindings[name] = actual(expression(name), bindings);
    }
    return bindings;
  }
  const choice = { name: 'Aït Benhaddou', country: 'Morocco', canonicalPlaceId: 'ait-place', providerId: 'fixture:ait',
    coordinates: [-7.13, 31.04], placeType: 'town', routability: 'direct_destination' };
  return { state, refs, durable, render, resolve, begin: () => render().chooseProviderClarification(mentions[index], choice) as Promise<void> };
}

test('earlier accepted choice cannot advance a dismissed and reopened two-item chooser', async () => {
  const h = fixture(), run = h.begin();
  h.render().dismissClarificationSession(); h.render().openClarificationSession('merzouga'); h.render();
  assert.equal(h.state.clarificationIndex, 1);
  h.resolve(true); await run;
  assert.equal(h.state.clarificationOpen, true);
  assert.equal(h.state.clarificationSessionIds[h.state.clarificationIndex], 'merzouga', 'late Aït completion must not run beyond the reopened session');
  assert.ok(h.durable.has('ait'), 'accepted earlier data remains durable');
});

test('current accepted first choice advances exactly once to the next mention', async () => {
  const h = fixture(), run = h.begin(); h.resolve(true); await run;
  assert.equal(h.state.clarificationIndex, 1); assert.equal(h.state.clarificationOpen, true); assert.ok(h.durable.has('ait'));
});

test('current accepted final choice completes the legitimate session', async () => {
  const h = fixture(1), run = h.begin(); h.resolve(true); await run;
  assert.equal(h.state.clarificationOpen, false); assert.deepEqual(h.state.clarificationSessionIds, []); assert.ok(h.durable.has('merzouga'));
});

test('rejected acceptance leaves the active chooser unchanged', async () => {
  const h = fixture(), run = h.begin(); h.resolve(false); await run;
  assert.equal(h.state.clarificationIndex, 0); assert.equal(h.state.clarificationOpen, true); assert.equal(h.durable.size, 0);
});

for (const change of ['dismiss', 'same-mention-reopen', 'owner', 'document', 'editor', 'unmount', 'mention']) {
  test(`late accepted choice cannot navigate after ${change}`, async () => {
    const h = fixture(), run = h.begin();
    if (change === 'dismiss' || change === 'same-mention-reopen') h.render().dismissClarificationSession();
    if (change === 'same-mention-reopen') h.render().openClarificationSession('ait');
    if (change === 'owner') h.refs.activeBrowserOwnerIdRef.current = 'other';
    if (change === 'document') h.refs.builderCurrentDocumentRef.current = { ...h.refs.builderCurrentDocumentRef.current, id: 'other' };
    if (change === 'editor') h.refs.builderEditSessionRef.current = null;
    if (change === 'unmount') h.refs.builderMountedRef.current = false;
    h.render();
    if (change === 'mention') h.refs.activeDiscoveryRef.current.mentionId = 'merzouga';
    const before = { open: h.state.clarificationOpen, ids: [...h.state.clarificationSessionIds], index: h.state.clarificationIndex };
    h.resolve(true); await run;
    assert.deepEqual({ open: h.state.clarificationOpen, ids: h.state.clarificationSessionIds, index: h.state.clarificationIndex }, before);
    assert.ok(h.durable.has('ait'));
  });
}
