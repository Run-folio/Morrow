import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {captureJourneyBrief} from '../lib/easyt/journey-capture.ts';
import {extractStructuredTripBrief,mergeStructuredTripBrief} from '../lib/easyt/structured-trip-brief.ts';
import {projectHomepageInput,handoffRouteStops} from '../lib/easyt/home-trip-handoff.ts';
import {tripFromBuilder,defaultTripIntent,fixedTripCommitmentsFromStructuredBrief} from '../lib/easyt/trip.ts';
import {projectFixedCommitmentsToStops} from '../lib/easyt/fixed-commitment.ts';
import {allocateTripNights} from '../lib/easyt/night-allocation.ts';
import {canonicalTripForOwner,tripStopReferenceInvariantIssues} from '../lib/easyt/trip-promotion.ts';
import {requireReadableTripDocument,prepareTripDocumentForWrite} from '../lib/easyt/trip-document.ts';
import {emptyHomepageInput} from './fixtures/homepage-dual-entry.ts';
import type {JourneyCaptureResult} from '../lib/easyt/journey-capture.ts';
const recorded=JSON.parse(readFileSync(new URL('./fixtures/batch14-initial-intake-capture.json',import.meta.url),'utf8')).find((f:any)=>f.case==='A16');
const origin={name:'City of London',canonicalPlaceId:'open-world:nominatim:relation:51800',country:'United Kingdom',coordinates:[-0.0919983,51.5156177] as [number,number]};
function project(prompt:string,capture=captureJourneyBrief(prompt)){
 const result=projectHomepageInput({snapshot:{...emptyHomepageInput(),mode:'describe',prompt,origin:{state:'selected',value:origin},originInput:origin.name,tripType:{state:'selected',value:'one_way'}},capture,profile:null,handoffId:'initial-night-test'});assert(result.ok);const d=result.draft;
 const stops=handoffRouteStops(d.locationMentions!,d.journeyEnd).map((s,i)=>({...s,order:i})),bindings=d.routeIntent!.destinations;
 const requests=fixedTripCommitmentsFromStructuredBrief(d.structuredBrief!);
 const linked=(projectFixedCommitmentsToStops as any)(requests,stops,bindings);
 return {d,stops,bindings,requests,linked};
}
test('A16 actual captured source night requests bind to their separate initial stay occurrences',()=>{
 const capture=structuredClone(recorded.capture) as JourneyCaptureResult;
 capture.structuredBrief=extractStructuredTripBrief(recorded.prompt,capture.parserVersion,{version:1,parserVersion:capture.parserVersion as any,sequenceKind:"ordered",mentions:capture.mentions,issues:capture.structuredBrief.placeIssues??[]});
 const {stops,bindings,requests,linked}=project(recorded.prompt,capture);
 assert.equal(stops.length,4);assert.deepEqual(bindings.map(i=>i.requestedNights),[2,4,3,1]);
 for(const intent of bindings){const commitment=linked.find((c:any)=>c.sourceMentionId===intent.id);assert(commitment,"Captured request must retain its source occurrence");assert.equal(commitment.stopId,intent.stopIds[0]);assert.equal(commitment.fixedNights,intent.requestedNights);}
 assert.equal(new Set(requests.map(c=>c.id)).size,4);
 const allocation=allocateTripNights({totalNights:10,stops,fixedCommitments:linked});assert.notEqual(allocation.state,'conflict');const allocated=allocation.allocations;assert(allocated);assert.deepEqual(stops.map(s=>allocated[s.id]),[2,4,3,1]);
 const merged=mergeStructuredTripBrief(capture.structuredBrief,{fixedCommitments:linked});const reloaded=JSON.parse(JSON.stringify(merged));
 const saved=fixedTripCommitmentsFromStructuredBrief(reloaded);assert.deepEqual(saved.map(c=>[c.id,c.stopId,c.fixedNights]),linked.map((c:any)=>[c.id,c.stopId,c.fixedNights]));
});
for(const prompt of ['Bangkok 2n → Chiang Mai 4n → Krabi 3n → Bangkok 1n.','Bangkok 2n → Chiang Mai 4n → Bangkok 2n.'])test(`repeated request IDs and links survive reverse operational order: ${prompt}`,()=>{
 const p=project(prompt);const linked=(projectFixedCommitmentsToStops as any)(p.requests,[...p.stops].reverse(),[...p.bindings].reverse());
 assert.equal(new Set(linked.map((c:any)=>c.id)).size,p.stops.length);
 for(const intent of p.bindings){const commitment=linked.find((c:any)=>c.sourceMentionId===intent.id);assert(commitment);assert.equal(commitment.stopId,intent.stopIds[0]);}
});
for(const proof of ['missing','duplicate','foreign','split'] as const)test(`initial source-night binding rejects ${proof} occurrence proof`,()=>{
 const p=project(recorded.prompt);const target=p.bindings[0]!,source=(p.requests[0] as any).sourceMentionId??target.id;
 const request={...p.requests[0],sourceMentionId:source,stopId:undefined};let bindings=p.bindings;
 if(proof==='missing')bindings=bindings.filter(i=>i.id!==source);
 if(proof==='duplicate')bindings=[...bindings,structuredClone(target)];
 if(proof==='foreign')bindings=bindings.map(i=>i.id===source?{...i,stopIds:['different-trip-stay']}:i);
 if(proof==='split')bindings=bindings.map(i=>i.id===source?{...i,stopIds:[p.stops[0]!.id,p.stops[3]!.id]}:i);
 const result=(projectFixedCommitmentsToStops as any)([request],p.stops,bindings);assert.equal(result[0].stopId,undefined);
});
test('legacy unbound same-place requests stay ambiguous instead of selecting the first occurrence',()=>{
 const p=project(recorded.prompt);const result=projectFixedCommitmentsToStops([{label:'Unknown Bangkok stay',place:{name:'Bangkok',canonicalPlaceId:'bangkok'},fixedNights:1}],p.stops);
 assert.equal(result[0]!.stopId,undefined);
});
test('an unrelated authored booking retains its exact stop/date while initial source nights bind',()=>{
 const p=project(recorded.prompt),booking={id:'authored-booking',label:'Keep booking',stopId:p.stops[1]!.id,date:'2027-01-10',commitmentType:'booking' as const};
 const linked=(projectFixedCommitmentsToStops as any)([...p.requests,booking],p.stops,p.bindings);assert.deepEqual(linked.at(-1),booking);
});

