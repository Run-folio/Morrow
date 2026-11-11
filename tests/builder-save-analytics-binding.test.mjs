import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { createBuilderSaveAcknowledgementTracker } from '../lib/easyt/trip-save-analytics.ts';
const require = createRequire(import.meta.url), ts = require('typescript');
const source = readFileSync('app/journey/new/trip-builder.tsx', 'utf8');
const ast = ts.createSourceFile('trip-builder.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let callback;
function visit(node) { if (ts.isPropertyAssignment(node) && node.name.getText(ast) === 'acknowledgeRecovery') callback = node.initializer.getText(ast); ts.forEachChild(node, visit); }
visit(ast); assert.ok(callback, 'the production acknowledgement callback exists');
const script = ts.transpileModule(`globalThis.callback = ${callback};`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
function mount() {
  const calls = []; let resolve, current = true;
  const result = new Promise(done => { resolve = done; });
  const owner = { current: 'owner-a' };
  const sandbox = { URL, builderMountedRef: { current: true }, activeBrowserOwnerIdRef: owner,
    acknowledgeTripBuildSave: () => result, loadTripRecovery: async () => null,
    window: { location: { href: 'https://staging.morrovia.com/journey/new?trip=synthetic-trip' }, history: { state: {}, replaceState() {} } },
    recordBuilderSaveAcknowledgement: createBuilderSaveAcknowledgementTracker({ hasConsent: () => true, emit: properties => calls.push(properties) }),
  };
  vm.runInNewContext(script, sandbox);
  return { calls, resolve: ack => resolve(ack), retire: () => { current = false; }, invoke: () => sandbox.callback({}, {id:'synthetic-trip',ownerId:'owner-a',updatedAt:'revision-a'}, {tripId:'synthetic-trip',ownerId:'owner-a'}, {isCurrent:()=>current}) };
}
test('production builder callback emits only after the exact acknowledgement returns', async () => {
  const app = mount(); const pending = app.invoke(); assert.equal(app.calls.length,0);
  app.resolve({outcome:'acknowledged',accountAcknowledged:true}); await pending;
  assert.deepEqual(app.calls,[{trip_id:'synthetic-trip',trip_source:'builder'}]);
});
test('retired scope and failed account acknowledgement remain unmeasured', async () => {
  for (const retired of [true,false]) {
    const app = mount(); const pending = app.invoke(); if(retired)app.retire();
    app.resolve({outcome:retired?'acknowledged':'storage-failed',accountAcknowledged:retired}); await pending;
    assert.equal(app.calls.length,0);
  }
});
