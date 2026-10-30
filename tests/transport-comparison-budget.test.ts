import assert from 'node:assert/strict';
import test from 'node:test';
import {OpenRouteServiceRoadRoutingProvider,type RoadRoutingProvider} from '../lib/easyt/road-routing.ts';

const config={apiBaseUrl:'https://api.heigit.org/openrouteservice/v2' as const,apiKey:'synthetic-test-only',providerVersion:'v2' as const};
const input={origin:{canonicalIdentity:'a',coordinates:[0,51] as [number,number]},destination:{canonicalIdentity:'b',coordinates:[1,52] as [number,number]}};

test('a comparison-owned provider aborts its request without sharing another consumer in-flight request',async()=>{
 const owner=new AbortController();let signals:AbortSignal[]=[];
 const request:typeof fetch=async(_url,init)=>{signals.push(init!.signal!);return await new Promise((_,reject)=>init!.signal!.addEventListener('abort',()=>reject(init!.signal!.reason),{once:true}));};
 const otherOwner=new AbortController();
 const a=new OpenRouteServiceRoadRoutingProvider(config,{request,operationSignal:owner.signal} as any);
 const b=new OpenRouteServiceRoadRoutingProvider(config,{request,operationSignal:otherOwner.signal} as any);
 const first=a.route(input).catch(e=>e),second=b.route(input).catch(e=>e);
 await new Promise(r=>setTimeout(r,0));
 try {assert.equal(signals.length,2,'separate explicit comparisons must not share cancellable in-flight work');
 owner.abort();assert.equal(signals[0].aborted,true);assert.equal(signals[1].aborted,false);
 } finally {owner.abort();otherOwner.abort();}
 await Promise.all([first,second]);
});

test('operation deadline settles non-cooperative work and rejects further downstream requests',async()=>{
 const module=await import('../lib/easyt/transport-comparison-operation.ts').catch(()=>null);
 assert.ok(module,'bounded explicit comparison operation is required');
 let calls=0;const provider:RoadRoutingProvider={provider:'openrouteservice',async route(){calls++;return await new Promise(()=>{});}};
 const {comparisonLeg}=await import('./fixtures/transport-comparison.ts');
 await assert.rejects(module.runTransportComparison(comparisonLeg(),{provider,timeoutMs:15}),e=>(e as Error).name==='TimeoutError');
 assert.equal(calls,1);
});
