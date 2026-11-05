import assert from 'node:assert/strict';
import {mkdirSync,readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
import {builderBrowserTestsEnabled,renderBuilder} from './helpers/builder-render.ts';
import {cityReturnTrip} from './fixtures/omio-return.ts';
import {canonicalTripForOwner} from '../lib/easyt/trip-promotion.ts';
import {requireReadableTripDocument} from '../lib/easyt/trip-document.ts';
import {nextTripUpdatedAt} from '../lib/easyt/trip-continuity.ts';
const auth=`import {useState,useEffect} from 'react';window.__transportRecoveryGate=new Promise(resolve=>window.addEventListener('release-transport-recovery',resolve,{once:true}));export const authClient={useSession(){const[ready,setReady]=useState(false);useEffect(()=>{const release=()=>setReady(true);window.addEventListener('release-transport-auth',release);return()=>window.removeEventListener('release-transport-auth',release)},[]);return{data:ready?{user:{id:'owner-a'}}:null,isPending:!ready}},getSession:async()=>({data:{user:{id:'owner-a'}}})};`;
const driverPath=fileURLToPath(new URL('../lib/easyt/browser-recovery-persistence.ts',import.meta.url));
const driver=readFileSync(driverPath,'utf8').replace('export async function browserRecoveryDriver(): Promise<RecoveryDomainDriver> {',`export async function browserRecoveryDriver(): Promise<RecoveryDomainDriver> {\n  await (window as Window & {__transportRecoveryGate?:Promise<void>}).__transportRecoveryGate;`);
for(const browserName of ['chromium','webkit'] as const)for(const language of ['en','es'] as const){
 test(`${browserName} ${language}: transport waits for auth and recovery, then one activation persists`,{skip:!builderBrowserTestsEnabled,timeout:90_000},async()=>{
  let cloud=canonicalTripForOwner('owner-a',cityReturnTrip()),writes=0;
  const view=await renderBuilder({browserName,ownerId:'owner-a',shellCanonicalTrip:cloud,seedRecovery:false,styled:true,language,path:`/journey/${cloud.id}/transport`,sourceOverrides:new Map([['fixture:auth',auth],[driverPath,driver]]),accountRequest:({method,trip})=>{if(method==='GET')return{status:200,body:{trip:cloud}};writes++;cloud=requireReadableTripDocument({...trip as object,updatedAt:nextTripUpdatedAt(cloud.updatedAt)});return{status:200,body:{trip:cloud}};}});
  try{
   const page=view.page;await page.setViewportSize({width:320,height:1000});
   const card=page.locator('[data-transport-leg-id]').first();await card.locator('[data-transport-summary] button').press('Enter');
   const mark=card.getByRole('button',{name:language==='es'?'Marcar como reservado':'Mark as booked',exact:true});
   const airports=card.getByRole('button',{name:language==='es'?'Cambiar aeropuertos de búsqueda':'Change flight-search airports',exact:true});
   assert.equal(await mark.isEnabled(),false);assert.equal(await airports.isEnabled(),false);assert.equal(writes,0);
   const artifacts=process.env.MORROVIA_BROWSER_ARTIFACT_DIR;if(artifacts){mkdirSync(artifacts,{recursive:true});await page.screenshot({path:`${artifacts}/readiness-${browserName}-${language}-pending-320.png`,fullPage:true});}
   await page.evaluate(()=>window.dispatchEvent(new Event('release-transport-auth')));
   assert.equal(await mark.isEnabled(),false,'recovery is still held after auth resolves');assert.equal(writes,0);
   await page.evaluate(()=>window.dispatchEvent(new Event('release-transport-recovery')));
   await page.waitForFunction(()=>{const b=[...document.querySelectorAll('button')].find(b=>/^(Mark as booked|Marcar como reservado)$/.test(b.textContent??''));return b&&!b.disabled});assert.equal(await airports.isEnabled(),true);
   await mark.press('Enter');await card.locator('[data-tone="booked"]').waitFor();
   await page.waitForFunction(()=>[...document.querySelectorAll('[role="status"]')].some(el=>el.textContent?.includes('Saved to your account')));
   assert.equal(writes,1);assert.equal(cloud.brief.bookings?.[0]?.travellerMarkedBooked,true);
   await card.getByRole('button',{name:language==='es'?'Deshacer marca de reserva':'Undo booked mark',exact:true}).press('Space');
   await card.locator('[data-tone="not-booked"]').waitFor();await page.waitForFunction(()=>[...document.querySelectorAll('[role="status"]')].some(el=>el.textContent?.includes('Saved to your account')));
   assert.equal(writes,2);assert.equal(cloud.brief.bookings?.[0]?.travellerMarkedBooked,false);assert.equal(await airports.isEnabled(),true);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assert.deepEqual(view.errors,[]);
   if(artifacts)await page.screenshot({path:`${artifacts}/readiness-${browserName}-${language}-settled-320.png`,fullPage:true});
  }finally{await view.close()}
 });
}

for(const browserName of ['chromium','webkit'] as const)test(`${browserName}: guest auth refetch does not strand an in-flight local edit`,{skip:!builderBrowserTestsEnabled,timeout:90_000},async()=>{
 const trip=cityReturnTrip();let accountWrites=0;
 const guestAuth=`import{useState,useEffect}from'react';export const authClient={useSession(){const[pending,setPending]=useState(false);useEffect(()=>{const start=()=>setPending(true),end=()=>setPending(false);window.addEventListener('guest-refetch-start',start);window.addEventListener('guest-refetch-end',end);return()=>{window.removeEventListener('guest-refetch-start',start);window.removeEventListener('guest-refetch-end',end)}},[]);return{data:null,isPending:pending}},getSession:async()=>({data:null})};`;
 const storagePath=fileURLToPath(new URL('../lib/easyt/storage.ts',import.meta.url));
 const storage=readFileSync(storagePath,'utf8').replace('  const candidate=prepareTripDocumentForWrite(structuredClone(trip)),ownerId=',`  await (window as Window & {__guestWriteGate?:Promise<void>}).__guestWriteGate;\n  const candidate=prepareTripDocumentForWrite(structuredClone(trip)),ownerId=`);
 const view=await renderBuilder({browserName,initialTrip:trip,path:`/journey/${trip.id}/transport`,styled:true,sourceOverrides:new Map([['fixture:auth',guestAuth],[storagePath,storage]]),accountRequest:()=>{accountWrites++;return{status:500,body:{error:'Guest must remain local'}};}});
 try{
  const page=view.page,card=page.locator('[data-transport-leg-id]').first();await card.locator('[data-transport-summary] button').click();
  const mark=card.getByRole('button',{name:'Mark as booked',exact:true});
  await page.waitForFunction(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent==='Mark as booked');return b&&!b.disabled});
  await page.evaluate(()=>{localStorage.setItem('synthetic-unrelated-retained-data','preserve');const w=window as Window&{__guestWriteGate?:Promise<void>;__releaseGuestWrite?:()=>void};w.__guestWriteGate=new Promise<void>(resolve=>{w.__releaseGuestWrite=resolve})});
  await mark.click();
  await page.evaluate(()=>window.dispatchEvent(new Event('guest-refetch-start')));
  await page.getByText('Checking this trip…',{exact:true}).waitFor();
  assert.equal(await mark.isEnabled(),false);
  await page.evaluate(()=>(window as Window&{__releaseGuestWrite?:()=>void}).__releaseGuestWrite?.());
  await card.locator('[data-tone="booked"]').waitFor();
  const undo=card.getByRole('button',{name:'Undo booked mark',exact:true});
  assert.equal(await undo.isEnabled(),false,'new transport actions still wait while the accepted guest write finishes');
  await page.getByText('Checking this trip…',{exact:true}).waitFor();
  await page.evaluate(()=>window.dispatchEvent(new Event('guest-refetch-end')));
  await page.getByText('Checking this trip…',{exact:true}).waitFor({state:'hidden'});
  await page.waitForFunction(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent==='Undo booked mark');return b&&!b.disabled});
  await undo.click();await card.locator('[data-tone="not-booked"]').waitFor();
  assert.equal(accountWrites,0);assert.equal(await page.evaluate(()=>localStorage.getItem('synthetic-unrelated-retained-data')),'preserve');assert.deepEqual(view.errors,[]);
 }finally{await view.close()}
});
