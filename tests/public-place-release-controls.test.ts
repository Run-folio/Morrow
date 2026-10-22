import assert from 'node:assert/strict';
import test from 'node:test';
import { publicPlaceResearchReady, runAdmittedPlaceResearch, defaultPlaceResearchControls, PLACE_RESEARCH_RESERVATION_MICRO_USD } from '../lib/easyt/public-place-research-controls.server.ts';
type Controls=import("../lib/easyt/public-place-research-controls.server.ts").PlaceResearchControls;
type Budget=import("../lib/easyt/public-place-research-controls.server.ts").PlaceResearchBudget;
const ready=():Controls & {budget:Budget}=>({activationRequested:true,privacyReviewed:true,noticeReviewed:true,abuseReviewed:true,spendReviewed:true,qualifiedUntil:Date.now()+60_000,
 budget:{kind:'durable-reservation-v1' as const,reserve:async()=>({admitted:true as const,reservationId:'fixture-1',reservedMicroUsd:PLACE_RESEARCH_RESERVATION_MICRO_USD,policyVersion:'luna-place-v1'})}});
test('production default is disabled even with activation requested and no durable adapter',()=>{
 assert.equal(publicPlaceResearchReady(defaultPlaceResearchControls()),false);
 assert.equal(publicPlaceResearchReady({...defaultPlaceResearchControls(),activationRequested:true}),false);
 for(const field of ['activationRequested','privacyReviewed','noticeReviewed','abuseReviewed','spendReviewed'] as const)assert.equal(publicPlaceResearchReady({...ready(),[field]:false}),false,field);
 assert.equal(publicPlaceResearchReady({...ready(),budget:undefined}),false);assert.equal(publicPlaceResearchReady({...ready(),qualifiedUntil:0}),false);
});
test('no upstream without a successful durable worst-case reservation; no retries',async()=>{
 let calls=0,claims=0;
 for(const budget of [undefined,{kind:'durable-reservation-v1' as const,reserve:async()=>{claims++;return {admitted:false as const};}},{kind:'durable-reservation-v1' as const,reserve:async()=>{claims++;throw new Error('unavailable');}},{kind:'durable-reservation-v1' as const,reserve:async()=>{claims++;return {admitted:true as const,reservationId:'x',reservedMicroUsd:1,policyVersion:'luna-place-v1'};}}]){
  await assert.rejects(runAdmittedPlaceResearch({...ready(),budget},new AbortController().signal,async()=>{calls++;}));
 }
 assert.equal(calls,0);assert.equal(claims,3);
});
test('exact approved reservation precedes upstream and carries no query/user data',async()=>{
 const events:string[]=[];let input:unknown;
 const controls=ready();controls.budget.reserve=async(value:any)=>{input=value;events.push('reserve');return {admitted:true,reservationId:'fixture-1',reservedMicroUsd:PLACE_RESEARCH_RESERVATION_MICRO_USD,policyVersion:'luna-place-v1'};};
 assert.equal(await runAdmittedPlaceResearch(controls,new AbortController().signal,async()=>{events.push('upstream');return 'ok';}),'ok');
 assert.deepEqual(events,['reserve','upstream']);assert.deepEqual(input,{operation:'public-place-research',policyVersion:'luna-place-v1',maximumMicroUsd:250000});
});
test('cancelled request makes no claim; failed upstream is not retried or refunded',async()=>{
 let claims=0,calls=0;const controls=ready();controls.budget.reserve=async()=>{claims++;return {admitted:true,reservationId:'fixture-1',reservedMicroUsd:PLACE_RESEARCH_RESERVATION_MICRO_USD,policyVersion:'luna-place-v1'};};
 const controller=new AbortController();controller.abort();await assert.rejects(runAdmittedPlaceResearch(controls,controller.signal,async()=>{calls++;}));assert.equal(claims,0);
 await assert.rejects(runAdmittedPlaceResearch(controls,new AbortController().signal,async()=>{calls++;throw new Error('upstream uncertain');}));assert.equal(claims,1);assert.equal(calls,1);
});

test('late durable admission after cancellation cannot dispatch upstream',async()=>{
 const control=new AbortController();let complete:((value:any)=>void)|undefined,calls=0;
 const controls=ready();controls.budget.reserve=async()=>new Promise(resolve=>{complete=resolve;});
 const pending=runAdmittedPlaceResearch(controls,control.signal,async()=>{calls++;});control.abort();await assert.rejects(pending);
 complete?.({admitted:true,reservationId:'late',reservedMicroUsd:PLACE_RESEARCH_RESERVATION_MICRO_USD,policyVersion:'luna-place-v1'});await Promise.resolve();assert.equal(calls,0);
});

test('only bounded, explicit staging review configuration can construct the durable adapter; production stays off',()=>{
 const origin='https://staging.example.org';
 const review={origin,scope:'morrovia:place-research:staging',reviewReference:'staging-review-fixture',qualifiedUntil:new Date(Date.now()+3600000).toISOString(),privacyReviewed:true,noticeVersion:'public-place-alias-v3',abuseReviewed:true,spendReviewed:true};
 const env={MORROVIA_ENVIRONMENT:'staging',NEXT_PUBLIC_APP_URL:origin,DATABASE_URL:'postgresql://fixture@ep-fancy-credit-ar0ithc8.c-4.us-west-2.aws.neon.tech/morrovia_staging?sslmode=require',MORROVIA_PLACE_RESEARCH_ENABLED:'true',MORROVIA_PLACE_RESEARCH_REVIEW:JSON.stringify(review)};
 assert.equal(publicPlaceResearchReady(defaultPlaceResearchControls(env)),true);
 for(const change of [{MORROVIA_ENVIRONMENT:'production'},{MORROVIA_PLACE_RESEARCH_REVIEW:'{}'},{NEXT_PUBLIC_APP_URL:'https://morrovia.com'},{MORROVIA_PLACE_RESEARCH_ENABLED:'false'}, {MORROVIA_PLACE_RESEARCH_REVIEW:JSON.stringify({...review,qualifiedUntil:'2000-01-01'})}])assert.equal(publicPlaceResearchReady(defaultPlaceResearchControls({...env,...change})),false);
});

test('review flags cannot qualify a missing, production, wrong-database or routing-overridden connection',()=>{
 const origin='https://staging.example.org';
 const review={origin,scope:'morrovia:place-research:staging',reviewReference:'staging-review-fixture',qualifiedUntil:new Date(Date.now()+3600000).toISOString(),privacyReviewed:true,noticeVersion:'public-place-alias-v3',abuseReviewed:true,spendReviewed:true};
 const env={MORROVIA_ENVIRONMENT:'staging',NEXT_PUBLIC_APP_URL:origin,MORROVIA_PLACE_RESEARCH_ENABLED:'true',MORROVIA_PLACE_RESEARCH_REVIEW:JSON.stringify(review)};
 for(const DATABASE_URL of [undefined,'postgresql://fixture@ep-silent-darkness-ay7ysvm1-pooler.c-5.us-east-2.aws.neon.tech/neondb','postgresql://fixture@ep-fancy-credit-ar0ithc8.c-4.us-west-2.aws.neon.tech/neondb','postgresql://fixture@ep-fancy-credit-ar0ithc8.c-4.us-west-2.aws.neon.tech/morrovia_staging?host=production.invalid']){
  assert.equal(publicPlaceResearchReady(defaultPlaceResearchControls({...env,DATABASE_URL})),false);
 }
});
