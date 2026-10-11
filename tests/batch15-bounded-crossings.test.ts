import assert from 'node:assert/strict';
import test from 'node:test';
import {resolveCanonicalTransferJourney} from '../lib/easyt/multimodal-transfer-resolution.ts';
import { REVIEWED_SURFACE_CROSSINGS } from '../lib/easyt/surface-crossing-evidence.ts';
import { referencePlaceById } from '../lib/easyt/place-reference.server.ts';
import { REFERENCE_SNAPSHOT_ID } from '../lib/easyt/place-reference.ts';
import {landConnectionEvidence} from '../lib/easyt/land-connection.ts';
import {RoadRoutingError,type RoadRoutingProvider} from '../lib/easyt/road-routing.ts';
import type {TripLeg} from '../lib/easyt/trip.ts';
const leg=(name:string,country:string,point:[number,number],toName:string,toCountry:string,toPoint:[number,number]):TripLeg=>({id:'test',fromStopId:'from',toStopId:'to',fromEndpoint:{id:'from',kind:'origin',name,country,coordinates:point},toEndpoint:{id:'to',kind:'stop',name:toName,country:toCountry,coordinates:toPoint},mode:'unknown',distanceKm:null,durationMinutes:null,provider:null,routeMetadata:{source:'morrovia-planner',roadFallbackEligible:true}});
const provider:RoadRoutingProvider={provider:'openrouteservice',async route(input){return {mode:'road',distanceKm:input.origin.coordinates[0]>12?45:55,durationMinutes:60,confidence:'medium',provenance:'routed',provider:'openrouteservice',providerCheckedAt:'2026-10-10',profile:'driving-car',routeGeometry:[input.origin.coordinates,input.destination.coordinates],attribution:'Test routing evidence'};}};
test('a mainland road candidate is selectable without a driving preference',async()=>{
 const result=await resolveCanonicalTransferJourney(leg('Puebla','Mexico',[-98.2063,19.0414],'Oaxaca','Mexico',[-96.7266,17.0732]),{provider:{...provider,async route(input){return {...await provider.route(input),distanceKm:340,durationMinutes:270};}}});
 assert.equal(result.leg.mode,'road');assert.equal(result.leg.provenance,'routing_engine');
});
test('reviewed fixed link permits routed Copenhagen–Malmö road in both directions',async()=>{
 for(const reverse of [false,true]){
 const c:['Copenhagen','Denmark',[number,number]]=['Copenhagen','Denmark',[12.56553,55.67594]],m:['Malmö','Sweden',[number,number]]=['Malmö','Sweden',[13.00073,55.60587]];
 const [a,b]=reverse?[m,c]:[c,m];assert.notEqual(landConnectionEvidence(a[2],b[2]),'same-land');
 const input=leg(a[0],a[1],a[2],b[0],b[1],b[2]);
 input.fromEndpoint!.canonicalPlaceId=reverse?'reference:geonames:2692969':'reference:geonames:2618425';
 input.toEndpoint!.canonicalPlaceId=reverse?'reference:geonames:2618425':'reference:geonames:2692969';
 const result=await resolveCanonicalTransferJourney(input,{provider});assert.equal(result.leg.mode,'road');assert.match(result.leg.provider??'',/routing|route/i);
 }
});
test('Java–Bali reuses an explicit ferry component without inventing timing',async()=>{
 for(const reverse of [false,true]){
 const java:['Banyuwangi','Indonesia',[number,number]]=['Banyuwangi','Indonesia',[114.369, -8.219]],bali:['Lovina','Indonesia',[number,number]]=['Lovina','Indonesia',[115.025,-8.158]];
 const [a,b]=reverse?[bali,java]:[java,bali];const result=await resolveCanonicalTransferJourney(leg(a[0],a[1],a[2],b[0],b[1],b[2]),{provider});
 assert.equal(result.leg.mode,'mixed');assert.deepEqual(result.leg.segments?.map(s=>s.mode),['road','ferry','road']);
 const ferry=result.leg.segments![1];assert.equal(ferry.durationMinutes,null);assert.equal(result.leg.durationMinutes,null);assert.match(ferry.provider??'',/asdp.id/);
 assert.deepEqual([ferry.fromEndpoint.name,ferry.toEndpoint.name],reverse?['Gilimanuk ferry port','Ketapang ferry port']:['Ketapang ferry port','Gilimanuk ferry port']);
 }
});
test('crossing evidence never establishes unrelated road or ferry services',async()=>{
 const noRoute:RoadRoutingProvider={provider:'openrouteservice',async route(){throw new RoadRoutingError('no_route');}};
 for(const input of [leg('Athens','Greece',[23.7275,37.9838],'Naxos','Greece',[25.376,37.1036]),leg('Ketapang','Indonesia',[109.983,-1.85],'Lovina','Indonesia',[115.025,-8.158]),leg('Copenhagen','Denmark',[12.56553,55.67594],'Oslo','Norway',[10.7522,59.9139])]){
 const result=await resolveCanonicalTransferJourney(input,{provider:noRoute});assert.equal(result.leg.mode,'unknown');
 }
});
test('hard exclusions prevent ferry composition and missing access evidence stays untimed',async()=>{
 const input=leg('Banyuwangi','Indonesia',[114.369,-8.219],'Lovina','Indonesia',[115.025,-8.158]);
 for(const excludedModes of [['road'],['ferry']]){
  const constrained={...input,routeMetadata:{...input.routeMetadata,transportConstraints:{excludedModes}}};
  assert.equal((await resolveCanonicalTransferJourney(constrained)).leg.mode,'unknown');
 }
 const result=await resolveCanonicalTransferJourney(input);
 assert.equal(result.outcome,'unresolved');assert.equal(result.leg.mode,'mixed');
 assert.ok(result.leg.segments?.every(s=>s.durationMinutes===null));assert.equal(result.leg.scheduleNeedsChecking,true);
});
test('nearby Saltholm cannot inherit the Øresund fixed link by country and proximity',async()=>{
 const input=leg('Saltholm','Denmark',[12.756,55.647],'Malmö','Sweden',[13.00073,55.60587]);
 assert.equal(landConnectionEvidence(input.fromEndpoint!.coordinates!,input.toEndpoint!.coordinates!),'unproven');
 const result=await resolveCanonicalTransferJourney(input,{provider});assert.equal(result.leg.mode,'unknown');
});

