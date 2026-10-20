// Browser qualification uses only synthetic snapshots produced by the existing
// adapter fixture. Raw seeding is setup, never presented as a supported writer.
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
import {harness,accepted} from './idb-projection-boundary.mjs';
import {builderInputDraftKey} from '../../lib/easyt/trip-builder-input-draft.ts';
const fixtures=new Map();
export async function browserFixture(mode='indexeddb-body',owner=null){
 const key=JSON.stringify([mode,owner]);if(!fixtures.has(key))fixtures.set(key,(async()=>{
  const h=await harness(mode,owner);try{
   await accepted(h);h.control.beforeProjectionSave=async({options})=>{options.projectionOnly.inputRevision++;};
   await h.run();await h.session.waitForDeviceWrites();
   assert.equal(h.trace.writes.filter(w=>w.projection).at(-1).result.writeAttempted,false);
   const frozen=h.trace.candidates.at(-1);assert.ok(frozen);
   return {source:structuredClone(h.session.getSnapshot().trip),handle:structuredClone(h.session.getSnapshot().recovery),
    draft:structuredClone(h.session.getSnapshot().draft),candidate:frozen.trip,options:frozen.options,
    native:[...h.storage.values],domain:[...h.model.data].map(([name,map])=>[name,[...map]])};
  }finally{h.close();}
 })());return structuredClone(await fixtures.get(key));
}

