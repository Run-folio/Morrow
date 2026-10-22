import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {homeRecoveryFixture} from './helpers/home-recovery-fixture.ts';
import {tripSaveContinuationHref,tripSaveSignInHref} from '../lib/easyt/trip-workspace-links.ts';
import {safeJourneyReturnTarget} from '../lib/easyt/trip-continuity.ts';
import {workspaceRefusalDiagnostic} from '../lib/easyt/workspace-recovery-diagnostic.ts';

const source=readFileSync('app/journey/new/trip-builder.tsx','utf8');
const ast=ts.createSourceFile('builder.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let branch;
function walk(n){if(ts.isIfStatement(n)&&n.expression.getText(ast)==='tripIdFromUrl')branch=n.thenStatement;ts.forEachChild(n,walk);}walk(ast);assert.ok(branch);
const script=ts.transpileModule(branch.getText(ast),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
function harness({owner='owner-a',recover=true,owned=false,guest=true}={}){
 const trip={...homeRecoveryFixture().trip,status:'planned'},state={},reads=[];let claims=0;
 const base={tripIdFromUrl:trip.id,params:new URLSearchParams({trip:trip.id,handoff:'synthetic-unused',...(recover?{recover:'1'}:{})}),
  authenticatedOwnerId:owner,activeOwnerId:owner,active:true,activeBrowserOwnerIdRef:{current:owner},recoveryHandleRef:{current:null},showItinerary:false,
  setGenerated(){},setGuestSaveRequired:v=>{state.guestSave=v},applySaved:t=>{state.applied=t},guardEntry:r=>{state.guard=r},qaHydrationAccepted:true,
  claimGuestTripRecoveryForOwner:async()=>{claims++;return{stored:false,claimHeldReason:'claim-activation-held'}},
  loadTripRecovery:async(id,scope)=>{reads.push(scope);return scope===null&&guest?{trip}:scope!==null&&owned?{trip:{...trip,ownerId:owner}}:null},
  loadRequestedTrip:async()=>owned?{...trip,ownerId:owner}:null};
 return{base,trip,state,reads,claims:()=>claims,run:()=>new Function('scope',`return (async()=>{with(scope){${script}}})();`)(base)};
}
test('held Builder recovery offers an explicit qualified save instead of missing or an implicit claim',async()=>{
 const h=harness();await h.run();assert.deepEqual(h.state.guestSave,{tripId:h.trip.id,ownerId:'owner-a'});
 assert.equal(h.state.applied,undefined);assert.equal(h.state.guard,'requested-trip-missing');assert.equal(h.claims(),0);
 assert.deepEqual(h.reads,['owner-a',null]);
 const href=tripSaveContinuationHref(h.state.guestSave.tripId);assert.equal(new URL(href,'https://morrovia.invalid').searchParams.get('saved'),'1');
});
for(const recover of [false,true])test(`existing account trip stays in its own scope (recover=${recover})`,async()=>{
 const h=harness({owned:true,recover});await h.run();assert.equal(h.state.applied.ownerId,'owner-a');assert.equal(h.state.guestSave,undefined);
 assert.ok(!h.reads.includes(null));assert.equal(h.claims(),0);
});
test('ordinary sign-in without recovery intent does not inspect or offer guest data',async()=>{
 const h=harness({recover:false});await h.run();assert.deepEqual(h.reads,[]);assert.equal(h.state.guestSave,undefined);assert.equal(h.claims(),0);
});
test('guest Builder still opens its exact recovery without a save-to-account action',async()=>{
 const h=harness({owner:null});await h.run();assert.equal(h.state.applied.id,h.trip.id);assert.equal(h.state.guestSave,undefined);assert.equal(h.claims(),0);
});
for(const invalid of ['absent','foreign','different-trip'])test(`no save continuation for ${invalid} guest source`,async()=>{
 const h=harness({guest:invalid!=='absent'}),read=h.base.loadTripRecovery;
 h.base.loadTripRecovery=async(id,owner)=>{const r=await read(id,owner);if(owner!==null||!r)return r;return{trip:{...r.trip,...(invalid==='foreign'?{ownerId:'owner-b'}:invalid==='different-trip'?{id:'different-trip'}:{})}}};
 await h.run();assert.equal(h.state.guestSave,undefined);assert.equal(h.claims(),0);
});
test('protected guest read is an error, never missing data or save consent',async()=>{
 const h=harness(),read=h.base.loadTripRecovery;h.base.loadTripRecovery=(id,owner)=>owner===null?Promise.reject(Error('protected')):read(id,owner);
 await assert.rejects(h.run(),/protected/);assert.equal(h.state.guestSave,undefined);assert.equal(h.claims(),0);
});
for(const retirement of ['owner','unmount'])test(`late guest read cannot offer save after ${retirement}`,async()=>{
 const h=harness(),read=h.base.loadTripRecovery;let release;const gate=new Promise(r=>{release=r});
 h.base.loadTripRecovery=(id,owner)=>owner===null?gate:read(id,owner);const run=h.run();for(let i=0;i<15;i++)await Promise.resolve();
 if(retirement==='owner')h.base.activeBrowserOwnerIdRef.current='owner-b';else h.base.active=false;
 release({trip:h.trip});await run;assert.equal(h.state.guestSave,undefined);assert.equal(h.state.applied,undefined);assert.equal(h.claims(),0);
});
test('explicit guest save sign-in roundtrip keeps the exact trip and save marker',()=>{
 const id='trip-public-synthetic',login=new URL(tripSaveSignInHref(id),'https://morrovia.invalid');
 const next=safeJourneyReturnTarget(login.searchParams.get('next'));assert.equal(next,tripSaveContinuationHref(id));
});

// The return action enters the real workspace callback and qualified save
// protocol. Only the account HTTP boundary is synthetic; all stores are isolated.
const resolverSource=readFileSync('components/easyt/trip-shell-resolver.tsx','utf8');
const resolverAst=ts.createSourceFile('resolver.tsx',resolverSource,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let callback;
function findCallback(n){if(ts.isVariableDeclaration(n)&&n.name.getText(resolverAst)==='resolveAndPromote')callback=n.initializer.arguments[0];ts.forEachChild(n,findCallback);}findCallback(resolverAst);assert.ok(callback);
const resolverScript=ts.transpileModule('return ('+callback.getText(resolverAst)+');',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
const {saveTripRecoveryToStorage,saveExplicitGuestTripForOwnerInStorage,BrowserRecoveryReadError,tripRecoveryStorageKey}=await import('../lib/easyt/storage.ts');
const {MemoryRecoveryDriver}=await import('./helpers/durable-recovery-driver.ts');
const {createTwoStoreTripPersistence}=await import('../lib/easyt/two-store-trip-persistence.ts');
const {canonicalTripForOwner}=await import('../lib/easyt/trip-promotion.ts');
const {builderInputDraftKey,createBuilderInputDraft,updateBuilderInputDraft}=await import('../lib/easyt/trip-builder-input-draft.ts');
function connected(existingSession=false){
 const f=homeRecoveryFixture(),values=new Map(f.native),driver=new MemoryRecoveryDriver();let current=true;
 const storage={get length(){return values.size},key:i=>[...values.keys()][i]??null,getItem:k=>values.get(k)??null,setItem:(k,v)=>{values.set(k,v)},removeItem:k=>values.delete(k)};
 const guest={...f.trip,status:'planned'};assert.equal(saveTripRecoveryToStorage(storage,guest,{ownerId:null,writeId:'exact-guest-source'}).stored,true);
 const draft=updateBuilderInputDraft(createBuilderInputDraft(guest),guest,{kind:'origin'},'  retained original input  ');storage.setItem(builderInputDraftKey(null,guest.id),JSON.stringify(draft));
 const guestBefore=[...values];
 if(existingSession){assert.equal(saveTripRecoveryToStorage(storage,{...canonicalTripForOwner('owner-a',guest),id:'unrelated-owned-trip'},{ownerId:'owner-a',writeId:'existing-account-trip'}).stored,true);}
 guestBefore.push(...[...values].filter(([key])=>key.includes('unrelated-owned-trip')));
 const state={},requests=[];let lostAck=false,deviceFailure=false,account=null;
 const context={ownerId:'owner-a',isCurrent:()=>current,overflowEnabled:true,accountOverflowQualified:true};
 const broker=ownerId=>createTwoStoreTripPersistence(storage,driver,{...context,ownerId});
 const scope={resolutionIdentity:'owner-a:'+guest.id,requestGenerationRef:{current:0},mountedRef:{current:true},currentResolutionIdentityRef:{current:'owner-a:'+guest.id},
  acknowledgedAccountRef:{current:null},ownerId:'owner-a',tripId:guest.id,searchParams:new URLSearchParams('saved=1'),BrowserRecoveryReadError,workspaceRefusalDiagnostic,
  setSyncing:v=>{state.syncing=v},setResolution:v=>{if(typeof v!=='function')state.resolution=v},setSyncIssue:v=>{state.issue=v},setSyncComplete:v=>{state.complete=v},setDeviceContinuationIncomplete:v=>{state.incomplete=v},setShowingCanonicalConflict(){},
  loadTripRecovery:async(id,owner)=>{const read=await broker(owner).read(id);if(read.kind==='protected'||read.kind==='unavailable')throw new BrowserRecoveryReadError('protected','fixture');return read.kind==='found'?read.recovery:null},
  loadTripWorkspaceDocument:async(id,owner)=>{const read=await broker(owner).read(id);return read.kind==='found'?{trip:read.trip,recovery:read.recovery}:null},
  saveExplicitGuestTripForOwner:(id,owner,isCurrent)=>saveExplicitGuestTripForOwnerInStorage(storage,driver,{...context,ownerId:owner,isCurrent},id,async(_url,init)=>{
   requests.push(init.method);assert.equal(new Headers(init.headers).get('x-morrovia-expected-owner'),'owner-a');
   const input=JSON.parse(init.body);account=canonicalTripForOwner(owner,input);
   if(lostAck){lostAck=false;throw Error('Synthetic lost response after insert');}
   if(deviceFailure)storage.setItem(builderInputDraftKey('owner-a',guest.id),'concurrent account input');
   return Response.json({trip:account,outcome:'promoted'},{status:201});
  })};
 const run=new Function('scope',`with(scope){${resolverScript}}`)(scope);
 return{guest,state,scope,broker,values,storage,driver,requests,guestBefore,run,account:()=>account,
  loseAck:()=>{lostAck=true},failDevice:()=>{deviceFailure=true},retire:()=>{current=false;scope.mountedRef.current=false},
  retained:()=>{for(const [key,raw]of guestBefore)assert.equal(storage.getItem(key),raw,'every guest source/receipt/input byte remains exact')}};
}
for(const entry of ['fresh-session','existing-session'])test(`Builder recovery -> explicit action -> account save -> reload -> Back (${entry})`,async()=>{
 const c=connected(entry==='existing-session'),h=harness();h.base.tripIdFromUrl=c.guest.id;
 h.base.loadTripRecovery=(id,owner)=>c.scope.loadTripRecovery(id,owner);h.base.loadRequestedTrip=async()=>null;
 await h.run();assert.deepEqual(h.state.guestSave,{tripId:c.guest.id,ownerId:'owner-a'});assert.equal(c.requests.length,0);
 assert.equal(new URL(tripSaveContinuationHref(h.state.guestSave.tripId),'https://morrovia.invalid').searchParams.get('saved'),'1');
 await c.run();assert.equal(c.state.resolution.status,'found');assert.equal(c.state.complete,true);assert.equal(c.state.incomplete,false);c.retained();
 const before=[...c.values];await c.run();assert.equal(c.state.complete,true);c.retained();
 // A cold owner read sees the exact acknowledged account trip, not a timestamp winner.
 const coldDriver=new MemoryRecoveryDriver();coldDriver.generations=structuredClone(c.driver.generations);coldDriver.heads=structuredClone(c.driver.heads);coldDriver.acknowledgements=structuredClone(c.driver.acknowledgements);
 const coldStorage={...c.storage,getItem:k=>new Map(before).get(k)??null,key:i=>before[i]?.[0]??null,length:before.length};
 const cold=await createTwoStoreTripPersistence(coldStorage,coldDriver,{ownerId:'owner-a',isCurrent:()=>true,overflowEnabled:true,accountOverflowQualified:true}).read(c.guest.id);
 assert.equal(cold.kind,'found');assert.deepEqual(cold.trip,c.account());
 const back=harness({owned:true});back.base.tripIdFromUrl=c.guest.id;back.base.loadTripRecovery=(id,owner)=>c.scope.loadTripRecovery(id,owner);await back.run();
 assert.equal(back.state.applied.ownerId,'owner-a');assert.equal(back.state.guestSave,undefined);assert.equal(back.claims(),0);c.retained();
});
test('lost account ACK shows no success; explicit retry reads same guest and keeps one account identity',async()=>{
 const c=connected();c.loseAck();await c.run();assert.equal(c.state.resolution.status,'blocked');assert.equal(c.state.complete,false);assert.ok(c.account());c.retained();
 const inserted=c.account();await c.run();assert.equal(c.state.resolution.status,'found');assert.equal(c.state.complete,true);assert.equal(c.account().id,inserted.id);assert.equal(c.account().ownerId,inserted.ownerId);c.retained();
});
test('post-ACK device conflict remains found with incomplete notice and never overwrites concurrent account input',async()=>{
 const c=connected();c.failDevice();await c.run();assert.equal(c.state.resolution.status,'found');assert.equal(c.state.complete,true);assert.equal(c.state.incomplete,true);
 assert.equal(c.storage.getItem(builderInputDraftKey('owner-a',c.guest.id)),'concurrent account input');c.retained();
 await c.run(true);assert.equal(c.state.resolution.status,'blocked');assert.equal(c.storage.getItem(builderInputDraftKey('owner-a',c.guest.id)),'concurrent account input');c.retained();
});
test('late explicit save callback cannot install old account state after retirement',async()=>{
 const c=connected(),save=c.scope.saveExplicitGuestTripForOwner;let release;const gate=new Promise(r=>{release=r});
 c.scope.saveExplicitGuestTripForOwner=async(...args)=>{await gate;return save(...args)};
 const run=c.run();for(let i=0;i<50;i++)await Promise.resolve();c.retire();release();await run;
 assert.notEqual(c.state.resolution?.status,'found');assert.equal(c.requests.length,0);c.retained();
});

const {default:React}=await import('react');let unavailableBranch;
function findUnavailable(n){if(ts.isIfStatement(n)&&n.expression.getText(ast)==='tripUnavailable')unavailableBranch=n.thenStatement;ts.forEachChild(n,findUnavailable);}findUnavailable(ast);assert.ok(unavailableBranch);
const renderScript=ts.transpileModule(unavailableBranch.getText(ast),{compilerOptions:{target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}}).outputText;
for(const currentOwner of ['owner-a','owner-b',null])test(`recovery action renders only for its authenticated scope (${currentOwner})`,()=>{
 const scope={React,guestSaveRequired:{tripId:'trip-synthetic',ownerId:'owner-a'},authenticatedOwnerId:currentOwner,activeBrowserOwnerId:currentOwner,
  language:'en',styles:{},mobilePolish:{},pendingContinuationNeedsReview:false,MorroviaRecoveryFeedback:'feedback',EasyTLinkButton:'link',tripSaveContinuationHref};
 const view=new Function('scope',`with(scope){${renderScript}}`)(scope),content=view.props.children;
 if(currentOwner==='owner-a'){
  assert.equal(content.type,'feedback');assert.equal(content.props.actions.type,'link');
  assert.equal(content.props.actions.props.href,tripSaveContinuationHref('trip-synthetic'));assert.equal(content.props.actions.props.children,'Save trip to my account');
 }else assert.equal(content.type,'aside','a different account never receives the earlier guest-save action');
});
test('unavailable Builder cannot start the separate hydration claim effect',()=>{
 let effect;
 function find(n){if(ts.isCallExpression(n)&&n.expression.getText(ast)==='useEffect'&&n.arguments[0]?.getText(ast).includes('if (hydrated && !tripUnavailable'))effect=n.arguments[0];ts.forEachChild(n,find);}find(ast);assert.ok(effect);
 const script=ts.transpileModule('return ('+effect.getText(ast)+');',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;let claims=0;
 const scope={hydrated:true,tripUnavailable:true,tripOwnerId:null,tripId:'trip-synthetic',session:{user:{id:'owner-a'}},activeBrowserOwnerIdRef:{current:'owner-a'},
  claimGuestTripRecoveryForOwner:async()=>{claims++;return{stored:false}},recoveryHandleRef:{current:null},window:{location:{assign(){throw Error('Unexpected navigation')}}}};
 new Function('scope',`with(scope){${script}}`)(scope)();assert.equal(claims,0);
});
