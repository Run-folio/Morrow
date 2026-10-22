import assert from 'node:assert/strict';import test from 'node:test';
import {createDurablePlaceResearchBudget,createReviewedPlaceMappingReader} from '../lib/easyt/public-place-durable.server.ts';
import {placeMappingKey} from '../lib/easyt/reviewed-place-mapping-cache.ts';
const scope='morrovia:place-research:staging';const signal=()=>new AbortController().signal;
const receipt={admitted:true,reservation_id:'11111111-1111-4111-8111-111111111111',reserved_micro_usd:250000,policy_version:'luna-place-v1'};
test('durable budget uses one parameterized atomic claim and validates receipt, never logs query data',async()=>{
 const calls:any[]=[];const budget=createDurablePlaceResearchBudget({scope,reviewReference:'review-fixture'},{query:async(text,params,s)=>{calls.push({text,params,s});return [receipt];},reservationId:()=>receipt.reservation_id});
 const result=await budget.reserve({operation:'public-place-research',policyVersion:'luna-place-v1',maximumMicroUsd:250000},signal());assert.equal(result.admitted,true);assert.equal(calls.length,1);assert.match(calls[0].text,/morrovia_place_research_claim/);assert.deepEqual(calls[0].params,[scope,receipt.reservation_id,'luna-place-v1',250000,'review-fixture']);assert.ok(calls[0].s instanceof AbortSignal);
});
test('claim denial, malformed/mismatched receipts and database failures never grant admission',async()=>{
 for(const rows of [[],[{admitted:false}],[{...receipt,policy_version:'other'}],[{...receipt,reservation_id:'other'}],[{...receipt,reserved_micro_usd:1}]]){
 const budget=createDurablePlaceResearchBudget({scope,reviewReference:'review-fixture'},{query:async()=>rows,reservationId:()=>receipt.reservation_id});assert.deepEqual(await budget.reserve({operation:'public-place-research',policyVersion:'luna-place-v1',maximumMicroUsd:250000},signal()),{admitted:false});}
 const budget=createDurablePlaceResearchBudget({scope,reviewReference:'review-fixture'},{query:async()=>{throw new Error('db offline');}});await assert.rejects(budget.reserve({operation:'public-place-research',policyVersion:'luna-place-v1',maximumMicroUsd:250000},signal()));
});
const key=placeMappingKey('Yunomine hot spring village','Japan');const row={normalized_query:key.normalizedQuery,country_context:'JP',intent:'route-stop',verification_version:'public-place-v1',status:'reviewed',alternate_name:'Yunomine Onsen',provider_id:'photon:N:2822838506',provider_key:'place',provider_kind:'locality',place_type:'town',country_code:'JP',source_urls:['https://www.tb-kumano.jp/en/places/yunomine/'],reviewed_at:new Date(Date.now()-1000).toISOString(),expires_at:new Date(Date.now()+3600000).toISOString()};
test('cache reader is exact-key read-only and rejects expired, wrong-context or unreviewed rows',async()=>{
 const statements:string[]=[];const reader=createReviewedPlaceMappingReader({query:async(text)=>{statements.push(text);return [row,{...row,provider_id:'photon:N:999'}];}});
 const results=await reader.read(key,signal());assert.equal(results.length,2);assert.deepEqual(results.map(r=>r.providerId),['photon:N:2822838506','photon:N:999']);assert.match(statements[0]!,/^select /i);assert.doesNotMatch(statements[0]!,/insert|update|delete/i);assert.match(statements[0]!,/limit 9/);assert.doesNotMatch(statements[0]!,/status='reviewed'|expires_at>/);
});
test('cache preserves native keys, rejects private shape, bad evidence and overflow',async()=>{
 assert.equal(placeMappingKey('湯の峰温泉','Japan').normalizedQuery,'湯の峰温泉');
 let calls=0;const reader=createReviewedPlaceMappingReader({query:async()=>{calls++;return Array.from({length:9},()=>row);}});await assert.rejects(reader.read(key,signal()));
 assert.throws(()=>placeMappingKey('my private home address','Japan'));const bad=createReviewedPlaceMappingReader({query:async()=>[{...row,source_urls:['https://localhost/private']} ]});await assert.rejects(bad.read(key,signal()));
});

test('expired and revoked exact-key mappings are blocked, not converted to an AI-eligible miss',async()=>{
 for(const change of [{expires_at:'2000-01-01T00:00:00Z'},{status:'revoked'}]){
  const reader=createReviewedPlaceMappingReader({query:async()=>[{...row,...change}]});await assert.rejects(reader.read(key,signal()),/Reviewed mapping unavailable/);
 }
});
