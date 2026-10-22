import assert from 'node:assert/strict';
import test from 'node:test';
import {adaptedDiscoveryPlaces} from '../lib/easyt/discovery-evidence-adapter.ts';
import {buildCanonicalTripLegs} from '../lib/easyt/trip-legs.ts';
import {reviewedAirJourney} from '../lib/easyt/reviewed-air-journeys.ts';
import {resolveCanonicalTransferJourney} from '../lib/easyt/multimodal-transfer-resolution.ts';
import {transferTimingLabel} from '../lib/easyt/transfer-timing-label.ts';
import {selectedTransferPlace} from './fixtures/accepted-transfer-place.ts';
import type {JourneyEndpointPlace,TripLeg} from '../lib/easyt/trip.ts';
import {tripFromBuilder} from '../lib/easyt/trip.ts';
import {requireReadableTripDocument} from '../lib/easyt/trip-document.ts';
import {prepareBuilderHandlerEdit} from '../lib/easyt/trip-builder-handler-contract.ts';
import {pendingBuilderReconciliationUnits,reconcileBuilderDependencies} from '../lib/easyt/trip-builder-reconciliation.ts';
import {builderDocumentFingerprint} from '../lib/easyt/trip-builder-document-commit.ts';
import {saveTripRecoveryToStorage,loadTripRecoveryFromStorage} from '../lib/easyt/storage.ts';
import {selectTripLegTransportChoice,selectedTransportChoiceForLeg,supportedTransportChoicesForLeg} from '../lib/easyt/transport-mode-choice.ts';

const selections={osaka:['Osaka','Japan','reference:geonames:1853909'],seoul:['Seoul','South Korea','reference:geonames:1835848'],
 tokyo:['Tokyo','Japan','reference:geonames:1850147'],kix:['KIX','Japan','reference:ourairports:5536'],icn:['ICN','South Korea','reference:ourairports:5653']} as const;
function selected(key:keyof typeof selections,legacy=false):JourneyEndpointPlace {
 const [name,country,id]=selections[key];return selectedTransferPlace(name,country,id,'endpoint',legacy?key:id);
}
function maintained(key:'osaka'|'seoul'):JourneyEndpointPlace {
 const row=adaptedDiscoveryPlaces().find(place=>place.id===key)!;assert(row);
 return {name:row.name,country:row.country,canonicalPlaceId:row.id,coordinates:[...row.coordinates]};
}
function pair(from:JourneyEndpointPlace,to:JourneyEndpointPlace):TripLeg {
 return buildCanonicalTripLegs({tripId:'osaka-seoul-control',origin:{...from,coordinates:from.coordinates??null},stops:[],
  journeyEnd:{mode:'explicit',place:to}})[0]!;
}

for(const [label,from,to] of [
 ['maintained',maintained('osaka'),maintained('seoul')],
 ['pinned reference',selected('osaka'),selected('seoul')],
 ['legacy identity with pinned binding',selected('osaka',true),selected('seoul',true)],
] as const)test(`${label} Osaka to Seoul uses reviewed directional evidence and a broad planning total`,async()=>{
 const source=pair(from,to),before=structuredClone(source);assert.equal(source.mode,'flight');assert.equal(source.straightLineDistanceKm,829);
 const result=await resolveCanonicalTransferJourney(source);
 assert.equal(result.outcome,'resolved');assert.equal(result.leg.mode,'flight');assert.equal(result.leg.doorToDoorMinutes,300);
 assert.equal(transferTimingLabel(result.leg),'~5h');assert.equal(result.leg.headlineMinutes,null);
 assert.equal(result.leg.provenance,'planning_estimate');assert.equal(result.leg.scheduleNeedsChecking,true);
 assert.equal(result.diagnostic.selectedCandidateId,'flight:reviewed:osaka-seoul');assert.equal(result.assessment.evidence,'conditional');
 const candidate=result.diagnostic.candidates.find(item=>item.id==='flight:reviewed:osaka-seoul')!;
 assert.equal(candidate.connectionCount,null);assert.equal(candidate.transferImpact?.headline.status,'unknown');
 assert.equal(candidate.transferImpact?.doorToDoor.value?.rangeMinutes,null);
 assert.equal(candidate.transferImpact?.doorToDoor.confidence,'estimated');
 assert.match(result.leg.provider!,/planning allowance.*airport access and processing/);
 assert.match(result.leg.provider!,/koreanair.com\/flights\/en\/flights-from-osaka-to-seoul/);
 const reviewed=reviewedAirJourney(source.fromEndpoint!,source.toEndpoint!)!;assert.equal(reviewed.transfer.mode.status,'known');
 assert.equal(reviewed.transfer.mode.sources[0]?.reviewedAt,'2026-10-21');
 assert.match(reviewed.transfer.mode.sources[0]?.supports??'',/not .*availability|no .*availability/i);
 assert.deepEqual(result.leg.fromEndpoint,source.fromEndpoint);assert.deepEqual(result.leg.toEndpoint,source.toEndpoint);
 assert.equal(result.leg.id,source.id);assert.deepEqual(source,before);
 assert.deepEqual((await resolveCanonicalTransferJourney(result.leg)).leg,result.leg);
});

