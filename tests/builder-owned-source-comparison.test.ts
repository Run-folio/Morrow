import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {freezeBuilderSessionValue as freeze} from '../lib/easyt/trip-builder-edit-session.ts';
import {canonicalRouteFixture} from './fixtures/batch14-route-documents.ts';

// Exercise the actual private ownership helper, without exporting a test-only app API.
const source=ts.createSourceFile('session.ts',readFileSync(new URL('../lib/easyt/trip-builder-async-edit-session.ts',import.meta.url),'utf8'),ts.ScriptTarget.Latest,true);
let helper:ts.FunctionDeclaration|undefined;
function find(node:ts.Node){if(ts.isFunctionDeclaration(node)&&node.name?.text==='ownedSourceGuard')helper=node;ts.forEachChild(node,find)}find(source);assert.ok(helper);
const js=ts.transpileModule(helper!.getText(source),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
function fixture(prepare?:(state:any)=>void){
 const state:any={trip:canonicalRouteFixture(),recovery:{ownerId:'owner-a',tripId:'trip-a',writeId:'write-a'},acceptedRevision:2,owner:'owner-a',disposed:false};
 state.active=()=>!state.disposed&&state.owner==='owner-a';prepare?.(state);let capturedCalls=0,currentCalls=0;
 const json={stringify(value:unknown){if(value&&typeof value==='object'&&Object.isFrozen(value))capturedCalls++;else currentCalls++;return JSON.stringify(value)}};
 const guard=new Function('state','freeze','exact','JSON',`with(state){${js};return ownedSourceGuard();}`)(state,freeze,(a:unknown,b:unknown)=>json.stringify(a)===json.stringify(b),json);
 return {state,guard,capturedCalls:()=>capturedCalls,currentCalls:()=>currentCalls};
}
test('ownership guard serializes captured frozen operands once, current operands on every check',()=>{
 const h=fixture();assert.equal(h.guard.isCurrent(),true);const captured=h.capturedCalls(),current=h.currentCalls();for(let i=0;i<10;i++)assert.equal(h.guard.isCurrent(),true);
 assert.equal(h.currentCalls()-current,20,'both current values are freshly serialized on every guard');
 assert.equal(h.capturedCalls(),captured,'immutable captured operands must not be reserialized');
 h.state.trip.title+=' in-place change';assert.equal(h.guard.isCurrent(),false,'current body is still freshly compared');
});
test('ownership guard preserves byte ordering and equivalent new-object semantics',()=>{
 const h=fixture();h.state.trip=structuredClone(h.state.trip);h.state.recovery={...h.state.recovery};assert.equal(h.guard.isCurrent(),true);
 const title=h.state.trip.title;delete h.state.trip.title;h.state.trip.title=title;assert.equal(h.guard.isCurrent(),false,'JSON property order semantics remain exact');
});
for(const change of ['owner','dispose','revision','handle','trip-id'] as const)test(`ownership guard refuses changed ${change} on repeated late callbacks`,()=>{
 const h=fixture();if(change==='owner')h.state.owner='owner-b';if(change==='dispose')h.state.disposed=true;if(change==='revision')h.state.acceptedRevision++;
 if(change==='handle')h.state.recovery.writeId+='later';if(change==='trip-id')h.state.trip.id+='other';
 for(let i=0;i<3;i++)assert.equal(h.guard.isCurrent(),false);
});

test('serialization remains lazy after owner/revision/disposal short circuits',()=>{
 for(const kind of ['owner','revision','dispose'] as const){
  const h=fixture(s=>{s.trip.extension=BigInt(1)});
  if(kind==='owner')h.state.owner='b';if(kind==='revision')h.state.acceptedRevision++;if(kind==='dispose')h.state.disposed=true;
  assert.equal(h.guard.isCurrent(),false,'invalid scope does not serialize captured values');
 }
});
test('active serializer failures still throw at isCurrent and never become cached success',()=>{
 const h=fixture(s=>{s.trip.extension=BigInt(1)});
 assert.throws(()=>h.guard.isCurrent(),TypeError);
 delete h.state.trip.extension;
 assert.throws(()=>h.guard.isCurrent(),TypeError,'captured snapshot failure is retried, not cached as undefined');
 h.state.owner='b';assert.equal(h.guard.isCurrent(),false);
});
test('mismatching body still short circuits unserializable captured handle',()=>{
 const h=fixture(s=>{s.recovery.extension=BigInt(1)});h.state.trip.title+='later';
 assert.equal(h.guard.isCurrent(),false,'handle serialization happens only after body equality');
});
