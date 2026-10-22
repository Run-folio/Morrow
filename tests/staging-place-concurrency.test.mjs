import assert from 'node:assert/strict';import test from 'node:test';
import {runStagingPlaceConcurrency,reviewedQualificationFunctionBody} from '../scripts/staging-place-concurrency.mjs';
import {STAGING_DEPLOYMENT_TARGET,STAGING_METADATA_QUERY} from '../lib/easyt/staging-deployment-target.mjs';
const databaseUrl=`postgresql://fixture@${STAGING_DEPLOYMENT_TARGET.endpoint_host}/morrovia_staging?sslmode=require`;
const metadata={...STAGING_DEPLOYMENT_TARGET,connected_database:'morrovia_staging',verification_reference:'fixture-review',verified_at:'2026-10-01'};
const prerequisites={owns_schema:true,owns_function:true,invoker_function:true,expected_function_metadata:true,function_body:reviewedQualificationFunctionBody,function_settings:['search_path=pg_catalog, morrovia_place_research_qualification_20261022'],argument_names:['p_scope','p_reservation','p_policy_version','p_upper_micro_usd','p_review_reference','admitted','reservation_id','reserved_micro_usd','policy_version']};
test('harness requires opt-in and exact target before constructing clients',async()=>{
 let clients=0;const createClient=()=>{clients++;throw Error('must not connect');};
 await assert.rejects(runStagingPlaceConcurrency({databaseUrl,createClient}));
 await assert.rejects(runStagingPlaceConcurrency({databaseUrl:'postgresql://production.invalid/neondb',confirmed:true,createClient}));assert.equal(clients,0);
  await assert.rejects(runStagingPlaceConcurrency({databaseUrl:databaseUrl.replace('.c-4.','-pooler.c-4.'),confirmed:true,createClient}));assert.equal(clients,0);
});
test('harness observes blocked independent session and leaves only disabled isolated test state (mock)',async()=>{
 let next=0,release,cleanups=0;const sql=[];
 const createClient=()=>{const id=next++;return {connect:async()=>{},end:async()=>{},query:async(text,params)=>{
  sql.push(text);
  if(text===STAGING_METADATA_QUERY)return {rows:[metadata]};
  if(text==='select pg_backend_pid() as pid')return {rows:[{pid:900+id}]};
  if(text.includes('owns_schema'))return {rows:[prerequisites]};
  if(text.startsWith('select enabled'))return {rows:[{enabled:false}]};
  if(text.startsWith('select admitted'))return id===0?{rows:[{admitted:true}]}:new Promise(resolve=>{release=()=>resolve({rows:[{admitted:false}]});});
  if(text.includes('pg_blocking_pids')){assert.deepEqual(params,[900,901]);return {rows:[{blocked:true}]};}
  if(text==='commit'&&id===0)release();
  if(text.includes('select total_reserved'))return {rows:[{total_reserved_micro_usd:'250000',claim_count:1}]};
  if(text.startsWith('update ')){cleanups++;assert.match(text,/^update morrovia_place_research_qualification_20261022\./);}
  return {rows:[]};
 }};};
 assert.deepEqual(await runStagingPlaceConcurrency({databaseUrl,confirmed:true,createClient}),{passed:true,independentBackends:true,observedLockWait:true,admitted:1,denied:1,reservedMicroUsd:250000,paidCalls:0});
 assert.equal(cleanups,1);assert.ok(sql.filter(s=>/^(insert|update)/i.test(s)).every(s=>s.includes('morrovia_place_research_qualification_20261022.')));assert.ok(sql.every(s=>!s.includes('set_config')&&!s.includes('alter database')));
});
test('harness refuses old GUC-guarded objects before test policy mutation (mock)',async()=>{
 let next=0,writes=0;const createClient=()=>{const id=next++;return {connect:async()=>{},end:async()=>{},query:async text=>{
  if(/^(insert|update)/i.test(text))writes++;
  if(text===STAGING_METADATA_QUERY)return {rows:[metadata]};
  if(text.includes('pg_backend_pid'))return {rows:[{pid:900+id}]};
  if(text.includes('owns_schema'))return {rows:[{...prerequisites,function_body:'-- morrovia_deployment_metadata\nbegin perform arbitrary();end;'}]};
  return {rows:[]};
 }};};
 await assert.rejects(runStagingPlaceConcurrency({databaseUrl,confirmed:true,createClient}));assert.equal(writes,0);
});