test('normal worker can resolve an unknown Osaka to Seoul leg from service evidence without changing input',async()=>{
 const source:TripLeg={...pair(maintained('osaka'),maintained('seoul')),mode:'unknown',durationMinutes:null,doorToDoorMinutes:null,
  headlineMinutes:null,provenance:'unknown',routeMetadata:{source:'necessary-reconciliation',pending:true}};
 const before=structuredClone(source),result=await resolveCanonicalTransferJourney(source);
 assert.equal(result.leg.mode,'flight');assert.equal(result.leg.doorToDoorMinutes,300);
 assert.equal(result.diagnostic.selectedCandidateId,'flight:reviewed:osaka-seoul');assert.deepEqual(source,before);
});

for(const identity of ['maintained','pinned reference'] as const)for(const [from,to] of [['osaka','seoul'],['seoul','osaka']] as const)test(`${identity} ${from} to ${to} no-flight, authored own-car, saved timetable, provider and booked facts remain authoritative`,async()=>{
 const source=pair(identity==='maintained'?maintained(from):selected(from),identity==='maintained'?maintained(to):selected(to));
 const excluded={...source,routeMetadata:{...source.routeMetadata,transportConstraints:{excludedModes:['flight']}}};
 const blocked=await resolveCanonicalTransferJourney(excluded);assert.equal(blocked.leg.mode,'unknown');
 assert.equal(blocked.diagnostic.candidates.some(item=>item.summaryMode==='flight'),false);
 const preserved:TripLeg[]=[
  {...source,mode:'road',durationMinutes:720,doorToDoorMinutes:720,provider:'Self drive estimate.',routeMetadata:{source:'traveller-authored'}},
  {...source,mode:'train',durationMinutes:777,doorToDoorMinutes:777,provenance:'canonical_schedule'},
  {...source,durationMinutes:333,doorToDoorMinutes:333,provenance:'provider'},
  ...[{source:'imported-booking'},{confirmed:true},{userConfirmed:true}].map(routeMetadata=>({...source,durationMinutes:444,doorToDoorMinutes:444,routeMetadata})),
 ];
 for(const leg of preserved){const before=structuredClone(leg),result=await resolveCanonicalTransferJourney(leg);assert.equal(result.outcome,'preserved');assert.deepEqual(result.leg,before);assert.deepEqual(leg,before);}
});

test('reviewed city corridors do not infer Seoul to Tokyo or airport substitutions',async()=>{
 for(const [from,to] of [[selected('seoul'),selected('tokyo')],[selected('kix'),selected('icn')]]){
  const source=pair(from,to);assert.equal(reviewedAirJourney(source.fromEndpoint!,source.toEndpoint!),undefined);
  const result=await resolveCanonicalTransferJourney(source);assert.equal(result.leg.mode,'unknown');assert.equal(result.leg.durationMinutes,null);
  assert.equal(result.diagnostic.candidates.some(item=>item.id==='flight:reviewed:osaka-seoul'||item.id==='flight:reviewed:seoul-osaka'),false);
 }
});

