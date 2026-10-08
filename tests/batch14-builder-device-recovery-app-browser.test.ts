import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {renderBuilder} from './helpers/builder-render.ts';
import {requireReadableTripDocument} from '../lib/easyt/trip-document.ts';
import {canonicalTripForOwner} from '../lib/easyt/trip-promotion.ts';
const enabled=process.env.MORROVIA_BUILDER_APP_BROWSER_TESTS==='1';
const captured=JSON.parse(readFileSync(new URL('./fixtures/batch14-guest-bootstrap.json',import.meta.url),'utf8')).trip;
for(const own of [true,false])test(`zero-day device recovery respects Builder context and ${own?'its owner':'a different owner'}`,{skip:!enabled,timeout:30000},async()=>{
 const device=requireReadableTripDocument(canonicalTripForOwner('owner-a',captured)),cloud={...structuredClone(device),ownerId:own?'owner-a':'owner-b',travellers:3},requests:any[]=[];
 const view=await renderBuilder({initialTrip:device,ownerId:cloud.ownerId,query:`?trip=${device.id}`,accountRequest:({method,trip})=>{requests.push({method,trip});return method==='GET'?{status:200,body:{trip:cloud}}:{status:409,body:{trip:cloud,conflictReason:'cloud-changed'}};}});
 try{
  const read=()=>view.page.evaluate((id:string)=>Object.keys(localStorage).filter(k=>k.startsWith(`easyt:trip-recovery:v2:owner-owner-a:${id}:`)).map(k=>JSON.parse(localStorage.getItem(k)!)),device.id);
  if(own){
   await view.page.getByRole('button',{name:'Open device copy',exact:true}).waitFor();assert.equal(requests.filter(r=>r.method!=='GET').length,0,'A genuine unsynced document cannot be written before traveller recovery');const before=await read();assert.equal(before.length,1);assert.equal(before[0].writeId,'browser-fixture');
   await view.page.getByRole('button',{name:'Open device copy',exact:true}).click();await view.page.waitForURL(/\/journey\/new\?.*recover=1/);await view.page.locator('[data-builder-edit-session="active"]').waitFor();assert.equal(new URL(view.page.url()).searchParams.get('trip'),device.id);assert.equal(await view.page.getByText('This trip has no planned days yet',{exact:true}).count(),0);
   assert(await view.page.getByRole('combobox',{name:'Start from',exact:true}).isVisible());const after=await read();assert.equal(after[0].trip.ownerId,'owner-a');assert.equal(after[0].trip.travellers,2);assert.equal(after[0].trip.planItems.length,0);assert.deepEqual(after[0].trip.brief.intent.route.destinations,device.brief.intent.route.destinations);
  }else{
   await view.page.locator('[data-builder-edit-session="active"]').waitFor();assert.equal(await view.page.getByRole('button',{name:'Open device copy',exact:true}).count(),0);const untouched=await read();assert.equal(untouched.length,1);assert.equal(untouched[0].trip.ownerId,'owner-a');assert.deepEqual(untouched[0].trip,device);assert.equal(requests.filter(r=>r.method!=='GET').length,0);
  }
  assert(requests.every(r=>r.method==='GET'||r.trip.ownerId===cloud.ownerId),'No save may cross the connected owner');assert.deepEqual(view.errors,[]);
  const dir=process.env.MORROVIA_BROWSER_ARTIFACT_DIR;if(dir){mkdirSync(dir,{recursive:true});const tag=own?'same-owner':'different-owner';writeFileSync(`${dir}/${tag}.json`,JSON.stringify({url:view.page.url(),requests,recovery:await read(),errors:view.errors},null,2)+'\n');await view.page.screenshot({path:`${dir}/${tag}.png`,fullPage:true});}
 }finally{await view.close();}
});
