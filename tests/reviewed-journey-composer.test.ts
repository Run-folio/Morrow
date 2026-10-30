import assert from 'node:assert/strict';
import test from 'node:test';
import {comparisonLeg, syntheticRoad} from './fixtures/transport-comparison.ts';
import {resolveCanonicalTransferJourney} from '../lib/easyt/multimodal-transfer-resolution.ts';

const context={asOf:'2026-10-27',travelDate:'2026-12-30'};
const evidence={id:'fixture:official',url:'https://operator.example/service',reviewedAt:'2026-10-26',expiresAt:'2026-11-26',supports:'directional-service'};
function fixture(){
 const leg=comparisonLeg();leg.mode='unknown';leg.durationMinutes=null;leg.provenance='unknown';leg.routeMetadata.source='spreadsheet-import-planning';
 const from=structuredClone(leg.fromEndpoint!),to=structuredClone(leg.toEndpoint!);
 return {leg,template:{id:'fixture:rail',from,to,components:[{id:'rail',kind:'service',mode:'train',from,to,evidence,timing:{minutes:270,basis:'estimate',scope:'component',covers:['movement','departure-processing','arrival-processing'],evidence:{...evidence,id:'fixture:estimate',supports:'planning-estimate'}}}]}};
}
test('real resolver admits a fully evidenced planning estimate without live inventory or December timetable',async()=>{
 const {leg,template}=fixture(),before=JSON.stringify(leg);
 const result=await resolveCanonicalTransferJourney(leg,{provider:syntheticRoad(),reviewedJourneyTemplates:[template],reviewedJourneyContext:context} as any);
 const candidate=result.diagnostic.candidates.find(c=>c.evidence==='reviewed_composition' as any);
 assert.ok(candidate,'qualified composed planning option must reach existing candidate selection');
 assert.equal(candidate.transferImpact?.headline.status,'unknown');
 assert.equal(candidate.transferImpact?.doorToDoor.value?.rangeMinutes,null);
 assert.equal(candidate.totalDurationMinutes,270);assert.equal(candidate.connectionCount,0);
 assert.equal(candidate.segments[0].fromEndpoint.id,leg.fromStopId);
 assert.equal(candidate.segments[0].scheduleNeedsChecking,true);
 assert.equal(JSON.stringify(leg),before);
});
async function assess(change:(t:any)=>void){const {leg,template}=fixture();change(template);return resolveCanonicalTransferJourney(leg,{provider:syntheticRoad(),reviewedJourneyTemplates:[template],reviewedJourneyContext:context} as any);}
for(const [name,change,status] of [
 ['missing required timing',(t:any)=>t.components[0].timing=null,'partial'],
 ['stale service',(t:any)=>t.components[0].evidence={...evidence,expiresAt:'2026-10-25'},'unqualified'],
 ['future review',(t:any)=>t.components[0].evidence={...evidence,reviewedAt:'2026-10-28'},'unqualified'],
 ['wrong directional endpoint',(t:any)=>{t.components[0].from=t.to;t.components[0].to=t.from;},'unqualified'],
 ['changed provider',(t:any)=>t.components[0].from.providerId='other','unqualified'],
 ['whole journey time counted as component',(t:any)=>t.components[0].timing.scope='whole-journey','unqualified'],
 ['zero invented time',(t:any)=>t.components[0].timing.minutes=0,'unqualified'],
 ['schedule outside date',(t:any)=>t.components[0].timing={...t.components[0].timing,basis:'scheduled',evidence:{...evidence,supports:'schedule',validFrom:'2026-10-01',validUntil:'2026-11-01'}},'partial'],
] as const)test(name,async()=>{const r=await assess(change);assert.ok(!r.diagnostic.candidates.some(c=>c.evidence==='reviewed_composition' as any));assert.equal((r.diagnostic as any).reviewedJourneys?.[0]?.status,status);});
test('a zero-length main service is rejected',async()=>{
 const {leg,template}=fixture();const middle=structuredClone(leg.fromEndpoint!);middle.id='connection-place';
 const first={...template.components[0],id:'first',to:middle,timing:{...template.components[0].timing,minutes:60}};
 // This zero-length first service is intentionally invalid even with valid outer endpoints.
 const bad={...template,components:[first,{...first,id:'connection',kind:'connection',from:middle,to:middle,timing:{...first.timing,minutes:30}},{...template.components[0],id:'second',from:middle}]};
 const r=await resolveCanonicalTransferJourney(leg,{provider:syntheticRoad(),reviewedJourneyTemplates:[bad],reviewedJourneyContext:context} as any);
 assert.ok(!r.diagnostic.candidates.some(c=>c.evidence==='reviewed_composition' as any));
});
test('authored or booked transport cannot be displaced by new evidence',async()=>{
 for(const source of ['traveller-authored','imported-booking','curated-route']){
  const {leg,template}=fixture();leg.routeMetadata.source=source;const before=JSON.stringify(leg);
  const r=await resolveCanonicalTransferJourney(leg,{reviewedJourneyTemplates:[template],reviewedJourneyContext:context} as any);
  assert.equal(r.outcome,'preserved');assert.equal(JSON.stringify(r.leg),before);
 }
});
test('excluded component mode prevents composed option',async()=>{
 const {leg,template}=fixture();leg.routeMetadata.transportConstraints={excludedModes:['train']};
 const r=await resolveCanonicalTransferJourney(leg,{reviewedJourneyTemplates:[template],reviewedJourneyContext:context} as any);
 assert.ok(!r.diagnostic.candidates.some(c=>c.evidence==='reviewed_composition' as any));
});

