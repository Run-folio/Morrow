import assert from 'node:assert/strict';import test from 'node:test';
import { canonicalPlaceSuggestionsForQuery } from '../lib/easyt/place-intelligence.ts';
import { discoveryPlacesForMention } from '../lib/easyt/discovery-content.ts';
import { canonicalRouteFixture } from './fixtures/batch14-route-documents.ts';
import { destinationKnowledge } from '../lib/easyt/destination-knowledge.ts';
import { buildCanonicalTripLegs } from '../lib/easyt/trip-legs.ts';
import { resolveTripTransferJourneys, resolveCanonicalTransferJourney } from '../lib/easyt/multimodal-transfer-resolution.ts';
import { effectiveTripLeg, selectTripLegTransportChoice, supportedTransportChoicesForLeg } from '../lib/easyt/transport-mode-choice.ts';
import { transferImpactFromMetadata } from '../lib/easyt/transfer-impact.ts';
test('verified Chamonix alias is a coordinate-bearing French settlement; Germany/Alps reviewed discovery is nonempty',()=>{
 const suggestions=canonicalPlaceSuggestionsForQuery('Chamonix',['France']);assert.equal(suggestions[0]?.canonicalPlaceId,'chamonix-mont-blanc');assert.equal(suggestions[0]?.country,'France');assert.ok(suggestions[0]?.coordinates);
 const germany=discoveryPlacesForMention({canonicalPlaceId:'germany',canonicalName:'Germany',placeType:'country',parentCountries:['Germany']});assert.ok(germany.some(p=>p.id==='berlin'&&p.actionability==='overnight-base'));
 const alps=discoveryPlacesForMention({canonicalPlaceId:'alps',canonicalName:'Alps',placeType:'mountain_range',parentCountries:['France','Austria','Germany','Italy','Switzerland','Slovenia','Liechtenstein']});assert.ok(alps.some(p=>p.id==='chamonix-mont-blanc'&&p.actionability==='overnight-base'));
 assert.ok(germany.every(p=>p.country==='Germany'));assert.ok(!alps.some(p=>p.id==='berlin'));
});
test('exact UK London administrative access uses existing rail evidence without rewriting identities',()=>{
 const from={name:'City of London',country:'United Kingdom',canonicalPlaceId:'open-world:provider:opaque-london'};const to={name:'Edinburgh',country:'United Kingdom',canonicalPlaceId:'edinburgh'};const before=structuredClone(from);
 assert.ok(destinationKnowledge.findIntercityRailConnection(from,to,533));assert.deepEqual(from,before);
 assert.equal(destinationKnowledge.findIntercityRailConnection({...from,country:'United States'},to,533),undefined);
 assert.equal(destinationKnowledge.findIntercityRailConnection({...from,name:'London Borough of Croydon'},to,533),undefined);
});
for(const reverse of [false,true])test(`Gyeongbu KTX ${reverse?'Busan-Seoul':'Seoul-Busan'} has indicative station time, distinct from access allowance`,async()=>{
 const seoul={name:'Seoul',country:'South Korea',canonicalPlaceId:'seoul',coordinates:[126.978,37.5665] as [number,number]};const busan={name:'Busan',country:'South Korea',canonicalPlaceId:'busan',coordinates:[129.0756,35.1796] as [number,number]};const [from,to]=reverse?[busan,seoul]:[seoul,busan];
 const fact=destinationKnowledge.findTransfer(from,to);assert.ok(fact);assert.equal(fact.planningMinutes.value,180);assert.equal(fact.durationBasis.value,'headline');assert.equal(fact.realisticRangeMinutes.value,null);assert.match(fact.note.value??'',/station.*service/i);
 assert.equal(destinationKnowledge.findTransfer({...from,country:'United States'},to),undefined);
 const providerFrom={...from,canonicalPlaceId:'open-world:opaque:from',country:'Republic of Korea'};
 const providerTo={...to,canonicalPlaceId:'open-world:opaque:to',country:'Republic of Korea'};
 assert.equal(destinationKnowledge.findTransfer(providerFrom,providerTo)?.planningMinutes.value,180);
 assert.equal(destinationKnowledge.findTransfer({...providerFrom,country:'United States'},providerTo),undefined);
 assert.equal(destinationKnowledge.findTransfer({...providerFrom,country:undefined},{...providerTo,country:undefined}),undefined,'unscoped names with opaque identities must not establish a Korean corridor');
 const tripLeg=buildCanonicalTripLegs({tripId:'korea',origin:from,stops:[{id:'stay',order:0,name:to.name,country:to.country,canonicalPlaceId:to.canonicalPlaceId,longitude:to.coordinates[0],latitude:to.coordinates[1],nights:2,arrivalDate:null,departureDate:null}]})[0]!;
 assert.equal(tripLeg.mode,'train');assert.equal(tripLeg.headlineMinutes,180);assert.ok(tripLeg.doorToDoorMinutes!>180);
 const unresolved={...tripLeg,mode:'unknown' as const,durationMinutes:null,headlineMinutes:null,doorToDoorMinutes:null,provenance:'unknown' as const,routeMetadata:{}};
 const resolved=await resolveCanonicalTransferJourney(unresolved);assert.equal(resolved.leg.mode,'train');assert.equal(resolved.leg.headlineMinutes,180);assert.ok(resolved.leg.doorToDoorMinutes!>180);assert.equal(resolved.leg.scheduleNeedsChecking,true);
 assert.equal(transferImpactFromMetadata(resolved.leg.routeMetadata.transferImpact)?.headline.value?.planningMinutes,180);
 const selectable=canonicalRouteFixture();selectable.legs=[resolved.leg];
 const choice=supportedTransportChoicesForLeg(selectable,resolved.leg).find(candidate=>candidate.evidence==='exact_transfer');assert.ok(choice);
 const selected=selectTripLegTransportChoice(selectable,resolved.leg.id,choice.identity);
 const reloaded=JSON.parse(JSON.stringify(selected)) as typeof selected;
 const effective=effectiveTripLeg(reloaded,reloaded.legs[0]!);assert.equal(effective.headlineMinutes,180);assert.ok(effective.doorToDoorMinutes!>180);
 const pending={...tripLeg,mode:'unknown' as const,durationMinutes:null,headlineMinutes:null,doorToDoorMinutes:null,provider:'Pending trip details',routeMetadata:{source:'necessary-reconciliation',pending:true}};
 for(const phase of ['pending','failed'] as const){
  const held=canonicalRouteFixture();held.legs=[pending];
  held.brief.cascadeStatus={conflicts:[],affectedBookingIds:[],affectedPlanItemCount:0,routeReconciliation:{version:1,inputKey:'held-evidence',residual:[{kind:'leg',targetId:pending.id,basisKey:'held-basis',phase,...(phase==='failed'?{reason:'unavailable' as const}:{})}]}};
  const before=structuredClone(held);const deferred=await resolveTripTransferJourneys(held);
  assert.deepEqual(deferred.legs[0],pending);assert.deepEqual(deferred.brief.cascadeStatus,before.brief.cascadeStatus);
 }
});
