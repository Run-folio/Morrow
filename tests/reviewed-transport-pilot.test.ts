import assert from 'node:assert/strict';
import test from 'node:test';
import {capturedPhilippinesTrip} from './fixtures/philippines-captured.ts';
import {assessCanonicalTransferJourneys} from '../lib/easyt/multimodal-transfer-resolution.ts';
test('captured import preserves six occurrences; reviewed Cebu to Manila yields an estimated total, not an invented flight duration',async()=>{
 const trip=capturedPhilippinesTrip(),before=JSON.stringify(trip);let calls=0;
 const result=await assessCanonicalTransferJourneys(trip.legs,{provider:{provider:'openrouteservice',async route(){calls++;throw Error('External routing not permitted in evidence pilot');}}});
 assert.equal(trip.stops.length,6);assert.equal(result.legs.length,5);
 const leg=result.legs.at(-1)!;assert.equal(leg.mode,'flight');assert.equal(leg.doorToDoorMinutes,240);assert.equal(leg.headlineMinutes,null);assert.equal(leg.scheduleNeedsChecking,true);assert.equal(result.assessments.at(-1)!.state.evidence,'conditional');
 assert.equal((leg.routeMetadata.transferImpact as any).doorToDoor.value.rangeMinutes,null);
 assert.equal(calls,0);assert.equal(JSON.stringify(trip),before);
 assert.deepEqual(result.legs.map(l=>[l.fromEndpoint,l.toEndpoint]),trip.legs.map(l=>[l.fromEndpoint,l.toEndpoint]));
 assert.equal(result.legs.slice(0,4).filter(l=>l.mode==='unknown').length,4,'do not invent the other four journeys');
});
import {reviewedPilotRecords,reviewedRouteGuidance} from '../lib/easyt/reviewed-transport-pilot.ts';
import {compareCanonicalTransferJourney} from '../lib/easyt/multimodal-transfer-resolution.ts';
import {validateTransportComparison} from '../lib/easyt/transport-comparison.ts';
import {adoptTransportComparison,transportGuidanceForLeg} from '../lib/easyt/transport-comparison.ts';
import {extractStructuredTripBrief} from '../lib/easyt/structured-trip-brief.ts';
import {effectiveTripLeg,supportedTransportChoicesForLeg,selectTripLegTransportChoice} from '../lib/easyt/transport-mode-choice.ts';
import {selectedTransferPlace} from './fixtures/accepted-transfer-place.ts';
test('four incomplete captured corridors offer sourced guidance without selectable invented timings',async()=>{
 const trip=capturedPhilippinesTrip();
 for(const leg of trip.legs.slice(0,4)){
  const r=await compareCanonicalTransferJourney(leg);assert.equal(r.diagnostic.candidates.length,0);
  const c=validateTransportComparison(trip,leg.id,r);assert.ok(c);assert.equal((c as any).routeGuidance.length,1);assert.match((c as any).routeGuidance[0].url,/^https:/);
 }
});
test('changed or foreign geography, unsupported reverse and expired review do not acquire a corridor',()=>{
 const trip=capturedPhilippinesTrip(),leg=trip.legs.at(-1)!;
 assert.equal(reviewedPilotRecords(leg.fromEndpoint!,leg.toEndpoint!,'2026-10-29').length,0);
 assert.equal(reviewedPilotRecords(leg.toEndpoint!,leg.fromEndpoint!).length,0);
 for(const mutation of [(e:any)=>e.coordinates[0]+=0.00001,(e:any)=>e.country='Turkey',(e:any)=>e.providerId+='x',(e:any)=>e.canonicalPlaceId='cebu-island',(e:any)=>e.geographicBinding.placeType='island',(e:any)=>e.geographicBinding=null]){
  const from=structuredClone(leg.fromEndpoint!);mutation(from);assert.equal(reviewedPilotRecords(from,leg.toEndpoint!).length,0);
 }
});
test('pinned and captured representations are qualified independently, never retagged',async()=>{
 const leg=structuredClone(capturedPhilippinesTrip().legs.at(-1)!);
 for(const [side,name,id] of [['fromEndpoint','Cebu City','1717512'],['toEndpoint','Manila','1701668']] as const){const p=selectedTransferPlace(name,'Philippines',`reference:geonames:${id}`,'endpoint');leg[side]={...leg[side]!,...p,coordinates:p.coordinates!};}
 const before=JSON.stringify(leg);const r=await compareCanonicalTransferJourney(leg);assert.ok(r.diagnostic.candidates.some(c=>c.evidence==='reviewed_air_journey'));assert.equal(JSON.stringify(leg),before);
});
test('source-guidance response cannot inject links or bypass excluded flight',async()=>{
 const trip=capturedPhilippinesTrip(),leg=trip.legs[0];let r=await compareCanonicalTransferJourney(leg);(r.diagnostic as any).routeGuidance=[{id:'manila-elnido-clark',mode:'flight',label:'Cebgo',url:'javascript:alert(1)',limitation:'complete'}];
 assert.equal((validateTransportComparison(trip,leg.id,r) as any).routeGuidance.length,0);
 leg.routeMetadata.transportConstraints={excludedModes:['flight']};r=await compareCanonicalTransferJourney(leg);assert.equal((r.diagnostic as any).routeGuidance?.length??0,0);assert.equal(r.diagnostic.candidates.some(c=>c.summaryMode==='flight'),false);
});
test('composed candidate crosses the actual comparison validator without relaxing legacy evidence guards',async()=>{
 const trip=capturedPhilippinesTrip(),leg=trip.legs.at(-1)!,from=leg.fromEndpoint!,to=leg.toEndpoint!;
 const source={id:'synthetic-component',url:'https://operator.example/evidence',reviewedAt:'2026-10-27',expiresAt:'2026-10-28',supports:'directional-service' as const};
 const template={id:'fixture-composed',from,to,components:[{id:'service',kind:'service' as const,mode:'flight' as const,from,to,evidence:source,timing:{minutes:271.5,basis:'estimate' as const,scope:'component' as const,covers:['movement','departure-processing','arrival-processing'] as const,evidence:{...source,supports:'planning-estimate' as const}}}]};
 const r=await compareCanonicalTransferJourney(leg,{reviewedJourneyTemplates:[template],reviewedJourneyContext:{asOf:'2026-10-27',travelDate:'2026-12-30'}});
 assert.ok(r.diagnostic.candidates.some(c=>c.evidence==='reviewed_composition'));
 assert.ok(validateTransportComparison(trip,leg.id,r));
});
test('European rail and North American ferry evidence use the same strict representation contract without invented totals',()=>{
 for(const [fromName,toName,country,fromId,toId,mode] of [
  ['London','Paris','United Kingdom','2643743','2988507','train'],
  ['Seattle','Bainbridge Island','United States','5809844','5816320','ferry'],
 ] as const){
  const from=selectedTransferPlace(fromName,country,`reference:geonames:${fromId}`,'endpoint');
  const to=selectedTransferPlace(toName,toName==='Paris'?'France':country,`reference:geonames:${toId}`,'endpoint');
  const f={...from,coordinates:from.coordinates!,id:'from',kind:'stop' as const},t={...to,coordinates:to.coordinates!,id:'to',kind:'stop' as const};
  const guidance=reviewedRouteGuidance(f,t);assert.equal(guidance.length,1);assert.equal(guidance[0].mode,mode);assert.equal(reviewedPilotRecords(f,t)[0].timing,null);
  assert.equal(reviewedRouteGuidance(t,f).length,0,'no unsupported reverse inference');
  assert.equal(reviewedRouteGuidance({...f,providerId:'unreviewed-provider'},t).length,0);
 }
});
test('expired pilot cannot be newly offered or adopted; a previously selected choice survives unchanged',async(t)=>{
 t.mock.timers.enable({apis:['Date'],now:Date.parse('2026-10-27T12:00:00Z')});
 const trip=capturedPhilippinesTrip(),leg=trip.legs.at(-1)!;const raw=await compareCanonicalTransferJourney(leg);const c=validateTransportComparison(trip,leg.id,raw)!;const candidate=c.candidates.find(c=>c.evidence==='reviewed_air_journey')!;
 const saved=adoptTransportComparison(trip,c,candidate.id);assert.equal(effectiveTripLeg(saved,saved.legs.at(-1)!).mode,'flight');const savedBefore=JSON.stringify(saved);
 const unselected=structuredClone(saved);delete unselected.brief.decisionSelections;
 t.mock.timers.setTime(Date.parse('2026-10-29T12:00:00Z'));
 assert.equal(validateTransportComparison(trip,leg.id,raw),null);assert.equal(adoptTransportComparison(trip,c,candidate.id),trip);
 assert.equal(supportedTransportChoicesForLeg(unselected,unselected.legs.at(-1)!).some(c=>c.candidateId===candidate.id),false);
 assert.equal(effectiveTripLeg(saved,saved.legs.at(-1)!).mode,'flight');assert.equal(JSON.stringify(saved),savedBefore);
 const old=supportedTransportChoicesForLeg(saved,saved.legs.at(-1)!)[0];assert.equal(selectTripLegTransportChoice(unselected,leg.id,old.identity),unselected);
 unselected.brief.bookings=[{id:`transport-${leg.id}`,type:'transport'} as any];const bookedBefore=JSON.stringify(unselected);
 assert.equal(supportedTransportChoicesForLeg(unselected,unselected.legs.at(-1)!).some(c=>c.candidateId===candidate.id),false,'a different bound booking does not keep an expired alternative offered');assert.equal(JSON.stringify(unselected),bookedBefore);
});
test('saved guidance respects current structured no-flying constraints before any refresh',async()=>{
 const trip=capturedPhilippinesTrip(),leg=trip.legs[0];const raw=await compareCanonicalTransferJourney(leg);const guidance=raw.diagnostic.routeGuidance;
 assert.equal(transportGuidanceForLeg(trip,leg.id,guidance).length,1);
 trip.brief.structuredBrief=extractStructuredTripBrief('No flights.');
 assert.equal(transportGuidanceForLeg(trip,leg.id,guidance).length,0);
});
