import assert from 'node:assert/strict';
import test from 'node:test';
import ts from 'typescript';
import {readFileSync} from 'node:fs';
import {captureJourneyBrief} from '../lib/easyt/journey-capture.ts';
import {canonicalRouteFixture} from './fixtures/batch14-route-documents.ts';
import {requireReadableTripDocument} from '../lib/easyt/trip-document.ts';
import {createAsyncBuilderEditSession} from '../lib/easyt/trip-builder-async-edit-session.ts';
import {readBuilderInputDraft,writeBuilderInputDraft} from '../lib/easyt/trip-builder-input-draft.ts';
import {saveTripRecoveryToStorage} from '../lib/easyt/storage.ts';
import {builderPlaceCommand} from '../lib/easyt/trip-builder-handler-contract.ts';
import {handoffOutcomeIsCurrent,retireHandoffResolutionStatus,preferredHandoffLocationChoice,handoffStopOccurrenceId} from '../lib/easyt/home-trip-handoff.ts';
import {acceptedGeographicPlace,geographicInputKey,stopGeographicPlace} from '../lib/easyt/geographic-binding.ts';
import {referenceGeographicAcceptanceMatches} from '../lib/easyt/place-reference.ts';
import {authoredContentKey} from '../lib/easyt/trip-retained-authored-content.ts';
const source=()=>readFileSync(new URL('../app/journey/new/trip-builder.tsx',import.meta.url),'utf8');
const closure=(body:string,scope:Record<string,unknown>,name:string)=>new Function('scope',`with(scope){${ts.transpileModule(body+'\nreturn '+name+';',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText}}`)(scope);
const tick=async()=>{for(let n=0;n<70;n++)await Promise.resolve();};
async function fixture(){
 const capture=captureJourneyBrief('Tokyo and Kyoto'),trip=requireReadableTripDocument({...canonicalRouteFixture(),ownerId:null});trip.brief.structuredBrief=capture.structuredBrief;
 const mentions=['Tokyo','Kyoto'].map(name=>capture.mentions.find(m=>m.canonicalName===name)!);mentions.forEach((m,index)=>{trip.brief.intent.route.destinations[index]!.id=m.mentionId;});
 const values=new Map<string,string>(),storage={get length(){return values.size;},key:(n:number)=>[...values.keys()][n]??null,getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>{values.set(k,v);},removeItem:(k:string)=>{values.delete(k);}};
 let finish!:()=>void;const held=new Promise<void>(r=>finish=r);let writes=0,accountWrites=0,fail=false;
 const session=await createAsyncBuilderEditSession({initialTrip:trip,initialRecovery:null,getOwnerId:()=>null,readDraft:(document,owner)=>readBuilderInputDraft(storage,document,owner),writeDraft:(document,draft,owner)=>writeBuilderInputDraft(storage,document,draft,owner),
 saveRecovery:async(document,metadata)=>{writes++;if(writes===1)await held;if(fail)return{stored:false,handle:{ownerId:null,tripId:document.id,writeId:'refused'},blockedByExistingRecovery:false,failureReason:'device-unavailable'};const result=saveTripRecoveryToStorage(storage,document,metadata);if(result.stored)assert.equal(writeBuilderInputDraft(storage,document,metadata.draft,metadata.ownerId).ok,true);return result;},
 acknowledgeRecovery:()=>{throw Error('No account ACK in guest diagnostic');},persistAccount:()=>{accountWrites++;throw Error('No guest account write');},reconcile:()=>new Promise(()=>{}),now:()=>new Date().toISOString(),schedule:()=>()=>{}});
 const lookupSession={controller:new AbortController(),statuses:new Map(mentions.map(m=>[m.mentionId,'pending'])),handled:new Set<string>(),replayPending:undefined as undefined|(()=>Promise<void>)};
 let editNeedsReview=false;const errors:string[]=[],statuses:Record<string,string>={};
 const scope:any={lookupSession,handoffLookupSessionRef:{current:lookupSession},isCurrent:()=>true,builderEditSessionRef:{current:session},builderMountedRef:{current:true},activeBrowserOwnerIdRef:{current:null},lookupOwnerId:null,lookupTripId:trip.id,
 removedPlaceMentionIdsRef:{current:[]},placeSelectionsRef:{current:[]},intakeSelectionKeys:new Set(),authoredContentKey,handoffOutcomeIsCurrent,retireHandoffResolutionStatus,preferredHandoffLocationChoice,acceptedGeographicPlace,stopGeographicPlace,referenceGeographicAcceptanceMatches,
 savedTargetKey:(place:Parameters<typeof geographicInputKey>[0])=>authoredContentKey([geographicInputKey(place),place.geographicBinding??null]),pendingHandoffOutcomes:[],builderSeedPendingRef:{current:false},isOriginMention:(m:typeof mentions[number])=>m.role==='origin'||m.role==='fixed_start',draft:{},originResolutionVersionRef:{current:0},originVersion:0,
 seedById:new Map(trip.stops.map(s=>[s.id,{...s,coordinates:[s.longitude,s.latitude]}])),handoffOccurrenceMentionIdsRef:{current:Object.fromEntries(mentions.map((m,index)=>[trip.stops[index]!.id,m.mentionId]))},handoffStopOccurrenceId,builderPlaceCommand,
 setHandoffResolutionStatuses(update:any){Object.assign(statuses,update(statuses));},setLocationChoices(){},builderStructuralFeedback:()=>null,applyAcceptedBuilderDocument(){},setCloudSaveError:(message:string)=>errors.push(message),setSaveState(){},setEditNeedsReview(value:boolean){editNeedsReview=value;},captureStructuralChange(){},publishStructuralChange(){}};
 const text=source();scope.dispatchAcceptedBuilderEdit=closure(text.slice(text.indexOf('  const dispatchAcceptedBuilderEdits ='),text.indexOf('  const updateDiscoveryPlanningState =')),scope,'dispatchAcceptedBuilderEdit');
 const outcome=closure(text.slice(text.indexOf('      const onOutcome ='),text.indexOf('      const runLookups =')),scope,'onOutcome');
 const send=(index:number)=>outcome({item:mentions[index],value:[{name:mentions[index]!.canonicalName,country:'Japan',coordinates:index===0?[139.6917,35.6895]:[135.7681,35.0116],providerId:index===0?'provider-tokyo':'provider-kyoto',placeType:'city',routability:'direct_destination'}],status:'resolved'});
 return{session,scope,mentions,lookupSession,errors,statuses,send,finish,fail:()=>{fail=true;},writes:()=>writes,accountWrites:()=>accountWrites,editNeedsReview:()=>editNeedsReview};
}
test('simultaneous optional handoff results wait for sibling acceptance and both preserve their exact stop',async()=>{
 const f=await fixture();try{const first=f.send(0),second=f.send(1);await tick();f.finish();await Promise.all([first,second]);assert.equal(f.session.getSnapshot().acceptedRevision,2,'both independent current targets must be accepted');assert.equal(f.errors.filter(Boolean).length,0);assert.equal(f.accountWrites(),0);assert.deepEqual(f.session.getSnapshot().trip.stops.slice(0,2).map(s=>s.providerId),['provider-tokyo','provider-kyoto']);assert.equal(f.lookupSession.statuses.get(f.mentions[0]!.mentionId),'resolved');assert.equal(f.lookupSession.statuses.get(f.mentions[1]!.mentionId),'resolved');}finally{f.session.dispose();}
});
test('handoff resolved feedback waits for its durable accepted command',async()=>{
 const f=await fixture();try{const work=f.send(0);await tick();assert.notEqual(f.lookupSession.statuses.get(f.mentions[0]!.mentionId),'resolved');f.finish();await work;assert.equal(f.lookupSession.statuses.get(f.mentions[0]!.mentionId),'resolved');}finally{f.finish();f.session.dispose();}
});