import type {EasyTTrip} from '../lib/easyt/trip.ts';
import {composeReviewedJourney} from '../lib/easyt/reviewed-journey-composer.ts';
import {selectedTransferPlace} from './fixtures/accepted-transfer-place.ts';
import {buildCanonicalTripLegs} from '../lib/easyt/trip-legs.ts';
import {readFileSync} from 'node:fs';
import {requireReadableTripDocument} from '../lib/easyt/trip-document.ts';
import {supportedTransportChoicesForLeg,selectTripLegTransportChoice,effectiveTripLeg} from '../lib/easyt/transport-mode-choice.ts';
import {saveTripRecoveryToStorage,loadTripRecoveryFromStorage} from '../lib/easyt/storage.ts';
function endpoint(name:string,country:string,id:string){const place=selectedTransferPlace(name,country,`reference:geonames:${id}`,'endpoint');return {...place,coordinates:place.coordinates!,id:`physical-${id}`,kind:'stop' as const};}
function component(id:string,kind:string,mode:string,from:any,to:any,minutes:number){return {id,kind,mode,from,to,evidence:{...evidence,id:`source:${id}`,supports:kind==='service'?'directional-service':kind==='connection'?'connection':'access'},timing:{minutes,basis:'estimate',scope:'component',covers:kind==='service'?['movement','departure-processing','arrival-processing']:kind==='connection'?['movement','connection-buffer']:['movement'],evidence:{...evidence,id:`time:${id}`,supports:'planning-estimate'}}};}
test('one evidenced connection sums independent components once without inventing a same-terminal movement',()=>{
 const {leg}=fixture(),middle=endpoint('Paris','France','2988507');
 const t={id:'synthetic-connection',from:leg.fromEndpoint!,to:leg.toEndpoint!,components:[component('first','service','train',leg.fromEndpoint,middle,150),component('wait','connection','walk',middle,middle,45),component('second','service','train',middle,leg.toEndpoint,240)]};
 const before=JSON.stringify(t),r=composeReviewedJourney(leg,t as any,context);assert.equal(r.status,'complete');if(r.status!=='complete')return;
 assert.equal(r.candidate.totalDurationMinutes,435);assert.equal(r.candidate.connectionCount,1);assert.equal(r.candidate.segments.length,2);assert.equal(r.candidate.transferImpact?.doorToDoor.value?.planningMinutes,435);assert.equal(JSON.stringify(t),before);
 const missing=structuredClone(t);missing.components[1].timing=null as any;assert.equal(composeReviewedJourney(leg,missing as any,context).status,'partial');
 const broken=structuredClone(t);broken.components[2].from=leg.fromEndpoint!;assert.equal(composeReviewedJourney(leg,broken as any,context).status,'unqualified');
 const extra=structuredClone(t);extra.components.push(component('extra','service','train',leg.toEndpoint,leg.toEndpoint,10));assert.equal(composeReviewedJourney(leg,extra as any,context).status,'unqualified');
});
test('internal physical matches with different occurrence IDs or kinds are rejected before comparison',()=>{
 const {leg}=fixture(),middle=endpoint('Paris','France','2988507');
 for(const field of ['id','kind']){
  const other={...middle,[field]:field==='id'?'different-terminal-occurrence':'origin'};
  const t={id:'inconsistent-internal-occurrences',from:leg.fromEndpoint!,to:leg.toEndpoint!,components:[component('first','service','train',leg.fromEndpoint,middle,150),component('wait','connection','walk',middle,middle,45),component('second','service','train',other,leg.toEndpoint,240)]};
  assert.equal(composeReviewedJourney(leg,t as any,context).status,'unqualified');
 }
});
for(const [region,a,b] of [
 ['Europe',['London','United Kingdom','2643743'],['Edinburgh','United Kingdom','2650225']],
 ['Asia',['Kyoto','Japan','1857910'],['Hiroshima','Japan','1862415']],
 ['South America',['Lima','Peru','3936456'],['Cusco','Peru','3941584']],
] as const)for(const mode of ['flight','train','road','ferry','walk'])test(`${region} ${mode}: generic contract and cross-region identity rejection (synthetic evidence, not coverage)`,()=>{
 const from=endpoint(a[0],a[1],a[2]),to=endpoint(b[0],b[1],b[2]),{leg}=fixture();leg.fromEndpoint=from;leg.toEndpoint=to;leg.fromStopId=from.id;leg.toStopId=to.id;
 const t={id:`synthetic-${region}-${mode}`,from,to,components:[component('service','service',mode,from,to,180)]};
 assert.equal(composeReviewedJourney(leg,t as any,context).status,'complete');
 const before=JSON.stringify(leg);const foreign=structuredClone(t);foreign.components[0].to.country='Wrong country';assert.equal(composeReviewedJourney(leg,foreign as any,context).status,'unqualified');assert.equal(JSON.stringify(leg),before);
});
for(const variant of ['train','walk','mixed','unrounded','fractional'])test(`${variant} reviewed option survives explicit selection, owner-scoped recovery and reopen without changing the underlying recommendation`,async()=>{
 const {leg,template}=fixture();
 if(variant==='fractional')template.components[0].timing.minutes=271.5;
 if(variant==='unrounded')template.components[0].timing.minutes=271;
 if(variant==='walk')template.components[0].mode='walk';
 if(variant==='mixed'){const middle=endpoint('Paris','France','2988507');template.components=[component('access','access','road',leg.fromEndpoint,middle,30),component('service','service','train',middle,leg.toEndpoint,240)] as any;}
 const result=await resolveCanonicalTransferJourney(leg,{provider:syntheticRoad(),reviewedJourneyTemplates:[template],reviewedJourneyContext:context} as any);
 const base=JSON.parse(readFileSync(new URL('./fixtures/main-staging-africa-control.json',import.meta.url),'utf8'));
 const from=leg.fromEndpoint!,to=leg.toEndpoint!;
 let trip:EasyTTrip=requireReadableTripDocument({...base,schemaVersion:1,id:'comparison-test',ownerId:'synthetic-owner-a',startDate:'2026-12-30',endDate:'2027-01-01',brief:{origin:from.name,originCountry:from.country,originCanonicalPlaceId:from.canonicalPlaceId,originProviderId:from.providerId,originCoordinates:from.coordinates,mustDo:'',pace:'slow',hotelChanges:'few',budgetBand:'mid',selectedPlaces:{}},stops:[{id:leg.toStopId,order:0,name:to.name,country:to.country,canonicalPlaceId:to.canonicalPlaceId,providerId:to.providerId,geographicBinding:to.geographicBinding,longitude:to.coordinates![0],latitude:to.coordinates![1],arrivalDate:'2026-12-30',departureDate:'2027-01-01',nights:2}],legs:[result.leg],planItems:[],recommendations:[]});
 const original=JSON.stringify(trip.legs);const option=supportedTransportChoicesForLeg(trip,trip.legs[0]).find(c=>c.evidence==='reviewed_composition');assert.ok(option);assert.equal(option.transferImpact?.headline.status,'unknown');assert.equal(option.transferImpact?.doorToDoor.value?.rangeMinutes,null);
 trip=selectTripLegTransportChoice(trip,trip.legs[0].id,option.identity);assert.equal(JSON.stringify(trip.legs),original);
 const entries=new Map<string,string>();const storage={get length(){return entries.size;},key:(i:number)=>[...entries.keys()][i]??null,getItem:(k:string)=>entries.get(k)??null,setItem:(k:string,v:string)=>{entries.set(k,v)},removeItem:(k:string)=>{entries.delete(k)}};
 assert.equal(saveTripRecoveryToStorage(storage,trip,{writeId:'composer-test'}).stored,true);
 assert.equal(loadTripRecoveryFromStorage(storage,trip.id,'synthetic-owner-b'),null);
 const reopened=loadTripRecoveryFromStorage(storage,trip.id,'synthetic-owner-a');assert.ok(reopened);
 const read=requireReadableTripDocument(JSON.parse(JSON.stringify(reopened.trip))),effective=effectiveTripLeg(read,read.legs[0]);
 assert.equal(effective.doorToDoorMinutes,variant==='fractional'?271.5:variant==='unrounded'?271:270);assert.equal((effective.routeMetadata.transferImpact as any).doorToDoor.value.planningMinutes,effective.doorToDoorMinutes);assert.equal(effective.headlineMinutes,null);assert.equal(effective.scheduleNeedsChecking,true);assert.equal(JSON.stringify(read.legs),original);
});

