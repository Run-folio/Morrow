import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {createOpenWorldPlaceProvider} from '../lib/easyt/open-world-place.server.ts';
import {enrichPublicPlaceSearch,parsePlaceResearchResponse} from '../lib/easyt/public-place-research.server.ts';
const recorded=JSON.parse(readFileSync('notes/public-place-alias-acceptance-20261022.json','utf8'));

test('recorded four-call acceptance preserves exact independent identities and conservative Hirayu rejection',async()=>{
 assert.equal(recorded.dispatched,4);assert.equal(recorded.counterCalls,0);assert.equal(recorded.reservedMicroUsd,1000000);
 assert.ok(recorded.estimatedTokenCostUsd<.001);
 for(const row of recorded.results){
  assert.equal(row.response.status,'completed');
  const lookup=async(name:string,signal:AbortSignal)=>{
   let sourceFailed=false;
   const provider=createOpenWorldPlaceProvider({cache:new Map(),onSourceFailure:()=>{sourceFailed=true;},fetchImpl:async(input,init)=>{
    assert.equal(init?.signal?.aborted,false);const capture=recorded.providerCaptures.find((c:any)=>c.url===String(input));assert.ok(capture,'Missing real public response fixture '+String(input));return new Response(JSON.stringify(capture.body),{status:capture.status});
   }});
   return {candidates:await provider.lookup(name,{travelIntent:'route-stop',explicitCountryNames:[row.country],countryNames:[row.country]}),sourceFailed};
  };
  const result=await enrichPublicPlaceSearch({query:row.query,country:row.country,publicPlaceConfirmed:true,deterministicCandidates:[],sourceFailed:false,signal:new AbortController().signal},{research:async()=>row.response,lookup});
  assert.deepEqual(result.map(c=>c.providerId),row.verifiedCandidates.map((c:any)=>c.providerId));
  if(row.query==='Hirayu'){assert.deepEqual(parsePlaceResearchResponse(row.response),[{alternate_name:'平湯'}]);assert.deepEqual(result,[]);assert.ok(row.baseline.candidates.some((c:any)=>c.providerId==='photon:N:2481035449'));}
  if(row.query==='Fangjin mountain'){assert.equal(result[0]?.providerId,'photon:N:699700351');assert.equal(result[0]?.placeType,'natural_area');assert.equal(result[0]?.routability,'needs_base_selection');assert.deepEqual(result[0]?.parentCountries,['China']);}
  if(row.query==='Yunomine'){assert.equal(result[0]?.providerId,'photon:N:2822838506');assert.equal(result[0]?.routability,'direct_destination');assert.deepEqual(result[0]?.parentCountries,['Japan']);}
  if(row.query==='Springfield'){assert.deepEqual(result,[]);assert.equal(row.aliasStatus,'ambiguous');}
  let calls=0;assert.deepEqual(await enrichPublicPlaceSearch({query:row.query,country:row.country,publicPlaceConfirmed:true,deterministicCandidates:row.baseline.candidates,sourceFailed:false,signal:new AbortController().signal},{research:async()=>{calls++;return row.response;},lookup}),[]);assert.equal(calls,0);
 }
});