test('pending replay and a duplicate live result share once-only durable application',async()=>{
 const f=await fixture();try{f.scope.builderEditSessionRef.current=null;await Promise.all([f.send(0),f.send(1)]);assert.equal(f.scope.pendingHandoffOutcomes.length,2);assert.equal(f.writes(),0);f.scope.builderEditSessionRef.current=f.session;
 const live=f.send(0),replay=f.lookupSession.replayPending!();await tick();f.finish();await Promise.all([live,replay]);assert.equal(f.writes(),2);assert.equal(f.session.getSnapshot().acceptedRevision,2);assert.equal(f.errors.filter(Boolean).length,0);assert.equal(f.accountWrites(),0);
 }finally{f.finish();f.session.dispose();}
});
for(const retirement of ['lookup-session','abort','owner','trip','removed-mention','manual-selection']as const)test(`queued handoff result retires after ${retirement}`,async()=>{
 const f=await fixture();try{const first=f.send(0),second=f.send(1);await tick();
 if(retirement==='lookup-session')f.scope.handoffLookupSessionRef.current={};
 if(retirement==='abort')f.lookupSession.controller.abort();
 if(retirement==='owner')f.scope.activeBrowserOwnerIdRef.current='other-owner';
 if(retirement==='trip')f.scope.lookupTripId='other-trip';
 if(retirement==='removed-mention')f.scope.removedPlaceMentionIdsRef.current=[f.mentions[1]!.mentionId];
 if(retirement==='manual-selection')f.lookupSession.handled.add(f.mentions[1]!.mentionId);
 f.finish();await Promise.all([first,second]);assert.equal(f.writes(),1,'obsolete queued target cannot start a write');assert.equal(f.accountWrites(),0);assert.equal(f.errors.filter(Boolean).length,0);
 }finally{f.finish();f.session.dispose();}
});
test('genuine storage refusal stays visible and does not cause a sibling automatic retry',async()=>{
 const f=await fixture();try{const first=f.send(0),second=f.send(1);await tick();f.fail();f.finish();await Promise.all([first,second]);assert.equal(f.writes(),1);assert.equal(f.session.getSnapshot().error?.category,'storage');assert.equal(f.session.getSnapshot().acceptedRevision,0);assert.notEqual(f.lookupSession.statuses.get(f.mentions[0]!.mentionId),'resolved');assert.notEqual(f.lookupSession.statuses.get(f.mentions[1]!.mentionId),'resolved');assert.equal(f.accountWrites(),0);
 }finally{f.finish();f.session.dispose();}
});
test('new raw input during an optional durable edit remains visible and unconsumed',async()=>{
 const f=await fixture();try{const first=f.send(0);await tick();const raw=f.session.updateDraft({binding:{kind:'origin'},raw:'new airport still being typed'});f.finish();await first;await raw;assert.equal(f.session.getSnapshot().draft.fields[0]?.raw,'new airport still being typed');assert.equal(f.accountWrites(),0);assert.equal(f.errors.filter(Boolean).length,0);
 }finally{f.finish();f.session.dispose();}
});

