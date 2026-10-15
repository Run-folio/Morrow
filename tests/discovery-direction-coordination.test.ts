import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import type { DiscoveryDraftAction } from '../lib/easyt/discovery-draft.ts';
import { createDiscoveryDraft, reduceDiscoveryDraft } from '../lib/easyt/discovery-draft.ts';

function actualDirectionClick(onAction: (action: DiscoveryDraftAction) => void | boolean | Promise<void | boolean>) {
  const source = readFileSync(new URL('../components/easyt/discovery-steps.tsx', import.meta.url), 'utf8');
  const parsed = ts.createSourceFile('discovery-steps.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let callback = '';
  const visit = (node: ts.Node) => {
    if (ts.isJsxAttribute(node) && node.name.getText(parsed) === 'onClick' && node.initializer && ts.isJsxExpression(node.initializer)
      && node.initializer.expression?.getText(parsed).includes('type: "change-direction"')
      && node.initializer.expression.getText(parsed).includes('type: "set-step"')) callback = node.initializer.expression.getText(parsed);
    ts.forEachChild(node, visit);
  };
  visit(parsed); assert.ok(callback, 'test must execute the actual direction button callback');
  const script = ts.transpileModule(`return (${callback});`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return new Function('scope', `with(scope){${script}}`)({ onAction, direction: { id: 'synthetic-morocco' } }) as () => Promise<void> | void;
}
test('actual Discovery direction button waits for accepted direction before advancing the step', async () => {
  const actions: DiscoveryDraftAction[] = [];
  let release!: (accepted: boolean) => void;
  const accepted = new Promise<boolean>(resolve => { release = resolve; });
  const click = actualDirectionClick(action => { actions.push(action); return actions.length === 1 ? accepted : true; });
  const pending = click();
  assert.deepEqual(actions, [{ type: 'change-direction', directionId: 'synthetic-morocco' }]);
  release(true); await pending;
  assert.deepEqual(actions[1], { type: 'set-step', step: 'places' });
});
test('actual Discovery direction button does not advance after a refused durable action', async () => {
  const actions: DiscoveryDraftAction[] = [];
  await actualDirectionClick(action => { actions.push(action); return Promise.resolve(false); })();
  assert.equal(actions.length, 1);
});
test('actual Discovery direction button retains synchronous story fixture compatibility', async () => {
  const actions: DiscoveryDraftAction[] = [];
  await actualDirectionClick(action => { actions.push(action); })();
  assert.equal(actions.length, 2);
});
function actualBuilderAction(input: { accept: () => Promise<boolean>; isCurrent: () => boolean; retired?: boolean }) {
  const source = readFileSync(new URL('../app/journey/new/trip-builder.tsx', import.meta.url), 'utf8');
  const parsed = ts.createSourceFile('trip-builder.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let callback = '';
  const visit = (node: ts.Node) => {
    if (ts.isJsxAttribute(node) && node.name.getText(parsed) === 'onAction' && node.initializer && ts.isJsxExpression(node.initializer)
      && node.initializer.expression?.getText(parsed).includes('updateDiscoveryPlanningState')) callback = node.initializer.expression.getText(parsed);
    ts.forEachChild(node, visit);
  };
  visit(parsed); assert.ok(callback);
  const script = ts.transpileModule(`return (${callback});`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return new Function('scope', `with(scope){${script}}`)({ discoveryCommitRef: { current: false }, discoverySearchVersionRef: { current: 0 }, discoveryRead: { status: 'current' },
    planningAreaViewRef: { current: { key: input.retired ? 'newer-view' : 'synthetic-view' } }, planningAreaViewKey: 'synthetic-view',
    capturePlanningAreaView: () => input.isCurrent, discoveryDraft: createDiscoveryDraft(), reduceDiscoveryDraft,
    discoveryChoiceEvent: () => null, discoveryEventKind: 'country', discoveryProjection: { places: [] },
    updateDiscoveryPlanningState: input.accept }) as (action: DiscoveryDraftAction) => Promise<boolean>;
}
test('actual Builder Discovery action returns a failed durable acknowledgement to its component', async () => {
  assert.equal(await actualBuilderAction({ accept: async () => false, isCurrent: () => true })({ type: 'set-step', step: 'places' }), false);
});
test('actual Builder Discovery action cannot return success after its view retires', async () => {
  let current = true, release!: (accepted: boolean) => void;
  const gate = new Promise<boolean>(resolve => { release = resolve; });
  const action = actualBuilderAction({ accept: () => gate, isCurrent: () => current });
  const pending = action({ type: 'set-step', step: 'places' }); current = false; release(true);
  assert.equal(await pending, false);
});
test('actual Builder Discovery callback from a retired render cannot start another durable action', async () => {
  let writes = 0;
  const action = actualBuilderAction({ accept: async () => { writes++; return true; }, isCurrent: () => true, retired: true });
  assert.equal(await action({ type: 'set-step', step: 'places' }), false); assert.equal(writes, 0);
});
