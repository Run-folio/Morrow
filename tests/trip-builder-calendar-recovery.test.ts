import assert from 'node:assert/strict';
import test from 'node:test';
import type {CanonicalEasyTTrip, EasyTTrip} from '../lib/easyt/trip.ts';
import type {BuilderAcceptedEdit} from '../lib/easyt/trip-builder-edit.ts';
import type {EasyTBrowserStorage} from '../lib/easyt/storage.ts';
import {canonicalRouteFixture} from './fixtures/batch14-route-documents.ts';
import {requireReadableTripDocument} from '../lib/easyt/trip-document.ts';
import {canonicalTripForOwner} from '../lib/easyt/trip-promotion.ts';
import {builderStructuralSnapshot} from '../lib/easyt/trip-builder-edit.ts';
import {prepareBuilderHandlerEdit} from '../lib/easyt/trip-builder-handler-contract.ts';
import {builderDocumentFingerprint} from '../lib/easyt/trip-builder-document-commit.ts';
import {authoredContentKey} from '../lib/easyt/trip-retained-authored-content.ts';
import {nextTripUpdatedAt} from '../lib/easyt/trip-continuity.ts';
import {cacheCanonicalTripToStorage,cacheCanonicalTripWithRecoveryToStorage,saveTripRecoveryToStorage,loadTripRecoveryFromStorage,loadLocalTripFromStorage,tripDocumentsCanonicalEquivalent} from '../lib/easyt/storage.ts';
const apply=(trip:CanonicalEasyTTrip,edit:BuilderAcceptedEdit)=>{const result=prepareBuilderHandlerEdit(trip,edit,builderDocumentFingerprint(trip));assert.ok(result.ok);return result.trip};
function memory(): EasyTBrowserStorage {const data=new Map<string,string>();return {getItem:(key:string)=>data.get(key)??null,setItem:(key:string,value:string)=>{data.set(key,value)},removeItem:(key:string)=>{data.delete(key)},key:(index:number)=>[...data.keys()][index]??null,get length(){return data.size}}}
test('unacknowledged monotone calendar history survives equivalent old cloud reload',()=>{
 const initial=requireReadableTripDocument(canonicalTripForOwner('owner-a',canonicalRouteFixture()));
 const frame=builderStructuralSnapshot(initial),stop=initial.stops[0],intent=initial.brief.intent.route.destinations.find(i=>i.stopIds.includes(stop.id))!;
 const grown=apply(initial,{kind:'nights',stopId:stop.id,intentId:intent.id,nights:stop.nights!+1});
 const addedId=grown.planItems.find(d=>!initial.planItems.some(old=>old.id===d.id))!.id;
 let local=apply(grown,{kind:'structural-inverse',snapshot:frame});
 const entry=local.brief.retainedAuthoredContent!.entries.find(e=>e.days.some(d=>d.sourceDay.id===addedId))!;
 local=apply(local,{kind:'retained-content-remove',selection:{entryId:entry.id,expectedContentKey:authoredContentKey(entry),dayIds:[addedId]}});
 assert.ok(local.brief.builderCalendarGeneration!>0);assert.equal(local.brief.retainedAuthoredContent,undefined);
 const storage=memory();cacheCanonicalTripToStorage(storage,initial);
 assert.equal(saveTripRecoveryToStorage(storage,local,{writeId:'review-unacknowledged'}).stored,true);
 const oldCloud={...initial,updatedAt:nextTripUpdatedAt(initial.updatedAt)};
 const equivalence=tripDocumentsCanonicalEquivalent(local,oldCloud);
 const cached=cacheCanonicalTripWithRecoveryToStorage(storage,oldCloud);
 const reload=loadLocalTripFromStorage(storage,initial.id,'owner-a')!;
 const regrown=apply(requireReadableTripDocument(reload),{kind:'nights',stopId:stop.id,intentId:intent.id,nights:stop.nights!+1});
 const newId=regrown.planItems.find(d=>!initial.planItems.some(old=>old.id===d.id))!.id;
 assert.equal(equivalence,false); assert.equal(cached.recoveryResolved,false);
 assert.ok(loadTripRecoveryFromStorage(storage,initial.id,'owner-a'),'an unrelated cloud read must not acknowledge generation-only recovery');
 assert.equal(reload.brief.builderCalendarGeneration,local.brief.builderCalendarGeneration);
 assert.notEqual(newId,addedId,'a genuinely new day cannot reuse the retired live ID');
});

