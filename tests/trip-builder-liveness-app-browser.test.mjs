import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdirSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {renderBuilder,builderBrowserTestsEnabled} from './helpers/builder-render.ts';
import {publicRouteDetailFor} from '../lib/easyt/public-route.ts';
import {routePlannerPayload} from '../lib/easyt/public-route-handoff.ts';
import {tripFromBuilder} from '../lib/easyt/trip.ts';
import {requireReadableTripDocument} from '../lib/easyt/trip-document.ts';
import {prepareBuilderHandlerEdit} from '../lib/easyt/trip-builder-handler-contract.ts';
import {builderDocumentFingerprint} from '../lib/easyt/trip-builder-document-commit.ts';
import {BETA_RENDERING_LANGUAGE} from '../lib/easyt/i18n.ts';

const artifacts=process.env.MORROVIA_BROWSER_ARTIFACT_DIR;
const seedBundle=build({stdin:{contents:`
 import {openIndexedDbRecoveryDriver,createRecoveryDomainStore} from './lib/easyt/durable-recovery-store';
 import {createTwoStoreTripPersistence} from './lib/easyt/two-store-trip-persistence';
 window.seedLivenessFixture=async trip=>{
  const driver=await openIndexedDbRecoveryDriver(indexedDB),ownerId=null;
  const handle={version:1,backend:'indexeddb',ownerId,tripId:trip.id,writeId:'liveness-fixture'};
  const envelope={version:1,handle,parent:null,legacySources:[],rawRecovery:JSON.stringify({version:2,ownerId,tripId:trip.id,writeId:handle.writeId,state:'pending',savedAt:'2026-10-20T00:00:00.000Z',trip}),entry:{pointer:handle,input:null,receipt:null}};
  try{return await createRecoveryDomainStore(driver,{ownerId,isCurrent:()=>true}).commit({raw:JSON.stringify(envelope),expectedHead:null,admission:'native-setter-quota'});}finally{driver.close();}
 };
 window.readLivenessFixture=async tripId=>{
  const driver=await openIndexedDbRecoveryDriver(indexedDB);
  try{return await createTwoStoreTripPersistence(localStorage,driver,{ownerId:null,isCurrent:()=>true,overflowEnabled:true,accountOverflowQualified:true}).read(tripId);}finally{driver.close();}
 };
 window.livenessDomainBytes=async()=>new Promise((resolve,reject)=>{
  const req=indexedDB.open('morrovia-recovery-domain-v1',1);req.onerror=()=>reject(req.error);req.onsuccess=()=>{
   const db=req.result,tx=db.transaction(['heads','generations','acknowledgements'],'readonly'),output={};
   for(const name of ['heads','generations','acknowledgements']){const store=tx.objectStore(name),keys=store.getAllKeys(),values=store.getAll();keys.onsuccess=()=>{output[name]={keys:keys.result};};values.onsuccess=()=>{output[name].values=values.result;};}
   tx.oncomplete=()=>{db.close();resolve(output)};tx.onerror=()=>{db.close();reject(tx.error)};
  };
 });`,resolveDir:fileURLToPath(new URL('../',import.meta.url)),loader:'js'},bundle:true,write:false,platform:'browser',format:'iife'}).then(result=>result.outputFiles[0].text);
