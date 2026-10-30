import assert from 'node:assert/strict';
import test from 'node:test';
import {createServer} from 'node:http';
import {createRequire} from 'node:module';
import {build} from 'esbuild';
import type {Route} from 'playwright';
import type {EasyTTrip} from '../lib/easyt/trip.ts';
import {japanTrip} from './fixtures/transport-choice.ts';
import {selectTripLegTransportChoice,supportedTransportChoicesForLeg} from '../lib/easyt/transport-mode-choice.ts';
import {markTransportLegBooked} from '../lib/easyt/transport-booking.ts';
import {canonicalTripForOwner} from '../lib/easyt/trip-promotion.ts';
const require=createRequire(import.meta.url),{chromium,webkit}=require('playwright');
const enabled=process.env.MORROVIA_BUILDER_BROWSER_TESTS==='1';
let script:Promise<string>|undefined;
function browserScript(){return script??=build({stdin:{resolveDir:process.cwd(),loader:'ts',contents:`
import{openIndexedDbRecoveryDriver}from'./lib/easyt/durable-recovery-store.ts';
import{createTwoStoreTripPersistence}from'./lib/easyt/two-store-trip-persistence.ts';
import{prepareTripDocumentForWrite}from'./lib/easyt/trip-document.ts';
import{authoredContentKey}from'./lib/easyt/trip-retained-authored-content.ts';
import{effectiveTripLeg}from'./lib/easyt/transport-mode-choice.ts';
import{saveTripRecoveryToStorage,acknowledgeTripBuildSaveInStorage,loadTripRecoveryFromStorage}from'./lib/easyt/storage.ts';
let driver,trip,saved,current=true;
const storage={get length(){return localStorage.length},key:i=>localStorage.key(i),getItem:k=>localStorage.getItem(k),setItem(){throw new DOMException('Synthetic quota','QuotaExceededError')},removeItem:k=>localStorage.removeItem(k)};
const broker=()=>createTwoStoreTripPersistence(storage,driver,{ownerId:trip.ownerId,isCurrent:()=>current,overflowEnabled:true,accountOverflowQualified:true});
function reply(kind){const t=structuredClone(trip);t.updatedAt='2026-10-28T17:36:00.000Z';const d=t.legs[0].routeMetadata.multimodalResolution;
 if(kind==='drop')d.candidates=d.candidates.filter(c=>c.summaryMode!=='road');
 if(kind==='rewrite'){const c=d.candidates.find(c=>c.summaryMode==='road');c.totalDurationMinutes=600;c.segments[0].durationMinutes=600;}
 if(kind==='booked-source')t.legs[0].durationMinutes=600;
 if(kind==='owner')t.ownerId='other-owner';if(kind==='trip')t.id='other-trip';return t;}
window.qa={async seed(input){trip=prepareTripDocumentForWrite(input);driver=await openIndexedDbRecoveryDriver(indexedDB);saved=await broker().save(trip,{newTripOrClone:true,writeId:'ack-safeguard'});return{stored:saved.stored,backend:saved.handle?.backend}},
 async snapshot(){const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('morrovia-recovery-domain-v1');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});const rows={};await Promise.all([...db.objectStoreNames].map(name=>new Promise((resolve,reject)=>{const r=db.transaction(name,'readonly').objectStore(name).getAll();r.onsuccess=()=>{rows[name]=r.result;resolve()};r.onerror=()=>reject(r.error)})));db.close();return authoredContentKey({rows,native:Object.entries(localStorage)});},
 async ack(kind){const t=reply(kind),r=await broker().acknowledge(trip,t,saved.handle);if(kind==='exact'&&r.outcome==='acknowledged')trip=t;return{outcome:r.outcome,accountAcknowledged:r.accountAcknowledged}},
 async cold(){driver.close();driver=await openIndexedDbRecoveryDriver(indexedDB);const r=await broker().read(trip.id);return{kind:r.kind,exact:r.kind==='found'&&authoredContentKey(r.trip)===authoredContentKey(trip),recovery:r.kind==='found'&&!!r.recovery,minutes:r.kind==='found'?effectiveTripLeg(r.trip,r.trip.legs[0]).durationMinutes:null}},
 async stale(){current=false;const r=await broker().acknowledge(trip,reply('exact'),saved.handle);current=true;return r.outcome},
 native(kind){const localSaved=saveTripRecoveryToStorage(localStorage,trip,{ownerId:trip.ownerId,writeId:'native-ack'});if(!localSaved.stored)throw Error('native fixture not stored');const prior=authoredContentKey(Object.entries(localStorage)),r=acknowledgeTripBuildSaveInStorage(localStorage,trip,reply(kind),localSaved.handle);return{outcome:r.outcome,unchanged:prior===authoredContentKey(Object.entries(localStorage)),recovery:!!loadTripRecoveryFromStorage(localStorage,trip.id,trip.ownerId)}},
 close(){driver?.close()}};`},bundle:true,write:false,platform:'browser',format:'iife',define:{'process.env':'{}'},logLevel:'silent'}).then(r=>r.outputFiles[0].text)}