function richRetiredTrip() {
 const initial=requireReadableTripDocument(canonicalTripForOwner('owner-a',canonicalRouteFixture()));
 const tokyo=initial.stops[0],tokyoIntent=initial.brief.intent.route.destinations.find(i=>i.stopIds.includes(tokyo.id))!;
 const grown=apply(initial,{kind:'nights',stopId:tokyo.id,intentId:tokyoIntent.id,nights:tokyo.nights!+1});
 const kyoto=grown.stops[1],intent=grown.brief.intent.route.destinations.find(i=>i.stopIds.includes(kyoto.id))!;
 const source=grown.planItems.filter(d=>d.stopId===kyoto.id).at(-1)!;
 source.notes=['Private ticket instructions'];source.noteDayParts=['morning'];source.startsAt='09:00';source.bookingUrl='https://example.invalid/my-ticket';
 grown.brief.dayNotes={[source.dayNumber]:['Private reminder']};
 grown.brief.customActivities={[source.dayNumber]:['Meet the guide']};
 grown.brief.itineraryIdeas=[{id:'private-reference',stopId:kyoto.id,dayId:source.id,category:'activity',source:'google-place-reference',providerReference:{provider:'google',placeId:'ChIJ-private-retired'},userNote:'Keep my meeting details'}];
 grown.brief.mapPins=[{id:'private-pin',title:'Meeting point',category:'activity',dayNumber:source.dayNumber,latitude:35,longitude:135}];
 return apply(grown,{kind:'nights',stopId:kyoto.id,intentId:intent.id,nights:kyoto.nights!-1});
}

test('recovery equivalence protects every complete retained source field and generation',()=>{
 const local=richRetiredTrip();
 const changes:Array<(trip:CanonicalEasyTTrip)=>void>=[
  trip=>{trip.brief.builderCalendarGeneration!++;},
  trip=>{trip.brief.retainedAuthoredContent=undefined;},
  trip=>{trip.brief.retainedAuthoredContent!.entries[0].id+='-other';},
  trip=>{trip.brief.retainedAuthoredContent!.entries[0].sourceKind='removed_stop';},
  trip=>{trip.brief.retainedAuthoredContent!.entries[0].sourceStop.name='Other source';},
  trip=>{trip.brief.retainedAuthoredContent!.entries[0].sourceIntentIds=[];},
  trip=>{trip.brief.retainedAuthoredContent!.entries[0].days[0].sourceDay.id+='-other';},
  trip=>{trip.brief.retainedAuthoredContent!.entries[0].days[0].sourceDay.date='2026-10-30';},
  trip=>{trip.brief.retainedAuthoredContent!.entries[0].days[0].sourceDay.notes=['Other notes'];},
  trip=>{trip.brief.retainedAuthoredContent!.entries[0].days[0].sourceDay.noteDayParts=['evening'];},
  trip=>{trip.brief.retainedAuthoredContent!.entries[0].days[0].sourceDay.startsAt='11:00';},
  trip=>{trip.brief.retainedAuthoredContent!.entries[0].days[0].sourceDay.bookingUrl=null;},
  trip=>{trip.brief.retainedAuthoredContent!.entries[0].days[0].dayNotes=['Other reminder'];},
  trip=>{trip.brief.retainedAuthoredContent!.entries[0].days[0].customActivities=[];},
  trip=>{const idea=trip.brief.retainedAuthoredContent!.entries[0].itineraryIdeas[0]; assert.equal(idea.source,'google-place-reference'); if(idea.source==='google-place-reference') idea.userNote='Other reference';},
  trip=>{trip.brief.retainedAuthoredContent!.entries[0].mapPins[0].longitude=136;},
 ];
 for(const [index,change] of changes.entries()) {
  const cloud=structuredClone(local);change(cloud);
  assert.equal(tripDocumentsCanonicalEquivalent(local,cloud),false,`retained payload variant ${index}`);
 }
});

