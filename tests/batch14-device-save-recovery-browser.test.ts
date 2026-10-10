import assert from 'node:assert/strict';
import test from 'node:test';
import {renderBuilder} from './helpers/builder-render.ts';
import {canonicalRouteFixture} from './fixtures/batch14-route-documents.ts';
import {canonicalTripForOwner} from '../lib/easyt/trip-promotion.ts';
import {requireReadableTripDocument} from '../lib/easyt/trip-document.ts';
const enabled=process.env.MORROVIA_DEVICE_SAVE_BROWSER_TESTS==='1';

test('discard confirmation remains bound to the reviewed write when a different device edit arrives',{skip:!enabled,timeout:30000},async()=>{
 const cloud=fixture(),local=structuredClone(cloud);local.travellers=3;const writes:any[]=[];
 const view=await renderBuilder({path:'/journey/'+cloud.id+'/itinerary',ownerId:'owner-a',initialTrip:local,shellCanonicalTrip:cloud,accountRequest:({method,trip})=>{if(method!=='GET')writes.push(trip);return{status:200,body:{trip:cloud}};}});
 try{
  await view.page.getByRole('button',{name:'Discard device copy',exact:true}).click();const dialog=view.page.getByRole('dialog');await dialog.waitFor();
  await view.page.evaluate(({cloud}: {cloud: ReturnType<typeof fixture>})=>{const trip=structuredClone(cloud);trip.travellers=4;const key='easyt:trip-recovery:v2:owner-owner-a:'+cloud.id+':other-device-write';const value=JSON.stringify({version:2,ownerId:'owner-a',tripId:cloud.id,trip,state:'pending',writeId:'other-device-write',savedAt:'2026-10-10T20:00:00Z'});localStorage.setItem(key,value);window.dispatchEvent(new StorageEvent('storage',{key,newValue:value}));},{cloud});await view.page.waitForTimeout(50);
  await dialog.getByRole('button',{name:'Discard device edits',exact:true}).click();await dialog.waitFor({state:'hidden'});
  const retained=await view.page.evaluate((id: string)=>Object.keys(localStorage).filter(k=>k.startsWith('easyt:trip-recovery:')&&k.includes(id)).map(k=>JSON.parse(localStorage.getItem(k)!)),cloud.id);
  assert(retained.some((record:any)=>record.writeId==='other-device-write'&&record.trip.travellers===4),'The unreviewed newer recovery must remain protected');
  await assertRecoveryBlocksEdit(view.page,cloud.id,writes);assert.deepEqual(view.errors,[]);
 }finally{await view.close();}
});