for(const engine of['chromium','webkit']as const)for(const ownerId of[null,'ack-browser-owner'])test(`native localStorage/IDB snapshot ACK protection (${engine}/${ownerId??'guest'})`,{skip:!enabled,timeout:30000},async()=>{
 let t=japanTrip();const c=(t.legs[0].routeMetadata.multimodalResolution as any).candidates[1];c.id='road:routed:revision-v1:synthetic';c.totalDurationMinutes=480;c.segments[0].durationMinutes=480;
 t=selectTripLegTransportChoice(t,t.legs[0].id,supportedTransportChoicesForLeg(t,t.legs[0]).find(c=>c.mode==='road')!.identity);t=markTransportLegBooked(t,t.legs[0].id,{confirmation:'SYNTHETIC-ACK'});if(ownerId)t=canonicalTripForOwner(ownerId,t);
 const js=await browserScript(),browser=await({chromium,webkit}[engine]).launch({headless:true}),server=createServer((req,res)=>{res.setHeader('Content-Type',req.url==='/fixture.js'?'text/javascript':'text/html');res.end(req.url==='/fixture.js'?js:'<title>Isolated synthetic ACK test</title><script src="/fixture.js"></script>')});await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
 const origin='http://127.0.0.1:'+(server.address()as any).port,ctx=await browser.newContext(),external:string[]=[];
 await ctx.route('**/*',(r:Route)=>new URL(r.request().url()).origin===origin?r.continue():(external.push(r.request().url()),r.abort()));const page=await ctx.newPage();
 try{await page.goto(origin);assert.deepEqual(await page.evaluate((t:EasyTTrip)=>(window as any).qa.seed(t),t),{stored:true,backend:'indexeddb'});const before=await page.evaluate(()=>(window as any).qa.snapshot());
 for(const bad of['drop','rewrite','booked-source','owner','trip']){const r=await page.evaluate((k:string)=>(window as any).qa.ack(k),bad);assert.deepEqual(r,{outcome:'invalid-canonical',accountAcknowledged:false});assert.equal(await page.evaluate(()=>(window as any).qa.snapshot()),before,'refused ACK must not mutate either store');}
 assert.deepEqual(await page.evaluate(()=>(window as any).qa.cold()),{kind:'found',exact:true,recovery:true,minutes:480});
 if(ownerId){assert.equal(await page.evaluate(()=>(window as any).qa.stale()),'storage-failed');assert.equal(await page.evaluate(()=>(window as any).qa.snapshot()),before);}
 assert.equal((await page.evaluate(()=>(window as any).qa.ack('exact'))).outcome,ownerId?'acknowledged':'invalid-canonical');
 assert.deepEqual(await page.evaluate(()=>(window as any).qa.cold()),{kind:'found',exact:true,recovery:!ownerId,minutes:480});
 for(const bad of['drop','rewrite']){const native=await page.evaluate((k:string)=>(window as any).qa.native(k),bad);assert.deepEqual(native,{outcome:'invalid-canonical',unchanged:true,recovery:true});}
 assert.deepEqual(external,[]);
 }finally{await page.evaluate(()=>(window as any).qa.close()).catch(()=>{});await ctx.close();await browser.close();server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));}
});