function fixture(){
 const p=routePlannerPayload(publicRouteDetailFor('japan-slow').planDraft,new Date(2026,9,20,12));
 let trip=requireReadableTripDocument(tripFromBuilder({...p,id:'qa-disposable-builder-idb-liveness',stops:p.destinations,picks:{},mustDo:p.brief,pace:'slow',hotels:'few',budget:'value',draft:[],createdAt:'2026-10-20T00:00:00.000Z'}));
 for(const edit of [{kind:'type',tripType:'one_way'},{kind:'dates',startDate:'2026-10-26',endDate:'2026-11-10'}]){
  const result=prepareBuilderHandlerEdit(trip,edit,builderDocumentFingerprint(trip));assert.ok(result.ok);trip=result.trip;
 }
 return trip;
}
for(const [width,language] of [[1440,'en'],[320,'en'],[390,'en'],[430,'en'],[768,'en'],[390,'es']])test(`deferred IndexedDB Build returns accessible review at ${width}px with ${language} preference`,{skip:!builderBrowserTestsEnabled,timeout:45000},async()=>{
 const renderingLanguage=BETA_RENDERING_LANGUAGE;
 const trip=fixture();let release;const gate=new Promise(resolve=>{release=resolve;});let calls=0;
 const view=await renderBuilder({styled:true,seedRecovery:false,language,transferRequest:async({legs})=>{calls++;await gate;return {status:200,body:{legs,assessments:[],failedLegIds:[]}};}});
 const tag=`${width}-${language}`;
 try{
  await view.page.setViewportSize({width,height:1000});
  await view.page.addScriptTag({content:await seedBundle});
  assert.equal((await view.page.evaluate(trip=>window.seedLivenessFixture(trip),trip)).kind,'verified');
  await view.page.goto(new URL(`/journey/new?trip=${trip.id}&recover=1`,view.page.url()).href);
  await view.page.locator('[data-builder-edit-session="active"]').waitFor();
  const buildButton=view.page.getByRole('button',{name:renderingLanguage==='es'?/^Crear viaje/:/^Build trip/});
  await buildButton.waitFor();
  await view.page.addScriptTag({content:await seedBundle});
  const nativeBefore=await view.page.evaluate(id=>Object.fromEntries(Object.keys(localStorage).filter(key=>key.includes(id)).map(key=>[key,localStorage.getItem(key)])),trip.id);
  const domainBefore=await view.page.evaluate(()=>window.livenessDomainBytes());
  await buildButton.click();
  await view.page.getByRole('button',{name:renderingLanguage==='es'?'Abriendo tu ruta…':'Opening your route…'}).waitFor();
  release();
  const review=view.page.getByRole('alert').filter({hasText:renderingLanguage==='es'?'No se pudieron completar las comprobaciones de la ruta.':'Route checks could not finish.'});
  await review.waitFor();
  assert.equal(await buildButton.isEnabled(),true);assert.equal(await buildButton.getAttribute('aria-busy'),null);
  const reviewButton=review.getByRole('button',{name:renderingLanguage==='es'?'Revisar viaje':'Review trip',exact:true});
  await reviewButton.focus();assert.equal(await reviewButton.evaluate(el=>el===document.activeElement),true);
  assert.equal(new URL(view.page.url()).pathname,'/journey/new');
  assert.equal(calls,1,'deferral must not start a provider retry loop');
  assert.deepEqual(await view.page.evaluate(id=>Object.fromEntries(Object.keys(localStorage).filter(key=>key.includes(id)).map(key=>[key,localStorage.getItem(key)])),trip.id),nativeBefore);
  assert.deepEqual(await view.page.evaluate(()=>window.livenessDomainBytes()),domainBefore);
  const saved=await view.page.evaluate(id=>window.readLivenessFixture(id),trip.id);assert.equal(saved.kind,'found');assert.deepEqual(saved.trip,trip);
  assert.deepEqual(view.errors,[]);
  assert.equal(await view.page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'feedback must not overflow narrow layouts');
  if(artifacts){mkdirSync(artifacts,{recursive:true});await review.scrollIntoViewIfNeeded();await view.page.screenshot({path:`${artifacts}/builder-review-${tag}.png`,fullPage:true});writeFileSync(`${artifacts}/builder-review-${tag}.json`,JSON.stringify({url:view.page.url(),width,language,renderingLanguage,calls,alert:await review.innerText(),tripPreserved:true,nativePreserved:true,indexedDbPreserved:true,errors:view.errors},null,2)+'\n');}
  await reviewButton.press('Enter');await review.waitFor({state:'hidden'});
  await buildButton.click();await review.waitFor();assert.equal(calls,2,'a deliberate Build retry makes exactly one more request');
  assert.equal(new URL(view.page.url()).pathname,'/journey/new');assert.equal(await buildButton.isEnabled(),true);
 }finally{release();await view.close();}
});
