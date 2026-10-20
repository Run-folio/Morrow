import assert from 'node:assert/strict';
import test from 'node:test';
import {createServer} from 'node:http';
import {mkdirSync,writeFileSync,existsSync,mkdtempSync,rmSync} from 'node:fs';
import {createRequire} from 'node:module';
import {homedir,tmpdir} from 'node:os';
import {join} from 'node:path';
import {browserFixture,browserBundle,inputCopies,assertAncestors} from './helpers/idb-projection-browser.mjs';
const require=createRequire(import.meta.url),bundled=homedir()+'/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright';
const {chromium}=require(process.env.MORROVIA_PLAYWRIGHT_MODULE??(existsSync(bundled)?bundled:'playwright'));
const enabled=process.env.MORROVIA_IDB_BROWSER_TESTS==='1';
const artifacts=process.env.MORROVIA_BROWSER_ARTIFACT_DIR??'output/playwright/idb-projection';
let server,browser,base;
test.before(async()=>{if(!enabled)return;const script=await browserBundle;
 server=createServer((req,res)=>{res.setHeader('Content-Type','text/html');res.end('<h1>Disposable IndexedDB projection verification</h1><script>'+script.replaceAll('</script>','<\\/script>')+'</script>');});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));base='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({channel:process.env.MORROVIA_BROWSER_CHANNEL??'chrome',headless:true,timeout:15000});mkdirSync(artifacts,{recursive:true});
},{timeout:30000});
test.after(async()=>{await browser?.close();if(server)await new Promise(resolve=>server.close(resolve));});
async function isolated(name,run,mode='indexeddb-body',owner=null){
 const fixture=await browserFixture(mode,owner),context=await browser.newContext(),errors=[],unexpected=[];
 await context.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():(unexpected.push(route.request().url()),route.abort()));
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 await context.tracing.start({screenshots:true,snapshots:true,sources:true});
 try{await page.goto(base);const before=await page.evaluate(value=>window.idbQa.seed(value),fixture);
  const report=await run({page,context,fixture,before});assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);
  writeFileSync(artifacts+'/'+name+'.json',JSON.stringify({name,engine:browser.version(),mode,owner:owner===null?'guest':'synthetic-account',errors,unexpected,accountWrites:0,...report},null,2)+'\n');
  await context.tracing.stop();
 }catch(error){await page.screenshot({path:artifacts+'/'+name+'-failure.png'}).catch(()=>{});await context.tracing.stop({path:artifacts+'/'+name+'-failure.zip'}).catch(()=>{});throw error;}
 finally{await context.close();}
}
async function otherTab(context,fixture){const page=await context.newPage();await page.goto(base);await page.evaluate(value=>window.idbQa.attach(value),fixture);return page;}
for(const [mode,owner] of [['indexeddb-body',null],['indexeddb-body','synthetic-browser-owner'],['native',null]])
 test(`real Chromium ${mode} ${owner??'guest'} completion retains exact input and cold-reopens`,{skip:!enabled,timeout:30000},async()=>isolated('complete-'+mode+'-'+(owner??'guest'),async({page,context,fixture,before})=>{
  const result=await page.evaluate(()=>window.idbQa.project());assert.equal(result.stored,true);assert.equal(result.readbackConfirmed,true);
  const after=await page.evaluate(()=>window.idbQa.snapshot());assert.deepEqual(inputCopies(after,fixture),inputCopies(before,fixture));
  if(mode==='indexeddb-body'){assertAncestors(after,before);assert.deepEqual(after.native,before.native);}
  await page.close();const cold=await otherTab(context,fixture),read=await cold.evaluate(()=>window.idbQa.read());
  assert.equal(read.kind,'found');assert.deepEqual(read.trip,fixture.candidate);
  return {result,inputGenerationExact:true,ancestorsRetained:mode==='indexeddb-body',coldNewDocument:true,completedTripExact:true};
 },mode,owner));
