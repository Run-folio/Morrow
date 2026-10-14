import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {homeRecoveryFixture} from './helpers/home-recovery-fixture.ts';
import {emptyHomepageInput} from './fixtures/homepage-dual-entry.ts';
import {commitHomepageHandoff,homepageCompletedReceiptIsUnchanged,homepageSemanticInputFingerprint,homepagePreflightIssues,
 projectHomepageInput,homepageReceiptForProjection,homepageHandoffMatchesTrip,reusableHomepageReceipt,reservePendingDescribeHandoff,pendingHomepageSubmissionForOwner,pendingIntakeReceiptForOwner,pendingHomepageHandoffForOwner,createPendingIntakeReceipt,HOME_TRIP_DRAFT_KEY} from '../lib/easyt/home-trip-handoff.ts';
import {createDurableHomepagePersistence,prepareIntakeAcknowledgement} from '../lib/easyt/homepage-persistence.ts';
import {createTwoStoreTripPersistence} from '../lib/easyt/two-store-trip-persistence.ts';
import {prepareTripDocumentForWrite} from '../lib/easyt/trip-document.ts';
import {homepageInputStorageKey} from '../lib/easyt/private-browser-context.ts';
import {prepareAcceptedBuilderEdit} from '../lib/easyt/trip-builder-edit.ts';
import {builderDocumentFingerprint} from '../lib/easyt/trip-builder-document-commit.ts';
import {MemoryRecoveryDriver} from './helpers/durable-recovery-driver.ts';