test('equal retained metadata tolerates generated guidance and current-cloud redundancy',()=>{
 const local=richRetiredTrip(),cloud=structuredClone(local);
 cloud.updatedAt=nextTripUpdatedAt(local.updatedAt);cloud.legs=cloud.legs.map(leg=>({...leg,durationMinutes:(leg.durationMinutes??0)+1}));cloud.recommendations=[];
 cloud.planItems[0].notes=cloud.planItems[0].notes.map((_,index)=>`Refreshed generated guidance ${index}`);
 assert.equal(tripDocumentsCanonicalEquivalent(local,cloud),true);
 const storage=memory();assert.equal(saveTripRecoveryToStorage(storage,local,{writeId:'equal-metadata'}).stored,true);
 assert.deepEqual(cacheCanonicalTripWithRecoveryToStorage(storage,cloud),{stored:true,recoveryResolved:true});
 assert.equal(loadTripRecoveryFromStorage(storage,local.id,'owner-a'),null);
 const reload=loadLocalTripFromStorage(storage,local.id,'owner-a')!;
 assert.deepEqual(reload.brief.retainedAuthoredContent,local.brief.retainedAuthoredContent);
 assert.equal(reload.brief.builderCalendarGeneration,local.brief.builderCalendarGeneration);
});

test('prior-cloud redundancy requires complete retained metadata equality',()=>{
 const local=richRetiredTrip(),next=apply(local,{kind:'budget',budget:'high'});
 for(const sameMetadata of [false,true]) {
  const storage=memory(),prior=structuredClone(local);
  if(!sameMetadata) prior.brief.retainedAuthoredContent!.entries[0].days[0].sourceDay.notes=['Older private source'];
  assert.equal(cacheCanonicalTripToStorage(storage,prior),true);
  assert.equal(saveTripRecoveryToStorage(storage,local,{writeId:`prior-metadata-${sameMetadata}`}).stored,true);
  const cloud=structuredClone(next);
  if(!sameMetadata) cloud.brief.retainedAuthoredContent=structuredClone(prior.brief.retainedAuthoredContent);
  const cached=cacheCanonicalTripWithRecoveryToStorage(storage,cloud);
  assert.equal(cached.recoveryResolved,sameMetadata);
  assert.equal(Boolean(loadTripRecoveryFromStorage(storage,local.id,'owner-a')),!sameMetadata);
  const reload=loadLocalTripFromStorage(storage,local.id,'owner-a')!;
  assert.deepEqual(reload.brief.retainedAuthoredContent,local.brief.retainedAuthoredContent);
  assert.equal(reload.brief.builderCalendarGeneration,local.brief.builderCalendarGeneration);
 }
});

test('only the exact current write ACK clears newer retained metadata',()=>{
 const old=richRetiredTrip(),latest=structuredClone(old);
 latest.brief.retainedAuthoredContent!.entries[0].days[0].sourceDay.notes.push('Later private edit');
 const storage=memory();assert.equal(cacheCanonicalTripToStorage(storage,old),true);
 const first=saveTripRecoveryToStorage(storage,old,{writeId:'retained-write-a'});assert.equal(first.stored,true);
 const second=saveTripRecoveryToStorage(storage,latest,{writeId:'retained-write-b',replace:first.handle});assert.equal(second.stored,true);
 const staleCloud={...old,updatedAt:nextTripUpdatedAt(old.updatedAt)};
 assert.deepEqual(cacheCanonicalTripWithRecoveryToStorage(storage,staleCloud,first.handle),{stored:true,recoveryResolved:false});
 const remaining=loadTripRecoveryFromStorage(storage,latest.id,'owner-a')!;
 assert.equal(remaining.writeId,second.handle.writeId);
 assert.deepEqual(remaining.trip.brief.retainedAuthoredContent,latest.brief.retainedAuthoredContent);
 const exactCloud={...latest,updatedAt:nextTripUpdatedAt(staleCloud.updatedAt)};
 assert.deepEqual(cacheCanonicalTripWithRecoveryToStorage(storage,exactCloud,second.handle),{stored:true,recoveryResolved:true});
 assert.equal(loadTripRecoveryFromStorage(storage,latest.id,'owner-a'),null);
 assert.deepEqual(loadLocalTripFromStorage(storage,latest.id,'owner-a')!.brief.retainedAuthoredContent,latest.brief.retainedAuthoredContent);
});

