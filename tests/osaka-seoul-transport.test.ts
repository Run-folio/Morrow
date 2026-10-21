import assert from 'node:assert/strict';
import test from 'node:test';
import {adaptedDiscoveryPlaces} from '../lib/easyt/discovery-evidence-adapter.ts';
import {buildCanonicalTripLegs} from '../lib/easyt/trip-legs.ts';
import {reviewedAirJourney} from '../lib/easyt/reviewed-air-journeys.ts';
import {resolveCanonicalTransferJourney} from '../lib/easyt/multimodal-transfer-resolution.ts';
import {transferTimingLabel} from '../lib/easyt/transfer-timing-label.ts';
import {selectedTransferPlace} from './fixtures/accepted-transfer-place.ts';
import type {JourneyEndpointPlace,TripLeg} from '../lib/easyt/trip.ts';

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

test('no-flight, authored own-car, saved timetable, provider and booked facts remain authoritative',async()=>{
 const source=pair(selected('osaka'),selected('seoul'));
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

test('the new directional corridor does not infer reverse, Seoul to Tokyo or airport substitutions',async()=>{
 for(const [from,to] of [[selected('seoul'),selected('osaka')],[selected('seoul'),selected('tokyo')],[selected('kix'),selected('icn')]]){
  const source=pair(from,to);assert.equal(reviewedAirJourney(source.fromEndpoint!,source.toEndpoint!),undefined);
  const result=await resolveCanonicalTransferJourney(source);assert.equal(result.leg.mode,'unknown');assert.equal(result.leg.durationMinutes,null);
  assert.equal(result.diagnostic.candidates.some(item=>item.id==='flight:reviewed:osaka-seoul'),false);
 }
});

test('mismatched source point, provider pin, place id and country cannot borrow reviewed service evidence',async()=>{
 const source=pair(selected('osaka'),selected('seoul'));
 for(const endpoint of [
  {...source.toEndpoint!,coordinates:[126.97841,37.566] as [number,number]},
  {...source.toEndpoint!,providerId:source.toEndpoint!.providerId!.replace('@','@stale-')},
  {...source.toEndpoint!,canonicalPlaceId:'different-seoul'},
  {...source.toEndpoint!,country:'Japan'},
 ]){
  assert.equal(reviewedAirJourney(source.fromEndpoint!,endpoint),undefined);
  const result=await resolveCanonicalTransferJourney({...source,toEndpoint:endpoint});
  assert.equal(result.diagnostic.candidates.some(item=>item.id==='flight:reviewed:osaka-seoul'),false);
 }
});
