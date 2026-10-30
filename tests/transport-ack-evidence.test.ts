import assert from 'node:assert/strict';
import test from 'node:test';
import type {EasyTTrip} from '../lib/easyt/trip.ts';
import {japanTrip} from './fixtures/transport-choice.ts';
import {canonicalTripForOwner,tripBuildDocumentsCanonicalEquivalent as equivalent} from '../lib/easyt/trip-promotion.ts';
import {selectTripLegTransportChoice,supportedTransportChoicesForLeg,effectiveTripLeg} from '../lib/easyt/transport-mode-choice.ts';
import {markTransportLegBooked} from '../lib/easyt/transport-booking.ts';
import {prepareTripDocumentForWrite} from '../lib/easyt/trip-document.ts';
import {resolveTripTransferJourneys} from '../lib/easyt/multimodal-transfer-resolution.ts';
import {acknowledgeTripBuildSaveInStorage,saveTripRecoveryToStorage,loadTripRecoveryFromStorage,loadLocalTripFromStorage,saveTripRecoveryToEasyT} from '../lib/easyt/storage.ts';
const owner='ack-safeguard-owner';
function fixture(versioned=false,booked=false) {
 let t=japanTrip();
 if(versioned){const c=(t.legs[0].routeMetadata.multimodalResolution as any).candidates[1];c.id='road:routed:revision-v1:synthetic-content';c.totalDurationMinutes=480;c.segments[0].durationMinutes=480;}
 const c=supportedTransportChoicesForLeg(t,t.legs[0]).find(c=>c.mode==='road')!;
 t=selectTripLegTransportChoice(t,t.legs[0].id,c.identity);
 return booked?markTransportLegBooked(t,t.legs[0].id,{confirmation:'SYNTHETIC-ACK',note:'Retain booking'}):t;
}
const reply=(t:EasyTTrip)=>canonicalTripForOwner(owner,t,'2026-10-28T17:35:00.000Z');
function changed(t:EasyTTrip,kind:'drop'|'rewrite'){
 const out=structuredClone(t),d=out.legs[0].routeMetadata.multimodalResolution as any;
 if(kind==='drop')d.candidates=d.candidates.filter((c:any)=>c.summaryMode!=='road');
 else{const c=d.candidates.find((c:any)=>c.summaryMode==='road');c.totalDurationMinutes=600;c.segments[0].durationMinutes=600;}
 return out;
}
for(const versioned of[false,true])for(const booked of[false,true])for(const change of['drop','rewrite']as const)
 test(`ACK refuses ${change} of ${versioned?'revision':'legacy'} selected snapshot (${booked?'booked':'unbooked'})`,()=>{
 const before=fixture(versioned,booked),after=changed(reply(before),change);
 assert.deepEqual(after.brief,reply(before).brief,'tuple/booking unchanged; support is the mutation');
 assert.equal(effectiveTripLeg(before,before.legs[0]).durationMinutes,versioned?480:390);
 assert.equal(effectiveTripLeg(after,after.legs[0]).durationMinutes,change==='drop'?135:600);
 assert.equal(equivalent(before,after,owner),false);
});
for(const binding of['typed','leg-id','transport-id','imported-id']as const)test(`booked source without selection (${binding}) stays exact`,()=>{
 const t=fixture(false,true);delete t.brief.decisionSelections!.transportByLeg![t.legs[0].id];const b=t.brief.bookings![0];
 if(binding!=='typed'){delete b.transportLegBinding;b.id=binding==='leg-id'?t.legs[0].id:binding==='transport-id'?`transport-${t.legs[0].id}`:'imported-ticket';if(binding==='imported-id')t.legs[0].routeMetadata.importedBookingId=b.id;}
 const after=reply(t);after.legs[0].durationMinutes=600;assert.equal(equivalent(t,after,owner),false);assert.equal(equivalent(t,reply(t),owner),true);
});
for(const shape of['legacy-string','endpoint-rebound','unsupported','malformed-null']as const)test(`retained ${shape} cannot authorize replacement`,()=>{
 const t=fixture(),leg=t.legs[0],s=t.brief.decisionSelections!.transportByLeg!;
 if(shape==='legacy-string')s[leg.id]='road:routed';
 if(shape==='endpoint-rebound'){s['old-leg-id']=s[leg.id];delete s[leg.id];}
 if(shape==='unsupported')s[leg.id]={...(s[leg.id]as any),candidateId:'missing'};
 if(shape==='malformed-null')(s as any)[leg.id]=null;
 assert.equal(equivalent(t,changed(reply(t),'drop'),owner),false);
 assert.equal(equivalent(t,reply(t),owner),true,'unchanged invalid retained payload must not become a permanent conflict');
});
test('unselected enrichment/terminal no-evidence allowed; authored metadata change refused',()=>{
 const t=japanTrip(),after=reply(t);after.legs[0].durationMinutes=180;(after.legs[0].routeMetadata.multimodalResolution as any).candidates=[];
 assert.equal(equivalent(t,after,owner),true);after.legs[0].mode='unknown';after.legs[0].durationMinutes=null;assert.equal(equivalent(t,after,owner),true);
 after.legs[0].routeMetadata.travellerNote='Changed authored metadata';assert.equal(equivalent(t,after,owner),false);
});
test('unrelated unselected leg may enrich while selected leg stays exact',()=>{
 const t=fixture();t.legs.push({...structuredClone(t.legs[0]),id:'unselected'});t.brief.decisionSelections!.transportByLeg![t.legs[0].id]='road:routed';
 const after=reply(t);after.legs[1].durationMinutes=180;(after.legs[1].routeMetadata.multimodalResolution as any).candidates=[];assert.equal(equivalent(t,after,owner),true);
});
test('protected snapshots allow canonical identity/revision and JSON key ordering',()=>{
 const before=fixture(true,true),after=reply(before);
 function reorder(v:any):any{return Array.isArray(v)?v.map(reorder):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).reverse().map(([k,c])=>[k,reorder(c)])):v;}
 assert.equal(equivalent(before,reorder(after),owner),true);const original=JSON.stringify(before);assert.equal(equivalent(before,after,owner),true);assert.equal(JSON.stringify(before),original);
 (after.legs[0].routeMetadata.multimodalResolution as any).rejected=['Changed diagnostic'];assert.equal(equivalent(before,after,owner),false,'entire protected leg is exact; normal resolver skips it');
});
class Storage {values=new Map<string,string>();get length(){return this.values.size}key(i:number){return[...this.values.keys()][i]??null}getItem(k:string){return this.values.get(k)??null}setItem(k:string,v:string){this.values.set(k,v)}removeItem(k:string){this.values.delete(k)}}
for(const promotion of[false,true])test(`${promotion?'guest promotion':'account update'} negative ACK retains recovery; exact ACK cold reopen succeeds`,async()=>{
 const storage=new Storage(),reviewed=prepareTripDocumentForWrite(promotion?fixture(true,true):reply(fixture(true,true)));
 const saved=saveTripRecoveryToStorage(storage,reviewed,{ownerId:owner,writeId:'safeguard'});assert.ok(saved.stored);const prior=JSON.stringify([...storage.values]);
 assert.equal(acknowledgeTripBuildSaveInStorage(storage,reviewed,changed(reply(reviewed),'drop'),saved.handle!).outcome,'invalid-canonical');
 assert.equal(JSON.stringify([...storage.values]),prior);assert.ok(loadTripRecoveryFromStorage(storage,reviewed.id,owner));let calls=0;
 const request=(async(_url:any,init:any)=>{calls++;assert.equal(new Headers(init.headers).get('x-morrovia-expected-owner'),owner);return new Response(JSON.stringify({trip:reply(JSON.parse(init.body)),outcome:'promoted'}),{status:200,headers:{'content-type':'application/json'}});})as typeof fetch;
 const canonical=await saveTripRecoveryToEasyT(reviewed,saved.handle!,request);assert.equal(calls,promotion?2:1);
 assert.equal(acknowledgeTripBuildSaveInStorage(storage,reviewed,canonical,saved.handle!).outcome,'acknowledged');assert.equal(loadTripRecoveryFromStorage(storage,reviewed.id,owner),null);
 const cold=loadLocalTripFromStorage(storage,reviewed.id,owner)!;assert.equal(effectiveTripLeg(cold,cold.legs[0]).durationMinutes,480);assert.deepEqual(cold.brief.bookings,canonical.brief.bookings);
});
test('actual repository routing preserves selected/booked legs without provider dispatch',async()=>{
 let calls=0;const provider={provider:'openrouteservice',async route(){calls++;throw Error('Unexpected provider')}};
 for(const booked of[false,true]){const t=reply(fixture(true,booked)),normalized=await resolveTripTransferJourneys(structuredClone(t),{provider}as any);assert.deepEqual(normalized,t);assert.equal(equivalent(t,normalized,owner),true);}assert.equal(calls,0);
});
for(const change of['drop','rewrite']as const)test(`HTTP response and idempotent conflict cannot ACK ${change}`,async()=>{
 const reviewed=reply(fixture(true,true)),storage=new Storage(),saved=saveTripRecoveryToStorage(storage,reviewed,{ownerId:owner,writeId:'http-negative'});assert.ok(saved.stored);
 const bad=changed(reply(reviewed),change),before=JSON.stringify([...storage.values]);let requests=0;
 const request=(async()=>{requests++;return new Response(JSON.stringify({trip:bad}),{status:200,headers:{'content-type':'application/json'}})})as typeof fetch;
 const canonical=await saveTripRecoveryToEasyT(reviewed,saved.handle!,request);
 assert.equal(acknowledgeTripBuildSaveInStorage(storage,reviewed,canonical,saved.handle!).outcome,'invalid-canonical');assert.equal(requests,1);assert.equal(JSON.stringify([...storage.values]),before);
 await assert.rejects(()=>saveTripRecoveryToEasyT(reviewed,saved.handle!,(async()=>new Response(JSON.stringify({trip:bad,conflictReason:'cloud-newer',error:'Changed cloud trip'}),{status:409,headers:{'content-type':'application/json'}}))as typeof fetch),/Changed cloud trip/);
 assert.equal(JSON.stringify([...storage.values]),before,'conflict response cannot retire or rewrite recovery');
});
for(const malformed of[[null],{unexpected:'retained booking shape'}])test(`malformed retained bookings remain exact without throwing (${Array.isArray(malformed)?'element':'collection'})`,()=>{
 const t=japanTrip();(t.brief as any).bookings=malformed;
 assert.equal(equivalent(t,reply(t),owner),true,'unchanged readable retained fields must not create an ACK crash');
 const after=reply(t);after.legs[0].durationMinutes=600;assert.equal(equivalent(t,after,owner),false,'uncertain booking support cannot authorize replacing a snapshot');
});
