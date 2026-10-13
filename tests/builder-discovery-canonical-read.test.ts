import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {createAsyncBuilderEditSession} from '../lib/easyt/trip-builder-async-edit-session.ts';
import {createTwoStoreTripPersistence} from '../lib/easyt/two-store-trip-persistence.ts';
import {createDurableBuilderInputPersistence} from '../lib/easyt/builder-input-persistence.ts';
import {createBuilderInputDraft} from '../lib/easyt/trip-builder-input-draft.ts';
import {MemoryRecoveryDriver} from './helpers/durable-recovery-driver.ts';
import {tripFromBuilder} from '../lib/easyt/trip.ts';
import {requireReadableTripDocument} from '../lib/easyt/trip-document.ts';
import {canonicalRouteFixture} from './fixtures/batch14-route-documents.ts';
import {extractStructuredTripBrief} from '../lib/easyt/structured-trip-brief.ts';
import {createDiscoveryDraft,reduceDiscoveryDraft} from '../lib/easyt/discovery-draft.ts';
import {projectDiscovery} from '../lib/easyt/discovery-projection.ts';
import {buildDiscoveryReview} from '../lib/easyt/discovery-review.ts';
import {commitDiscoveryReview} from '../lib/easyt/discovery-commit.ts';
import {acceptedGeographicPlace} from '../lib/easyt/geographic-binding.ts';
import {builderPlaceCommand} from '../lib/easyt/trip-builder-handler-contract.ts';
import {validateBuilderStopOrder,routeIntentForAcceptedBuilderOrder} from '../lib/easyt/trip-builder-order.ts';
import {confirmedAttractionVisitSelection} from '../lib/easyt/place-intelligence.ts';
import {tripRecoveryStorageKey,currentTripStorageKey} from '../lib/easyt/storage.ts';

