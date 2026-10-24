import assert from 'node:assert/strict';
import test from 'node:test';
import {createServer} from 'node:http';
import {createRequire} from 'node:module';
import {mkdtempSync,readFileSync,readlinkSync,rmSync,existsSync} from 'node:fs';
import {tmpdir,homedir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {builderBundle,builderBrowserTestsEnabled} from './helpers/builder-render.ts';
import {saveReopenTripFixture} from './fixtures/save-reopen-trip.ts';

const root=fileURLToPath(new URL('../',import.meta.url));
const require=createRequire(import.meta.url);
const bundled=`${homedir()}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright`;
const runtime=process.env.MORROVIA_PLAYWRIGHT_MODULE??(existsSync(bundled)?bundled:'playwright');
const marker='  retained unfinished synthetic origin  ',overflow='  seventeenth interrupted synthetic origin  ';
const prefix='easyt:interrupted-builder-input:v1:';

function observedSources(){
 const sources=new Map<string,string>(),hashes:Array<{file:string;sha256:string}>=[];
 const edit=(file:string,replacements:Array<[string,string]>)=>{
  let source=readFileSync(root+file,'utf8');hashes.push({file,sha256:createHash('sha256').update(source).digest('hex')});
  for(const [from,to] of replacements){assert.equal(source.split(from).length,2,'unique observation anchor '+file);source=source.replace(from,to);}
  sources.set(root+file,source);
 };
 edit('app/journey/new/trip-builder.tsx',[
  ['"use client";',`"use client";
   const restartProbe=(window as any).__restartProbe={hold:false,held:false,release:null as any,completion:null as any,retention:null as any,state:null as any};
   (window as any).__retainFixture=retainInterruptedBuilderInput;
   (window as any).__readFixture=readInterruptedBuilderInputs;`],
  ['verified=retainInterruptedBuilderInput(browserRecoveryStorage(),capture).kind===\'verified\';',`const outcome=retainInterruptedBuilderInput(browserRecoveryStorage(),capture);restartProbe.retention=outcome;verified=outcome.kind==='verified';`],
  ['writeDraft: (trip, draft, owner, guard) => writeDurableBuilderInputDraft(trip, draft, owner, guard?.isCurrent, builderInitialOverflowRef.current),',`writeDraft: async (trip,draft,owner,guard)=>{const result=await writeDurableBuilderInputDraft(trip,draft,owner,guard?.isCurrent,builderInitialOverflowRef.current);restartProbe.completion={stored:result.ok,current:guard?.isCurrent()??null};return result;},`],
  ['builderEditSessionRef.current = mountedBuilder?.session ?? null;',`builderEditSessionRef.current = mountedBuilder?.session ?? null;
   restartProbe.state={pending:sessionPending,authenticated:Boolean(authenticatedOwnerId),owner:activeBrowserOwnerId,mounted:Boolean(mountedBuilder),error:mountedBuilder?.snapshot.error??null};`],
 ]);
 edit('lib/easyt/builder-input-persistence.ts',[
  ['const before = await trips.read(trip.id);',`const before = await trips.read(trip.id);const probe=(window as any).__restartProbe;
   if(probe.hold){probe.hold=false;probe.held=true;await new Promise<void>(resolve=>{probe.release=resolve;});}`],
 ]);
 for(const file of ['lib/easyt/interrupted-builder-input.ts','lib/easyt/trip-builder-input-draft.ts','components/easyt/interrupted-input-review.tsx'])edit(file,[]);
 sources.set('fixture:auth',`import {createAuthClient} from 'better-auth/react';const real=createAuthClient();export const authClient={...real,useSession(){const value=real.useSession();window.__authRefetch=value.refetch;return value;}};`);
 return {sources,hashes};
}

test('acknowledged interrupted input survives full isolated browser restarts; capacity never evicts',{skip:!builderBrowserTestsEnabled,timeout:90000},async t=>{
 const trip=saveReopenTripFixture(),savedTrip=JSON.stringify(trip),{sources,hashes}=observedSources();
 const {script}=await builderBundle(false,sources);
 let owner:'owner-a'|'owner-b'|null='owner-a',holdAuth=false,releaseAuth=()=>{};
 let authGate=Promise.resolve();
 let accountWrites=0,externalRequests=0;const errors:string[]=[];const requests:string[]=[];
 const server=createServer(async(request,response)=>{
  const url=new URL(request.url!,'http://127.0.0.1');requests.push(url.pathname);response.setHeader('Content-Type','application/json');
  if(url.pathname==='/api/auth/get-session'){
   if(holdAuth)await authGate;
   response.end(JSON.stringify(owner?{user:{id:owner,name:'Synthetic owner',email:'fixture@example.invalid'},session:{id:'synthetic',userId:owner,expiresAt:'2099-01-01T00:00:00.000Z'}}:null));return;
  }
  if(url.pathname.startsWith('/api/easyt/trips/')){
   if(request.method!=='GET'){accountWrites++;response.statusCode=409;response.end('{}');return;}
   response.statusCode=owner==='owner-a'?200:404;response.end(JSON.stringify(owner==='owner-a'?{trip}:{error:'Trip not found'}));return;
  }
  if(url.pathname.startsWith('/api/')){response.end(JSON.stringify({candidates:[],places:[],result:null,legs:[]}));return;}
  response.setHeader('Content-Type','text/html; charset=utf-8');response.end(`<div id="root"></div><script>${script.replaceAll('</script>','<\\/script>')}</script>`);
 });
 const profile=mkdtempSync(join(tmpdir(),'morrovia-interrupted-restart-'));
 const {chromium}=require(runtime);let context:any=null,page:any=null;
 const processIds:number[]=[];let port=0;
 const dead=(pid:number)=>{try{process.kill(pid,0);return false;}catch(error){if((error as NodeJS.ErrnoException).code==='ESRCH')return true;throw error;}};
 const launch=async()=>{
  const executablePath=process.env.MORROVIA_BUILDER_BROWSER_EXECUTABLE;
  assert.ok(executablePath&&existsSync(executablePath),'use the explicitly selected installed test browser');
  context=await chromium.launchPersistentContext(profile,{executablePath,headless:true});
  // Chromium writes this lock in our freshly created test-only profile; no user profile is read.
  const pid=Number(readlinkSync(join(profile,'SingletonLock')).split('-').at(-1));assert.ok(Number.isSafeInteger(pid)&&pid>0);
  assert.ok(!dead(pid),'test browser process exists');assert.ok(!processIds.includes(pid),'new process, not a page reload');processIds.push(pid);
  await context.route('**/*',async(route:any)=>{const u=new URL(route.request().url());if(u.protocol==='http:'&&u.hostname==='127.0.0.1'&&u.port===String(port))await route.continue();else{externalRequests++;await route.abort();}});
  page=context.pages()[0]??await context.newPage();page.on('pageerror',(error:Error)=>errors.push(error.message));
  await page.goto(`http://127.0.0.1:${port}/journey/new?trip=${trip.id}`);
  await page.waitForFunction(()=>Boolean((window as any).__restartProbe?.state)&&!(window as any).__restartProbe.state.pending);
 };
 const closeProcess=async()=>{
  if(!context)return;const pid=processIds.at(-1)!;await context.close();context=null;page=null;
  assert.ok(dead(pid),'closing persistent context waits for the entire test browser process to exit');
 };
 const snapshot=()=>page.evaluate(async()=>{
  const native=Object.fromEntries(Object.keys(localStorage).sort().filter(k=>k.includes('trip')||k.includes('builder')).map(k=>[k,localStorage.getItem(k)]));
  const domain:Record<string,unknown>={};
  for(const info of await indexedDB.databases()){
   if(!info.name)continue;const db=await new Promise<IDBDatabase>((resolve,reject)=>{const r=indexedDB.open(info.name!);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
   try{for(const store of Array.from(db.objectStoreNames))domain[info.name+'/'+store]=await new Promise((resolve,reject)=>{const r=db.transaction(store,'readonly').objectStore(store).getAll();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}finally{db.close();}
  }
  return {native,domain};
 });
 const preserve=(before:any,after:any)=>{
  assert.deepEqual(after.domain,before.domain,'all IndexedDB records survive unchanged');
  for(const key of Object.keys(before.native)){
   if(key.startsWith('easyt:trip-cache:')){const {cachedAt:oldTime,...a}=JSON.parse(before.native[key]);const {cachedAt:newTime,...b}=JSON.parse(after.native[key]);assert.equal(typeof oldTime,'string');assert.equal(typeof newTime,'string');assert.deepEqual(b,a,'saved canonical trip is unchanged');}
   else assert.equal(after.native[key],before.native[key],'existing record bytes preserved: '+key);
  }
 };
 const interrupt=async(raw:string)=>{
  await page.evaluate(()=>{const p=(window as any).__restartProbe;p.hold=true;p.held=false;p.completion=null;p.retention=null;});
  await page.locator('#builder-origin').getByRole('combobox').first().fill(raw);
  await page.waitForFunction(()=>(window as any).__restartProbe.held);
  owner=null;await page.evaluate(async()=>{await (window as any).__authRefetch();});
  await page.waitForFunction(()=>{const s=(window as any).__restartProbe.state;return !s.pending&&!s.authenticated&&s.owner==='owner-a';});
  holdAuth=true;authGate=new Promise<void>(resolve=>{releaseAuth=resolve;});await page.evaluate(()=>{void (window as any).__authRefetch();});
  await page.waitForFunction(()=>(window as any).__restartProbe.state.pending&&(window as any).__restartProbe.retention!==null);
  const result=await page.evaluate(()=>(window as any).__restartProbe.retention);
  await page.evaluate(()=>(window as any).__restartProbe.release());
  await page.waitForFunction(()=>(window as any).__restartProbe.completion?.current===false);
  assert.deepEqual(await page.evaluate(()=>(window as any).__restartProbe.completion),{stored:false,current:false});
  owner='owner-a';holdAuth=false;releaseAuth();await page.waitForFunction(()=>(window as any).__restartProbe.state.owner==='owner-a'&&!(window as any).__restartProbe.state.pending);
  return result;
 };
 try{
  await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});port=(server.address() as {port:number}).port;
  await launch();await page.waitForFunction(()=>(window as any).__restartProbe.state.mounted);
  const before=await snapshot(),originalOrigin=await page.locator('#builder-origin').getByRole('combobox').first().inputValue();
  assert.deepEqual(await interrupt(marker),{kind:'verified'});
  await page.getByText('Review edit 1',{exact:true}).click();assert.equal(await page.getByRole('textbox',{name:/Interrupted starting point/}).inputValue(),marker);
  const acknowledged=await snapshot();preserve(before,acknowledged);
  const captureKeys=Object.keys(acknowledged.native).filter(k=>k.startsWith(prefix));assert.equal(captureKeys.length,1);
  const record=JSON.parse(acknowledged.native[captureKeys[0]]);
  await closeProcess();
  owner='owner-b';await launch();
  await page.waitForFunction(()=>{const s=(window as any).__restartProbe.state;return !s.pending&&s.owner==='owner-b';});
  // Let the ordinary exact-trip B read reach its existing unavailable state.
  await page.getByText('This trip is not available to the current browser account.',{exact:false}).waitFor();
  assert.equal(await page.getByRole('region',{name:'Interrupted edits'}).count(),0);assert.equal(await page.getByRole('textbox').count(),0);
  assert.ok(!(await page.locator('body').innerText()).includes(marker.trim()));
  assert.deepEqual(await page.evaluate((id:string)=>(window as any).__readFixture(localStorage,'owner-b',id),trip.id),{records:[],unreadable:false});
  preserve(acknowledged,await snapshot());await closeProcess();
  owner='owner-a';await launch();await page.waitForFunction(()=>(window as any).__restartProbe.state.mounted);
  await page.getByText('Review edit 1',{exact:true}).click();
  assert.equal(await page.getByRole('textbox',{name:/Interrupted starting point/}).inputValue(),marker);
  assert.equal(await page.getByRole('textbox',{name:/Interrupted starting point/}).getAttribute('readonly'),'');
  assert.equal(await page.locator('#builder-origin').getByRole('combobox').first().inputValue(),originalOrigin,'retained input is not automatically applied');
  preserve(acknowledged,await snapshot());
  // Fill the remaining 15 slots using the real retention adapter and valid synthetic records.
  const retained=await page.evaluate((source:any)=>Array.from({length:15},(_,i)=>(window as any).__retainFixture(localStorage,{...source,captureId:'capacity-'+i})),record);
  assert.deepEqual(retained,Array.from({length:15},()=>({kind:'verified'})));
  const full=await snapshot();assert.equal(Object.keys(full.native).filter(k=>k.startsWith(prefix)).length,16);
  assert.equal(await page.evaluate((id:string)=>(window as any).__readFixture(localStorage,'owner-a',id).records.length,trip.id),16);
  assert.deepEqual(await interrupt(overflow),{kind:'unavailable',reason:'capacity'});
  await page.getByText('They could not be saved. Keep this tab open.',{exact:true}).waitFor();
  assert.equal(await page.getByText('Interrupted edits on this device',{exact:true}).count(),0,'no durable-success panel for the seventeenth input');
  await page.getByText('Review edit 1',{exact:true}).click();assert.equal(await page.getByRole('textbox',{name:/Interrupted starting point/}).inputValue(),overflow);
  assert.equal(await page.locator('[data-builder-edit-session="active"]').count(),0);
  assert.equal(await page.evaluate(()=>{const event=new Event('beforeunload',{cancelable:true});window.dispatchEvent(event);return event.defaultPrevented;}),true,'memory-only input retains a close warning');
  const refused=await snapshot();preserve(full,refused);assert.deepEqual(Object.keys(refused.native),Object.keys(full.native),'no silent eviction or seventeenth persisted copy');
  await page.getByRole('button',{name:'Save recovery copy',exact:true}).click();
  await page.getByText('They could not be saved. Keep this tab open.',{exact:true}).waitFor();
  preserve(full,await snapshot());assert.equal(await page.evaluate((id:string)=>(window as any).__readFixture(localStorage,'owner-a',id).records.length,trip.id),16);
  assert.equal(accountWrites,0);assert.equal(JSON.stringify(trip),savedTrip);assert.deepEqual(errors,[]);
  await closeProcess();assert.ok(processIds.every(dead));
  t.diagnostic(JSON.stringify({hashes,browserProcesses:processIds,allExited:true,sameProfile:true,sameOrigin:true,ownerIsolation:true,separateReadOnlyRecovery:true,canonicalTripUnchanged:true,capacity:16,seventeenthRetainedOnlyInMemory:true,existingCopiesPreserved:true,accountWrites,externalRequests}));
 }catch(error){t.diagnostic(JSON.stringify({errors,requests,processIds,page:page?await page.evaluate(()=>({probe:(window as any).__restartProbe,body:document.body.innerText.slice(0,500)})).catch(()=>null):null}));throw error;}finally{
  holdAuth=false;releaseAuth();if(page)await page.evaluate(()=>(window as any).__restartProbe?.release?.()).catch(()=>{});
  try{await closeProcess();}finally{await new Promise<void>(resolve=>server.close(()=>resolve()));rmSync(profile,{recursive:true,force:true});}
 }
});
