import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {createRequire} from 'node:module';
import {build} from 'esbuild';
const require=createRequire(import.meta.url);
const {chromium,webkit}=require('/Users/shaun/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fixture=JSON.parse(readFileSync('../projection-evidence/browser-fixture.json','utf8'));
const script=(await build({stdin:{resolveDir:process.cwd(),loader:'js',contents:`
import {openIndexedDbRecoveryDriver} from './lib/easyt/durable-recovery-store';
import {createTwoStoreTripPersistence} from './lib/easyt/two-store-trip-persistence';
import {cacheCanonicalTripWithRecoveryToStorage} from './lib/easyt/storage';
let driver,data;const owner='owner-a';const context={ownerId:owner,isCurrent:()=>true,overflowEnabled:true,accountOverflowQualified:true};
const broker=()=>createTwoStoreTripPersistence(localStorage,driver,context);
window.qa={async seed(f){data=f;driver=await openIndexedDbRecoveryDriver(indexedDB);
 for(const [key,value] of f.native)localStorage.setItem(key,value);
 const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('morrovia-recovery-domain-v1',1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});
 await new Promise((resolve,reject)=>{const tx=db.transaction(['heads','generations','acknowledgements'],'readwrite');for(const [name,rows]of f.domain)for(const [key,value]of rows)tx.objectStore(name).put(value,key);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)});db.close();
 const ack=await broker().acknowledge(f.reviewed,f.canonical,f.handle);if(ack.outcome!=='acknowledged'||!ack.projectionPredecessor)throw Error('Exact browser ACK witness unavailable');
 data.projection.options.projectionOnly.acknowledged=ack.projectionPredecessor;return {outcome:ack.outcome,witness:true};},
 async project(kind){if(kind==='navigation')await broker().clearCurrent();if(kind==='cache')cacheCanonicalTripWithRecoveryToStorage(localStorage,{...data.canonical,title:'Later canonical value',updatedAt:'2026-10-26T00:09:00.000Z'});
 const result=await broker().save(data.projection.trip,data.projection.options);
 if(kind==='success'){if(!result.stored)throw Error('Projection not durable');const next={...data.projection.trip,updatedAt:'2026-10-26T00:10:00.000Z'};const ack=await broker().acknowledge(data.projection.trip,next,result.handle);if(ack.outcome!=='acknowledged')throw Error('Projection ACK refused');data.expected=next;}
 return {stored:result.stored,attempted:result.writeAttempted,deferred:result.projectionDeferred};},
 async reopen(){driver.close();driver=await openIndexedDbRecoveryDriver(indexedDB);const read=await broker().read(data.canonical.id);return {kind:read.kind,exact:read.kind==='found'&&JSON.stringify(read.trip)===JSON.stringify(data.expected),recovery:read.kind==='found'&&Boolean(read.recovery)};},close(){driver?.close();}};
`},bundle:true,write:false,platform:'browser',format:'iife',define:{'process.env':'{}'},logLevel:'silent'})).outputFiles[0].text;
const server=createServer((req,res)=>{res.setHeader('content-type','text/html');res.end('<!doctype html><title>Isolated ACK projection storage test</title><script>'+script.replaceAll('</script>','<\\/script>')+'</script>')});
await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve)});
const base='http://127.0.0.1:'+server.address().port,results=[];
try{for(const [name,engine]of [['chromium',chromium],['webkit',webkit]]){const browser=await engine.launch({headless:true,...(name==='chromium'?{channel:'chrome'}:{})});
 try{for(const scenario of ['success','navigation','cache']){const ctx=await browser.newContext(),page=await ctx.newPage(),unexpected=[];
  await ctx.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():(unexpected.push(route.request().url()),route.abort()));
  try{await page.goto(base);assert.equal((await page.evaluate(f=>window.qa.seed(f),fixture)).witness,true);const result=await page.evaluate(s=>window.qa.project(s),scenario);
   assert.equal(result.stored,scenario==='success');if(scenario==='success'){const read=await page.evaluate(()=>window.qa.reopen());assert.deepEqual(read,{kind:'found',exact:true,recovery:false});}else assert.equal(result.attempted,false);
   assert.deepEqual(unexpected,[]);results.push({browser:name,scenario,...result,pass:true});console.log(name,scenario,'PASS');
  }finally{await page.evaluate(()=>window.qa.close()).catch(()=>{});await ctx.close();}
 }}finally{await browser.close();}}
}finally{await new Promise(resolve=>server.close(resolve));writeFileSync('../combined-evidence/native-browser-results.json',JSON.stringify(results,null,2));}
