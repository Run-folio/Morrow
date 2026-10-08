import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import * as storageApi from '../lib/easyt/storage.ts';
import {requireReadableTripDocument} from '../lib/easyt/trip-document.ts';
import {createBuilderEditSession} from '../lib/easyt/trip-builder-edit-session.ts';
import {readBuilderInputDraft,writeBuilderInputDraft} from '../lib/easyt/trip-builder-input-draft.ts';
import {tripSyncRecoveryPath,tripSyncSignInPath} from '../lib/easyt/trip-continuity.ts';
const fixture=JSON.parse(readFileSync(new URL('./fixtures/batch14-guest-bootstrap.json',import.meta.url),'utf8'));
class Memory {values=new Map<string,string>();get length(){return this.values.size;}key(i:number){return [...this.values.keys()][i]??null;}getItem(k:string){return this.values.get(k)??null;}setItem(k:string,v:string){this.values.set(k,v);}removeItem(k:string){this.values.delete(k);}}
const source=readFileSync(new URL('../app/journey/new/trip-builder.tsx',import.meta.url),'utf8');
const at=source.indexOf('    const start=async()=>{'),end=source.indexOf('\n    void start();',at);assert(at>0&&end>at);
const script=ts.transpileModule(source.slice(at,end)+'\nreturn start;',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
async function bootstrap(options:{prior?:any;candidate?:any;owner?:string|null;source?:boolean;loaded?:(record:any,storage:Memory)=>any}={}){
 const memory=new Memory(),prior=options.prior??structuredClone(fixture.trip),candidate=options.candidate??{...structuredClone(fixture.trip),updatedAt:fixture.renderedUpdatedAt},owner=options.owner??null;
 storageApi.saveTripRecoveryToStorage(memory,prior,{ownerId:prior.ownerId,writeId:'original-write'});
 const state={seed:null as any,blocked:false,error:'',stored:null as any};
 const scope={active:true,activeBrowserOwnerId:owner,activeTripDocument:candidate,hydratedCanonicalTripRef:{current:options.source?candidate:null},recoveryHandleRef:{current:options.source?storageApi.loadTripRecoveryFromStorage(memory,prior.id,prior.ownerId):null},receiptAcknowledgementRef:{current:Promise.resolve(true)},builderSearchParams:new URLSearchParams(),requireReadableTripDocument,
  sameRecoveryDocument:(storageApi as any).sameRecoveryDocument,
  persistDeviceRecovery:(trip:any)=>{state.stored=storageApi.saveTripRecoveryToStorage(memory,trip,{ownerId:owner});return state.stored;},
  loadTripRecovery:(id:string,scopeOwner:string|null)=>{const record=storageApi.loadTripRecoveryFromStorage(memory,id,scopeOwner);return options.loaded?options.loaded(record,memory):record;},
  setDeviceRecoveryBlocked:(blocked:boolean)=>state.blocked=blocked,setDeviceStorageBlocked:()=>{},setSaveState:()=>{},setCloudSaveError:(message:string)=>state.error=message,setBuilderSeed:(seed:any)=>state.seed=seed};
 await new Function('scope',`with(scope){${script}}`)(scope)();return {memory,state,candidate};
}
test('timestamp-only guest reconstruction seeds the acknowledged document and exact original handle',async()=>{
 const h=await bootstrap();assert.equal(h.state.blocked,false);assert(h.state.seed,'The accepted durable document must mount');assert.equal(h.state.seed.initialTrip.updatedAt,fixture.trip.updatedAt);assert.equal(h.state.seed.initialRecovery.writeId,'original-write');assert.equal(h.state.stored.handle.writeId,'original-write');assert.equal(h.state.seed.allowRecoverySync,true);
 const session=createBuilderEditSession({...h.state.seed,getOwnerId:()=>null,readDraft:(trip,owner)=>readBuilderInputDraft(h.memory,trip,owner),writeDraft:(trip,draft,owner)=>writeBuilderInputDraft(h.memory,trip,draft,owner),saveRecovery:(trip,options)=>storageApi.saveTripRecoveryToStorage(h.memory,trip,options),acknowledgeRecovery:()=>{throw Error('Guest must not acknowledge cloud');},persistAccount:async()=>{throw Error('Guest must not write cloud');},reconcile:async()=>{throw Error('No requested projection');},now:()=>fixture.trip.updatedAt,schedule:()=>()=>{}});
 try{assert.equal(session.getSnapshot().error,null);assert.equal(session.getSnapshot().recovery!.writeId,'original-write');assert.deepEqual(session.getSnapshot().trip,h.state.seed.initialTrip);}finally{session.dispose();}
});
for(const change of ['authored','generation','retained-content','identity'] as const)test(`a real ${change} difference cannot mount through existing guest recovery`,async()=>{
 const candidate={...structuredClone(fixture.trip),updatedAt:fixture.renderedUpdatedAt};
 if(change==='authored')candidate.brief.mustDo='A traveller changed this';
 if(change==='generation')candidate.brief.builderCalendarGeneration=17;
 if(change==='retained-content')candidate.brief.retainedAuthoredContent={version:1,entries:[{id:'retained',sourceStop:{id:'old',name:'Old stay',country:'Nicaragua'},sourceIntentIds:[],days:[],itineraryIdeas:[],mapPins:[]}]};
 if(change==='identity')candidate.brief.intent.route.origin.providerId='another-geographic-identity';
 const h=await bootstrap({candidate});assert.equal(h.state.seed,null);assert.equal(h.state.stored.blockedByExistingRecovery,true);assert.equal(storageApi.loadTripRecoveryFromStorage(h.memory,fixture.trip.id,null)!.writeId,'original-write');
});
test('a cloud-owned revision difference is never treated as a guest render',async()=>{
 const prior={...structuredClone(fixture.trip),ownerId:'owner-a'},candidate={...structuredClone(prior),updatedAt:fixture.renderedUpdatedAt};const h=await bootstrap({prior,candidate,owner:'owner-a'});assert.equal(h.state.seed,null);assert.equal(h.state.stored.blockedByExistingRecovery,true);
});
for(const foreign of ['owner','trip','missing','later-write'] as const)test(`bootstrap cannot seed a ${foreign} recovery after its acknowledged write`,async()=>{
 const h=await bootstrap({loaded:(record,memory)=>{
  if(foreign==='owner')return {...record,ownerId:'owner-b'};
  if(foreign==='trip')return {...record,tripId:'other-trip'};
  if(foreign==='missing')return null;
  const later={...record,writeId:'later-write',savedAt:new Date(Date.parse(record.savedAt)+1).toISOString()};memory.setItem(`easyt:trip-recovery:v2:guest:${record.tripId}:later-write`,JSON.stringify(later));return storageApi.loadTripRecoveryFromStorage(memory,record.tripId,null);
 }});assert.equal(h.state.seed,null);assert.equal(h.state.blocked,true);
});
test('Builder device recovery keeps the same draft and owner context in its editable surface',()=>{
 const body=source.match(/const recoverFromSaveError = \(\) => \{([\s\S]*?)\n  \};/)![1];assert(body);
 for(const mounted of [false,true]){let target='';new Function('scope',`with(scope){${body}}`)({builderEditSessionRef:{current:mounted?{}:null},mountedBuilder:{snapshot:{historicalRecovery:false}},syncAction:'open-device',activeTripDocument:fixture.trip,tripSyncRecoveryPath,window:{location:{assign:(url:string)=>target=url}}});assert.equal(target,`/journey/new?trip=${fixture.trip.id}&recover=1`);}
});
test('completed planner recovery and sign-in retain their existing protected routing',()=>{
 const id='completed trip';assert.equal(tripSyncRecoveryPath(id),'/journey/plan?trip=completed%20trip&save=1&recover=1');assert.equal(tripSyncSignInPath(id),`/journey/login?next=${encodeURIComponent(tripSyncRecoveryPath(id))}`);
});

for(const change of ['missing','later-write'] as const)test(`an opened recovery cannot mount a ${change} version after hydration`,async()=>{
 const h=await bootstrap({source:true,candidate:structuredClone(fixture.trip),loaded:record=>change==='missing'?null:{...record,writeId:'later-write'}});assert.equal(h.state.seed,null);assert.equal(h.state.blocked,true);
});
