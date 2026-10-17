import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {selectedTransferPlace} from './fixtures/accepted-transfer-place.ts';
import {buildCanonicalTripLegs} from '../lib/easyt/trip-legs.ts';
import {resolveCanonicalTransferJourney} from '../lib/easyt/multimodal-transfer-resolution.ts';
import {effectiveTripLeg,selectTripLegTransportChoice,supportedTransportChoicesForLeg,tripWithEffectiveTransportChoices} from '../lib/easyt/transport-mode-choice.ts';
import {requireReadableTripDocument} from '../lib/easyt/trip-document.ts';
import {builderHasUsablePlanningTransfer} from '../lib/easyt/builder-planning-status.ts';
import {itineraryTransportAgendaStatus,transportAssessmentState} from '../lib/easyt/itinerary-transport-agenda.ts';
import {mapRouteLegsFromTrip} from '../lib/easyt/map-spatial-context.ts';
import {haversineKm} from '../lib/easyt/planner.ts';
import {estimateTransferImpact} from '../lib/easyt/transfer-impact.ts';
import {knownKnowledgeFact,unknownKnowledgeFact} from '../lib/easyt/destination-knowledge.ts';
import {saveTripRecoveryToStorage,loadTripRecoveryFromStorage,type EasyTBrowserStorage} from '../lib/easyt/storage.ts';
import type {EasyTTrip,TripLeg,TripStop} from '../lib/easyt/trip.ts';
import type {RoadRoutingProvider} from '../lib/easyt/road-routing.ts';

