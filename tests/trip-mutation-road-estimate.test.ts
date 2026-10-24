import assert from 'node:assert/strict';
import test from 'node:test';
import {tripFromBuilder,type EasyTTrip} from '../lib/easyt/trip.ts';
import {acceptedGeographicPlace} from '../lib/easyt/geographic-binding.ts';
import {canonicalTripForOwner} from '../lib/easyt/trip-promotion.ts';
import {requireReadableTripDocument} from '../lib/easyt/trip-document.ts';
import {resolveTripTransferJourneys} from '../lib/easyt/multimodal-transfer-resolution.ts';
import {haversineKm} from '../lib/easyt/planner.ts';
import type {RoadRoutingProvider} from '../lib/easyt/road-routing.ts';
import {prepareBuilderHandlerEdit} from '../lib/easyt/trip-builder-handler-contract.ts';
import {builderDocumentFingerprint} from '../lib/easyt/trip-builder-document-commit.ts';
import {authoredContentKey} from '../lib/easyt/trip-retained-authored-content.ts';
import {mergeTripMutationDocuments,createTripMutationPersistenceQueue} from '../lib/easyt/trip-mutation-persistence.ts';
import {EasyTTripSaveConflictError,nextTripUpdatedAt} from '../lib/easyt/trip-continuity.ts';

// Real resolver/normalizer with only its external road provider replaced.
// A fresh provider result changes checkedAt; no leg payload delta is injected.
function provider(checkedAt:string):RoadRoutingProvider {return {provider:'openrouteservice',async route(input){
 const distance=haversineKm(input.origin.coordinates,input.destination.coordinates);assert.ok(distance);
 return {mode:'road',distanceKm:distance*1.2,durationMinutes:Math.ceil(distance*1.2/65*60),confidence:'medium',provenance:'routed',provider:'openrouteservice',providerCheckedAt:checkedAt,profile:'driving-car',routeGeometry:[input.origin.coordinates,input.destination.coordinates],attribution:'Synthetic offline road route'};
}};}
async function capturedShape(){
 const place=(id:string,name:string,country:string,coordinates:[number,number])=>{const p=acceptedGeographicPlace({name,country,coordinates,canonicalPlaceId:'fixture:'+id},{name,country,coordinates,canonicalPlaceId:'fixture:'+id,providerId:'fixture:'+id,placeType:'city',routability:'direct_destination'},'endpoint');assert.ok(p);return {...p,country};};
 const origin=place('gatwick','London Gatwick Airport','United Kingdom',[-.1903,51.1537]);
 const stops=[{...place('paris','Paris','France',[2.3522,48.8566]),id:'paris',nights:4},{...place('madrid','Madrid','Spain',[-3.7038,40.4168]),id:'madrid',nights:4},{...place('valencia','Valencia','Spain',[-.3763,39.4699]),id:'valencia',nights:3},{...place('andorra','Andorra la Vella','Andorra',[1.5218,42.5063]),id:'andorra',nights:3}];
 const raw=tripFromBuilder({id:'synthetic-road-reference',origin:origin.name,originCountry:origin.country,originCanonicalPlaceId:origin.canonicalPlaceId,originProviderId:origin.providerId,originCoordinates:origin.coordinates,journeyEnd:{mode:'same_as_start'},stops,startDate:'2027-11-10',endDate:'2027-11-24',picks:{},mustDo:'',pace:'slow',hotels:'few',budget:'mid',nightAllocations:{paris:4,madrid:4,valencia:3,andorra:3},draft:[]});raw.brief.intent.route.origin=origin;
 const base=requireReadableTripDocument(await resolveTripTransferJourneys(canonicalTripForOwner('owner-a',{...raw,status:'planned'}),{provider:provider('2026-10-24T01:00:00.000Z')}));
 const canonical=requireReadableTripDocument({...await resolveTripTransferJourneys(base,{provider:provider('2026-10-24T02:00:00.000Z')}),updatedAt:nextTripUpdatedAt(base.updatedAt)});
 const ids=base.stops.map(s=>s.id),prepared=prepareBuilderHandlerEdit(base,{kind:'order',source:'drag',stopIds:[ids[0],ids[2],ids[1],ids[3]]},builderDocumentFingerprint(base));assert.ok(prepared.ok);
 const authored=prepared.trip;
 const changed=base.legs.flatMap((leg,index)=>{const ack=canonical.legs.find(l=>l.id===leg.id);assert.ok(ack);const fields=Object.keys({...leg,...ack}).filter(k=>authoredContentKey((leg as any)[k])!==authoredContentKey((ack as any)[k]));return fields.length?[{index,leg,ack,fields}]:[];});
 assert.ok(changed.length>0,'real provider refresh must change a persisted reference');
 assert.ok(changed.every(x=>x.fields.length===1&&x.fields[0]==='roadEstimate'),'only roadEstimate differs on canonical legs');
 const conflict=changed.find(x=>!authored.legs.some(l=>l.id===x.leg.id));assert.ok(conflict,'actual reorder removes an affected matching leg');
 assert.equal(conflict.leg.fromStopId,conflict.ack.fromStopId);assert.equal(conflict.leg.toStopId,conflict.ack.toStopId);
 assert.equal(base.updatedAt,authored.updatedAt);assert.notEqual(base.updatedAt,canonical.updatedAt);
 return {base,authored,canonical,conflict};
}

