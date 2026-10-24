import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {assessCanonicalTransferJourneys,resolveTripTransferJourneys} from '../../lib/easyt/multimodal-transfer-resolution.ts';
import {haversineKm} from '../../lib/easyt/planner.ts';
import {requireReadableTripDocument,prepareTripDocumentForWrite} from '../../lib/easyt/trip-document.ts';
import {normalizeLegacyGeneratedDayContext} from '../../lib/easyt/itinerary-generated-context.ts';
import {canonicalTripForOwner} from '../../lib/easyt/trip-promotion.ts';
import {nextTripUpdatedAt} from '../../lib/easyt/trip-continuity.ts';
import {requestCanonicalTransferResolution} from '../../lib/easyt/transfer-resolution-client.ts';
import {saveReopenTripFixture} from '../fixtures/save-reopen-trip.ts';
import {prepareBuilderHandlerEdit} from '../../lib/easyt/trip-builder-handler-contract.ts';
import {builderDocumentFingerprint} from '../../lib/easyt/trip-builder-document-commit.ts';
import type {EasyTTrip,TripLeg} from '../../lib/easyt/trip.ts';
import type {RoadRoutingProvider} from '../../lib/easyt/road-routing.ts';

// Explicit offline provider: no configured provider, credentials or external requests.
export const offlineRoadProvider:RoadRoutingProvider={provider:'openrouteservice',async route(input){
 const distance=haversineKm(input.origin.coordinates,input.destination.coordinates);assert.notEqual(distance,null);
 const distanceKm=Math.max(1,distance!*1.2);
 return {mode:'road',distanceKm,durationMinutes:Math.ceil(distanceKm/65*60),confidence:'medium',provenance:'routed',
 provider:'openrouteservice',providerCheckedAt:'2026-10-23T00:00:00.000Z',profile:'driving-car',
 routeGeometry:[input.origin.coordinates,input.destination.coordinates],attribution:'Synthetic offline test route'};
}};
// Execute the actual API input guard, replacing only its framework response and provider dependency.
const apiSource=readFileSync(new URL('../../app/api/journey-transfer-resolution/route.ts',import.meta.url),'utf8');
const compiled=ts.transpileModule(apiSource,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const mod={exports:{} as any};
new Function('require','module','exports',compiled)((id:string)=>{
 if(id==='next/server')return {NextResponse:{json:Response.json}};
 if(id==='@/lib/easyt/multimodal-transfer-resolution.server')return {assessCanonicalTransferJourneys:(legs:TripLeg[])=>assessCanonicalTransferJourneys(legs,{provider:offlineRoadProvider})};
 throw Error('Unexpected API import '+id);
},mod,mod.exports);
export async function transferResponse(legs:unknown[]){
 const response=await mod.exports.POST(new Request('http://fixture.invalid/api/journey-transfer-resolution',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({legs})}));
 return {status:response.status,body:await response.json()};
}
// Same document normalization ordering as repository.ts, with synthetic SQL CAS handled by caller.
export async function accountNormalization(trip:EasyTTrip,method:'GET'|'POST'|'PUT'){
 if(method==='GET')return normalizeLegacyGeneratedDayContext(await resolveTripTransferJourneys(requireReadableTripDocument(trip),{provider:offlineRoadProvider}));
 const prepared=prepareTripDocumentForWrite(trip);
 const routed=await resolveTripTransferJourneys(method==='PUT'?normalizeLegacyGeneratedDayContext(prepared):prepared,{provider:offlineRoadProvider});
 return requireReadableTripDocument(method==='POST'?canonicalTripForOwner('owner-a',routed):canonicalTripForOwner('owner-a',routed,nextTripUpdatedAt(trip.updatedAt)));
}
export async function proveSuccessfulContract(){
 const initial=requireReadableTripDocument(saveReopenTripFixture());
 const prepared=prepareBuilderHandlerEdit(initial,{kind:'order',source:'route-check',stopIds:[...initial.brief.intent.route.orderedStopIds].reverse()},builderDocumentFingerprint(initial));
 assert.ok(prepared.ok);
 const leg=prepared.trip.legs.find(l=>l.routeMetadata.source==='necessary-reconciliation'&&l.fromEndpoint?.country===l.toEndpoint?.country)!;assert.ok(leg);
 const previous=globalThis.fetch;let requests=0;
 globalThis.fetch=async(input,init)=>{assert.equal(input,'/api/journey-transfer-resolution');requests++;const result=await transferResponse(JSON.parse(String(init?.body)).legs);return Response.json(result.body,{status:result.status});};
 try{
  const result=await requestCanonicalTransferResolution([leg],new AbortController().signal);
  assert.ok(result.ok);assert.deepEqual(result.failedLegIds,[]);assert.equal(result.assessments[0].state.retrieval,'completed');
  assert.notEqual(result.legs[0].mode,'unknown');assert.notDeepEqual(result.legs[0],leg);assert.equal(requests,1);
  const invalid=await transferResponse([{id:'invalid'}]);assert.equal(invalid.status,400);
  return {actualApiGuard:true,actualClient:true,actualResolver:true,offlineProvider:true,requests,completed:1,changedLegs:1,invalidRejected:400};
 }finally{globalThis.fetch=previous;}
}
