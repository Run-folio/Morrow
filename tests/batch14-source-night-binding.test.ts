import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {builderPlaceCommand,prepareBuilderHandlerEdit} from '../lib/easyt/trip-builder-handler-contract.ts';
import {builderDocumentFingerprint} from '../lib/easyt/trip-builder-document-commit.ts';
import {requireReadableTripDocument,prepareTripDocumentForWrite} from '../lib/easyt/trip-document.ts';
import {validateFinalPlan} from '../lib/easyt/plan-validator.ts';
import type {BuilderAcceptedEdit} from '../lib/easyt/trip-builder-edit.ts';
import type {CanonicalEasyTTrip,JourneyEndpointPlace} from '../lib/easyt/trip.ts';
import type {PlaceSelection,ResolvedPlaceMention} from '../lib/easyt/place-intelligence.ts';
import {canonicalTripForOwner} from '../lib/easyt/trip-promotion.ts';

type Choice={mention:ResolvedPlaceMention;intentId:string;stopId:string;place:JourneyEndpointPlace;selection:PlaceSelection;nights:number};
const fixtures=JSON.parse(readFileSync(new URL('./fixtures/batch14-source-night-resolution.json',import.meta.url),'utf8')) as Array<{case:string;trip:CanonicalEasyTTrip;selections:Choice[]}>;
function apply(trip:CanonicalEasyTTrip,edit:BuilderAcceptedEdit){
 const result=prepareBuilderHandlerEdit(trip,edit,builderDocumentFingerprint(trip));assert(result.ok,`${edit.kind}: ${!result.ok&&result.reason}`);return result.trip;
}
function select(trip:CanonicalEasyTTrip,choice:Choice){
 const before=trip.brief.structuredBrief!.placeMentions!.find(m=>m.mentionId===choice.intentId)!;
 trip=apply(trip,{kind:'planning-mention',action:'replace',mention:choice.mention,expectedMention:before});
 const command=builderPlaceCommand(trip,{intentId:choice.intentId,stopId:choice.stopId,place:choice.place,bindSourceNights:true});assert(command);
 trip=apply(trip,command);return apply(trip,{kind:'planning-selection',selection:choice.selection});
}
function unrepresented(trip:CanonicalEasyTTrip){
 const report=validateFinalPlan({plan:{version: 1, origin:{name:trip.brief.intent.route.origin!.name,coordinates:trip.brief.intent.route.origin!.coordinates},
  stops:trip.stops.map(stop=>({...stop,nights:stop.nights??0,coordinates:stop.longitude!==null&&stop.latitude!==null?[stop.longitude,stop.latitude] as [number,number]:undefined})),
  totalNights:Math.round((Date.parse(trip.endDate)-Date.parse(trip.startDate))/86400000),startDate:trip.startDate,endDate:trip.endDate,
  constraints:{fixedCommitments:trip.brief.intent.hardConstraints.fixedCommitments}},structuredBrief:trip.brief.structuredBrief});
 return report.issues.filter(i=>i.code==='fixed-date-conflict').flatMap(i=>i.evidence.unrepresentedCommitments??[]);
}
for(const fixture of fixtures)test(`${fixture.case} accepted source selection binds its requested nights before serialization/readiness`,()=>{
 let trip=requireReadableTripDocument(structuredClone(fixture.trip));const unrelated=structuredClone(trip.brief.intent.hardConstraints.fixedCommitments),authority=trip.brief.intent.route.orderAuthority;
 for(const choice of fixture.selections){trip=select(trip,choice);const intent=trip.brief.intent.route.destinations.find(i=>i.id===choice.intentId)!;
  assert.deepEqual(intent.stopIds,[choice.stopId]);assert.equal(intent.requestedNights,choice.nights);assert.equal(trip.stops.find(s=>s.id===choice.stopId)!.nights,choice.nights);
  assert(trip.brief.intent.hardConstraints.fixedCommitments.some(c=>c.stopId===choice.stopId&&c.fixedNights===choice.nights),'The accepted occurrence owns its generated night commitment');
  assert.equal(trip.brief.structuredBrief!.destinations.find(d=>d.placeMentionId===choice.intentId)!.id,choice.stopId);
  trip=requireReadableTripDocument(JSON.parse(JSON.stringify(prepareTripDocumentForWrite(trip))));
 }
 assert.deepEqual(trip.brief.intent.hardConstraints.fixedCommitments.filter(c=>unrelated.some(old=>old.id===c.id)),unrelated);
 assert.equal(trip.brief.intent.route.orderAuthority,authority);assert.deepEqual(unrepresented(trip),[]);
});