test('captured removed-leg reorder survives a provider-only road reference refresh',async t=>{
 const {base,authored,canonical,conflict}=await capturedShape();
 const estimateDifferingFields=Object.keys(conflict.leg.roadEstimate!).filter(k=>authoredContentKey((conflict.leg.roadEstimate as any)[k])!==authoredContentKey((conflict.ack.roadEstimate as any)[k]));
 assert.deepEqual(estimateDifferingFields,['checkedAt'],'exact independently captured live subfield difference');
 t.diagnostic(JSON.stringify({legAlias:'L'+(conflict.index+1),authoredMatchingLegAbsent:true,canonicalPairUnchanged:true,canonicalDifferingFields:conflict.fields,estimateDifferingFields}));
 const originals=structuredClone([base,authored,canonical]);
 const merged=mergeTripMutationDocuments(base,authored,canonical);
 assert.deepEqual(merged.stops.map(s=>s.name),['Paris','Valencia','Madrid','Andorra la Vella']);
 assert.deepEqual(merged.brief.intent!.route!.orderedStopIds,authored.brief.intent.route.orderedStopIds);
 assert.equal(merged.legs.some(l=>l.id===conflict.leg.id),false,'removed leg and its estimate must not reappear on new endpoint pairs');
 assert.equal(merged.updatedAt,canonical.updatedAt);assert.deepEqual([base,authored,canonical],originals,'all input/recovery snapshots remain immutable');
});

for(const ancestry of ['prior-authored','revision-map'] as const)test(`road reference refresh rebases queued reorder using ${ancestry} without another false conflict`,async()=>{
 const {base,authored,canonical,conflict}=await capturedShape();
 const retained=structuredClone({base,authored,canonical}),submitted:EasyTTrip[]=[];
 let release!:(trip:EasyTTrip)=>void;const held=new Promise<EasyTTrip>(resolve=>{release=resolve;});
 const queue=createTripMutationPersistenceQueue(async trip=>{submitted.push(structuredClone(trip));return submitted.length===1?held:{...trip,updatedAt:nextTripUpdatedAt(trip.updatedAt)};});queue.reset(base);
 const handle=(writeId:string)=>({ownerId:base.ownerId,tripId:base.id,writeId});
 const first=queue.enqueue(base,handle('projection'));await Promise.resolve();
 const next=queue.enqueue(authored,handle('reorder'),ancestry==='prior-authored'?base:undefined);
 release(canonical);await first;const saved=await next;
 assert.equal(submitted.length,2);assert.equal(submitted[1].updatedAt,canonical.updatedAt,'account CAS uses the actual ACK revision');
 assert.deepEqual(saved.stops.map(s=>s.name),['Paris','Valencia','Madrid','Andorra la Vella']);
 assert.equal(saved.legs.some(l=>l.id===conflict.leg.id),false);
 assert.deepEqual({base,authored,canonical},retained,'queue cannot mutate retained source/recovery branches');
});