for(const [label,from,to] of [
 ['maintained',maintained('seoul'),maintained('osaka')],
 ['pinned reference',selected('seoul'),selected('osaka')],
 ['legacy identity with pinned binding',selected('seoul',true),selected('osaka',true)],
] as const)test(`${label} Seoul to Osaka uses separately reviewed reverse evidence`,async()=>{
 const source=pair(from,to),before=structuredClone(source),result=await resolveCanonicalTransferJourney(source);
 assert.equal(result.leg.mode,'flight');assert.equal(result.leg.doorToDoorMinutes,300);
 assert.equal(result.diagnostic.selectedCandidateId,'flight:reviewed:seoul-osaka');
 assert.equal(result.leg.provenance,'planning_estimate');assert.equal(result.leg.scheduleNeedsChecking,true);
 assert.equal(result.leg.headlineMinutes,null);assert.equal(result.assessment.evidence,'conditional');
 const candidate=result.diagnostic.candidates.find(c=>c.id==='flight:reviewed:seoul-osaka')!;
 assert.equal(candidate.connectionCount,null);assert.equal(candidate.transferImpact?.doorToDoor.value?.rangeMinutes,null);
 const reviewed=reviewedAirJourney(source.fromEndpoint!,source.toEndpoint!)!;
 assert.equal(reviewed.transfer.mode.sources[0]?.url,'https://www.koreanair.com/flights/en/flights-from-seoul-to-osaka');
 assert.match(reviewed.transfer.mode.sources[0]?.supports??'',/not .*availability/);
 assert.deepEqual(source,before);assert.deepEqual((await resolveCanonicalTransferJourney(result.leg)).leg,result.leg);
});

test('catalog and GeoNames city representations work independently in both directions',async()=>{
 for(const osaka of [maintained('osaka'),selected('osaka')])for(const seoul of [maintained('seoul'),selected('seoul')]){
  for(const [from,to,id] of [[osaka,seoul,'osaka-seoul'],[seoul,osaka,'seoul-osaka']] as const){
   const source=pair(from,to),before=structuredClone(source),result=await resolveCanonicalTransferJourney(source);
   assert.equal(result.leg.mode,'flight');assert.equal(result.leg.doorToDoorMinutes,300);
   assert.equal(result.diagnostic.selectedCandidateId,`flight:reviewed:${id}`);assert.deepEqual(source,before);
  }
 }
});