test('a genuine stale traveller edit uses review feedback without asserting an account failure',async()=>{
 const f=await fixture();try{assert.equal(await f.scope.dispatchAcceptedBuilderEdit({kind:'budget',budget:'high'},{expectedInputRevision:-1}),false);assert.equal(f.editNeedsReview(),true);assert.equal(f.accountWrites(),0);
 const parsed=ts.createSourceFile('builder.tsx',source(),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),props:Record<string,string>={};
 function visit(node:ts.Node){if(ts.isJsxSelfClosingElement(node)&&node.tagName.getText(parsed)==='MorroviaRecoveryFeedback')for(const prop of node.attributes.properties)if(ts.isJsxAttribute(prop)&&['title','safety'].includes(prop.name.getText(parsed))&&prop.initializer&&ts.isJsxExpression(prop.initializer)&&prop.initializer.expression)props[prop.name.getText(parsed)]=prop.initializer.expression.getText(parsed);ts.forEachChild(node,visit);}visit(parsed);
 const scope={buildNeedsReview:false,editNeedsReview:true,mountedBuilder:{snapshot:f.session.getSnapshot()},language:'en',devicePersistenceOutcome:null,deviceStorageBlocked:false,deviceRecoveryBlocked:false,cloudConflictTrip:null,cloudAuthInterrupted:false};
 const render=(value:string)=>new Function('scope',`with(scope){return (${value});}`)(scope);assert.doesNotMatch(render(props.title!),/account/i);assert.match(render(props.title!),/review/i);assert.doesNotMatch(render(props.safety!),/safe on this device/i);
 }finally{f.finish();f.session.dispose();}
});
