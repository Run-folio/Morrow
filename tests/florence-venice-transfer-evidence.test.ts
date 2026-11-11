import assert from 'node:assert/strict';
import test from 'node:test';
import { destinationKnowledge } from '../lib/easyt/destination-knowledge.ts';
import { buildCanonicalTripLegs } from '../lib/easyt/trip-legs.ts';
import { resolveCanonicalTransferJourney } from '../lib/easyt/multimodal-transfer-resolution.ts';
import { selectedTransferPlace } from './fixtures/accepted-transfer-place.ts';

function pair(referenceIds=false) {
  // Same reference settlements and canonical identities as the Italy Trip Captain trip.
  const from=selectedTransferPlace('Florence','Italy','reference:geonames:3176959','endpoint',referenceIds?'reference:geonames:3176959':'florence');
  const to=selectedTransferPlace('Venice','Italy','reference:geonames:3164603','stop',referenceIds?'reference:geonames:3164603':'venice');
  return buildCanonicalTripLegs({tripId:'italy-rail-evidence',origin:{...from,coordinates:from.coordinates!},stops:[{id:'venice-stop',order:0,name:to.name,country:to.country!,canonicalPlaceId:to.canonicalPlaceId,providerId:to.providerId,geographicBinding:to.geographicBinding,longitude:to.coordinates![0],latitude:to.coordinates![1],arrivalDate:null,departureDate:null,nights:3}],constraints:{transportModes:['train']}})[0]!;
}

test('Florence-Venice records official directional rail evidence and indicative headline timing',()=>{
  const leg=pair(),fact=destinationKnowledge.findTransfer(leg.fromEndpoint!,leg.toEndpoint!);assert.ok(fact);
  assert.equal(fact.mode.value,'train');assert.equal(fact.mode.confidence,'static');
  assert.ok(fact.mode.sources.some(source=>source.kind==='official'&&source.url==='https://www.italotreno.com/en/destinations-timetable/florence-venice-tickets'));
  assert.equal(fact.planningMinutes.value,135);assert.equal(fact.planningMinutes.confidence,'estimated');
  assert.ok(fact.planningMinutes.sources.some(source=>source.kind==='official'&&source.url==='https://www.italotreno.com/en/destinations-timetable'));
  assert.equal(fact.durationBasis.value,'headline');assert.equal(fact.realisticRangeMinutes.status,'unknown');
  assert.match(fact.note.value??'',/indicative.*not.*schedule/i);
  assert.equal(leg.mode,'train');assert.equal(leg.headlineMinutes,135);assert.ok(leg.doorToDoorMinutes!>135);
  assert.equal(leg.scheduleNeedsChecking,true);assert.equal(leg.routeMetadata.roadFallbackEligible,false);
});

test('accepted provider/reference endpoint identities resolve without rewriting the saved places',async()=>{
  const leg=pair(true);
  // Re-assess the saved Trip Captain gap rather than short-circuiting a newly built rail leg.
  leg.mode='unknown';leg.durationMinutes=null;leg.headlineMinutes=null;leg.doorToDoorMinutes=null;
  delete leg.routeMetadata.transferImpact;
  const before=structuredClone(leg);
  const result=await resolveCanonicalTransferJourney(leg);
  assert.equal(result.leg.mode,'train');assert.equal(result.leg.headlineMinutes,135);assert.ok(result.leg.durationMinutes!>135);
  assert.equal(result.leg.provenance,'planning_estimate');assert.equal(result.leg.scheduleNeedsChecking,true);
  assert.equal(result.diagnostic.candidates.find(candidate=>candidate.id===result.diagnostic.selectedCandidateId)?.evidence,'exact_transfer');
  assert.deepEqual(result.leg.fromEndpoint,leg.fromEndpoint);assert.deepEqual(result.leg.toEndpoint,leg.toEndpoint);assert.deepEqual(leg,before);
});

test('country-scoped local aliases share only the reviewed directional pair',()=>{
  const from={name:'Firenze',country:'Italy',canonicalPlaceId:'opaque:florence'};
  const to={name:'Venezia',country:'Italy',canonicalPlaceId:'opaque:venice'};
  assert.equal(destinationKnowledge.findTransfer(from,to)?.mode.value,'train');
  for(const country of ['United States',undefined]) {
    assert.equal(destinationKnowledge.findTransfer({...from,country},to),undefined);
    assert.equal(destinationKnowledge.findTransfer(from,{...to,country}),undefined);
  }
  assert.equal(destinationKnowledge.findTransfer(to,from),undefined,'reverse evidence is not inferred');
  assert.equal(destinationKnowledge.findIntercityRailConnection(from,to,203),undefined,'pair records do not establish an Italian rail network');
  assert.equal(destinationKnowledge.findTransfer({name:'Bologna',country:'Italy',canonicalPlaceId:'bologna'},to),undefined);
});

test('rail exclusion and unverified endpoint protection remain authoritative',async()=>{
  const leg=pair();leg.routeMetadata.transportConstraints={excludedModes:['train','road','flight','ferry','mixed','walk']};
  const excluded=await resolveCanonicalTransferJourney(leg);assert.equal(excluded.leg.mode,'unknown');assert.equal(excluded.leg.durationMinutes,null);
  const invalid=pair();invalid.fromEndpoint={...invalid.fromEndpoint!,coordinates:[-80,32]};
  const unresolved=await resolveCanonicalTransferJourney(invalid);assert.equal(unresolved.leg.mode,'unknown');assert.equal(unresolved.leg.durationMinutes,null);
});
