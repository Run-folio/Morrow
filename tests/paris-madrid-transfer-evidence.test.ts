import assert from 'node:assert/strict';
import test from 'node:test';
import {destinationKnowledge} from '../lib/easyt/destination-knowledge.ts';
import {buildCanonicalTripLegs} from '../lib/easyt/trip-legs.ts';
import {resolveCanonicalTransferJourney,MULTIMODAL_SELECTION_RULES} from '../lib/easyt/multimodal-transfer-resolution.ts';
import {selectedTransferPlace} from './fixtures/accepted-transfer-place.ts';
import {RoadRoutingError,type RoadRoutingProvider} from '../lib/easyt/road-routing.ts';

function pair(reverse=false){
 const paris=selectedTransferPlace('Paris','France','reference:geonames:2988507','endpoint');
 const madrid=selectedTransferPlace('Madrid','Spain','reference:geonames:3117735','stop','madrid');
 const [from,to]=reverse?[madrid,paris]:[paris,madrid];
 return buildCanonicalTripLegs({tripId:'reviewed-pair',origin:{...from,coordinates:from.coordinates!},stops:[{id:'destination',order:0,name:to.name,country:to.country!,canonicalPlaceId:to.canonicalPlaceId,providerId:to.providerId,geographicBinding:to.geographicBinding,longitude:to.coordinates![0],latitude:to.coordinates![1],arrivalDate:null,departureDate:null,nights:2}]})[0]!;
}

test('Paris-Madrid records official directional mode evidence separately from estimated planning time',()=>{
 const leg=pair(),fact=destinationKnowledge.findTransfer(leg.fromEndpoint!,leg.toEndpoint!);assert.ok(fact);
 assert.equal(fact.mode.value,'flight');assert.equal(fact.mode.confidence,'static');
 assert.ok(fact.mode.sources.some(s=>s.kind==='official'&&s.url==='https://wwws.airfrance.fr/fr-fr/vols-de-paris-a-madrid'&&s.reviewedAt==='2026-10-16'));
 assert.equal(fact.planningMinutes.value,270);assert.equal(fact.planningMinutes.confidence,'estimated');
 assert.ok(fact.planningMinutes.sources.every(s=>s.kind==='legacy-planner'));
 assert.equal(fact.durationBasis.value,'door-to-door');assert.equal(fact.realisticRangeMinutes.status,'unknown');
 assert.match(fact.note.value??'',/planning allowance.*not.*schedule/i);
});

test('reviewed Paris-Madrid returns a conditional flight when optional road configuration is absent',async()=>{
 const result=await resolveCanonicalTransferJourney(pair());assert.equal(result.leg.mode,'flight');assert.equal(result.leg.durationMinutes,270);
 assert.equal(result.leg.provenance,'planning_estimate');assert.equal(result.leg.scheduleNeedsChecking,true);
 assert.equal(result.assessment.retrieval,'completed');assert.equal(result.assessment.evidence,'conditional');
 assert.equal(result.diagnostic.candidates.find(c=>c.id===result.diagnostic.selectedCandidateId)?.evidence,'exact_transfer');
});

test('an ineligible optional cross-border road reference cannot block the exact flight',async()=>{
 let calls=0;const provider:RoadRoutingProvider={provider:'openrouteservice',async route(){calls++;throw new RoadRoutingError('configuration');}};
 const result=await resolveCanonicalTransferJourney(pair(),{provider});assert.equal(calls,0);assert.equal(result.leg.mode,'flight');assert.equal(result.assessment.retrieval,'completed');
});

test('unsupported reverse pair keeps the unchanged short international flight safeguard',async()=>{
 const leg=pair(true);assert.equal(destinationKnowledge.findTransfer(leg.fromEndpoint!,leg.toEndpoint!),undefined);
 const result=await resolveCanonicalTransferJourney(leg);assert.equal(result.leg.mode,'unknown');assert.equal(result.leg.durationMinutes,null);
 assert.equal(result.assessment.reason,'configuration_unavailable');assert.equal(MULTIMODAL_SELECTION_RULES.minimumUnverifiedInternationalFlightKm,1200);
});

test('same-name or unscoped identities cannot borrow the France-Spain pair record',()=>{
 const leg=pair();for(const country of ['United States',undefined])assert.equal(destinationKnowledge.findTransfer({...leg.fromEndpoint!,country},leg.toEndpoint!),undefined);
 assert.equal(destinationKnowledge.findTransfer(leg.fromEndpoint!,{...leg.toEndpoint!,country:'Colombia'}),undefined);
});

test('hard flight exclusion remains authoritative for the reviewed pair',async()=>{
 const leg=pair();leg.routeMetadata.transportConstraints={excludedModes:['flight']};
 const result=await resolveCanonicalTransferJourney(leg);assert.equal(result.leg.mode,'unknown');assert.equal(result.leg.durationMinutes,null);
});

test('an explicit driving preference retains its road attempt and provider failure',async()=>{
 let calls=0;const provider:RoadRoutingProvider={provider:'openrouteservice',async route(){calls++;throw new RoadRoutingError('configuration');}};
 const leg=pair();leg.routeMetadata.transportConstraints={preferredModes:['road']};
 const result=await resolveCanonicalTransferJourney(leg,{provider});assert.equal(calls,1);assert.equal(result.assessment.retrieval,'unavailable');assert.equal(result.assessment.reason,'configuration_unavailable');
});