test('crossing scope points exactly match the existing reference snapshot and physical port points stay unknown',()=>{
 for(const crossing of REVIEWED_SURFACE_CROSSINGS)for(const side of crossing.sides){
  assert.equal(side.coordinates,null);
  assert.equal(side.coordinateProvenance.snapshotId,REFERENCE_SNAPSHOT_ID);
  assert.deepEqual(side.scopeCentre,referencePlaceById(side.scopeReferenceId)?.coordinates);
  assert.deepEqual(side.landAnchor,referencePlaceById(side.landAnchorReferenceId)?.coordinates);
 }
});
test('untimed ferry components discard stale saved whole-leg estimates and retain traveller rules',async()=>{
 const input=leg('Banyuwangi','Indonesia',[114.369,-8.219],'Lovina','Indonesia',[115.025,-8.158]);
 input.doorToDoorMinutes=120;input.headlineMinutes=90;input.routedDistanceKm=80;input.distanceKm=80;input.straightLineDistanceKm=70;input.usableDayLoss=0.25;
 input.routeGeometry=[[1,2],[3,4]];
 input.roadEstimate={provider:'openrouteservice',profile:'driving-car',provenance:'routed',checkedAt:'2026-10-10',distanceKm:80,durationMinutes:120,confidence:'medium',routeGeometry:[[1,2],[3,4]],attribution:'Stale prior journey',warnings:[]};
 input.routeMetadata.transferImpact={stale:true};input.routeMetadata.roadRouting={stale:true};input.routeMetadata.routingConfidence='high';input.routeMetadata.transportConstraints={preferredModes:['train'],excludedModes:['flight']};input.routeMetadata.travellerContext='retained';
 const before=structuredClone(input);
 const result=await resolveCanonicalTransferJourney(input);
 assert.equal(result.leg.mode,'mixed');assert.equal(result.outcome,'unresolved');
 assert.equal(result.leg.segments!.filter(s=>s.mode==='road').length,2);
 for(const access of result.leg.segments!.filter(s=>s.mode==='road')){
  assert.equal(access.durationMinutes,null);assert.equal(access.distanceKm,null);assert.equal(access.routeGeometry,undefined);assert.equal(access.provenance,'unknown');
 }
 assert.equal(result.leg.durationMinutes,null);assert.equal(result.leg.doorToDoorMinutes,null);assert.equal(result.leg.headlineMinutes,null);
 assert.equal(result.leg.distanceKm,null);assert.equal(result.leg.routedDistanceKm,null);assert.equal(result.leg.usableDayLoss,null);assert.equal(result.leg.routeGeometry,undefined);assert.equal(result.leg.roadEstimate,undefined);assert.equal(result.leg.routeMetadata.transferImpact,undefined);assert.equal(result.leg.routeMetadata.roadRouting,undefined);assert.equal(result.leg.routeMetadata.routingConfidence,undefined);assert.equal(result.leg.straightLineDistanceKm,null);
 assert.deepEqual(result.leg.routeMetadata.transportConstraints,before.routeMetadata.transportConstraints);assert.equal(result.leg.routeMetadata.travellerContext,'retained');assert.deepEqual(input,before);
});
test('resolving a saved generated crossing again removes newly forbidden transport without changing traveller intent',async()=>{
 const original=leg('Banyuwangi','Indonesia',[114.369,-8.219],'Lovina','Indonesia',[115.025,-8.158]);
 const first=await resolveCanonicalTransferJourney(original);
 assert.equal(first.leg.mode,'mixed');assert.deepEqual(first.leg.segments?.map(s=>s.mode),['road','ferry','road']);
 for(const rules of [{excludedModes:['ferry'],preferredModes:['train']},{excludedModes:['road'],preferredModes:['train']},{avoidDriving:true,preferredModes:['train']}]){
  const saved=JSON.parse(JSON.stringify(first.leg)) as TripLeg;
  saved.routeMetadata.transportConstraints=rules;saved.routeMetadata.travellerContext='preserved';
  const before=structuredClone(saved);const second=await resolveCanonicalTransferJourney(saved);
  assert.equal(second.leg.mode,'unknown');assert.equal(second.outcome,'unresolved');assert.equal(second.leg.segments,undefined);
  assert.equal(second.leg.durationMinutes,null);assert.equal(second.leg.doorToDoorMinutes,null);assert.equal(second.leg.headlineMinutes,null);assert.equal(second.leg.routeGeometry,undefined);
  assert.equal(second.leg.routeMetadata.surfaceCrossingEvidence,undefined);
  assert.deepEqual(second.leg.routeMetadata.transportConstraints,rules);assert.equal(second.leg.routeMetadata.travellerContext,'preserved');
  assert.deepEqual(second.leg.fromEndpoint,saved.fromEndpoint);assert.deepEqual(second.leg.toEndpoint,saved.toEndpoint);assert.deepEqual(saved,before);
 }
 const repeated=await resolveCanonicalTransferJourney(JSON.parse(JSON.stringify(first.leg)) as TripLeg);
 assert.deepEqual(repeated.leg.segments,first.leg.segments,'unchanged traveller rules retain the supported topology');
});