for(const change of ['mode','duration','authored-metadata','unknown-leg-field','unknown-estimate-field','malformed-estimate','unrecognized-provider','invalid-geometry'] as const)test(`removed leg still protects concurrent ${change}`,async()=>{
 const {base,authored,canonical,conflict}=await capturedShape();const leg=canonical.legs.find(l=>l.id===conflict.leg.id)!;
 if(change==='mode')leg.mode=leg.mode==='train'?'flight':'train';
 if(change==='duration')leg.durationMinutes=(leg.durationMinutes??0)+25;
 if(change==='authored-metadata')leg.routeMetadata.futureTravellerConstraint='Keep a reserved train';
 if(change==='unknown-leg-field')(leg as any).futureAuthoredOption='reserved';
 if(change==='unknown-estimate-field')(leg.roadEstimate as any).futureAuthoredOption='reserved';
 if(change==='malformed-estimate')(leg as any).roadEstimate=null;
 if(change==='unrecognized-provider')(leg.roadEstimate as any).provider='traveller-input';
 if(change==='invalid-geometry')leg.roadEstimate!.routeGeometry=[[NaN,0]];
 const before=structuredClone([base,authored,canonical]);
 assert.throws(()=>mergeTripMutationDocuments(base,authored,canonical),EasyTTripSaveConflictError);
 assert.deepEqual([base,authored,canonical],before);
});

test('same-ID endpoint replacement still protects changed road reference',async()=>{
 const {base,canonical,conflict}=await capturedShape();const authored=structuredClone(base);
 authored.legs.find(l=>l.id===conflict.leg.id)!.toStopId='different-endpoint';
 assert.throws(()=>mergeTripMutationDocuments(base,authored,canonical),EasyTTripSaveConflictError);
});

test('road reference refresh stays attached to an unchanged leg and never crosses owner scope',async()=>{
 const {base,canonical,conflict}=await capturedShape();const authored=structuredClone(base);authored.travellers=4;
 const merged=mergeTripMutationDocuments(base,authored,canonical);
 assert.equal(merged.travellers,4);assert.deepEqual(merged.legs.find(l=>l.id===conflict.leg.id)!.roadEstimate,conflict.ack.roadEstimate);
 const foreign={...canonical,ownerId:'owner-b'};assert.deepEqual(mergeTripMutationDocuments(base,authored,foreign),authored);
});

for(const transition of ['reference-added','reference-removed'] as const)test(`removed leg does not retain derived cache when ${transition}`,async()=>{
 const {base,authored,canonical,conflict}=await capturedShape();
 if(transition==='reference-added')delete base.legs.find(l=>l.id===conflict.leg.id)!.roadEstimate;
 else delete canonical.legs.find(l=>l.id===conflict.leg.id)!.roadEstimate;
 const before=structuredClone([base,authored,canonical]);
 const merged=mergeTripMutationDocuments(base,authored,canonical);
 assert.equal(merged.legs.some(l=>l.id===conflict.leg.id),false);
 assert.deepEqual(merged.stops.map(s=>s.name),['Paris','Valencia','Madrid','Andorra la Vella']);
 assert.deepEqual([base,authored,canonical],before);
});

test('unknown authored data in the old road reference cannot be discarded',async()=>{
 const {base,authored,canonical,conflict}=await capturedShape();
 (base.legs.find(l=>l.id===conflict.leg.id)!.roadEstimate as any).futureTravellerConstraint='Retain this requirement';
 assert.throws(()=>mergeTripMutationDocuments(base,authored,canonical),EasyTTripSaveConflictError);
});

for(const side of ['base','canonical'] as const)for(const checkedAt of ['1','2026-10-24','2026-02-30T00:00:00.000Z','2025-02-29T00:00:00.000Z'])test(`malformed timestamp on ${side} remains protected: ${checkedAt}`,async()=>{
 const {base,authored,canonical,conflict}=await capturedShape();
 (side==='base'?base:canonical).legs.find(leg=>leg.id===conflict.leg.id)!.roadEstimate!.checkedAt=checkedAt;
 const retained=structuredClone([base,authored,canonical]);
 assert.throws(()=>mergeTripMutationDocuments(base,authored,canonical),EasyTTripSaveConflictError);
 assert.deepEqual([base,authored,canonical],retained);
});

test('valid provider ISO leap-day timestamp remains a derived reference',async()=>{
 const {base,authored,canonical,conflict}=await capturedShape();
 canonical.legs.find(leg=>leg.id===conflict.leg.id)!.roadEstimate!.checkedAt='2024-02-29T00:00:00.000Z';
 const merged=mergeTripMutationDocuments(base,authored,canonical);
 assert.equal(merged.legs.some(leg=>leg.id===conflict.leg.id),false);
 assert.deepEqual(merged.stops.map(stop=>stop.name),['Paris','Valencia','Madrid','Andorra la Vella']);
});