test('same counter and route cannot acknowledge different owned calendar IDs',()=>{
 const initial=requireReadableTripDocument(canonicalTripForOwner('owner-a',canonicalRouteFixture()));
 const grow=(trip:CanonicalEasyTTrip,index:number)=>{
  const stop=trip.stops[index],intent=trip.brief.intent.route.destinations.find(i=>i.stopIds.includes(stop.id))!;
  return apply(trip,{kind:'nights',stopId:stop.id,intentId:intent.id,nights:stop.nights!+1});
 };
 const local=grow(grow(initial,0),1),cloud=grow(grow(initial,1),0);
 assert.equal(local.brief.builderCalendarGeneration,cloud.brief.builderCalendarGeneration);
 assert.deepEqual(local.stops,cloud.stops);
 assert.equal(local.brief.retainedAuthoredContent,undefined);assert.equal(cloud.brief.retainedAuthoredContent,undefined);
 assert.notDeepEqual(local.planItems.map(day=>day.id),cloud.planItems.map(day=>day.id));
 const storage=memory();assert.equal(cacheCanonicalTripToStorage(storage,initial),true);
 assert.equal(saveTripRecoveryToStorage(storage,local,{writeId:'calendar-identity-only'}).stored,true);
 assert.equal(tripDocumentsCanonicalEquivalent(local,cloud),false);
 assert.deepEqual(cacheCanonicalTripWithRecoveryToStorage(storage,cloud),{stored:true,recoveryResolved:false});
 assert.deepEqual(loadLocalTripFromStorage(storage,local.id,'owner-a')!.planItems,local.planItems);
});

test('older same-route cloud cannot erase unacknowledged retired authored content',()=>{
 const initial=requireReadableTripDocument(canonicalTripForOwner('owner-a',canonicalRouteFixture()));
 const stop=initial.stops[1],intent=initial.brief.intent.route.destinations.find(i=>i.stopIds.includes(stop.id))!;
 const command: BuilderAcceptedEdit={kind:'nights',stopId:stop.id,intentId:intent.id,nights:stop.nights!-1};
 const beforeLocal=structuredClone(initial),source=beforeLocal.planItems.filter(d=>d.stopId===stop.id).at(-1)!;
 source.notes=['Private ticket instructions'];source.startsAt='09:00';source.bookingUrl='https://example.invalid/my-ticket';
 beforeLocal.brief.itineraryIdeas=[{id:'private-reference',stopId:stop.id,dayId:source.id,category:'activity',source:'google-place-reference',providerReference:{provider:'google',placeId:'ChIJ-private-retired'},userNote:'Keep my meeting details'}];
 const local=apply(beforeLocal,command),cloud={...apply(initial,command),updatedAt:nextTripUpdatedAt(initial.updatedAt)};
 const storage=memory();cacheCanonicalTripToStorage(storage,initial);
 assert.equal(saveTripRecoveryToStorage(storage,local,{writeId:'review-authored-unacknowledged'}).stored,true);
 const equivalent=tripDocumentsCanonicalEquivalent(local,cloud);
 const cached=cacheCanonicalTripWithRecoveryToStorage(storage,cloud);
 const reload=loadLocalTripFromStorage(storage,initial.id,'owner-a')!;
 assert.equal(equivalent,false); assert.equal(cached.recoveryResolved,false);
 assert.ok(loadTripRecoveryFromStorage(storage,initial.id,'owner-a'),'the only retained copy of authored source data must survive an unrelated cloud read');
 assert.deepEqual(reload.brief.retainedAuthoredContent,local.brief.retainedAuthoredContent);
});