/** Execute the actual component callbacks with disposable in-memory dependencies. */
const source=readFileSync(new URL('../app/journey/home/home-trip-starter.tsx',import.meta.url),'utf8');
const ast=ts.createSourceFile('home.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
function actualCallback(name:'hydrate'|'submit'|'retryRecoveryRead'|'resumePendingSubmission',scope:Record<string,unknown>) {
  let callback:ts.ArrowFunction|undefined;
  const walk=(node:ts.Node)=>{
    if(name!=='hydrate'&&ts.isVariableDeclaration(node)&&node.name.getText(ast)===name&&node.initializer&&ts.isArrowFunction(node.initializer))callback=node.initializer;
    if(name==='hydrate'&&ts.isCallExpression(node)&&node.expression.getText(ast)==='useEffect'&&node.arguments[0]&&ts.isArrowFunction(node.arguments[0])&&node.arguments[0].getText(ast).includes('const hydrate ='))callback=node.arguments[0];
    ts.forEachChild(node,walk);
  };
  walk(ast);assert.ok(callback,`Actual ${name} callback must exist`);
  const script=ts.transpileModule(`const callback=${callback.getText(ast)};`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
  return new Function('scope',`with(scope){const inputBlocked=scope.inputBlocked ?? scope.recoveryBlocked;${script}return callback;}`)(scope) as ()=>unknown;
}
const tick=()=>new Promise<void>(done=>setImmediate(done));
function deferred<T>(){let resolve!:(value:T)=>void;return {promise:new Promise<T>(done=>{resolve=done}),resolve:(value:T)=>resolve(value)}}
function hydrationScope(read:(owner:string|null,guard:()=>boolean)=>Promise<unknown>) {
  const seen={blocked:[] as boolean[],errors:[] as string[],snapshots:[] as unknown[]};
  const initial={...emptyHomepageInput('owner-a'),prompt:'retained typed input'};
  const scope={setPendingSubmission:()=>{},pendingHomepageSubmissionForOwner,ownerId:'owner-a',sessionPending:false,language:'en',homepageReadyRef:{current:true},mountedRef:{current:true},
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
function resumeScope(ownerId:string|null=null) {
  const fixture=homeRecoveryFixture(ownerId),inputRaw=fixture.native[0]![1];
  let currentInput=inputRaw;
  const state=()=>({kind:'ready',storedInput:JSON.parse(currentInput),inputRaw:currentInput,draft:fixture.draft});
  const seen={hrefs:[] as string[],errors:[] as string[],preservations:0};
  const scope={recoveryBlocked:false,homepageReadyRef:{current:true},sessionPendingRef:{current:false},ownerIdRef:{current:null},snapshotRef:{current:fixture.snapshot},
    submitInFlightRef:{current:false},submissionGenerationRef:{current:0},mountedRef:{current:true},performance:{now:()=>1},trackEvent:()=>{},setLoading:()=>{},
    setCaptureError:(value:string)=>seen.errors.push(value),storedInputRef:{current:JSON.parse(inputRaw)},homepageSemanticInputFingerprint,homepageCompletedReceiptIsUnchanged,projectHomepageInput,homepageHandoffMatchesTrip,travelProfile:null,
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

test('actual Homepage Stops submit remains pending until canonical recovery and its receipt commit together',async()=>{
 const fixture=homeRecoveryFixture(),values=new Map<string,string>();
 let canonicalSetterQuota=false;
 const storage={get length(){return values.size;},key:(i:number)=>[...values.keys()][i]??null,
  getItem:(key:string)=>values.get(key)??null,setItem:(key:string,raw:string)=>{
   if(canonicalSetterQuota&&key.startsWith('easyt:trip-recovery:'))throw new DOMException('Declared model only','QuotaExceededError');values.set(key,raw)},removeItem:(key:string)=>{values.delete(key)}};
 storage.setItem(homepageInputStorageKey(null),JSON.stringify({snapshot:fixture.snapshot}));
 const driver=new MemoryRecoveryDriver(),lock=async<T,>(_key:string,work:()=>Promise<T>)=>work();
 const seen={hrefs:[] as string[],errors:[] as string[]};
 const scope={recoveryBlocked:false,homepageReadyRef:{current:true},sessionPendingRef:{current:false},ownerIdRef:{current:null},snapshotRef:{current:fixture.snapshot},
  submitInFlightRef:{current:false},submissionGenerationRef:{current:0},mountedRef:{current:true},performance:{now:()=>1},trackEvent:()=>{},setLoading:()=>{},
  setCaptureError:(value:string)=>seen.errors.push(value),storedInputRef:{current:{snapshot:fixture.snapshot}},homepageSemanticInputFingerprint,homepageCompletedReceiptIsUnchanged,
  readDurableHomepageState:()=>createDurableHomepagePersistence(storage,driver,{ownerId:null,isCurrent:()=>true,overflowEnabled:false,accountOverflowQualified:false}).read(),
  homepagePreflightIssues,evidenceFor:()=>undefined,projectHomepageInput,homepageReceiptForProjection,reusableHomepageReceipt,travelProfile:null,
  generatedId:(prefix:string)=>prefix+'-actual-stops',window:{localStorage:storage},requestNewTripNavigationAsync:async()=>true,
  commitHomepageHandoff:(input:Parameters<typeof commitHomepageHandoff>[0])=>commitHomepageHandoff({...input,lock}),
  reservePendingDescribeHandoff:(input:Parameters<typeof reservePendingDescribeHandoff>[0])=>reservePendingDescribeHandoff({...input,lock}),
  markPlanningMilestone:()=>{},planningAttemptOutcome:()=>{},router:{push:(href:string)=>seen.hrefs.push(href)},language:'en'};
 await actualCallback('submit',scope)();
 assert.deepEqual(seen.errors.filter(Boolean),[]);
 const retained=JSON.parse(storage.getItem(homepageInputStorageKey(null))!);
 assert.equal(retained.receipt.version,2,'Completion must wait for the canonical recovery transaction');
 assert.equal(JSON.stringify(retained.receipt.frozenSnapshot),JSON.stringify(fixture.snapshot));
 assert.equal(JSON.parse(storage.getItem(HOME_TRIP_DRAFT_KEY)!).version,2);
 assert.equal(seen.hrefs.length,1);assert.match(seen.hrefs[0]!,/^\/journey\/new\?homeDraft=1&handoff=/);
 assert.equal(driver.generations.size,0,'Homepage reservation does not fabricate canonical acceptance');
 // This declared fault model joins the actual producer to the existing broker;
 // native capacity and the compiled UI are qualified separately.
 const pending=retained.receipt,projected=projectHomepageInput({snapshot:pending.frozenSnapshot,profile:null,handoffId:pending.handoffId});
 assert.equal(projected.ok,true);if(!projected.ok)return;
 const completed=homepageReceiptForProjection(pending.frozenSnapshot,projected.draft,pending.tripId);
 const draft={...projected.draft,homepage:{...projected.draft.homepage!,receipt:completed}};
 const candidate=prepareTripDocumentForWrite({...fixture.trip,id:pending.tripId}),context={ownerId:null,isCurrent:()=>true,overflowEnabled:true,accountOverflowQualified:false};
 const before=[...values],writeId='actual-stops-canonical';canonicalSetterQuota=true;
 const prepared=await prepareIntakeAcknowledgement(storage,driver,context,{pending,completed,draft,fromHomepage:true},candidate,writeId+':intake');
 assert.equal(prepared.ok,true);if(!prepared.ok)return;
 const saved=await createTwoStoreTripPersistence(storage,driver,context).save(candidate,{newTripOrClone:true,writeId,entries:[prepared.entry],entry:{
  pointer:{version:1,backend:'indexeddb',ownerId:null,tripId:candidate.id,writeId},input:null,receipt:prepared.receipt}});
 assert.equal(saved.stored,true);assert.equal(saved.receiptAcknowledged,true);assert.equal(saved.pointerAcknowledged,true);assert.deepEqual([...values],before);
 const readerContext={...context,overflowEnabled:false};
 const canonical=await createTwoStoreTripPersistence(storage,driver,readerContext).read(candidate.id),home=await createDurableHomepagePersistence(storage,driver,readerContext).read();
 assert.equal(canonical.kind,'found');assert.equal(home.kind,'ready');
 if(canonical.kind==='found'&&home.kind==='ready'){
  assert.equal(canonical.domain?.envelope?.entry.receipt?.raw,home.raw);assert.deepEqual(home.storedInput?.receipt,completed);
  assert.equal(canonical.trip.id,completed.tripId);assert.equal(canonical.trip.ownerId,null);
 }
});


test('Plan with stops does not reopen an edited receipt trip whose route no longer matches the visible input', async () => {
 const {scope,seen,fixture}=resumeScope();
 const first=fixture.trip.brief.intent!.route!.destinations[0]!;
 const edited=prepareAcceptedBuilderEdit(fixture.trip,{kind:'remove-destination',intentId:first.id},builderDocumentFingerprint(fixture.trip));
 assert.equal(edited.ok,true);if(!edited.ok)return;
 const retainedRaw=JSON.stringify(edited.trip);let reservations=0;
 const values=new Map(fixture.native),storage={getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>{values.set(key,value)},removeItem:(key:string)=>{values.delete(key)}};
 const bindings=Object.assign(scope,{
  loadTripRecovery:async()=>({trip:edited.trip}),homepageHandoffMatchesTrip,projectHomepageInput,
  homepagePreflightIssues:()=>[],evidenceFor:()=>undefined,travelProfile:null,
  generatedId:(prefix:string)=>prefix+'-new-visible-input',requestNewTripNavigationAsync:async()=>true,
  window:{localStorage:storage},
  reservePendingDescribeHandoff:async(input:Parameters<typeof reservePendingDescribeHandoff>[0])=>{reservations++;return reservePendingDescribeHandoff({...input,lock:async(_key,work)=>work()});},
 });
 await actualCallback('submit',bindings)();
 assert.equal(reservations,1,'the current form must reserve a fresh identity, preserving the edited trip');
 assert.deepEqual(seen.hrefs,['/journey/new?homeDraft=1&handoff=handoff-new-visible-input']);
 assert.equal(JSON.parse(storage.getItem(homepageInputStorageKey(null))!).receipt.version,2);
 assert.equal(JSON.stringify(edited.trip),retainedRaw);assert.deepEqual(seen.errors.filter(Boolean),[]);
});

test('title-only edits keep the completed homepage trip identity',async()=>{
 const {scope,seen,fixture}=resumeScope();
 scope.loadTripRecovery=async()=>({trip:{...fixture.trip,title:'A traveller title'}});
 await actualCallback('submit',scope)();
 assert.deepEqual(seen.hrefs,[`/journey/new?trip=${fixture.trip.id}&recover=1`]);
});
test('route mutation during preservation cannot redeem a completed receipt',async()=>{
 const {scope,seen,fixture}=resumeScope();let reads=0;
 scope.loadTripRecovery=async()=>({trip:++reads===1?fixture.trip:{...fixture.trip,stops:[]}});
 await actualCallback('submit',scope)();assert.deepEqual(seen.hrefs,[]);assert.match(seen.errors.at(-1)!,/trip has changed/);
});
test('new input or owner while preservation is pending cannot navigate',async()=>{
 for(const change of ['input','owner']){
  const {scope,seen}=resumeScope(),gate=deferred<boolean>();scope.beginNewTripNavigation=async()=>gate.promise;
  const run=actualCallback('submit',scope)() as Promise<void>;await tick();
  if(change==='input')scope.snapshotRef.current={...scope.snapshotRef.current,revision:scope.snapshotRef.current.revision+1};
  else scope.ownerIdRef.current='owner-b' as never;
  gate.resolve(true);await run;assert.deepEqual(seen.hrefs,[]);
 }
});
test('fresh reservation supersedes only the exact completed receipt observed under lock',async()=>{
 const f=homeRecoveryFixture(),values=new Map(f.native),storage={getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>{values.set(k,v)},removeItem:(k:string)=>{values.delete(k)}};
 const before=[...values];
 const result=await reservePendingDescribeHandoff({storage,snapshot:f.snapshot,supersedeCompletedReceipt:{...f.intake.completed,handoffId:'not-the-current-receipt'},supersedeCompletedInputRaw:f.native[0]![1],isCurrent:()=>true,preserveAndBegin:()=>true,createIds:()=>({handoffId:'fresh',tripId:'fresh'}),lock:async(_key,work)=>work()});
 assert.equal(result.ok,false);assert.deepEqual([...values],before);
});

test('unchanged authenticated canonical trip resumes its completed homepage receipt',async()=>{
 const {scope,seen,fixture}=resumeScope('owner-a');scope.ownerIdRef.current='owner-a' as never;
 const {canonicalTripForOwner}=await import('../lib/easyt/trip-promotion.ts');
 scope.loadTripRecovery=async()=>({trip:prepareTripDocumentForWrite(canonicalTripForOwner('owner-a',fixture.trip))});
 await actualCallback('submit',scope)();
 assert.deepEqual(seen.hrefs,[`/journey/new?trip=${fixture.trip.id}&recover=1`]);
});

test('fresh reservation never overwrites a concurrently changed raw homepage snapshot',async()=>{
 const f=homeRecoveryFixture(),key=homepageInputStorageKey(null),values=new Map(f.native),changed=JSON.stringify(JSON.parse(f.native[0]![1]),null,2);values.set(key,changed);
 const storage={getItem:(key:string)=>values.get(key)??null,setItem:(key:string,raw:string)=>{values.set(key,raw)},removeItem:(key:string)=>{values.delete(key)}};
 const result=await reservePendingDescribeHandoff({storage,snapshot:f.snapshot,supersedeCompletedReceipt:f.intake.completed,supersedeCompletedInputRaw:f.native[0]![1],isCurrent:()=>true,preserveAndBegin:()=>true,createIds:()=>({tripId:'new',handoffId:'new'}),lock:async(_key,work)=>work()});
 assert.equal(result.ok,false);assert.equal(storage.getItem(key),changed);
});


test('explicit pending continuation uses the actual resume callback without clearing current selection',async()=>{
 const fixture=homeRecoveryFixture('owner-a');fixture.snapshot.revision=95;const receipt=createPendingIntakeReceipt(fixture.snapshot,{handoffId:fixture.intake.completed.handoffId,tripId:fixture.trip.id});
 const stored={snapshot:{...fixture.snapshot,revision:97},receipt},inputRaw=JSON.stringify(stored),draft={version:2,phase:'pending-interpretation',receipt},draftRaw=JSON.stringify(draft);
 for(const mode of ['match','edited-memory','changed-durable-input','owner-change']as const){let reads=0;const seen={hrefs:[]as string[],errors:[]as string[]};const ownerIdRef={current:'owner-a'},homepageEditedRef={current:mode==='edited-memory'};
 const scope={pendingSubmission:{receipt,inputRaw,draftRaw},loading:false,homepageEditedRef,mountedRef:{current:true},homepageReadyRef:{current:true},sessionPendingRef:{current:false},ownerIdRef,language:'en',setLoading:()=>{},setCaptureError:(v:string)=>seen.errors.push(v),pendingHomepageSubmissionForOwner,pendingHomepageHandoffForOwner,homepageSemanticInputFingerprint,
 readDurableHomepageState:async()=>{reads++;if(mode==='owner-change')ownerIdRef.current='owner-b';return{kind:'ready',storedInput:stored,inputRaw:mode==='changed-durable-input'?inputRaw+' ':inputRaw,draft,draftRaw};},router:{push:(v:string)=>seen.hrefs.push(v)}};
 actualCallback('resumePendingSubmission',scope)();await tick();
 if(mode==='match'){assert.deepEqual(seen.hrefs,[`/journey/new?homeDraft=1&handoff=${receipt.handoffId}&resumePending=1`]);assert.equal(reads,1);}else{assert.deepEqual(seen.hrefs,[]);if(mode==='edited-memory')assert.equal(reads,0);}
 }
});
