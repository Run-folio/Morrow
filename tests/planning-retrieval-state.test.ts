import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import * as multimodal from '../lib/easyt/multimodal-transfer-resolution.ts';
import {RoadRoutingError,OpenRouteServiceRoadRoutingProvider,type RoadRoutingProvider} from '../lib/easyt/road-routing.ts';
import type {TripLeg} from '../lib/easyt/trip.ts';

// Pinned accepted reference endpoints from the frozen diagnostic controls.
// All provider responses below are injected; no network or credentials.
const original=JSON.parse(readFileSync(new URL('./fixtures/planning-assessment-controls.json',import.meta.url),'utf8')).japanLegs[0] as TripLeg;
const leg=()=>structuredClone(original);
const provider=(category:ConstructorParameters<typeof RoadRoutingError>[0]):RoadRoutingProvider=>({provider:'openrouteservice',async route(){throw new RoadRoutingError(category);}});

for(const [category,retrieval,reason,retryable] of [
 ['configuration','unavailable','configuration_unavailable',false],
 ['timeout','unavailable','timeout',true],
 ['no_route','completed','no_route',false],
 ['malformed','unavailable','malformed_response',true],
 ['unavailable','unavailable','provider_error',true],
] as const)test(`transport retains ${category} independently of unknown evidence`,async()=>{
 const input=leg(),before=structuredClone(input);
 const result=await multimodal.resolveCanonicalTransferJourney(input,{provider:provider(category)}) as any;
 assert.equal(result.leg.mode,'unknown');assert.deepEqual(input,before);
 assert.ok(result.assessment,'nonpersistent assessment is present');
 assert.equal(result.assessment.retrieval,retrieval);assert.equal(result.assessment.reason,reason);
 assert.equal(result.assessment.retryable,retryable);assert.equal(result.assessment.evidence,'insufficient');
 assert.deepEqual(result.assessment.diagnostics.attemptedSources,['local-knowledge','road-provider']);
 assert.equal(JSON.stringify(result.leg).includes('assessment'),false);
});
test('missing provider configuration does not claim a provider request',async()=>{
 const result=await multimodal.resolveCanonicalTransferJourney(leg()) as any;
 assert.equal(result.assessment?.reason,'configuration_unavailable');
 assert.deepEqual(result.assessment?.diagnostics.attemptedSources,['local-knowledge']);
});
test('unqualified geography blocks provider calls with a distinct nonretryable assessment',async()=>{
 const input=leg();delete input.toEndpoint!.geographicBinding;let calls=0;
 const result=await multimodal.resolveCanonicalTransferJourney(input,{provider:{provider:'openrouteservice',async route(){calls++;throw new Error('must not route');}}}) as any;
 assert.equal(calls,0);assert.equal(result.leg.mode,'unknown');
 assert.equal(result.assessment?.retrieval,'blocked');assert.equal(result.assessment?.evidence,'unqualified');
 assert.equal(result.assessment?.reason,'identity_required');assert.equal(result.assessment?.retryable,false);
 assert.deepEqual(result.assessment?.diagnostics.attemptedSources,[]);
});
test('batch assessments preserve every leg and isolate an unexpected per-leg failure',async()=>{
 const assess=(multimodal as any).assessCanonicalTransferJourneys;
 assert.equal(typeof assess,'function','additive batch assessment entrypoint exists');
 let calls=0;
 const routed:RoadRoutingProvider={provider:'openrouteservice',async route(){calls++;throw new RoadRoutingError('timeout');}};
 const rows=Array.from({length:9},(_,i)=>({...leg(),id:`batch-${i}`}));
 const result=await assess(rows,{provider:routed,maxLegs:2});
 assert.equal(result.legs.length,9);assert.equal(result.assessments.length,9);assert.equal(calls,2);
 assert.deepEqual(result.assessments.map((r:any)=>r.legId),rows.map(r=>r.id));
 assert.equal(result.assessments[0].state.reason,'timeout');
 assert.equal(result.assessments[2].state.retrieval,'not-attempted');assert.equal(result.assessments[2].state.reason,'batch_limit');
 assert.deepEqual(result.legs.slice(2),rows.slice(2));
 const knowledge={...({} as any),findTransfer(){throw new Error('private error including secrets must never escape');},forTransferResolution(){return {}}};
 const partial=await assess([rows[0],{...rows[1],routeMetadata:{source:'traveller-authored'},mode:'road',durationMinutes:60}],{knowledge});
 assert.equal(partial.legs.length,2);assert.equal(partial.assessments[0].state.reason,'provider_error');
 assert.equal(partial.assessments[1].state.retrieval,'not-attempted');assert.equal(JSON.stringify(partial).includes('secrets'),false);
});
test('road cache exposes successful hits and never caches transient failures',async()=>{
 let now=1_000,calls=0,fail=true;
 const route=leg(),a=route.fromEndpoint!.coordinates!,b=route.toEndpoint!.coordinates!;
 const ors=new OpenRouteServiceRoadRoutingProvider({apiBaseUrl:'https://api.heigit.org/openrouteservice/v2',apiKey:'synthetic-placeholder',providerVersion:'v2'},
  {cache:new Map(),now:()=>now,cacheTtlMs:100,request:async()=>{calls++;if(fail)return new Response('{}',{status:503});return Response.json({features:[{geometry:{type:'LineString',coordinates:[a,b]},properties:{summary:{distance:370000,duration:14400}}}]});}});
 const first=await multimodal.resolveCanonicalTransferJourney(leg(),{provider:ors}) as any;
 assert.equal(first.assessment?.reason,'provider_error');assert.equal(first.assessment?.diagnostics.cacheOutcome,'miss');
 fail=false;
 const second=await multimodal.resolveCanonicalTransferJourney(leg(),{provider:ors}) as any;
 const third=await multimodal.resolveCanonicalTransferJourney(leg(),{provider:ors}) as any;
 assert.equal(second.leg.mode,'road');assert.equal(third.leg.mode,'road');assert.equal(calls,2);
 assert.equal(second.assessment.evidence,'conditional');assert.equal(second.assessment.diagnostics.cacheOutcome,'miss');
 assert.equal(third.assessment.diagnostics.cacheOutcome,'hit');
 now+=101;await multimodal.resolveCanonicalTransferJourney(leg(),{provider:ors});assert.equal(calls,3);
 assert.equal(second.leg.provenance,'routing_engine');assert.ok(second.leg.roadEstimate?.attribution);
});
test('a provider no-route remains completed unknown and is not cached as a transient failure',async()=>{
 let calls=0;const cache=new Map();
 const ors=new OpenRouteServiceRoadRoutingProvider({apiBaseUrl:'https://api.heigit.org/openrouteservice/v2',apiKey:'synthetic-placeholder',providerVersion:'v2'},
  {cache,request:async()=>{calls++;return new Response('{}',{status:404});}});
 for(let i=0;i<2;i++) {
  const result=await multimodal.resolveCanonicalTransferJourney(leg(),{provider:ors});
  assert.equal(result.leg.mode,'unknown');assert.equal(result.assessment.retrieval,'completed');
  assert.equal(result.assessment.reason,'no_route');assert.equal(result.assessment.retryable,false);
  assert.equal(result.assessment.diagnostics?.cacheOutcome,'miss');
 }
 assert.equal(calls,2);assert.equal(cache.size,0);
});
test('coalesced requests keep independent assessment snapshots and original provider timestamps',async()=>{
 let release!:()=>void,calls=0;const waiting=new Promise<void>(resolve=>{release=resolve;});
 const input=leg(),a=input.fromEndpoint!.coordinates!,b=input.toEndpoint!.coordinates!;
 const ors=new OpenRouteServiceRoadRoutingProvider({apiBaseUrl:'https://api.heigit.org/openrouteservice/v2',apiKey:'synthetic-placeholder',providerVersion:'v2'},
  {cache:new Map(),now:()=>1_000,request:async()=>{calls++;await waiting;return Response.json({features:[{geometry:{type:'LineString',coordinates:[a,b]},properties:{summary:{distance:370000,duration:14400}}}]});}});
 const cold=multimodal.resolveCanonicalTransferJourney(input,{provider:ors});
 const concurrent=multimodal.resolveCanonicalTransferJourney({...leg(),id:'independent-scope'},{provider:ors});
 release();const [one,two]=await Promise.all([cold,concurrent]);
 assert.equal(calls,1);assert.equal(one.assessment.diagnostics?.cacheOutcome,'miss');
 assert.equal(two.assessment.diagnostics?.cacheOutcome,'coalesced');
 assert.notEqual(one.assessment,two.assessment);assert.equal(two.leg.id,'independent-scope');
 assert.equal(one.leg.roadEstimate?.checkedAt,'1970-01-01T00:00:01.000Z');
 assert.equal(two.leg.roadEstimate?.checkedAt,one.leg.roadEstimate?.checkedAt);
 assert.equal(JSON.stringify(input).includes('assessment'),false);
});
test('a partial ferry composition remains insufficient evidence despite its non-unknown mode',async()=>{
 const input=JSON.parse(readFileSync('tests/fixtures/planning-assessment-controls.json','utf8')).partialFerryInput;
 const result=await multimodal.resolveCanonicalTransferJourney(input);
 assert.equal(result.leg.mode,'mixed');assert.equal(result.outcome,'unresolved');
 assert.equal(result.assessment.evidence,'insufficient');
 assert.equal(result.leg.durationMinutes,null);
});