test('two same-place source occurrences bind separately after a manual reorder and reload',()=>{
 const fixture=fixtures.find(f=>f.case==='A06')!,first=fixture.selections[0]!;let trip=requireReadableTripDocument(structuredClone(fixture.trip));
 const original=trip.brief.intent.route.destinations.find(i=>i.id===first.intentId)!,secondId='source:second-mostar',secondStop='second-mostar-stay';
 trip.brief.intent.route.destinations.push({...structuredClone(original),id:secondId,requestedNights:3,stopIds:[]});
 const source=trip.brief.structuredBrief!.placeMentions!.find(m=>m.mentionId===first.intentId)!;
 trip.brief.structuredBrief!.placeMentions!.push({...structuredClone(source),mentionId:secondId});
 const destination=trip.brief.structuredBrief!.destinations.find(d=>d.placeMentionId===first.intentId)!;
 trip.brief.structuredBrief!.destinations.push({...structuredClone(destination),placeMentionId:secondId});
 const order=trip.stops.map(s=>s.id).reverse();trip=apply(trip,{kind:'order',stopIds:order,source:'drag'});
 trip=select(trip,first);const retained=structuredClone(trip.brief.intent.hardConstraints.fixedCommitments);
 trip=requireReadableTripDocument(JSON.parse(JSON.stringify(prepareTripDocumentForWrite(trip))));
 const second:Choice={...first,intentId:secondId,stopId:secondStop,nights:3,mention:{...first.mention,mentionId:secondId},selection:{...first.selection,mentionId:secondId,routeStopId:secondStop}};
 trip=select(trip,second);const fixed=trip.brief.intent.hardConstraints.fixedCommitments;
 assert(fixed.some(c=>c.stopId===first.stopId&&c.fixedNights===2));assert(fixed.some(c=>c.stopId===secondStop&&c.fixedNights===3));
 assert.deepEqual(fixed.filter(c=>retained.some(old=>old.id===c.id)),retained);assert.equal(new Set(fixed.map(c=>c.id)).size,fixed.length);
 assert.deepEqual(trip.stops.filter(s=>order.includes(s.id)).map(s=>s.id),order);assert.equal(trip.brief.intent.route.orderAuthority,'manual');
});

for(const broken of ['missing-source','ambiguous-destination','foreign-commitment-target','missing-commitment-target'] as const)test(`source-night acceptance rejects ${broken} proof`,()=>{
 const fixture=fixtures.find(f=>f.case==='A06')!,choice=fixture.selections[0]!;let trip=requireReadableTripDocument(structuredClone(fixture.trip));
 const source=trip.brief.structuredBrief!.placeMentions!.find(m=>m.mentionId===choice.intentId)!;
 trip=apply(trip,{kind:'planning-mention',action:'replace',mention:choice.mention,expectedMention:source});
 if(broken==='missing-source')trip.brief.structuredBrief!.placeMentions=trip.brief.structuredBrief!.placeMentions!.filter(m=>m.mentionId!==choice.intentId);
 if(broken==='ambiguous-destination')trip.brief.structuredBrief!.destinations.push(structuredClone(trip.brief.structuredBrief!.destinations.find(d=>d.placeMentionId===choice.intentId)!));
 if(broken==='foreign-commitment-target'||broken==='missing-commitment-target')trip.brief.intent.hardConstraints.fixedCommitments.push({id:`source-night:${choice.intentId}`,label:'Keep this commitment',fixedNights:choice.nights,...(broken==='foreign-commitment-target'?{stopId:trip.stops[0]!.id}:{})});
 const command=builderPlaceCommand(trip,{intentId:choice.intentId,stopId:choice.stopId,place:choice.place,bindSourceNights:true});assert(command);
 const before=JSON.stringify(trip),result=prepareBuilderHandlerEdit(trip,command,builderDocumentFingerprint(trip));assert.equal(result.ok,false);assert.equal(JSON.stringify(trip),before);
});

test('an unrelated orphan commitment remains blocked while source resolution preserves authored booking meaning',()=>{
 const fixture=fixtures.find(f=>f.case==='A06')!,choice=fixture.selections[0]!;let trip=requireReadableTripDocument(structuredClone(fixture.trip));
 const orphan={id:'authored:orphan',label:'Unknown visit',place:{name:'Mostar',canonicalPlaceId:choice.place.canonicalPlaceId},fixedNights:1};
 const booking={id:'authored:booking',label:'Keep this booked stay',commitmentType:'booking' as const,date:trip.startDate,stopId:trip.stops[0]!.id};
 trip.brief.intent.hardConstraints.fixedCommitments.push(orphan,booking);trip=select(trip,choice);
 assert.deepEqual(trip.brief.intent.hardConstraints.fixedCommitments.find(c=>c.id===orphan.id),orphan);
 assert.deepEqual(trip.brief.intent.hardConstraints.fixedCommitments.find(c=>c.id===booking.id),booking);assert(unrepresented(trip).includes('Mostar'));
});

test('account save identity remap and reload preserve the bound source occurrence',()=>{
 const fixture=fixtures.find(f=>f.case==='A06')!,choice=fixture.selections[0]!;
 const selected=select(requireReadableTripDocument(structuredClone(fixture.trip)),choice);
 const saved=requireReadableTripDocument(JSON.parse(JSON.stringify(prepareTripDocumentForWrite(canonicalTripForOwner('fixture-owner',selected)))));
 const intent=saved.brief.intent.route.destinations.find(i=>i.id===choice.intentId)!;
 assert.equal(intent.stopIds.length,1);assert.notEqual(intent.stopIds[0],choice.stopId);
 assert(saved.brief.intent.hardConstraints.fixedCommitments.some(c=>c.stopId===intent.stopIds[0]&&c.fixedNights===choice.nights));
 assert.equal(saved.stops.find(s=>s.id===intent.stopIds[0])!.nights,choice.nights);assert.deepEqual(unrepresented(saved),[]);
});
