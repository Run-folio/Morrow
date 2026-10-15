import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { diagnosticLocation, createDiagnosticTimeline, installJapanWorkerProbe, boundedDiagnosticResult, attachJapanModuleDiagnostics } from './helpers/japan-module-diagnostics.mjs';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const origin='http://127.0.0.1:3100';
const asset=origin+'/_next/static/chunks/app/journey/%5BtripId%5D/layout-abc.js';

test('diagnostic locations omit origins, queries, trip identities and unknown route payloads',()=>{
 assert.deepEqual(diagnosticLocation(origin+'/journey/trip-private?token=secret',origin),{scope:'app',path:'/journey/:trip'});
 assert.deepEqual(diagnosticLocation(asset+'?token=secret',origin),{scope:'app',path:'/_next/static/chunks/app/journey/%5BtripId%5D/layout-abc.js'});
 assert.deepEqual(diagnosticLocation('https://user:password@example.com/private?key=secret',origin),{scope:'external',path:'[external]'});
 assert.deepEqual(diagnosticLocation(origin+'/api/account/private@example.com?token=secret',origin),{scope:'app',path:'[other-local-path]'});
 assert.equal(JSON.stringify(diagnosticLocation('not a URL containing secret',origin)).includes('secret'),false);
});

test('diagnostic timeline is bounded and declares evicted events',()=>{
 const t=createDiagnosticTimeline(2);t.record('one',{});t.record('two',{});t.record('three',{});
 assert.deepEqual(t.snapshot().events.map(e=>e.kind),['two','three']);assert.equal(t.snapshot().dropped,1);
});

test('diagnostic deadline returns for a stalled operation and preserves completed values',async()=>{
 assert.deepEqual(await boundedDiagnosticResult(new Promise(()=>{}),5),{status:'timeout'});
 const value={original:true};assert.equal((await boundedDiagnosticResult(Promise.resolve(value),50)).value,value);
 assert.deepEqual(await boundedDiagnosticResult(Promise.reject(new TypeError('private message')),50),{status:'error',errorName:'TypeError'});
});

test('binding setup failure remains explicit in an artifact',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'japan-diagnostic-'));
 let initScript;
 const cdp={on(){},async send(){},async detach(){}};
 const context={async newCDPSession(){return cdp;},on(){},off(){},serviceWorkers(){return [];},async exposeBinding(){throw new Error('private message');},async addInitScript(script){initScript=script;},browser(){return {version(){return 'test';}};}};
 try{const d=await attachJapanModuleDiagnostics(context,{}, {base:origin,artifacts:dir,commit:'secret'});await d.finish();
  assert.doesNotThrow(()=>vm.runInNewContext('('+initScript.toString()+')()',{navigator:{serviceWorker:{controller:null,addEventListener(){}}},document:{readyState:'loading'},location:{href:origin},addEventListener(){},MutationObserver:class {observe(){}}}));
  const result=JSON.parse(readFileSync(join(dir,'single-area-Japan-1440-module-diagnostics.json'),'utf8'));
  assert.ok(result.gaps.some(g=>g.stage==='binding-setup'&&g.errorName==='Error'));assert.equal(result.commit,null);assert.equal(JSON.stringify(result).includes('private message'),false);
 }finally{rmSync(dir,{recursive:true,force:true});}
});

test('a stalled worker cannot prevent the partial artifact or bounded finish',{timeout:4000},async()=>{
 const dir=mkdtempSync(join(tmpdir(),'japan-stalled-worker-'));
 const worker={url(){return origin+'/easyt-sw.js';},evaluate(){return new Promise(()=>{});}};
 const cdp={on(){},async send(){},async detach(){}};
 const context={async newCDPSession(){return cdp;},on(){},off(){},serviceWorkers(){return [worker];},async exposeBinding(){},async addInitScript(){},browser(){return {version(){return 'test';}};}};
 try{const d=await attachJapanModuleDiagnostics(context,{}, {base:origin,artifacts:dir,commit:null});const finishing=d.finish();
  const file=join(dir,'single-area-Japan-1440-module-diagnostics.json');assert.equal(JSON.parse(readFileSync(file,'utf8')).collectionComplete,false);
  await finishing;const result=JSON.parse(readFileSync(file,'utf8'));assert.equal(result.collectionComplete,true);
  assert.ok(result.gaps.some(g=>g.stage==='worker-probe-wait'&&g.errorName==='timeout'));assert.ok(result.gaps.some(g=>g.stage==='worker-snapshot'&&g.errorName==='timeout'));
 }finally{rmSync(dir,{recursive:true,force:true});}
});

