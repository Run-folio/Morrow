import assert from 'node:assert/strict';
import test from 'node:test';
import {japanTrip} from './fixtures/transport-choice.ts';
import {resolveTripTransferJourneys,compareCanonicalTransferJourney} from '../lib/easyt/multimodal-transfer-resolution.ts';
import {effectiveTripLeg,selectTripLegTransportChoice,supportedTransportChoicesForLeg} from '../lib/easyt/transport-mode-choice.ts';
import {syntheticRoad} from './fixtures/transport-comparison.ts';
import {cloneItineraryMutationDocument} from '../lib/easyt/itinerary-mutations.ts';
import {canonicalTripForOwner} from '../lib/easyt/trip-promotion.ts';

function unresolvedTrip(){const trip=japanTrip();const leg=trip.legs[0];trip.legs[0]={...leg,mode:'unknown',durationMinutes:null,doorToDoorMinutes:null,headlineMinutes:null,segments:undefined,provenance:'unknown',routeMetadata:{...leg.routeMetadata,source:'morrovia-planner'}};return trip;}

test('account normalization preserves the exact accepted candidate and recommendation',async()=>{
 const trip=unresolvedTrip(),leg=trip.legs[0];const road=supportedTransportChoicesForLeg(trip,leg).find(c=>c.mode==='road')!;
 const chosen=selectTripLegTransportChoice(trip,leg.id,road.identity);
 const reopened=await resolveTripTransferJourneys(JSON.parse(JSON.stringify(chosen)));
 assert.deepEqual(reopened.legs,JSON.parse(JSON.stringify(chosen.legs)),'normalization must not silently replace supporting candidate or recommendation');
 assert.equal(effectiveTripLeg(reopened,reopened.legs[0]).durationMinutes,390);
});

test('fresh comparison requires explicit current-basis adoption and survives guest promotion then reopen',async()=>{
 const api=await import('../lib/easyt/transport-comparison.ts').catch(()=>null);assert.ok(api,'guarded comparison adoption required');
 const trip=unresolvedTrip();delete trip.legs[0].routeMetadata.multimodalResolution;
 const before=structuredClone(trip),leg=trip.legs[0];
 const result=await compareCanonicalTransferJourney(leg,{provider:syntheticRoad()});
 const comparison=api.validateTransportComparison(trip,leg.id,result);assert.ok(comparison);
 assert.deepEqual(trip,before,'refresh only has no canonical writes');
 const road=comparison.candidates.find(c=>c.summaryMode==='road')!;assert.ok(road);
 const accepted=api.adoptTransportComparison(cloneItineraryMutationDocument(trip),comparison,road.id);
 assert.notEqual(accepted,trip);assert.equal(accepted.legs[0].mode,'unknown','recommendation remains unchanged');
 assert.equal(effectiveTripLeg(accepted,accepted.legs[0]).mode,'road');
 const promoted=canonicalTripForOwner('synthetic-owner',accepted);
 const reopened=await resolveTripTransferJourneys(JSON.parse(JSON.stringify(promoted)));
 assert.equal(effectiveTripLeg(reopened,reopened.legs[0]).mode,'road');
 assert.equal(effectiveTripLeg(reopened,reopened.legs[0]).durationMinutes,road.totalDurationMinutes);
 for(const stale of [{...trip,ownerId:'other-owner'},{...trip,startDate:'2027-04-02'},{...trip,stops:trip.stops.map((s,i)=>i===0?{...s,longitude:s.longitude!+1}:s)}]){
  assert.equal(api.adoptTransportComparison(stale,comparison,road.id),stale,'stale comparison is not adopted');
 }
});

test('comparison rejects mismatched geography, malformed timing and conflicting candidate identity without deleting saved evidence',async()=>{
 const api=await import('../lib/easyt/transport-comparison.ts').catch(()=>null);assert.ok(api);
 const trip=unresolvedTrip(),leg=trip.legs[0];const result=await compareCanonicalTransferJourney(leg,{provider:syntheticRoad()});
 const wrong=structuredClone(result);wrong.diagnostic.candidates[0].segments[0].fromEndpoint.coordinates=[0,0];
 assert.equal(api.validateTransportComparison(trip,leg.id,wrong),null);
 const bad=structuredClone(result);bad.diagnostic.candidates[0].totalDurationMinutes=NaN;
 assert.equal(api.validateTransportComparison(trip,leg.id,bad),null);
 const conflict=structuredClone(result),existing=(leg.routeMetadata.multimodalResolution as any).candidates[1];
 conflict.diagnostic.candidates=[{...existing,totalDurationMinutes:500}];
 const comparison=api.validateTransportComparison(trip,leg.id,conflict);assert.ok(comparison);
 assert.equal(api.adoptTransportComparison(trip,comparison,existing.id),trip);
});

test('a bound booked leg is not regenerated and refresh retains booking details',async()=>{
 const trip=unresolvedTrip();trip.brief.bookings=[{id:`transport-${trip.legs[0].id}`,type:'transport',title:'Synthetic booking',date:null,confirmation:'TEST',url:'https://example.invalid/booking',notes:['Retain me']}];
 const before=structuredClone(trip);
 const reopened=await resolveTripTransferJourneys(trip,{provider:syntheticRoad(()=>assert.fail('booked normalization must not call routing'))});
 assert.deepEqual(reopened,before);
 const result=await compareCanonicalTransferJourney(trip.legs[0],{provider:syntheticRoad()});
 assert.ok(result.diagnostic.candidates.length);assert.deepEqual(trip,before);
});

test('same date/owner cannot adopt after a selected choice or booking changed',async()=>{
 const api=await import('../lib/easyt/transport-comparison.ts');const trip=unresolvedTrip();delete trip.legs[0].routeMetadata.multimodalResolution;
 const result=await compareCanonicalTransferJourney(trip.legs[0],{provider:syntheticRoad()});const comparison=api.validateTransportComparison(trip,trip.legs[0].id,result)!;
 const candidate=comparison.candidates[0];
 const booked={...trip,brief:{...trip.brief,bookings:[{id:'new-booking',type:'transport' as const,title:'Booked',date:null,confirmation:null,url:null}]}};
 assert.equal(api.adoptTransportComparison(booked,comparison,candidate.id),booked);
 const changed={...trip,brief:{...trip.brief,decisionSelections:{transportByLeg:{[trip.legs[0].id]:'changed-choice'}}}};
 assert.equal(api.adoptTransportComparison(changed,comparison,candidate.id),changed);
});

test('returned summary mode cannot contradict its segments or bypass avoid-driving',async()=>{
 const api=await import('../lib/easyt/transport-comparison.ts');const trip=unresolvedTrip();trip.brief.intent!.hardConstraints.avoidDriving=true;
 const raw=await compareCanonicalTransferJourney(trip.legs[0],{});const rail=raw.diagnostic.candidates.find(c=>c.summaryMode==='train')!;assert.ok(rail);
 raw.diagnostic.candidates=[{...rail,summaryMode:'road',transferImpact:undefined}];
 assert.equal(api.validateTransportComparison(trip,trip.legs[0].id,raw),null);
});
