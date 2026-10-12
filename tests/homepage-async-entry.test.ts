import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {homeRecoveryFixture} from './helpers/home-recovery-fixture.ts';
import {emptyHomepageInput} from './fixtures/homepage-dual-entry.ts';
import {homepageCompletedReceiptIsUnchanged,homepageSemanticInputFingerprint} from '../lib/easyt/home-trip-handoff.ts';

/** Execute the actual component callbacks with disposable in-memory dependencies. */
const source=readFileSync(new URL('../app/journey/home/home-trip-starter.tsx',import.meta.url),'utf8');
const ast=ts.createSourceFile('home.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
function actualCallback(name:'hydrate'|'submit'|'retryRecoveryRead',scope:Record<string,unknown>) {
  let callback:ts.ArrowFunction|undefined;
  const walk=(node:ts.Node)=>{
    if(name!=='hydrate'&&ts.isVariableDeclaration(node)&&node.name.getText(ast)===name&&node.initializer&&ts.isArrowFunction(node.initializer))callback=node.initializer;
    if(name==='hydrate'&&ts.isCallExpression(node)&&node.expression.getText(ast)==='useEffect'&&node.arguments[0]&&ts.isArrowFunction(node.arguments[0])&&node.arguments[0].getText(ast).includes('const hydrate ='))callback=node.arguments[0];
    ts.forEachChild(node,walk);
  };
  walk(ast);assert.ok(callback,`Actual ${name} callback must exist`);
  const script=ts.transpileModule(`const callback=${callback.getText(ast)};`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
  return new Function('scope',`with(scope){${script}return callback;}`)(scope) as ()=>unknown;
}
const tick=()=>new Promise<void>(done=>setImmediate(done));
function deferred<T>(){let resolve!:(value:T)=>void;return {promise:new Promise<T>(done=>{resolve=done}),resolve:(value:T)=>resolve(value)}}
function hydrationScope(read:(owner:string|null,guard:()=>boolean)=>Promise<unknown>) {
  const seen={blocked:[] as boolean[],errors:[] as string[],snapshots:[] as unknown[]};
  const initial={...emptyHomepageInput('owner-a'),prompt:'retained typed input'};
  const scope={ownerId:'owner-a',sessionPending:false,language:'en',homepageReadyRef:{current:true},mountedRef:{current:true},
    homepageEditedRef:{current:false},
    ownerIdRef:{current:'owner-a'},sessionPendingRef:{current:false},snapshotRef:{current:initial},storedInputRef:{current:{snapshot:initial}},
    destinationIdRef:{current:0},setRecoveryBlocked:(value:boolean)=>seen.blocked.push(value),cancelSubmission:()=>{},setCaptureError:(value:string)=>seen.errors.push(value),
    emptySnapshot:emptyHomepageInput,setSnapshot:(value:unknown)=>seen.snapshots.push(value),setTravelProfile:()=>{},setProposedType:()=>{},readDurableHomepageState:read,
    nextDestinationNumber:()=>3,window:{localStorage:{getItem:()=>null}},travelProfileStorageKey:()=>'',travelProfileFromUnknown:()=>null};
  return {scope,seen,initial};
}
test('Homepage hydration stays disabled until both-store owner-scoped read resolves',async()=>{
  const gate=deferred<unknown>(),fixture=homeRecoveryFixture('owner-a');
  const {scope,seen}=hydrationScope(async()=>gate.promise);
  const cleanup=actualCallback('hydrate',scope)() as ()=>void;
  assert.deepEqual(seen.blocked,[true]);assert.equal(scope.homepageReadyRef.current,false);assert.equal(seen.snapshots.length,0);
  gate.resolve({kind:'ready',storedInput:{snapshot:fixture.snapshot,receipt:fixture.intake.completed}});await tick();
  assert.equal(scope.snapshotRef.current,fixture.snapshot);assert.deepEqual(seen.blocked,[true,false]);assert.equal(scope.homepageReadyRef.current,true);cleanup();
});
test('unknown/protected Homepage reads retain same-owner memory and do not manufacture empty durable input',async()=>{
  for(const kind of ['unavailable','protected']) {
    const {scope,seen,initial}=hydrationScope(async()=>({kind,reason:'synthetic'}));actualCallback('hydrate',scope)();await tick();
    assert.equal(scope.snapshotRef.current,initial);assert.equal(seen.snapshots.length,0);assert.deepEqual(seen.blocked,[true]);assert.equal(scope.homepageReadyRef.current,false);assert.match(seen.errors.at(-1)!,/couldn't restore/);
  }
});
test('owner change, unmount and superseded hydration reject late results',async()=>{
  for(const mutation of ['owner','unmount','cleanup']) {
    const gate=deferred<unknown>(),{scope,seen}=hydrationScope(async()=>gate.promise);const cleanup=actualCallback('hydrate',scope)() as ()=>void;
    if(mutation==='owner')scope.ownerIdRef.current='owner-b';if(mutation==='unmount')scope.mountedRef.current=false;if(mutation==='cleanup')cleanup();
    gate.resolve({kind:'ready',storedInput:{snapshot:emptyHomepageInput('owner-a')}});await tick();assert.equal(seen.snapshots.length,0);assert.deepEqual(seen.blocked,[true]);
  }
});
test('the visible retry rereads a transient unknown without discarding same-owner typed memory',async()=>{
  let reads=0,attempt=0;
  const {scope,seen,initial}=hydrationScope(async()=>++reads===1?{kind:'unavailable'}:{kind:'ready',storedInput:{snapshot:emptyHomepageInput('owner-a')}});
  scope.homepageEditedRef.current=true;
  const bindings={...scope,setRecoveryReadAttempt:(update:(value:number)=>number)=>{attempt=update(attempt)}};
  const cleanup=actualCallback('hydrate',bindings)() as ()=>void;await tick();assert.equal(reads,1);assert.equal(scope.homepageReadyRef.current,false);
  actualCallback('retryRecoveryRead',bindings)();assert.equal(attempt,1);cleanup();actualCallback('hydrate',bindings)();await tick();
  assert.equal(reads,2);assert.equal(scope.homepageReadyRef.current,true);assert.equal(scope.snapshotRef.current,initial);assert.equal(seen.snapshots.at(-1),initial);
  let wired=false,retriesTriggerEffect=false;
  const inspect=(node:ts.Node)=>{
    if(ts.isJsxAttribute(node)&&node.name.getText(ast)==='onRetry'&&node.initializer?.getText(ast)==='{retryRecoveryRead}')wired=true;
    if(ts.isCallExpression(node)&&node.expression.getText(ast)==='useEffect'&&node.arguments[0]?.getText(ast).includes('const hydrate =')&&node.arguments[1]?.getText(ast).includes('recoveryReadAttempt'))retriesTriggerEffect=true;
    ts.forEachChild(node,inspect);
  };inspect(ast);assert.equal(wired,true);assert.equal(retriesTriggerEffect,true);
});
function resumeScope() {
  const fixture=homeRecoveryFixture(),inputRaw=fixture.native[0]![1];
  let currentInput=inputRaw;
  const state=()=>({kind:'ready',storedInput:JSON.parse(currentInput),inputRaw:currentInput,draft:fixture.draft});
  const seen={hrefs:[] as string[],errors:[] as string[],preservations:0};
  const scope={recoveryBlocked:false,homepageReadyRef:{current:true},sessionPendingRef:{current:false},ownerIdRef:{current:null},snapshotRef:{current:fixture.snapshot},
    submitInFlightRef:{current:false},submissionGenerationRef:{current:0},mountedRef:{current:true},performance:{now:()=>1},trackEvent:()=>{},setLoading:()=>{},
    setCaptureError:(value:string)=>seen.errors.push(value),storedInputRef:{current:JSON.parse(inputRaw)},homepageSemanticInputFingerprint,homepageCompletedReceiptIsUnchanged,
    readDurableHomepageState:async()=>state(),markPlanningMilestone:()=>{},loadTripRecovery:async()=>({trip:fixture.trip}),loadRequestedTrip:async()=>{throw new Error('No account read expected');},
    beginNewTripNavigation:async()=>{seen.preservations++;return true},reportPersistenceOutcome:()=>{},router:{push:(href:string)=>seen.hrefs.push(href)},language:'en',window:{}};
  return {scope,seen,fixture,changeReceipt:()=>{const input=JSON.parse(currentInput);input.receipt.handoffId='competing';currentInput=JSON.stringify(input)}};
}
test('same-owner unchanged receipt resume awaits preservation and retains explicit recovery navigation',async()=>{
  const {scope,seen,fixture}=resumeScope(),gate=deferred<boolean>();scope.beginNewTripNavigation=async()=>gate.promise;
  const run=actualCallback('submit',scope)() as Promise<void>;await tick();assert.deepEqual(seen.hrefs,[]);gate.resolve(true);await run;
  assert.deepEqual(seen.hrefs,[`/journey/new?trip=${fixture.trip.id}&recover=1`]);
});
test('competing receipt during preservation prevents stale same-owner resume navigation',async()=>{
  const {scope,seen,changeReceipt}=resumeScope();scope.beginNewTripNavigation=async()=>{changeReceipt();return true};
  await actualCallback('submit',scope)();assert.deepEqual(seen.hrefs,[]);assert.match(seen.errors.at(-1)!,/couldn't recover/);
});