test('real Chromium mixed storage stays deferred on two deliberate attempts',{skip:!enabled,timeout:30000},async()=>isolated('mixed-deferred',async({page,before})=>{
 const results=[];for(let i=0;i<2;i++){const r=await page.evaluate(()=>window.idbQa.project());assert.equal(r.stored,false);assert.equal(r.projectionDeferred,true);assert.equal(r.writeAttempted,false);results.push(r);}
 assert.deepEqual(await page.evaluate(()=>window.idbQa.snapshot()),before);return {results,allCopiesExact:true};
},'indexeddb-input'));
for(const kind of ['body','input','input-away-back','mark-auth','discard','clear-current','other-trip'])
 test(`real Chromium second-tab ${kind} after capture is preserved`,{skip:!enabled,timeout:30000},async()=>isolated('race-'+kind,async({page,context,fixture})=>{
  const other=await otherTab(context,fixture);await page.evaluate(()=>window.idbQa.pause());
  const pending=page.evaluate(()=>window.idbQa.project());await page.waitForFunction(()=>window.idbQa.reached);
  const transition=await other.evaluate(kind=>window.idbQa.change(kind),kind);assert.ok(transition===true||transition.stored===true);
  const accepted=await other.evaluate(()=>window.idbQa.snapshot());await page.evaluate(()=>window.idbQa.release());
  const result=await pending;assert.equal(result.stored,false);assert.equal(result.writeAttempted,true);assert.notEqual(result.projectionDeferred,true);
  assert.deepEqual(await other.evaluate(()=>window.idbQa.snapshot()),accepted);return {result,supportedTransition:kind,acceptedCopiesExact:true};
 }));
for(const kind of ['clear-current','other-trip'])test(`real Chromium earlier ${kind} remains selected through projection and replay`,{skip:!enabled,timeout:30000},async()=>isolated('early-'+kind,async({page,context,fixture})=>{
 const other=await otherTab(context,fixture);const changed=await other.evaluate(kind=>window.idbQa.change(kind),kind);assert.ok(changed===true||changed.stored===true);
 const accepted=await other.evaluate(()=>window.idbQa.snapshot()),results=[];
 for(let i=0;i<2;i++){const result=await page.evaluate(()=>window.idbQa.project());assert.equal(result.stored,false);assert.equal(result.writeAttempted,false);results.push(result);}
 assert.deepEqual(await other.evaluate(()=>window.idbQa.snapshot()),accepted);return {results,acceptedCopiesExact:true,current:await other.evaluate(()=>window.idbQa.current())};
}));
for(const kind of ['startup','abort','uncertain-before','uncertain-after','readback'])
 test(`real Chromium injected ${kind} retains honest outcome and durable bytes`,{skip:!enabled,timeout:30000},async()=>isolated('fault-'+kind,async({page,context,fixture,before})=>{
  await page.evaluate(kind=>window.idbQa.setFault(kind),kind);const result=await page.evaluate(()=>window.idbQa.project());
  assert.equal(result.stored,false);assert.equal(result.writeAttempted,kind!=='startup');assert.notEqual(result.projectionDeferred,true);
  assert.equal(result.recoveryCommitted,kind==='readback'?true:kind.startsWith('uncertain')?undefined:false);assert.equal(result.readbackConfirmed,false);
  const cold=await otherTab(context,fixture),after=await cold.evaluate(()=>window.idbQa.snapshot()),read=await cold.evaluate(()=>window.idbQa.read());
  assert.equal(read.kind,'found');const committed=['uncertain-after','readback'].includes(kind);assert.deepEqual(read.trip,committed?fixture.candidate:fixture.source);
  assert.deepEqual(inputCopies(after,fixture),inputCopies(before,fixture));assertAncestors(after,before);if(!committed)assert.deepEqual(after,before);
  if(committed){assert.equal((await cold.evaluate(()=>window.idbQa.project())).stored,false);assert.deepEqual(await cold.evaluate(()=>window.idbQa.snapshot()),after);}
  return {faultInjected:true,result,coldRead:committed?'candidate':'original',inputGenerationExact:true,ancestorsRetained:true,staleReplayPreserved:true};
 }));