const fixture=()=>requireReadableTripDocument(canonicalTripForOwner('owner-a',canonicalRouteFixture()));
async function add(page:any,label:string){await page.getByRole('button',{name:'Add activity',exact:true}).click();const dialog=page.getByRole('dialog');await dialog.getByLabel('Add your own',{exact:true}).fill(label);await dialog.getByRole('button',{name:'Add to Morning',exact:true}).click();return dialog;}
async function assertRecoveryBlocksEdit(page:any,tripId:string,writes:unknown[]){
 const read=()=>page.evaluate((id:string)=>Object.keys(localStorage).filter(k=>k.startsWith('easyt:trip-recovery:')&&k.includes(id)).sort().map(k=>[k,localStorage.getItem(k)]),tripId);
 const before=await read();const composer=await add(page,'Blocked while recovery remains');
 await composer.getByText('This change could not be stored safely.',{exact:true}).waitFor();
 assert.equal(writes.length,0,'An unresolved separate copy must keep account mutations blocked');
 assert.deepEqual(await read(),before,'A rejected edit must leave existing device records byte-for-byte intact');
 await composer.getByRole('button',{name:'Close Add panel',exact:true}).click();await composer.waitFor({state:'hidden'});
}
test('session hydration keeps an owned save pending without presenting it as separate device recovery',{skip:!enabled,timeout:30000},async()=>{
 let cloud=fixture(),release!:()=>void;const gate=new Promise<void>(r=>release=r),writes:any[]=[];
 const view=await renderBuilder({path:'/journey/'+cloud.id+'/itinerary',shellCanonicalTrip:cloud,seedRecovery:false,accountRequest:async({method,trip})=>{if(method==='GET')return{status:200,body:{trip:cloud}};writes.push(trip);await gate;cloud=requireReadableTripDocument({...trip as any,updatedAt:'2026-10-10T20:00:00.000Z'});return{status:200,body:{trip:cloud}};}});
 try{
  await (await add(view.page,'Hydration edit')).waitFor({state:'hidden'});
  assert.equal(await view.page.getByRole('link',{name:'Open device copy',exact:true}).count(),0,'The mounted device edit is active, not a separate conflicting copy');
  await view.page.evaluate(()=>{(window as any).__BUILDER_TEST_OWNER__='owner-a';window.dispatchEvent(new Event('builder-test-owner'));});
  await view.page.getByText('Saving to your account…',{exact:true}).waitFor();await view.page.waitForTimeout(100);
  assert.equal(writes.length,1);assert.equal(await view.page.getByRole('link',{name:'Open device copy',exact:true}).count(),0);
  release();await view.page.getByText('Saved to your account',{exact:true}).waitFor();assert.deepEqual(view.errors,[]);
 }finally{release();await view.close();}
});
test('a separate recovery opens Builder and explicit discard unlocks the current cloud editor without reloading',{skip:!enabled,timeout:30000},async()=>{
 let cloud=fixture();const local=structuredClone(cloud);local.travellers=3;const writes:any[]=[];
 const view=await renderBuilder({path:'/journey/'+cloud.id+'/itinerary',ownerId:'owner-a',initialTrip:local,shellCanonicalTrip:cloud,accountRequest:({method,trip})=>{if(method==='GET')return{status:200,body:{trip:cloud}};writes.push(trip);cloud=requireReadableTripDocument({...trip as any,updatedAt:'2026-10-10T20:00:00.000Z'});return{status:200,body:{trip:cloud}};}});
 try{
  const open=view.page.getByRole('link',{name:'Open device copy',exact:true});await open.waitFor();assert.equal(await open.getAttribute('href'),'/journey/new?trip='+cloud.id+'&recover=1');
  await assertRecoveryBlocksEdit(view.page,cloud.id,writes);
  await view.page.getByRole('button',{name:'Discard device copy',exact:true}).click();const confirm=view.page.getByRole('dialog');await confirm.getByRole('button',{name:'Discard device edits',exact:true}).click();await confirm.waitFor({state:'hidden'});await open.waitFor({state:'hidden'});
  const composer=await add(view.page,'After deliberate discard');await composer.waitFor({state:'hidden'});await view.page.getByText('Saved to your account',{exact:true}).waitFor();assert.equal(writes.length,1);assert.equal(cloud.travellers,2);assert(cloud.planItems.some(d=>d.notes.includes('After deliberate discard')));assert.deepEqual(view.errors,[]);
 }finally{await view.close();}
});

test('discarding a failed current edit returns to the account copy before the next edit',{skip:!enabled,timeout:30000},async()=>{
 let cloud=fixture();const writes:any[]=[];
 const view=await renderBuilder({path:'/journey/'+cloud.id+'/itinerary',ownerId:'owner-a',shellCanonicalTrip:cloud,seedRecovery:false,accountRequest:({method,trip})=>{
  if(method==='GET')return{status:200,body:{trip:cloud}};
  writes.push(trip);if(writes.length===1)return{status:503,body:{error:'Temporary QA fixture failure'}};
  cloud=requireReadableTripDocument({...trip as any,updatedAt:'2026-10-10T20:00:00.000Z'});return{status:200,body:{trip:cloud}};
 }});
 try{
  await (await add(view.page,'Failed edit deliberately discarded')).waitFor({state:'hidden'});
  await view.page.getByRole('button',{name:'Discard device copy',exact:true}).click();
  const confirm=view.page.getByRole('dialog');await confirm.getByRole('button',{name:'Discard device edits',exact:true}).click();await confirm.waitFor({state:'hidden'});
  await (await add(view.page,'New edit after failed-copy discard')).waitFor({state:'hidden'});await view.page.getByText('Saved to your account',{exact:true}).waitFor();
  assert.equal(writes.length,2);assert(cloud.planItems.some(day=>day.notes.includes('New edit after failed-copy discard')));
  assert(!cloud.planItems.some(day=>day.notes.includes('Failed edit deliberately discarded')),'A deliberately discarded optimistic body must never be resaved by a subsequent edit');assert.deepEqual(view.errors,[]);
 }finally{await view.close();}
});