test('final trip day retires and restores exact source after later survivor edits',()=>{
 const initial=requireReadableTripDocument(canonicalTripForOwner('owner-a',canonicalRouteFixture()));
 const stop=initial.stops.at(-1)!,intent=initial.brief.intent.route.destinations.find(i=>i.stopIds.includes(stop.id))!,final=initial.planItems.at(-1)!;
 final.notes=['My final trip day'];final.startsAt='10:00';final.bookingUrl='https://example.invalid/final-booking';
 initial.brief.itineraryIdeas=[{id:'final-reference',stopId:stop.id,dayId:final.id,category:'activity',source:'google-place-reference',providerReference:{provider:'google',placeId:'ChIJ-final-day'},userNote:'Exact final source'}];
 const source=structuredClone(final),snapshot=builderStructuralSnapshot(initial);
 let reduced=apply(initial,{kind:'nights',stopId:stop.id,intentId:intent.id,nights:stop.nights!-1});
 assert.equal(reduced.planItems.some(d=>d.id===final.id),false);
 const entry=reduced.brief.retainedAuthoredContent!.entries.find(e=>e.days.some(d=>d.sourceDay.id===final.id))!;
 assert.deepEqual(entry.days[0].sourceDay,source);assert.deepEqual(entry.itineraryIdeas,initial.brief.itineraryIdeas);
 assert.equal(reduced.brief.itineraryIdeas!.length,0);
 reduced=apply(reduced,{kind:'budget',budget:'high'});reduced.planItems[0].notes.push('Later unrelated note');
 const inverse=apply(reduced,{kind:'structural-inverse',snapshot});
 assert.deepEqual(inverse.planItems.find(d=>d.id===final.id),source);assert.equal(inverse.planItems.at(-1)!.dayNumber,10);
 assert.deepEqual(inverse.brief.itineraryIdeas,initial.brief.itineraryIdeas);assert.equal(inverse.brief.budgetBand,'high');assert.ok(inverse.planItems[0].notes.includes('Later unrelated note'));
});

test('generation survives full document serialization and ordinary storage/promotion paths',async()=>{
 const {remapTripStopReferences,duplicateTripDocument,requestTripPromotion}=await import('../lib/easyt/trip-promotion.ts');
 const {requestTripUpdate}=await import('../lib/easyt/trip-continuity.ts');
 const {prepareTripDocumentForWrite}=await import('../lib/easyt/trip-document.ts');
 const {claimGuestTripRecoveryForOwnerInStorage}=await import('../lib/easyt/storage.ts');
 const initial=requireReadableTripDocument(canonicalTripForOwner('owner-a',canonicalRouteFixture())),stop=initial.stops[0],intent=initial.brief.intent.route.destinations.find(i=>i.stopIds.includes(stop.id))!;
 const grown=apply(initial,{kind:'nights',stopId:stop.id,intentId:intent.id,nights:stop.nights!+1}),generation=grown.brief.builderCalendarGeneration;
 assert.ok(generation!>0);
 const check=(trip:EasyTTrip)=>assert.equal(trip.brief.builderCalendarGeneration,generation);
 check(requireReadableTripDocument(JSON.parse(JSON.stringify(prepareTripDocumentForWrite(grown)))));
 check(canonicalTripForOwner('owner-a',grown));
 check(remapTripStopReferences(grown,new Map(grown.stops.map(s=>[s.id,s.id+'-remapped']))));
 let n=0;check(duplicateTripDocument(grown,{id:'review-copy',now:grown.updatedAt,nextId:()=>String(++n)}));
 const cache=memory();cacheCanonicalTripToStorage(cache,grown);check(loadLocalTripFromStorage(cache,grown.id,'owner-a')!);
 const recovery=memory(),guest={...grown,ownerId:null};saveTripRecoveryToStorage(recovery,guest,{writeId:'review-guest'});check(loadTripRecoveryFromStorage(recovery,grown.id,null)!.trip);
 const claimed=claimGuestTripRecoveryForOwnerInStorage(recovery,grown.id,'owner-a');assert.ok(claimed);assert.equal(claimed.stored,true);check(loadTripRecoveryFromStorage(recovery,grown.id,'owner-a')!.trip);
 const request: typeof fetch=async(_url,options)=>{check(JSON.parse(String(options?.body)));return new Response('{}')};
 await requestTripUpdate(grown,request as typeof fetch);await requestTripPromotion(guest,request as typeof fetch);
});