test('initial repeated source requests survive account promotion, reference remap and strict reload',()=>{
 const p=project(recorded.prompt),intent=defaultTripIntent();intent.hardConstraints.fixedCommitments=p.linked;
 const allocations=allocateTripNights({totalNights:10,stops:p.stops,fixedCommitments:p.linked});assert.notEqual(allocations.state,'conflict');
 const trip=tripFromBuilder({id:'a16-initial-promotion',origin:origin.name,originCanonicalPlaceId:origin.canonicalPlaceId,originCountry:origin.country,originCoordinates:origin.coordinates,journeyEnd:p.d.journeyEnd,routeIntent:p.d.routeIntent,intent,structuredBrief:mergeStructuredTripBrief(p.d.structuredBrief!,{fixedCommitments:p.linked}),stops:p.stops,startDate:'2027-01-01',endDate:'2027-01-11',picks:{},mustDo:'',pace:'slow',hotels:'some',budget:'mid',nightAllocation:allocations,draft:[]});
 const saved=requireReadableTripDocument(JSON.parse(JSON.stringify(prepareTripDocumentForWrite(canonicalTripForOwner('fixture-owner',trip)))));
 assert.deepEqual(tripStopReferenceInvariantIssues(saved),[]);
 for(const source of saved.brief.intent.route.destinations){const c=saved.brief.intent.hardConstraints.fixedCommitments.find(c=>c.sourceMentionId===source.id);assert(c);assert.equal(c.stopId,source.stopIds[0]);assert.equal(c.fixedNights,source.requestedNights);assert.notEqual(c.stopId,p.bindings.find(i=>i.id===source.id)!.stopIds[0]);}
 assert.deepEqual(saved.stops.map(s=>s.nights),[2,4,3,1]);
});
