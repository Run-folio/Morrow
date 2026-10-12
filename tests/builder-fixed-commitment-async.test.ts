import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync(new URL('../app/journey/new/trip-builder.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('builder.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function expression(name: string) {
  let result: string | undefined;
  function visit(node: ts.Node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === name) result = node.initializer?.getText(ast);
    ts.forEachChild(node, visit);
  }
  visit(ast); return result;
}
function actual(expression: string, bindings: Record<string, unknown>) {
  const js = ts.transpileModule(`const actual = ${expression};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return new Function('bindings', `with(bindings){${js}return actual;}`)(bindings);
}
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: unknown) => void;
  return { promise: new Promise<T>((yes, no) => { resolve = yes; reject = no; }), resolve, reject };
}
function fixture(persistence: Promise<boolean>) {
  let label = '  Oaxaca  ', date = '2026-11-01', revision = 4, tripId = 'trip-a';
  const calls: Array<{ fixedCommitments: Array<{ label: string; date: string }> }> = [], errors: string[] = [];
  const editor = { getSnapshot: () => ({ browserOwnerId: bindings.activeBrowserOwnerIdRef.current, inputRevision: revision,
    trip: { id: tripId, brief: { intent: { hardConstraints: { fixedCommitments: [] } } } } }) };
  const bindings: Record<string, any> = {
    get fixedCommitmentLabel() { return label; }, get fixedCommitmentDate() { return date; }, get tripId() { return tripId; },
    get activeBrowserOwnerId() { return bindings.activeBrowserOwnerIdRef.current; },
    builderEditSessionRef: { current: editor }, builderMountedRef: { current: true }, activeBrowserOwnerIdRef: { current: 'owner-a' },
    useRef: (value: unknown) => ({ current: value }), canonicalPlaceSuggestionFor: () => null, language: 'en',
    setFixedCommitmentLabelState: (value: string) => { label = value; }, setFixedCommitmentDateState: (value: string) => { date = value; },
    setFixedCommitmentLabel: (value: string) => { label = value; }, setFixedCommitmentDate: (value: string) => { date = value; },
    setCloudSaveError: (value: string) => errors.push(value),
    updateBuilderConstraints: async (constraints: typeof calls[number]) => { calls.push(constraints); const accepted = await persistence; if (accepted) revision++; return accepted; },
  };
  for (const name of ['fixedCommitmentInputRef', 'fixedCommitmentSubmissionRef']) {
    const declaration = expression(name); if (declaration) bindings[name] = actual(declaration, bindings);
  }
  for (const name of ['setFixedCommitmentLabel', 'setFixedCommitmentDate']) {
    const declaration = expression(name); if (declaration) bindings[name] = actual(declaration, bindings);
  }
  function render() { const sync = expression('syncFixedCommitmentInputScope'); if (sync) actual(sync, bindings)(); }
  render();
  const handler = actual(expression('addFixedCommitment')!, bindings) as () => Promise<boolean | void>;
  let labelChange: ((event: { target: { value: string } }) => void) | undefined, dateChange: ((value: string) => void) | undefined;
  function findInputs(node: ts.Node) {
    if (ts.isJsxSelfClosingElement(node)) {
      const attributes = node.attributes.properties.filter(ts.isJsxAttribute), value = attributes.find(item => item.name.getText(ast) === 'value');
      const change = attributes.find(item => item.name.getText(ast) === 'onChange');
      if (change?.initializer && ts.isJsxExpression(change.initializer) && change.initializer.expression) {
        if (value?.initializer?.getText(ast) === '{fixedCommitmentLabel}') labelChange = actual(change.initializer.expression.getText(ast), bindings);
        if (value?.initializer?.getText(ast) === '{fixedCommitmentDate}') dateChange = actual(change.initializer.expression.getText(ast), bindings);
      }
    }
    ts.forEachChild(node, findInputs);
  }
  findInputs(ast); assert.ok(labelChange); assert.ok(dateChange);
  return { bindings, calls, errors, submit: handler, read: () => ({ label, date }),
    typeLabel(value: string, rerender = true) { labelChange!({ target: { value } }); if (rerender) render(); },
    typeDate(value: string, rerender = true) { dateChange!(value); if (rerender) render(); },
    owner(value: string) { bindings.activeBrowserOwnerIdRef.current = value; render(); },
    trip(value: string) { tripId = value; render(); },
    editor(value: unknown) { bindings.builderEditSessionRef.current = value; render(); },
    advanceInput() { revision++; }, unmount() { bindings.builderMountedRef.current = false; },
  };
}

for (const accepted of [false, true]) test(`actual fixed commitment keeps raw input until held ${accepted} acceptance`, async () => {
  const gate = deferred<boolean>(), ui = fixture(gate.promise), original = ui.read(), run = ui.submit();
  assert.deepEqual(ui.read(), original); assert.equal(ui.calls.length, 1);
  assert.equal(ui.calls[0].fixedCommitments[0].label, 'Oaxaca'); assert.equal(ui.calls[0].fixedCommitments[0].date, original.date);
  gate.resolve(accepted); await run; assert.deepEqual(ui.read(), accepted ? { label: '', date: '' } : original);
});
test('actual fixed commitment handles rejection without clearing input', async () => {
  const gate = deferred<boolean>(), ui = fixture(gate.promise), original = ui.read(), run = ui.submit();
  gate.reject(new Error('synthetic storage refusal')); await assert.doesNotReject(async () => { await run; }); assert.deepEqual(ui.read(), original);
});
for (const change of ['label', 'date', 'label-before-render', 'date-before-render', 'input-revision', 'unmount']) test(`actual fixed commitment preserves ${change} during accepted persistence`, async () => {
  const gate = deferred<boolean>(), ui = fixture(gate.promise), run = ui.submit();
  if (change.startsWith('label')) ui.typeLabel('newer label', !change.endsWith('before-render'));
  if (change.startsWith('date')) ui.typeDate('2026-12-04', !change.endsWith('before-render'));
  if (change === 'input-revision') ui.advanceInput(); if (change === 'unmount') ui.unmount();
  const current = ui.read(); gate.resolve(true); await run; assert.deepEqual(ui.read(), current);
});
for (const cycle of ['label', 'date', 'owner', 'trip', 'editor']) test(`actual fixed commitment ${cycle} A to B to A cannot clear a later scope`, async () => {
  const gate = deferred<boolean>(), ui = fixture(gate.promise), original = ui.read(), editor = ui.bindings.builderEditSessionRef.current, run = ui.submit();
  if (cycle === 'label') { ui.typeLabel('new input'); ui.typeLabel(original.label); }
  if (cycle === 'date') { ui.typeDate('2026-12-04'); ui.typeDate(original.date); }
  if (cycle === 'owner') { ui.owner('owner-b'); ui.owner('owner-a'); }
  if (cycle === 'trip') { ui.trip('trip-b'); ui.trip('trip-a'); }
  if (cycle === 'editor') { ui.editor({ getSnapshot: editor.getSnapshot }); ui.editor(editor); }
  gate.resolve(true); await run; assert.deepEqual(ui.read(), original);
});
test('actual fixed commitment starts one request for a double click and permits retry after refusal', async () => {
  const gate = deferred<boolean>(), ui = fixture(gate.promise), first = ui.submit(), second = ui.submit();
  assert.equal(ui.calls.length, 1); gate.resolve(false); await Promise.all([first, second]);
  await ui.submit(); assert.equal(ui.calls.length, 2); assert.deepEqual(ui.read(), { label: '  Oaxaca  ', date: '2026-11-01' });
});