for(const [label,mutate,status] of [
 ['service only in-vehicle timing',(t:any)=>t.components[0].timing.covers=['movement'],'partial'],
 ['wrong physical binding type',(t:any)=>{t.components[0].to=structuredClone(t.to);t.components[0].to.geographicBinding.placeType='town';},'unqualified'],
 ['withdrawn service',(t:any)=>t.components[0].evidence={...evidence,withdrawn:true},'unqualified'],
] as const)test(label,async()=>{const r=await assess(mutate);assert.equal((r.diagnostic as any).reviewedJourneys?.[0].status,status);assert.ok(!r.diagnostic.candidates.some(c=>c.evidence==='reviewed_composition'));});

import {assessCanonicalTransferJourneys} from '../lib/easyt/multimodal-transfer-resolution.ts';
test('batch evaluates each occurrence against its own travel date',async()=>{
 const {leg,template}=fixture(),later=structuredClone(leg);later.id='later-occurrence';
 template.components[0].evidence={...evidence,validFrom:'2026-12-01',validUntil:'2026-12-31'} as any;
 const result=await assessCanonicalTransferJourneys([leg,later],{provider:syntheticRoad(),reviewedJourneyTemplates:[template],reviewedJourneyContextByLeg:{[leg.id]:context,[later.id]:{...context,travelDate:'2027-01-01'}}} as any);
 assert.equal((result.legs[0].routeMetadata.multimodalResolution as any).reviewedJourneys[0].status,'complete');
 assert.equal((result.legs[1].routeMetadata.multimodalResolution as any).reviewedJourneys[0].status,'partial');
});
test('a moving connection needs movement allowance as well as its buffer',()=>{
 const {leg}=fixture(),paris=endpoint('Paris','France','2988507'),kyoto=endpoint('Kyoto','Japan','1857910');
 const connection=component('connection','connection','road',paris,kyoto,30);connection.timing.covers=['connection-buffer'];
 const t={id:'synthetic-invalid-access',from:leg.fromEndpoint!,to:leg.toEndpoint!,components:[component('first','service','flight',leg.fromEndpoint,paris,60),connection,component('last','service','flight',kyoto,leg.toEndpoint,60)]};
 assert.equal(composeReviewedJourney(leg,t as any,context).status,'partial');
});

test('a service timing must not include the separately counted connection allowance',async()=>{const r=await assess(t=>t.components[0].timing.covers.push('connection-buffer'));assert.equal((r.diagnostic as any).reviewedJourneys[0].status,'unqualified');});