for(const owner of [null,'synthetic-browser-owner'])test(`real Chromium simultaneous broker replacements have one winner for ${owner??'guest'}`,{skip:!enabled,timeout:30000},async()=>isolated('simultaneous-'+(owner??'guest'),async({page,context,fixture,before})=>{
 const other=await otherTab(context,fixture);
 await Promise.all([page.evaluate(()=>window.idbQa.pause()),other.evaluate(()=>window.idbQa.pause('other-tab-body'))]);
 const pending=[page.evaluate(()=>window.idbQa.project()),other.evaluate(()=>window.idbQa.change('body'))];
 await Promise.all([page.waitForFunction(()=>window.idbQa.reached),other.waitForFunction(()=>window.idbQa.reached)]);
 assert.deepEqual(await page.evaluate(()=>window.idbQa.snapshot()),before,'both captured eligible operations wait before native transactions');
 await Promise.all([page.evaluate(()=>window.idbQa.release()),other.evaluate(()=>window.idbQa.release())]);
 const results=await Promise.all(pending);
 const decisions=await Promise.all([page.evaluate(()=>window.idbQa.decisions),other.evaluate(()=>window.idbQa.decisions)]);
 assert.ok(decisions[0].includes(fixture.options.writeId));assert.ok(decisions[1].includes('other-tab-body'));
 assert.equal(results[0].writeAttempted,true);assert.notEqual(results[0].projectionDeferred,true);
 assert.equal(results.filter(result=>result.stored).length,1);
 const after=await page.evaluate(()=>window.idbQa.snapshot());assertAncestors(after,before);
 const cold=await otherTab(context,fixture),read=await cold.evaluate(()=>window.idbQa.read());assert.equal(read.kind,'found');
 if(results[0].stored){assert.deepEqual(read.trip,fixture.candidate);assert.deepEqual(inputCopies(after,fixture),inputCopies(before,fixture));}
 else assert.equal(read.trip.title,'Authored by other disposable tab');
 return {results,bothCaptured:true,nativeTransactionDecisions:decisions,oneWinner:true,coldReadable:true,ancestorsRetained:true};
},'indexeddb-body',owner));

test('real Chrome process restart cold-opens the exact committed IDB projection and input generation',{skip:!enabled,timeout:45000},async()=>{
 const fixture=await browserFixture(),profile=mkdtempSync(join(tmpdir(),'morrovia-idb-disposable-'));let context;
 const open=async()=>{const next=await chromium.launchPersistentContext(profile,{channel:process.env.MORROVIA_BROWSER_CHANNEL??'chrome',headless:true,timeout:15000});
  await next.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());return next;};
 try{
  context=await open();let page=context.pages()[0];await page.goto(base);const before=await page.evaluate(value=>window.idbQa.seed(value),fixture);
  assert.equal((await page.evaluate(()=>window.idbQa.project())).stored,true);const committed=await page.evaluate(()=>window.idbQa.snapshot());
  assert.deepEqual(inputCopies(committed,fixture),inputCopies(before,fixture));await context.close();context=null;
  context=await open();page=context.pages()[0];await page.goto(base);await page.evaluate(value=>window.idbQa.attach(value),fixture);
  const read=await page.evaluate(()=>window.idbQa.read());assert.equal(read.kind,'found');assert.deepEqual(read.trip,fixture.candidate);
  assert.deepEqual(await page.evaluate(()=>window.idbQa.snapshot()),committed);
  writeFileSync(artifacts+'/process-restart.json',JSON.stringify({engine:browser.version(),browserProcessRestart:true,committedTripExact:true,inputGenerationExact:true,allCopiesExact:true,accountWrites:0,syntheticDisposableProfile:true},null,2)+'\n');
 }finally{await context?.close();rmSync(profile,{recursive:true,force:true});}
});