export const browserBundle=build({stdin:{resolveDir:fileURLToPath(new URL('../../',import.meta.url)),loader:'js',contents:`
 import {openIndexedDbRecoveryDriver} from './lib/easyt/durable-recovery-store';
 import {createTwoStoreTripPersistence} from './lib/easyt/two-store-trip-persistence';
 import {createDurableBuilderInputPersistence} from './lib/easyt/builder-input-persistence';
 import {updateBuilderInputDraft,builderInputDraftKey} from './lib/easyt/trip-builder-input-draft';
 import {RecoveryDomainError} from './lib/easyt/durable-recovery-error';
 const database='morrovia-recovery-domain-v1',stores=['heads','generations','acknowledgements'];
 let driver,data,live=true,pause=null,fault=null,release=null;
 const context=()=>({ownerId:data.source.ownerId,isCurrent:()=>live,overflowEnabled:true,accountOverflowQualified:true});
 const broker=()=>createTwoStoreTripPersistence(localStorage,driver,context());
 const rawDatabase=()=>new Promise((resolve,reject)=>{const r=indexedDB.open(database,1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
 async function snapshot(){const db=await rawDatabase();return new Promise((resolve,reject)=>{
  const tx=db.transaction(stores,'readonly'),domain={};for(const name of stores){const s=tx.objectStore(name),keys=s.getAllKeys(),values=s.getAll();
   keys.onsuccess=()=>{domain[name]={keys:keys.result};};values.onsuccess=()=>{domain[name].values=values.result;};}
  tx.oncomplete=()=>{db.close();resolve({native:Object.keys(localStorage).sort().map(k=>[k,localStorage.getItem(k)]),domain:Object.fromEntries(stores.map(name=>[name,domain[name].keys.map((key,i)=>[key,domain[name].values[i]]).sort((a,b)=>a[0].localeCompare(b[0]))]))});};
  tx.onerror=()=>{db.close();reject(tx.error);};
 });}
 async function connect(){driver=await openIndexedDbRecoveryDriver(indexedDB);const run=driver.run.bind(driver);
  driver.run=async(scope,id,mode,decide,entries)=>{
   const target=id===data.options.writeId&&mode==='readwrite';
   if(mode==='readwrite'&&pause!==null&&id===pause){window.idbQa.reached=true;await new Promise(resolve=>{release=resolve;});pause=null;}
   if(target&&fault==='startup'){driver.close();return run(scope,id,mode,decide,entries);}
   if(target&&fault==='abort')return run(scope,id,mode,()=>{throw new DOMException('Synthetic transaction abort','AbortError');},entries);
   if(target&&fault==='uncertain-before')throw new RecoveryDomainError('unavailable','unconfirmed');
   const result=await run(scope,id,mode,state=>{if(mode==='readwrite')window.idbQa.decisions.push(id);return decide(state);},entries);
   if(target&&fault==='uncertain-after')throw new RecoveryDomainError('unavailable','unconfirmed');
   if(id===data.options.writeId&&mode==='readonly'&&fault==='readback')throw new RecoveryDomainError('security','not-started');
   return result;
  };
 }
 window.idbQa={reached:false,decisions:[],
  async seed(value){data=structuredClone(value);live=true;const initial=await openIndexedDbRecoveryDriver(indexedDB);initial.close();
   const db=await rawDatabase();await new Promise((resolve,reject)=>{const tx=db.transaction(stores,'readwrite',{durability:'strict'});
    for(const [name,rows] of data.domain)for(const [key,raw] of rows)tx.objectStore(name).put(raw,key);
    tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});db.close();
   for(const [key,raw] of data.native)localStorage.setItem(key,raw);await connect();return snapshot();
  },
  async attach(value){data=structuredClone(value);await connect();},
  snapshot,
  async read(){return broker().read(data.source.id);},
  async current(){return broker().current();},
  async project(){return broker().save(structuredClone(data.candidate),structuredClone(data.options));},
  pause(id=data.options.writeId){pause=id;window.idbQa.reached=false;},release(){release?.();},setFault(value){fault=value;},
  async reconnect(){driver.close?.();fault=null;await connect();},
  async change(kind){
   if(kind==='clear-current')return broker().clearCurrent();
   if(kind==='other-trip'){const trip={...structuredClone(data.source),id:'other-disposable-browser-trip',title:'Other disposable browser trip'};return broker().save(trip,{newTripOrClone:true,writeId:'other-trip-browser'});}
   if(kind==='mark-auth')return broker().mark(data.handle,'auth');
   if(kind==='discard')return broker().discard(data.handle,true);
   if(kind==='dispose'){live=false;return true;}
   const input=createDurableBuilderInputPersistence(localStorage,driver,{trip:data.source,...context()});
   if(kind==='body'){const trip={...structuredClone(data.source),title:'Authored by other disposable tab'},id='other-tab-body';
    const prepared=await input.prepare(data.draft,id+':input');if(!prepared.ok)throw Error('Other tab input preparation failed');
    return broker().save(trip,{replace:data.handle,expectedRecoverySource:data.source,canonicalBase:data.source,writeId:id,entries:[prepared.entry],
     entry:{pointer:{version:1,backend:'indexeddb',ownerId:trip.ownerId,tripId:trip.id,writeId:id},input:prepared.input,receipt:null}});}
   if(kind==='input'||kind==='input-away-back'){
    let next=updateBuilderInputDraft(data.draft,data.source,{kind:'destination-add'},'Other tab raw input',data.source.ownerId);
    const first=await input.write(next);if(!first.ok)throw Error('Other tab input write failed');
    if(kind==='input-away-back'){next=updateBuilderInputDraft(next,data.source,{kind:'destination-add'},data.draft.fields.find(f=>f.binding.kind==='destination-add')?.raw??'',data.source.ownerId);const result=await input.write(next);if(!result.ok)throw Error('Other tab input restore failed');}return true;
   }
   throw Error('Unsupported synthetic transition');
  },close(){driver.close?.();}
 };
`},bundle:true,write:false,platform:'browser',format:'iife',define:{'process.env':'{}'}}).then(r=>r.outputFiles[0].text);

export function inputCopies(snapshot,fixture){
 const {ownerId,id}=fixture.source;
 return {native:snapshot.native.filter(([key])=>key===builderInputDraftKey(ownerId,id)),
  domain:Object.fromEntries(Object.entries(snapshot.domain).map(([name,rows])=>[name,rows.filter(([key])=>{
   try{const p=JSON.parse(key);return p[0]==='entry'&&p[1]===ownerId&&p[2]==='builder-input'&&p[3]===id;}catch{return false;}
  })]))};
}
export function assertAncestors(snapshot,before){for(const [key,raw] of before.domain.generations)assert.equal(new Map(snapshot.domain.generations).get(key),raw);}