for(const identity of ['maintained','pinned reference'] as const)test(`${identity} 35-night Builder reorder retains choices without applying a forward choice to the reverse leg`,async()=>{
 const origin=selectedTransferPlace('LHR','United Kingdom','reference:ourairports:2434','endpoint');
 const rows=[['Hong Kong','Hong Kong','1819729',6],['Coron','Philippines','1716834',6],['Osaka','Japan','1853909',5],
  ['Seoul','South Korea','1835848',6],['Cartagena','Colombia','3687238',6],['Madrid','Spain','3117735',6]] as const;
 const stops=rows.map(([name,country,id],i)=>({id:`retained-stop-${i}`,...(identity==='maintained'&&(name==='Osaka'||name==='Seoul')?maintained(name==='Osaka'?'osaka':'seoul'):selectedTransferPlace(name,country,`reference:geonames:${id}`,'stop')),country}));
 let trip=requireReadableTripDocument(tripFromBuilder({id:'synthetic-direction-reorder',origin:origin.name,originCountry:origin.country,
  originCanonicalPlaceId:origin.canonicalPlaceId,originProviderId:origin.providerId,originCoordinates:origin.coordinates,
  journeyEnd:{mode:'same_as_start'},stops,startDate:'2026-10-22',endDate:'2026-11-26',picks:{},mustDo:'',pace:'slow',hotels:'few',budget:'mid',draft:[],
  nightAllocations:Object.fromEntries(stops.map((s,i)=>[s.id,rows[i][3]])),createdAt:'2026-10-21T00:00:00.000Z'}));
 trip.brief.intent.route.origin=origin;trip=requireReadableTripDocument(trip);
 assert.equal(trip.legs.length,7);assert.equal(trip.stops.reduce((sum,s)=>sum+(s.nights??0),0),35);
 const forward=trip.legs.find(l=>l.fromEndpoint?.name==='Osaka'&&l.toEndpoint?.name==='Seoul')!;assert.ok(forward);
 const resolved=await resolveCanonicalTransferJourney(forward);assert.equal(resolved.leg.doorToDoorMinutes,300);
 trip={...trip,legs:trip.legs.map(l=>l.id===forward.id?resolved.leg:l)};
 const choice=supportedTransportChoicesForLeg(trip,resolved.leg).find(c=>c.candidateId==='flight:reviewed:osaka-seoul')!;assert.ok(choice);
 trip=requireReadableTripDocument(selectTripLegTransportChoice(trip,forward.id,choice.identity));
 const values=new Map<string,string>();const storage={get length(){return values.size;},key:(i:number)=>[...values.keys()][i]??null,
  getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>{values.set(k,v);},removeItem:(k:string)=>{values.delete(k);}};
 assert.equal(saveTripRecoveryToStorage(storage,trip,{writeId:'synthetic-forward-save'}).stored,true);
 const forwardCold=loadTripRecoveryFromStorage(storage,trip.id,null)!;assert.ok(forwardCold);
 assert.equal(forwardCold.trip.legs.find(l=>l.id===forward.id)!.doorToDoorMinutes,300);
 assert.deepEqual(forwardCold.trip.stops,JSON.parse(JSON.stringify(trip.stops)));
 assert.deepEqual(forwardCold.trip.brief.decisionSelections?.transportByLeg,trip.brief.decisionSelections?.transportByLeg);
 trip=requireReadableTripDocument(forwardCold.trip);
 const original=structuredClone(trip),ids=trip.stops.map(s=>s.id);[ids[2],ids[3]]=[ids[3],ids[2]];
 const edited=prepareBuilderHandlerEdit(trip,{kind:'order',stopIds:ids,source:'move-menu'},builderDocumentFingerprint(trip));assert.equal(edited.ok,true);
 if(!edited.ok)return;
 assert.deepEqual(trip,original);assert.deepEqual(edited.trip.stops.map(s=>s.id),ids);assert.equal(edited.trip.legs.length,7);
 for(const stop of edited.trip.stops)assert.equal(stop.nights,original.stops.find(s=>s.id===stop.id)!.nights);
 const legUnits=pendingBuilderReconciliationUnits(edited.trip).filter(unit=>unit.kind==='leg');assert.ok(legUnits.length);
 const reconciled=reconcileBuilderDependencies(edited.trip,legUnits).trip;
 assert.equal(pendingBuilderReconciliationUnits(reconciled).some(unit=>unit.kind==='leg'),false);
 const reverse=reconciled.legs.find(l=>l.fromEndpoint?.name==='Seoul'&&l.toEndpoint?.name==='Osaka')!;assert.ok(reverse);
 assert.equal(selectedTransportChoiceForLeg(edited.trip,reverse),null,'forward selection cannot attach to reverse endpoint IDs');
 const reverseResult=await resolveCanonicalTransferJourney(reverse);
 assert.equal(reverseResult.diagnostic.selectedCandidateId,'flight:reviewed:seoul-osaka');assert.equal(reverseResult.leg.doorToDoorMinutes,300);
 const persisted={...reconciled,legs:reconciled.legs.map(l=>l.id===reverse.id?reverseResult.leg:l)};
 const protectedBefore=[...values];
 assert.equal(saveTripRecoveryToStorage(storage,persisted,{writeId:'unproven-reverse-save'}).failureReason,'protected-recovery');
 assert.deepEqual([...values],protectedBefore);
 assert.equal(saveTripRecoveryToStorage(storage,persisted,{writeId:'synthetic-reverse-save',replace:forwardCold}).stored,true);
 const cold=loadTripRecoveryFromStorage(storage,persisted.id,null)!;assert.ok(cold);
 assert.deepEqual(cold.trip.stops.map(s=>s.id),ids);assert.deepEqual(cold.trip.stops,JSON.parse(JSON.stringify(persisted.stops)));
 assert.equal(cold.trip.stops.reduce((sum,s)=>sum+(s.nights??0),0),35);
 assert.equal(cold.trip.legs.find(l=>l.id===reverse.id)!.doorToDoorMinutes,300);
 assert.deepEqual(cold.trip.brief.decisionSelections?.transportByLeg,original.brief.decisionSelections?.transportByLeg);
});

for(const [from,to] of [['osaka','seoul'],['seoul','osaka']] as const)test(`${from} to ${to} mismatched source point, provider pin, place id and country cannot borrow reviewed service evidence`,async()=>{
 const source=pair(selected(from),selected(to));
 for(const endpoint of [
  {...source.toEndpoint!,coordinates:[source.toEndpoint!.coordinates![0]+0.00001,source.toEndpoint!.coordinates![1]] as [number,number]},
  {...source.toEndpoint!,providerId:source.toEndpoint!.providerId!.replace('@','@stale-')},
  {...source.toEndpoint!,canonicalPlaceId:'different-seoul'},
  {...source.toEndpoint!,country:'Peru'},
 ]){
  assert.equal(reviewedAirJourney(source.fromEndpoint!,endpoint),undefined);
  const result=await resolveCanonicalTransferJourney({...source,toEndpoint:endpoint});
  assert.equal(result.diagnostic.candidates.some(item=>item.id===`flight:reviewed:${from}-${to}`),false);
 }
});