const places={lima:['Lima','Peru','3936456','lima'],cusco:['Cusco','Peru','3941584','cusco'],quito:['Quito','Ecuador','3652462','quito'],bogota:['Bogotá','Colombia','3688689','bogota'],cartagena:['Cartagena','Colombia','3687238'],ica:['Ica','Peru','3938527'],kyoto:['Kyoto','Japan','1857910','kyoto'],hiroshima:['Hiroshima','Japan','1862415','hiroshima'],namesake:['Cusco','Peru','3697554','cusco']} as const;
type PlaceKey=keyof typeof places;
function input(a:PlaceKey,b:PlaceKey,referenceOwned=false){
 const get=(key:PlaceKey,role:'endpoint'|'stop')=>{const p=places[key];const id=`reference:geonames:${p[2]}`;return selectedTransferPlace(p[0],p[1],id,role,!referenceOwned&&p.length===4?p[3]:id);};
 const from=get(a,'endpoint'),to=get(b,'stop');
 assert.ok(from.coordinates);assert.ok(to.coordinates);assert.ok(to.country);
 const stop:TripStop={id:`stop-${b}`,order:0,name:to.name,country:to.country,canonicalPlaceId:to.canonicalPlaceId,providerId:to.providerId,geographicBinding:to.geographicBinding,latitude:to.coordinates[1],longitude:to.coordinates[0],arrivalDate:'2027-05-01',departureDate:'2027-05-04',nights:3};
 const leg=buildCanonicalTripLegs({tripId:'disposable-air-journey',origin:{...from,coordinates:from.coordinates},stops:[stop]})[0];
 leg.routeMetadata.source='morrovia-planner';leg.routeMetadata.roadFallbackEligible=true;
 return {leg,stop,from};
}
function road(minutes:number):RoadRoutingProvider{return {provider:'openrouteservice',route:async r=>({mode:'road',distanceKm:(haversineKm(r.origin.coordinates,r.destination.coordinates)??100)*1.1,durationMinutes:minutes,confidence:'medium',provenance:'routed',provider:'openrouteservice',providerCheckedAt:'2026-10-17T00:00:00Z',profile:'driving-car',routeGeometry:[r.origin.coordinates,r.destination.coordinates],attribution:'Synthetic diagnostic road, not live service'})};}
const rows=[['lima','cusco',915],['quito','bogota',975],['bogota','cartagena',825]] as const;
test('an explicitly unknown planning range does not become a fabricated plus/minus fifteen-minute interval',()=>{
 const impact=estimateTransferImpact({mode:'flight',knownDoorToDoorMinutes:knownKnowledgeFact(360,'estimated',{id:'test:planning-rule',label:'Synthetic planning allowance',kind:'curated',supports:'Allowance, not a measured travel time'}),knownDoorToDoorRange:unknownKnowledgeFact('No defensible interval'),connectionCount:null});
 assert.equal(impact.doorToDoor.status,'known');
 assert.equal(impact.doorToDoor.value!.rangeMinutes,null);
 assert.equal(impact.doorToDoor.value!.precision,'planning-allowance');
});
function makeTrip(fixture:ReturnType<typeof input>,leg:TripLeg):EasyTTrip {
 const template=JSON.parse(readFileSync(new URL('./fixtures/main-staging-africa-control.json',import.meta.url),'utf8')) as EasyTTrip;
 const trip=requireReadableTripDocument({...template,schemaVersion:1,id:'disposable-air-journey',ownerId:null,title:'Disposable reviewed air journey',startDate:'2027-05-01',endDate:'2027-05-04',
  brief:{origin:fixture.from.name,originCountry:fixture.from.country,originCanonicalPlaceId:fixture.from.canonicalPlaceId,originProviderId:fixture.from.providerId,originCoordinates:fixture.from.coordinates,mustDo:'',pace:'slow',hotelChanges:'few',budgetBand:'mid',selectedPlaces:{}},
  stops:[fixture.stop],legs:[leg],planItems:[],recommendations:[]});
 assert.equal(trip.brief.intent!.version,2);
 trip.brief.intent!.route!.origin=structuredClone(fixture.from);
 return trip;
}
for(const [a,b,minutes] of rows)for(const referenceOwned of [false,true])for(const seed of ['unknown','train','flight'] as const)test(`${a} to ${b}, ${referenceOwned?'reference':'catalog/reference'} identity: reviewed air ignores ${seed} preliminary mode`,async()=>{
 const fixture=input(a,b,referenceOwned),leg=structuredClone(fixture.leg),before=JSON.stringify(fixture);
 leg.mode=seed;leg.durationMinutes=seed==='unknown'?null:240;leg.doorToDoorMinutes=leg.durationMinutes;leg.provenance='planning_estimate';
 // A generic train seed is not a confirmed timetable or traveller choice.
 leg.routeMetadata.routingConfidence='medium';
 const result=await resolveCanonicalTransferJourney(leg,{provider:road(minutes)});
 assert.equal(result.leg.mode,'flight');assert.equal(result.leg.provenance,'planning_estimate');assert.equal(result.leg.confidence,'medium');
 assert.equal(result.leg.scheduleNeedsChecking,true);assert.equal(result.assessment.evidence,'conditional');
 const impact=result.leg.routeMetadata.transferImpact as any;
 assert.equal(impact.doorToDoor.confidence,'estimated');assert.equal(impact.headline.status,'unknown');
 assert.equal(impact.doorToDoor.value.rangeMinutes,null,'Do not fabricate a reviewed min/max interval');
 assert.equal(result.leg.headlineMinutes,null,'A total planning allowance is not airborne time');
 assert.ok(impact.doorToDoor.sources.some((s:any)=>s.id==='morrovia:reviewed-air-allowance-v1'));
 assert.match(result.leg.provider??'',/planning allowance/i);
 assert.match(result.leg.provider??'',/https:\/\//);
 assert.equal(result.diagnostic.candidates.filter(c=>c.evidence==='reviewed_air_journey').length,1);
 assert.equal(JSON.stringify(fixture),before,'Resolver does not rewrite accepted identity or input');
});

for(const [label,change] of [
 ['wrong reference pin',(leg:TripLeg)=>{leg.toEndpoint!.providerId=leg.toEndpoint!.providerId!.replace('3941584','3697554');}],
 ['coordinate drift',(leg:TripLeg)=>{leg.toEndpoint!.coordinates![0]+=0.00001;}],
 ['wrong country',(leg:TripLeg)=>{leg.toEndpoint!.country='Colombia';}],
 ['unqualified endpoint',(leg:TripLeg)=>{leg.toEndpoint!.geographicBinding=null as any;}],
 ['same-name northern settlement',(leg:TripLeg)=>{leg.toEndpoint=input('lima','namesake').leg.toEndpoint;}],
] as const)test(`Lima–Cusco rejects air evidence for ${label}`,async()=>{
 const {leg}=input('lima','cusco');change(leg);const result=await resolveCanonicalTransferJourney(leg,{provider:road(915)});
 assert.equal(result.diagnostic.candidates.some(c=>c.evidence==='reviewed_air_journey'),false);
 assert.notEqual(result.leg.mode,'flight');
});

for(const [a,b,minutes] of rows)test(`${a}–${b}: no-flight and explicit authored/booking facts remain authoritative`,async()=>{
 const {leg}=input(a,b);leg.routeMetadata.transportConstraints={excludedModes:['flight']};
 const constrained=await resolveCanonicalTransferJourney(leg,{provider:road(minutes)});
 assert.ok(constrained.diagnostic.candidates.every(c=>c.segments.every(s=>s.mode!=='flight')));
 for(const source of ['traveller-authored','imported-booking','curated-route']){
  const retained=structuredClone(leg);retained.mode='road';retained.durationMinutes=minutes;retained.routeMetadata.source=source;
  const original=JSON.stringify(retained),result=await resolveCanonicalTransferJourney(retained,{provider:road(minutes)});
  assert.equal(result.outcome,'preserved');assert.equal(JSON.stringify(result.leg),original);
 }
});

test('unreviewed reverse directions, Cusco–Quito and namesake journeys receive no new pair evidence',async()=>{
 for(const [a,b] of [['cusco','lima'],['cartagena','bogota'],['bogota','quito'],['cusco','quito'],['namesake','quito']] as const){
  const fixture=input(a,b);const original=JSON.stringify(fixture);const result=await resolveCanonicalTransferJourney(fixture.leg,{provider:road(900)});
  assert.equal(result.diagnostic.candidates.some(c=>c.evidence==='reviewed_air_journey'),false);
  assert.equal(JSON.stringify(fixture),original);
 }
});

test('short road and useful rail remain useful without new air candidates',async()=>{
 for(const [a,b,expected,minutes] of [['lima','ica','road',255],['kyoto','hiroshima','train',300]] as const){
  const {leg}=input(a,b);const result=await resolveCanonicalTransferJourney(leg,{provider:road(minutes)});
  assert.equal(result.leg.mode,expected);assert.equal(result.diagnostic.candidates.some(c=>c.evidence==='reviewed_air_journey'),false);
 }
});

test('road preference stays in ranking, and choosing air keeps timing provenance through reload',async()=>{
 const fixture=input('bogota','cartagena');fixture.leg.routeMetadata.transportConstraints={preferredModes:['road']};
 const result=await resolveCanonicalTransferJourney(fixture.leg,{provider:road(345)});
 assert.equal(result.leg.mode,'road');
 let trip=makeTrip(fixture,result.leg);
 const air=supportedTransportChoicesForLeg(trip,result.leg).find(c=>c.evidence==='reviewed_air_journey');assert.ok(air);
 trip=selectTripLegTransportChoice(trip,result.leg.id,air.identity);
 const entries=new Map<string,string>();
 const storage:EasyTBrowserStorage={get length(){return entries.size;},key:index=>[...entries.keys()][index]??null,getItem:key=>entries.get(key)??null,setItem:(key,value)=>{entries.set(key,value);},removeItem:key=>{entries.delete(key);}};
 const saved=saveTripRecoveryToStorage(storage,trip,{writeId:'reviewed-air-disposable-save'});assert.equal(saved.stored,true);
 const reopened=loadTripRecoveryFromStorage(storage,trip.id,null);assert.ok(reopened);
 const reloaded=requireReadableTripDocument(JSON.parse(JSON.stringify(reopened.trip)));
 const effective=effectiveTripLeg(reloaded,reloaded.legs[0]);
 assert.equal(effective.mode,'flight');assert.equal(effective.confidence,'medium');assert.equal(effective.headlineMinutes,null);
 assert.equal((effective.routeMetadata.transferImpact as any).mode,'flight');
 assert.equal((effective.routeMetadata.transferImpact as any).doorToDoor.confidence,'estimated');
 assert.ok(builderHasUsablePlanningTransfer(reloaded,reloaded.legs[0]));
 const map=mapRouteLegsFromTrip(tripWithEffectiveTransportChoices(reloaded));assert.equal(map[0].mode,'flight');assert.equal(map[0].headlineMinutes,null);
 assert.equal(map[0].doorToDoorMinutes,effective.doorToDoorMinutes);
 assert.equal(itineraryTransportAgendaStatus(effective,null),'confirm');assert.equal(transportAssessmentState(reloaded,effective),'supported');
 assert.equal(reloaded.legs[0].mode,'road','Explicit choice projects without rewriting recommendation');
});

test('malformed saved candidate timing cannot crash the transport choice reader',async()=>{
 const fixture=input('bogota','cartagena'),result=await resolveCanonicalTransferJourney(fixture.leg,{provider:road(825)});
 const trip=makeTrip(fixture,result.leg),diagnostic=trip.legs[0].routeMetadata.multimodalResolution as any;
 const air=diagnostic.candidates.find((c:any)=>c.evidence==='reviewed_air_journey');
 air.transferImpact={version:1,mode:'flight',headline:{status:'unknown'},doorToDoor:{status:'known'},components:[]};
 assert.doesNotThrow(()=>supportedTransportChoicesForLeg(trip,trip.legs[0]));
});

test('choosing road replaces the flight travel-day impact with the selected road total',async()=>{
 const fixture=input('bogota','cartagena'),result=await resolveCanonicalTransferJourney(fixture.leg,{provider:road(825)});
 let trip=makeTrip(fixture,result.leg);const option=supportedTransportChoicesForLeg(trip,trip.legs[0]).find(c=>c.mode==='road');assert.ok(option);
 trip=selectTripLegTransportChoice(trip,trip.legs[0].id,option.identity);const selected=effectiveTripLeg(trip,trip.legs[0]);
 assert.equal(selected.usableDayLoss,1);
 assert.equal((selected.routeMetadata.transferImpact as any).mode,'road');
 assert.equal((selected.routeMetadata.transferImpact as any).doorToDoor.value.planningMinutes,825);
});

test('choosing a different flight candidate replaces timing even when summary mode is unchanged',async()=>{
 const fixture=input('bogota','cartagena');fixture.leg.mode='flight';fixture.leg.durationMinutes=600;fixture.leg.doorToDoorMinutes=600;
 const result=await resolveCanonicalTransferJourney(fixture.leg,{provider:road(825)});let trip=makeTrip(fixture,result.leg);
 const option=supportedTransportChoicesForLeg(trip,trip.legs[0]).find(c=>c.evidence==='legacy_flight_estimate');assert.ok(option);
 trip=selectTripLegTransportChoice(trip,trip.legs[0].id,option.identity);const selected=effectiveTripLeg(trip,trip.legs[0]);
 assert.equal((selected.routeMetadata.transferImpact as any).doorToDoor.value.planningMinutes,600);
 assert.equal(selected.usableDayLoss,1);
});
