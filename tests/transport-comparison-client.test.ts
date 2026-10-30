import assert from 'node:assert/strict';import test from 'node:test';
import {japanTrip} from './fixtures/transport-choice.ts';
import {compareCanonicalTransferJourney} from '../lib/easyt/multimodal-transfer-resolution.ts';
import {syntheticRoad} from './fixtures/transport-comparison.ts';

test('explicit client sends one immutable single-leg comparison and validates returned endpoint evidence',async t=>{
 const api=await import('../lib/easyt/transport-comparison-client.ts').catch(()=>null);assert.ok(api);
 const trip=japanTrip(),before=structuredClone(trip);let calls=0;
 t.mock.method(globalThis,'fetch',async(url:RequestInfo|URL,init?:RequestInit)=>{calls++;assert.equal(url,'/api/journey-transfer-resolution');const body=JSON.parse(init!.body as string);assert.equal(body.operation,'compare');assert.equal(body.legs.length,1);return Response.json(await compareCanonicalTransferJourney(body.legs[0],{provider:syntheticRoad()}));});
 const result=await api.requestTransportComparison(trip,trip.legs[0].id,new AbortController().signal);
 assert.ok(result.candidates.length);assert.equal(calls,1);assert.deepEqual(trip,before);
});

test('HTTP failure is terminal without retry and malformed evidence is rejected',async t=>{
 const api=await import('../lib/easyt/transport-comparison-client.ts').catch(()=>null);assert.ok(api);const trip=japanTrip();let calls=0;
 t.mock.method(globalThis,'fetch',async()=>{calls++;return new Response('',{status:503});});
 await assert.rejects(api.requestTransportComparison(trip,trip.legs[0].id,new AbortController().signal));assert.equal(calls,1);
 t.mock.method(globalThis,'fetch',async()=>Response.json({leg:trip.legs[0],diagnostic:{version:1,candidates:[]},assessment:{retrieval:'fiction'}}));
 await assert.rejects(api.requestTransportComparison(trip,trip.legs[0].id,new AbortController().signal));
});