function workerFixture({reject=false}={}){
 const events={fetch:0,match:0,put:0,digest:0,claim:0};const failure=new TypeError('private failure details');
 const response={ok:true,status:200,type:'basic',bodyUsed:false};
 const promise=Promise.resolve(response);
 class Cache {match(){events.match++;return promise;}put(){events.put++;return Promise.resolve();}}
 const cache=new Cache();
 class CacheStorage {open(){return Promise.resolve(cache);}match(){return cache.match();}}
 const listeners=new Map();
 const sandbox={URL,Promise,WeakMap,Date,Cache,CacheStorage,caches:new CacheStorage(),location:{origin},
  MORROVIA_OFFLINE_SHELL:{readerFloor:'idb-recovery-account-homepage-v2',buildCommit:'a'.repeat(40),artifactId:'b'.repeat(64),assets:[{}]},
  addEventListener:(kind,listener)=>listeners.set(kind,listener),
  fetch(){events.fetch++;return reject?Promise.reject(failure):promise;},
  exactAsset(){events.digest++;return Promise.resolve(!reject);},
  clients:{claim(){events.claim++;return Promise.resolve();}},skipWaiting(){return Promise.resolve();}};
 sandbox.globalThis=sandbox;
 vm.runInNewContext('('+installJapanWorkerProbe.toString()+')()',sandbox);
 return {sandbox,events,failure,promise,cache,listeners};
}

test('worker observation preserves native promises, responses and call counts without extra work',async()=>{
 const f=workerFixture();const {sandbox:s}=f;
 assert.equal(s.fetch(asset),f.promise);assert.equal(await s.fetch(asset),await f.promise);
 await s.caches.open('easyt-public-shell-test');assert.equal(f.cache.match(asset),f.promise);
 await f.cache.put(asset,await f.promise);assert.equal(await s.exactAsset(await f.promise,{url:new URL(asset).pathname}),true);await s.clients.claim();
 assert.deepEqual(f.events,{fetch:2,match:1,put:1,digest:1,claim:1});
 const rows=s.__morroviaJapanWorkerDiagnostics.events;
 assert.ok(rows.some(e=>e.kind==='cache-match-result'&&e.hit===true));
 assert.ok(rows.some(e=>e.kind==='digest-result'&&e.exact===true));
 assert.equal(rows.some(e=>JSON.stringify(e).includes('private failure details')),false);
});

test('worker observation propagates the original rejection and records only its class',async()=>{
 const f=workerFixture({reject:true});
 await assert.rejects(f.sandbox.fetch(asset),error=>error===f.failure);
 const rows=f.sandbox.__morroviaJapanWorkerDiagnostics.events;
 assert.ok(rows.some(e=>e.kind==='fetch-rejected'&&e.errorName==='TypeError'));
 assert.equal(JSON.stringify(rows).includes('private failure details'),false);
 assert.equal(f.events.fetch,1);
});

test('worker probe observes fetch events without responding, retrying or touching nonpublic data',async()=>{
 const f=workerFixture();let responded=false;
 f.listeners.get('fetch')({request:{url:asset,mode:'no-cors',destination:'script',cache:'default'},clientId:'client',respondWith(){responded=true;}});
 await f.sandbox.fetch(origin+'/api/private?token=secret');
 assert.equal(responded,false);assert.equal(f.events.fetch,1);assert.equal(f.events.match,0);assert.equal(f.events.put,0);
 assert.equal(JSON.stringify(f.sandbox.__morroviaJapanWorkerDiagnostics).includes('secret'),false);
});