// Catch using a lagging rendered document to reject already durable Discovery
// selections. Execute production confirmation, read/order callbacks, scope guard
// and dispatcher with real edit/input/two-store persistence. Substitute React
// publication and Add/visit/checkpoint UI ports; Add still accepts real commands.
const text=readFileSync(new URL('../app/journey/new/trip-builder.tsx',import.meta.url),'utf8');
const ast=ts.createSourceFile('builder.tsx',text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const expressions=new Map<string,string>();let confirm='';
function visit(n:ts.Node){
 if(ts.isVariableDeclaration(n)&&ts.isIdentifier(n.name)&&n.initializer)expressions.set(n.name.text,n.initializer.getText(ast));
 if(ts.isJsxAttribute(n)&&n.name.getText(ast)==='onConfirm'&&n.initializer&&ts.isJsxExpression(n.initializer)&&n.initializer.expression?.getText(ast).includes('commitDiscoveryReview'))confirm=n.initializer.expression.getText(ast);
 ts.forEachChild(n,visit);
}visit(ast);assert.ok(confirm);
function actual(code:string,bindings:Record<string,unknown>){const js=ts.transpileModule(`const actual=${code};`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;return new Function('bindings',`with(bindings){${js}return actual;}`)(bindings);}
class MemoryStorage {values=new Map<string,string>();blocked=false;get length(){return this.values.size;}key(i:number){return [...this.values.keys()][i]??null;}getItem(k:string){return this.values.get(k)??null;}setItem(k:string,v:string){if(this.blocked&&k.startsWith('easyt:trip-recovery:'))throw new DOMException('synthetic refusal','QuotaExceededError');this.values.set(k,v);}removeItem(k:string){this.values.delete(k);}}
const deferred=()=>{let resolve!:()=>void;const promise=new Promise<void>(r=>resolve=r);return {promise,resolve};};
async function fixture({reverse=false,refuseSecond=false,holdSecond=false,legacy=false,landmark=false,refuseVisit=false}={}){
 const structuredBrief=extractStructuredTripBrief(landmark?'Taj Mahal':'South Korea'),mention=structuredBrief.placeMentions![0];
 const origin=requireReadableTripDocument(canonicalRouteFixture()).brief.intent.route.origin!;
 const trip=requireReadableTripDocument(tripFromBuilder({id:'canonical-discovery-test',origin:origin.name,originCanonicalPlaceId:origin.canonicalPlaceId,originCountry:origin.country,originProviderId:origin.providerId,originCoordinates:origin.coordinates,stops:[],startDate:'2026-10-14',endDate:landmark?'2026-10-20':'2026-10-28',picks:{},mustDo:landmark?'Taj Mahal':'South Korea',pace:'slow',hotels:'few',budget:'mid',draft:[],structuredBrief}));
 const storage=new MemoryStorage(),driver=new MemoryRecoveryDriver(),now=()=> '2026-10-13T00:00:00.000Z';let writes=0;
 const initial={version:2 as const,ownerId:null,tripId:trip.id,writeId:'source',state:'pending' as const,savedAt:now(),trip};
 storage.setItem(tripRecoveryStorageKey(null,trip.id,'source'),JSON.stringify(initial));storage.setItem(currentTripStorageKey(null),JSON.stringify({version:2,ownerId:null,tripId:trip.id}));
 const ctx=(isCurrent:()=>boolean)=>({ownerId:null,isCurrent,overflowEnabled:false,accountOverflowQualified:false});
 assert.equal((await createDurableBuilderInputPersistence(storage,driver,{trip,...ctx(()=>true)}).write(createBuilderInputDraft(trip))).ok,true);
 const session=await createAsyncBuilderEditSession({initialTrip:trip,initialRecovery:initial,getOwnerId:()=>null,
  readDraft:()=>createDurableBuilderInputPersistence(storage,driver,{trip,...ctx(()=>true)}).read(),
  writeDraft:(t,d,_o,g)=>createDurableBuilderInputPersistence(storage,driver,{trip:t,...ctx(g!.isCurrent)}).write(d),
  saveRecovery:async(t,m)=>{const id='accepted-'+ ++writes,p=await createDurableBuilderInputPersistence(storage,driver,{trip:t,...ctx(m.isCurrent)}).prepare(m.draft,id+':input');assert.equal(p.ok,true);if(!p.ok)throw Error('input preparation');
   return createTwoStoreTripPersistence(storage,driver,ctx(m.isCurrent)).save(t,{state:m.state,replace:m.replace,canonicalBase:m.canonicalBase,expectedRecoverySource:m.expectedRecoverySource,projectionOnly:m.projectionOnly,newTripOrClone:true,writeId:id,entries:[p.entry],entry:{pointer:{version:1,backend:'indexeddb',ownerId:null,tripId:t.id,writeId:id},input:p.input,receipt:null}});},
  acknowledgeRecovery:async()=>{throw Error('guest account acknowledgement');},reconcile:async()=>{throw Error('optional work is not run in this boundary regression');},persistAccount:async()=>{throw Error('guest account persistence');},now,schedule:()=>()=>{}});
 const draft={...createDiscoveryDraft(),step:'review' as const,shortlistIds:landmark?[]:['seoul','busan'],visitBaseByIntentId:landmark?{[mention.mentionId]:'agra'}:{}};
 const projection=projectDiscovery({mention,draft,context:{interests:[],existingPlaceIds:[]}});
 const review={...buildDiscoveryReview({mention,draft,projection,trip}),orderedStopIds:landmark?['discovery:agra']:reverse?['discovery:busan','discovery:seoul']:['discovery:seoul','discovery:busan']};assert.equal(review.canConfirm,true);if(landmark)assert.equal(review.visits.length,1);
 const entered=deferred(),release=deferred();let advanced=0,committing=false,visitCalls=0;
 const refs={builderEditSessionRef:{current:legacy?null:session as any},builderMountedRef:{current:true},activeBrowserOwnerIdRef:{current:null as string|null},builderCurrentDocumentRef:{current:{id:trip.id}},planningAreaViewRef:{current:{generation:1}},discoverySearchVersionRef:{current:0},planningBaseSearchUserIntentVersionRef:{current:0},planningBaseSearchIntentVersionRef:{current:0},planningAreaInputRef:{current:{generation:0}},planningAreaPendingRef:{current:new Map()},discoveryCommitRef:{current:false}};
 const owners:any={trip,addGuidedPlanningPlace:async()=>undefined,confirmAttractionVisit:async()=>false,persistDeviceRecovery:async(t:any,_caller:any,current:()=>boolean)=>{
  if(legacy)return {stored:current(),blockedByExistingRecovery:false};
  await session.waitForDeviceWrites();const s=session.getSnapshot();return {stored:current()&&JSON.stringify(s.trip)===JSON.stringify(t)&&s.saveState==='local',blockedByExistingRecovery:false};
 },applyRouteOrder:async()=>false};
 const bindings:any={...refs,discoveryOwnersRef:{current:owners},canonicalDiscoveryReview:review,activeClarificationMention:mention,discoveryDraft:draft,discoveryProjection:projection,language:'en',
  builderStructuralFeedback:()=>null,captureStructuralChange:()=>null,publishStructuralChange:()=>{},applyAcceptedBuilderDocument:()=>{},setCloudSaveError:()=>{},setSaveState:()=>{},setDeviceRecoveryBlocked:()=>{},setDeviceStorageBlocked:()=>{},setDiscoveryCommitting:(v:boolean)=>{committing=v;},
  setBaseSearchErrors:()=>{},setResolvingPlaceMentionId:()=>{},setTransientPlanningMentionId:()=>{},setBaseSearchInputs:()=>{},setShowStopEditor:()=>{},setCompletedPlanningAreaMentionIds:()=>{},setCapturedStructuredBrief:()=>{},
  placeSelections:[],placeDisplayName:()=> 'South Korea',reduceDiscoveryDraft,commitDiscoveryReview,discoveryConfirmedEvent:()=>null,trackEvent:()=>{},discoveryEventKind:'country',advanceClarificationSession:()=>{advanced++;},
  scheduleLocks:{stopIds:[],arrivalDates:{}},structuredRouteConstraints:{fixedCommitments:[]},stops:[],protectedBuilderStopIds:[],fixedBuilderChronology:false,validateBuilderStopOrder,routeIntentForAcceptedBuilderOrder,rememberStructuralChange:()=>{},setRoutePreviewStopIds:()=>{},setKeptRouteKey:()=>{},routeIntelligence:{route:{recommendedStopIds:[]}},handoffLookupSessionRef:{current:{handled:new Set()}},confirmedAttractionVisitSelection,setPlaceSelections:()=>{},setRemovedPlaceMentionIds:()=>{},origin:origin.name,journeyEnd:trip.brief.intent.route.journeyEnd,effectiveStructuredBrief:structuredBrief,tripBrief:'South Korea',allocation:{},useCallback:(fn:any)=>fn,
  window:{requestAnimationFrame:(fn:any)=>fn(),setTimeout:(fn:any)=>fn()},flushSync:(fn:any)=>fn(),
 };
 for(const name of ['dispatchAcceptedBuilderEdits','dispatchAcceptedBuilderEdit','capturePlanningAreaView','beginPlanningAreaAction','completePlanningArea','commitStopOrder','currentDiscoveryTrip','applyDiscoveryRouteOrder','confirmAttractionVisit'])if(expressions.has(name))bindings[name]=actual(expressions.get(name)!,bindings);
 if(landmark)owners.confirmAttractionVisit=async(...args:any[])=>{visitCalls++;if(refuseVisit)storage.blocked=true;return bindings.confirmAttractionVisit(...args);};
 owners.applyRouteOrder=(ids:string[])=>bindings.applyDiscoveryRouteOrder(ids);
 owners.addGuidedPlanningPlace=async(_mention:any,suggestion:any)=>{
  const source=session.getSnapshot();if(refuseSecond&&suggestion.canonicalPlaceId==='busan')storage.blocked=true;
  const place=acceptedGeographicPlace({name:suggestion.name,country:suggestion.country,canonicalPlaceId:suggestion.canonicalPlaceId,coordinates:suggestion.coordinates},suggestion);assert.ok(place);
  const id=suggestion.canonicalPlaceId+'-stop',command=builderPlaceCommand(source.trip,{stopId:id,intentId:source.trip.brief.intent.route.destinations.some(i=>i.id===mention.mentionId)?mention.mentionId:undefined,place});assert.ok(command);
  const selection={mentionId:mention.mentionId,kind:landmark?'visit' as const:'base' as const,relationshipType:landmark?'visit-from-base' as const:undefined,selectedCanonicalPlaceId:suggestion.canonicalPlaceId,selectedName:suggestion.name,selectedPlaceType:suggestion.placeType,selectedParentCountries:[suggestion.country],routeStopId:id,provenance:suggestion.provenance[0]};
  const ok=await bindings.dispatchAcceptedBuilderEdits([command,{kind:'planning-selection',selection}],{expectedInputRevision:source.inputRevision});if(!ok)return undefined;
  // Publish the first base, but hold every subsequent React/layout publication.
  if(suggestion.canonicalPlaceId==='seoul'){owners.trip=session.getSnapshot().trip;bindings.stops=owners.trip.stops;}
  if(holdSecond&&suggestion.canonicalPlaceId===(landmark?'agra':'busan')){entered.resolve();await release.promise;}
  return {id,name:suggestion.name,canonicalPlaceId:suggestion.canonicalPlaceId};
 };
 if(legacy){owners.addGuidedPlanningPlace=async(_m:any,suggestion:any)=>{const id=suggestion.canonicalPlaceId+'-stop';owners.trip={...owners.trip,stops:[...owners.trip.stops,{id,canonicalPlaceId:suggestion.canonicalPlaceId}],brief:{...owners.trip.brief,structuredBrief:{...owners.trip.brief.structuredBrief,placeSelections:[...(owners.trip.brief.structuredBrief.placeSelections??[]),{mentionId:mention.mentionId,kind:'base',selectedCanonicalPlaceId:suggestion.canonicalPlaceId,routeStopId:id}]}}};return {id};};owners.applyRouteOrder=async()=>true;bindings.completePlanningArea=async()=>true;}
 return {session,refs,owners,bindings,mention,review,entered,release,get writes(){return writes;},run:()=>actual(confirm,bindings)(),read:()=>createTwoStoreTripPersistence(storage,driver,ctx(()=>true)).read(trip.id),get visitCalls(){return visitCalls;},get advanced(){return advanced;},get committing(){return committing;}};
}
for(const reverse of [false,true])test(`durable multi-base Discovery completes with held rendered publication${reverse?' and reviewed order':''}`,async()=>{
 const h=await fixture({reverse});try{await h.run();const read=await h.read();assert.equal(h.advanced,1,'durable accepted bases must not be rejected because React publication is behind');assert.equal(read.kind,'found');if(read.kind!=='found')return;
 assert.deepEqual(read.trip.stops.map(s=>s.name),reverse?['Busan','Seoul']:['Seoul','Busan']);assert.deepEqual(read.trip.stops.map(s=>s.nights),[7,7]);assert.deepEqual(read.trip.brief.structuredBrief?.completedPlanningAreaMentionIds,[h.mention.mentionId]);assert.equal(h.owners.trip.stops.length,1,'the regression actually holds the rendered ref behind');assert.equal(h.committing,false);
 }finally{h.session.dispose();}
});
test('Discovery refuses an undurable second base despite the current editor',async()=>{
 const h=await fixture({refuseSecond:true});try{await h.run();const read=await h.read();assert.equal(h.advanced,0);assert.equal(read.kind,'found');if(read.kind==='found'){assert.deepEqual(read.trip.stops.map(s=>s.name),['Seoul']);assert.deepEqual(read.trip.brief.structuredBrief?.completedPlanningAreaMentionIds,[]);}assert.equal(h.committing,false);}finally{h.session.dispose();}
});
for(const change of ['view','search','owner','document','editor','unmount'] as const)test(`durable late second base cannot complete after ${change} retires confirmation`,async()=>{
 const h=await fixture({holdSecond:true});try{const work=h.run();await h.entered.promise;
 if(change==='view')h.refs.planningAreaViewRef.current.generation++;
 if(change==='search')h.refs.planningBaseSearchUserIntentVersionRef.current++;
 if(change==='owner')h.refs.activeBrowserOwnerIdRef.current='other-owner';
 if(change==='document')h.refs.builderCurrentDocumentRef.current.id='other-trip';
 if(change==='editor')h.refs.builderEditSessionRef.current={getSnapshot:()=>h.session.getSnapshot()};
 if(change==='unmount')h.refs.builderMountedRef.current=false;
 h.release.resolve();await work;assert.equal(h.advanced,0);const read=await h.read();assert.equal(read.kind,'found');if(read.kind==='found'){assert.deepEqual(read.trip.stops.map(s=>s.name),['Seoul','Busan']);assert.deepEqual(read.trip.brief.structuredBrief?.completedPlanningAreaMentionIds,[]);}if(change!=='unmount')assert.equal(h.committing,false);
 }finally{h.session.dispose();}
});
test('legacy Discovery without an editor continues to use its rendered mutation owner',async()=>{
 const h=await fixture({legacy:true});try{await h.run();assert.equal(h.advanced,1);assert.equal(h.owners.trip.stops.length,2);}finally{h.session.dispose();}
});

// The visit port below executes the real handler; the base UI port still accepts
// actual commands. Agra is durable while both rendered trip and stops stay empty.
test('real landmark visit handler confirms durable Agra with held rendered publication',async()=>{
 const h=await fixture({landmark:true});try{await h.run();const read=await h.read();assert.deepEqual(h.session.getSnapshot().trip.stops.map(s=>s.name),['Agra']);assert.equal(h.visitCalls,1);assert.equal(h.advanced,1,'durable Agra must acquire its confirmed visit before completion');assert.equal(read.kind,'found');if(read.kind!=='found')return;
 assert.deepEqual(read.trip.stops.map(s=>[s.id,s.name,s.nights]),[['agra-stop','Agra',6]]);
 const selection=read.trip.brief.structuredBrief?.placeSelections?.find(s=>s.mentionId===h.mention.mentionId);
 assert.equal(selection?.kind,'visit');assert.equal(selection?.relationshipType,'within-stop');assert.equal(selection?.routeStopId,'agra-stop');assert.equal(selection?.provenance.id,`builder-attraction-visit:${h.mention.mentionId}:agra-stop`);
 assert.deepEqual(read.trip.brief.structuredBrief?.completedPlanningAreaMentionIds,[h.mention.mentionId]);assert.equal(h.owners.trip.stops.length,0);assert.equal(h.bindings.stops.length,0);assert.equal(h.committing,false);
 }finally{h.session.dispose();}
});
test('real landmark visit refuses an undurable relationship and preserves its accepted base',async()=>{
 const h=await fixture({landmark:true,refuseVisit:true});try{await h.run();const read=await h.read();assert.equal(h.visitCalls,1);assert.equal(h.writes,2,'the confirmed visit actually reaches a refused durable write');assert.equal(h.advanced,0);assert.equal(read.kind,'found');if(read.kind==='found'){assert.deepEqual(read.trip.stops.map(s=>s.name),['Agra']);assert.equal(read.trip.brief.structuredBrief?.placeSelections?.[0]?.provenance.id.startsWith('builder-attraction-visit:'),false);assert.deepEqual(read.trip.brief.structuredBrief?.completedPlanningAreaMentionIds,[]);}}finally{h.session.dispose();}
});
for(const change of ['view','search','owner','document','editor','unmount'] as const)test(`durable Agra cannot confirm a visit after ${change} retires Discovery`,async()=>{
 const h=await fixture({landmark:true,holdSecond:true});try{const work=h.run();await h.entered.promise;
 if(change==='view')h.refs.planningAreaViewRef.current.generation++;
 if(change==='search')h.refs.planningBaseSearchUserIntentVersionRef.current++;
 if(change==='owner')h.refs.activeBrowserOwnerIdRef.current='other-owner';
 if(change==='document')h.refs.builderCurrentDocumentRef.current.id='other-trip';
 if(change==='editor')h.refs.builderEditSessionRef.current={getSnapshot:()=>h.session.getSnapshot()};
 if(change==='unmount')h.refs.builderMountedRef.current=false;
 h.release.resolve();await work;assert.equal(h.advanced,0);const read=await h.read();assert.equal(read.kind,'found');if(read.kind==='found'){assert.deepEqual(read.trip.stops.map(s=>s.name),['Agra']);assert.equal(read.trip.brief.structuredBrief?.placeSelections?.[0]?.provenance.id.startsWith('builder-attraction-visit:'),false);assert.deepEqual(read.trip.brief.structuredBrief?.completedPlanningAreaMentionIds,[]);}
 }finally{h.session.dispose();}
});

test('real visit handler without an editor retains the legacy rendered stop and selection owner',async()=>{
 const h=await fixture({landmark:true});try{
  const base=h.review.bases[0];await h.owners.addGuidedPlanningPlace(h.mention,base.suggestion);
  h.refs.builderEditSessionRef.current=null;h.bindings.stops=h.session.getSnapshot().trip.stops;
  let selections:any[]=[];h.bindings.setPlaceSelections=(update:any)=>{selections=update(selections);};
  await h.bindings.confirmAttractionVisit(h.mention,h.review.visits[0].proposal,'agra-stop');
  assert.equal(selections[0]?.provenance.id,`builder-attraction-visit:${h.mention.mentionId}:agra-stop`);assert.equal(selections[0]?.relationshipType,'within-stop');assert.equal(h.writes,1,'legacy UI publication must not dispatch an editor write');
 }finally{h.session.dispose();}
});
