import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {homeRecoveryFixture} from './helpers/home-recovery-fixture.ts';
import {requestedTripMatch} from '../lib/easyt/trip-id-resolution.ts';

const text=readFileSync('components/journey-map-planner-workspace.tsx','utf8');
const ast=ts.createSourceFile('map.tsx',text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
let callback:ts.Expression|undefined;
function visit(n:ts.Node){if(ts.isVariableDeclaration(n)&&n.name.getText(ast)==='hydratePlan')callback=n.initializer;ts.forEachChild(n,visit);}visit(ast);
assert.ok(callback);
const js=ts.transpileModule(`return (${callback.getText(ast)});`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
function deferred<T>(){let resolve!:(v:T)=>void;return{promise:new Promise<T>(r=>resolve=r),resolve:(v:T)=>resolve(v)}}
function harness({owned=false,cloud=false,protectedGuest=false}={}) {
  const guest={...homeRecoveryFixture().trip,status:'planned' as const},account={...guest,ownerId:'owner-a'};
  const state:Record<string,any>={},reads:Array<string|null>=[];let claims=0,writes=0,current=true;
  const base:any={isPlanningPreview:true,previousDocumentIdentityRef:{current:undefined},plannerDocumentIdentity:'owner-a:trip',
    hydratedOwnerScopeRef:{current:undefined},hydratedDocumentIdentityRef:{current:undefined},recoveryHandleRef:{current:null},
    plannerMutationQueueRef:{current:null},pendingPlannerWriteRef:{current:null},providedTrip:null,storyState:null,sessionPending:false,
    authenticatedOwnerId:'owner-a',activeBrowserOwnerId:'owner-a',sessionUnavailable:false,browserOffline:false,
    window:{location:{search:`?trip=${guest.id}&save=1&recover=1`}},isCurrent:()=>current,
    loadLocalTrip:async()=>owned?account:null,
    loadTripRecovery:async(_id:string,owner:string|null)=>{reads.push(owner);if(owner===null&&protectedGuest)throw Error('protected guest source');return owner===null?{trip:guest}:owned?{trip:account}:null},
    claimGuestTripRecoveryForOwner:async()=>{claims++;return{stored:false,blockedByExistingRecovery:true,guestResolved:false,claimHeldReason:'claim-activation-held'}},
    loadTripFromEasyT:async()=>cloud?account:null,requestedTripMatch,customBriefFromEasyT:(t:any)=>({id:t.id}),
    saveExplicitGuestTripForOwner:async()=>{writes++;throw Error('Generic sign-in cannot authorize account save')},};
  const scope=new Proxy(base,{has:(t,k)=>k in t||typeof k==='string'&&/^set[A-Z]/.test(k),get:(t,k)=>k in t?t[k]:typeof k==='string'&&/^set[A-Z]/.test(k)?(v:any)=>{state[k.slice(3)]=v}:undefined});
  return{guest,state,reads,base,run:()=>new Function('scope',`with(scope){${js}}`)(scope)(),retire:()=>{current=false},claims:()=>claims,writes:()=>writes};
}

test('legacy activity sign-in return offers explicit guest save instead of missing or implicit claim',async()=>{
  const h=harness();await h.run();
  assert.equal(h.state.ExplicitTripIssue,'guest-save-required');
  assert.equal(h.state.CustomTrip,null);assert.equal(h.claims(),0);assert.equal(h.writes(),0);
  assert.deepEqual(h.reads,['owner-a',null]);
});
for(const mode of ['owned','cloud'] as const)test(`existing ${mode} trip opens without inspecting or promoting guest data`,async()=>{
  const h=harness({[mode]:true});await h.run();
  assert.equal(h.state.CustomTrip.ownerId,'owner-a');assert.equal(h.state.ExplicitTripIssue,null);
  assert.ok(!h.reads.includes(null));assert.equal(h.claims(),0);assert.equal(h.writes(),0);
});
test('protected guest read remains a storage/review outcome and cannot become missing or authorize save',async()=>{
  const h=harness({protectedGuest:true});await h.run();assert.equal(h.state.ExplicitTripIssue,'storage');
  assert.equal(h.claims(),0);assert.equal(h.writes(),0);
});
test('late guest result after owner or document retirement cannot install the continuation',async()=>{
  const h=harness(),gate=deferred<any>(),original=h.base.loadTripRecovery;
  h.base.loadTripRecovery=(id:string,owner:string|null)=>owner===null?gate.promise:original(id,owner);
  const run=h.run();for(let i=0;i<15;i++)await Promise.resolve();h.retire();gate.resolve({trip:h.guest});await run;
  assert.equal(h.state.ExplicitTripIssue,null);assert.equal(h.state.CustomTrip,null);assert.equal(h.writes(),0);
});
