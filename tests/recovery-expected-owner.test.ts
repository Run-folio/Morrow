import assert from 'node:assert/strict';
import test from 'node:test';
import {homeRecoveryFixture} from './helpers/home-recovery-fixture.ts';
import {saveTripRecoveryToEasyT} from '../lib/easyt/storage.ts';
import {canonicalTripForOwner} from '../lib/easyt/trip-promotion.ts';

const fixture=()=>{const {trip}=homeRecoveryFixture('owner-a');return{trip:{...trip,ownerId:null,status:'planned' as const},handle:{ownerId:'owner-a',tripId:trip.id,writeId:'verified-local'}};};
test('explicit owner-scoped save pins both promotion POST and planned PUT to its recovery owner',async()=>{
 const f=fixture(),calls:string[]=[];
 const saved=await saveTripRecoveryToEasyT(f.trip,f.handle,async(_url,init)=>{assert.equal(new Headers(init?.headers).get('x-morrovia-expected-owner'),'owner-a');assert.equal(new Headers(init?.headers).get('content-type'),'application/json');calls.push(init!.method!);const submitted=JSON.parse(init!.body as string),trip=canonicalTripForOwner('owner-a',submitted);return Response.json(init?.method==='POST'?{trip,outcome:'promoted'}:{trip});});
 assert.deepEqual(calls,['POST','PUT']);assert.equal(saved.ownerId,'owner-a');
});
test('foreign promotion response is rejected before any follow-up PUT',async()=>{
 const f=fixture();let calls=0;await assert.rejects(saveTripRecoveryToEasyT(f.trip,f.handle,async(_url,init)=>{calls++;return Response.json({trip:canonicalTripForOwner('owner-b',JSON.parse(init!.body as string)),outcome:'promoted'});}),/owner|ownership|canonical|promotion/i);assert.equal(calls,1);
});
test('account rotation between promotion and planned update is rejected by the paired expected-owner contract',async()=>{
 const f=fixture();let owner='owner-a',writes=0;await assert.rejects(saveTripRecoveryToEasyT(f.trip,f.handle,async(_url,init)=>{const expected=new Headers(init?.headers).get('x-morrovia-expected-owner');if(expected!==owner)return Response.json({error:'Account changed. Sign in again.',category:'auth'},{status:403});writes++;const trip=canonicalTripForOwner(owner,JSON.parse(init!.body as string));owner='owner-b';return Response.json({trip,outcome:'promoted'});}),/account|sign in|auth/i);assert.equal(writes,1);
});