for(const cacheState of ['missing','stale'] as const)test(`failed current discard preserves its record when canonical cache is ${cacheState}`,{skip:!enabled,timeout:30000},async()=>{
 const cloud=fixture();let writes=0;
 const view=await renderBuilder({path:'/journey/'+cloud.id+'/itinerary',ownerId:'owner-a',shellCanonicalTrip:cloud,seedRecovery:false,accountRequest:({method})=>method==='GET'?{status:200,body:{trip:cloud}}:(writes++,{status:503,body:{error:'Temporary QA fixture failure'}})});
 try{
  await (await add(view.page,'Protected failed edit')).waitFor({state:'hidden'});
  await view.page.getByRole('button',{name:'Discard device copy',exact:true}).click();
  const read=()=>view.page.evaluate((id:string)=>Object.keys(localStorage).filter(k=>k.startsWith('easyt:trip-recovery:')&&k.includes(id)).sort().map(k=>[k,localStorage.getItem(k)]),cloud.id);
  const before=await read();assert(before.length>0);
  const cacheCount=await view.page.evaluate(({id,cacheState}:{id:string;cacheState:string})=>{const keys=Object.keys(localStorage).filter(k=>k.startsWith('easyt:trip-cache:')&&k.includes(id));for(const key of keys){if(cacheState==='missing')localStorage.removeItem(key);else{const cached=JSON.parse(localStorage.getItem(key)!);cached.trip.updatedAt='2000-01-01T00:00:00.000Z';localStorage.setItem(key,JSON.stringify(cached));}}return keys.length;},{id:cloud.id,cacheState});assert.equal(cacheCount,1,'Each case must alter the existing acknowledged cache');
  await view.page.getByRole('dialog').getByRole('button',{name:'Discard device edits',exact:true}).click();
  assert.deepEqual(await read(),before,'Without a usable acknowledged account base, discard must preserve the exact durable edit');assert.equal(writes,1);assert.deepEqual(view.errors,[]);
 }finally{await view.close();}
});

test('sequential discard of failed current and newer separate copies cannot revive either body',{skip:!enabled,timeout:30000},async()=>{
 let cloud=fixture();const writes:any[]=[];
 const view=await renderBuilder({path:'/journey/'+cloud.id+'/itinerary',ownerId:'owner-a',shellCanonicalTrip:cloud,seedRecovery:false,accountRequest:({method,trip})=>{if(method==='GET')return{status:200,body:{trip:cloud}};writes.push(trip);if(writes.length===1)return{status:503,body:{error:'Temporary QA fixture failure'}};cloud=requireReadableTripDocument({...trip as any,updatedAt:'2026-10-10T20:00:00.000Z'});return{status:200,body:{trip:cloud}};}});
 try{
  await (await add(view.page,'Failed current copy A')).waitFor({state:'hidden'});await view.page.getByRole('button',{name:'Discard device copy',exact:true}).click();const first=view.page.getByRole('dialog');
  await view.page.evaluate(({cloud}:{cloud:ReturnType<typeof fixture>})=>{const trip=structuredClone(cloud);trip.travellers=4;const key='easyt:trip-recovery:v2:owner-owner-a:'+cloud.id+':separate-copy-b';const value=JSON.stringify({version:2,ownerId:'owner-a',tripId:cloud.id,trip,state:'pending',writeId:'separate-copy-b',savedAt:'2026-10-10T20:00:00Z'});localStorage.setItem(key,value);window.dispatchEvent(new StorageEvent('storage',{key,newValue:value}));},{cloud});
  await first.getByRole('button',{name:'Discard device edits',exact:true}).click();await first.waitFor({state:'hidden'});
  const surviving=await view.page.evaluate((id:string)=>Object.keys(localStorage).filter(k=>k.startsWith('easyt:trip-recovery:')&&k.includes(id)).map(k=>JSON.parse(localStorage.getItem(k)!)),cloud.id);assert.equal(surviving.length,1);assert.equal(surviving[0].writeId,'separate-copy-b');assert.equal(surviving[0].trip.travellers,4);
  await view.page.getByRole('button',{name:'Discard device copy',exact:true}).click();const second=view.page.getByRole('dialog');await second.getByRole('button',{name:'Discard device edits',exact:true}).click();await second.waitFor({state:'hidden'});
  await (await add(view.page,'Accepted copy C')).waitFor({state:'hidden'});await view.page.getByText('Saved to your account',{exact:true}).waitFor();assert.equal(writes.length,2);assert.equal(cloud.travellers,2);assert(cloud.planItems.some(day=>day.notes.includes('Accepted copy C')));assert(!cloud.planItems.some(day=>day.notes.includes('Failed current copy A')),'Resolving the remaining separate copy must not revive the previously discarded current body');assert.deepEqual(view.errors,[]);
 }finally{await view.close();}
});
