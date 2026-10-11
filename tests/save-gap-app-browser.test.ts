import assert from 'node:assert/strict';
import test from 'node:test';
import {createRequire} from 'node:module';
import {captureJourneyBrief} from '../lib/easyt/journey-capture.ts';
const require=createRequire(import.meta.url);
const {chromium}=require('playwright');
const enabled=process.env.MORROVIA_SAVE_GAP_BROWSER_TESTS==='1';
const audit=process.env.MORROVIA_SAVE_GAP_DIAGNOSTIC_AUDIT==='1';
const base=process.env.MORROVIA_BASE_URL??'http://127.0.0.1:3116';
// Disposable contexts only. Synthetic bytes/identity remain inside the page;
// assertions export booleans, bounded production events and operation counts.
async function contextFor(browser:any){
 const context=await browser.newContext();let accountWrites=0;
 await context.route('**/*',async(route:any)=>{
  const url=new URL(route.request().url());if(url.origin!==new URL(base).origin)return route.abort();
  if(!url.pathname.startsWith('/api/'))return route.continue();
  let body:unknown={},status=503;
  if(url.pathname==='/api/auth/get-session'){body=null;status=200;}
  if(url.pathname==='/api/journey-geocode'){body={candidates:[],result:null};status=200;}
  if(url.pathname==='/api/journey-capture'){body=captureJourneyBrief(route.request().postDataJSON().brief);status=200;}
  if(url.pathname.startsWith('/api/easyt/trips')){status=401;if(route.request().method()!=='GET')accountWrites++;}
  return route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
 });
 await context.addInitScript(()=>{const g=window as any;g.gapEvents=[];g.gapBaseline=JSON.parse(sessionStorage.getItem('morrovia-gap-baseline')??'{}');window.addEventListener('morrovia-persistence-outcome',(event:any)=>g.gapEvents.push(event.detail));});
 return{context,writes:()=>accountWrites};
}
async function baseline(page:any){
 await page.goto(`${base}/journey/new?inspire=balkans-overland`);
 await page.getByText('Saved on this device',{exact:true}).first().waitFor();
 await page.locator('[data-builder-edit-session="active"]').waitFor();
 const close=page.getByRole('button',{name:'Close route shaping',exact:true});if(await close.isVisible())await close.click();
 await page.evaluate(()=>{const g=window as any;g.gapBaseline=Object.fromEntries(Object.keys(localStorage).filter(key=>key.startsWith('easyt:trip-recovery:v2:guest:')).map(key=>[key,localStorage.getItem(key)]));sessionStorage.setItem('morrovia-gap-baseline',JSON.stringify(g.gapBaseline));});
}
function firstFailure(events:any[]){return events.find(e=>e.phase==='result'&&!['device-confirmed','account-acknowledged'].includes(e.outcome));}

test('real Next recovery readback failure preserves accepted recovery and reports unconfirmed write',{skip:!enabled,timeout:60000},async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});const v=await contextFor(browser);
 try{
  const page=await v.context.newPage();await baseline(page);
  const state=await page.evaluate(()=>{const g=window as any;g.gapEvents=[];g.gapWriteCount=0;g.gapUnreadable=new Set();
   const get=Storage.prototype.getItem,set=Storage.prototype.setItem;g.gapRead=get;
   const root=document.querySelector('[data-builder-edit-session="active"]') as any;let fiber=root?.[Object.keys(root).find(key=>key.startsWith('__reactFiber$'))!];
   while(fiber&&!g.gapSession){let hook=fiber.memoizedState;while(hook){if(typeof hook.memoizedState?.current?.getSnapshot==='function'){g.gapSession=hook.memoizedState.current;break;}hook=hook.next;}fiber=fiber.return;}
   const accepted=g.gapSession?.getSnapshot();g.gapAcceptedBytes=accepted?JSON.stringify(accepted.trip):null;g.gapAcceptedRevision=accepted?.acceptedRevision;
   Storage.prototype.setItem=function(key,value){if(key.startsWith('easyt:trip-recovery:v2:')){g.gapWriteCount++;g.gapUnreadable.add(key);}return set.call(this,key,value);};
   Storage.prototype.getItem=function(key){return g.gapUnreadable.has(key)?null:get.call(this,key);};
   return{acceptedMounted:Boolean(document.querySelector('[data-builder-edit-session="active"]')),acceptedSessionFound:Boolean(accepted),baselinePresent:Object.keys(g.gapBaseline).length===1};
  });
  assert.equal(state.acceptedMounted,true);assert.equal(state.acceptedSessionFound,true);assert.equal(state.baselinePresent,true);
  const add=page.getByRole('button',{name:/^Add one night to/});let clicked=false;
  for(const button of await add.all())if(await button.isEnabled()){await button.click();clicked=true;break;}
  assert.equal(clicked,true);await page.getByText('Change not saved',{exact:true}).first().waitFor();
  const result=await page.evaluate(()=>{const g=window as any;return{priorPreserved:Object.entries(g.gapBaseline).every(([key,value])=>g.gapRead.call(localStorage,key)===value),writeCount:g.gapWriteCount,canonicalStatePreserved:JSON.stringify(g.gapSession.getSnapshot().trip)===g.gapAcceptedBytes,acceptedRevisionPreserved:g.gapSession.getSnapshot().acceptedRevision===g.gapAcceptedRevision,events:g.gapEvents};});
  assert.equal(result.priorPreserved,true);assert.equal(result.writeCount,1);assert.equal(result.canonicalStatePreserved,true);assert.equal(result.acceptedRevisionPreserved,true);assert.equal(v.writes(),0);
  assert.equal(await page.getByText('Saved on this device',{exact:true}).count(),0);assert.equal(await page.getByText('Trip updated',{exact:true}).count(),0);assert.equal(await page.getByRole('button',{name:'Undo',exact:true}).count(),0);
  assert.ok(result.events.some((e:any)=>e.outcome==='unknown'&&e.deviceCopyVerified===false&&e.nativeFailure===null));
  if(audit){const failure=firstFailure(result.events);assert.equal(failure?.failureBoundary,'recovery-readback');assert.equal(failure?.writeAttempted,true);assert.equal(failure?.readbackConfirmed,false);}
 }finally{await v.context.close();await browser.close();}
});

test('real Next receipt ACK readback failure preserves bytes and exact retry identity',{skip:!enabled,timeout:90000},async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});const v=await contextFor(browser);
 try{
  const page=await v.context.newPage();await baseline(page);
  await v.context.addInitScript(()=>{const g=window as any;g.gapEvents=[];g.gapReceiptWrites=0;g.gapRecoveryWrites=0;g.gapFailReceipt=true;
   const get=Storage.prototype.getItem,set=Storage.prototype.setItem;g.gapRead=get;
   Storage.prototype.setItem=function(key,value){if(key.startsWith('easyt:trip-recovery:v2:'))g.gapRecoveryWrites++;if(key==='easyt-private:guest:homepage-input'&&JSON.parse(value)?.receipt?.version===1)g.gapReceiptWrites++;return set.call(this,key,value);};
   Storage.prototype.getItem=function(key){const value=get.call(this,key);if(g.gapFailReceipt&&key==='easyt-private:guest:homepage-input'&&value&&JSON.parse(value)?.receipt?.version===1)return null;return value;};
  });
  await page.goto(base);
  await page.getByRole('tab',{name:'Describe my trip'}).click();await page.getByRole('textbox',{name:'Start your plan'}).fill('Tokyo and Kyoto in Japan for one week.');await page.getByRole('button',{name:'Plan my trip'}).first().click();
  await page.getByText('Trip opening not confirmed',{exact:true}).waitFor({timeout:15000});await page.getByText('Device copy saved; opening needs checking',{exact:true}).first().waitFor();
  const result=await page.evaluate(()=>{const g=window as any;const recoveries=Object.keys(localStorage).filter(key=>key.startsWith('easyt:trip-recovery:v2:guest:'));g.gapIncompleteKeys=recoveries;g.gapIncompleteBytes=recoveries.map(key=>g.gapRead.call(localStorage,key));return{priorPreserved:Object.entries(g.gapBaseline??{}).every(([key,value])=>g.gapRead.call(localStorage,key)===value),recoveryCount:recoveries.length,receiptWrites:g.gapReceiptWrites,recoveryWrites:g.gapRecoveryWrites,events:g.gapEvents,receiptPending:JSON.parse(g.gapRead.call(localStorage,'easyt-private:guest:homepage-input')??'null')?.receipt?.version===2};});
  assert.equal(result.priorPreserved,true);assert.equal(result.receiptPending,true);assert.ok(result.receiptWrites>=1);assert.ok(result.recoveryWrites>=1);assert.equal(v.writes(),0);assert.equal(await page.getByText('Saved on this device',{exact:true}).count(),0);assert.equal(await page.locator('[data-builder-edit-session="active"]').count(),0);
  assert.ok(result.events.some((e:any)=>e.outcome==='receipt-incomplete'&&e.deviceCopyVerified===true&&e.acknowledgement==='storage'));
  if(audit){const failure=firstFailure(result.events);assert.equal(failure?.failureBoundary,'receipt-readback');assert.equal(failure?.writeAttempted,true);assert.equal(failure?.readbackConfirmed,false);}
  // Release the injected refusal and activate the native retry in one task:
  // the existing background ACK retry may otherwise detach a located button.
  assert.equal(await page.evaluate(()=>{const button=[...document.querySelectorAll('button')].find(button=>button.textContent?.trim()==='Try device save again');if(!button)return false;(window as any).gapFailReceipt=false;button.click();return true;}),true);await page.getByText('Saved on this device',{exact:true}).first().waitFor();
  const retried=await page.evaluate(()=>{const g=window as any;const keys=Object.keys(localStorage).filter(key=>key.startsWith('easyt:trip-recovery:v2:guest:'));return{sameIdentities:keys.length===g.gapIncompleteKeys.length&&keys.every(key=>g.gapIncompleteKeys.includes(key)),sameBytes:g.gapIncompleteKeys.every((key:string,index:number)=>g.gapRead.call(localStorage,key)===g.gapIncompleteBytes[index]),completed:JSON.parse(g.gapRead.call(localStorage,'easyt-private:guest:homepage-input')??'null')?.receipt?.version===1};});
  assert.equal(retried.sameIdentities,true);assert.equal(retried.sameBytes,true);assert.equal(retried.completed,true);assert.equal(v.writes(),0);
 }finally{await v.context.close();await browser.close();}
});

test('real Next unknown hydrated entry scope refuses writes and protects prior recovery',{skip:!enabled,timeout:90000},async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});const v=await contextFor(browser);
 try{
  const page=await v.context.newPage();await baseline(page);
  await v.context.addInitScript(()=>{const g=window as any;g.gapEvents=[];g.gapWriteCount=0;const set=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key.startsWith('easyt:trip-recovery:v2:'))g.gapWriteCount++;return set.call(this,key,value);};});
  const cdp=await v.context.newCDPSession(page);let armed=false,injectId='',injected=0,pendingRestore=false;let debuggerFailure=false;
  cdp.on('Debugger.scriptParsed',async(meta:any)=>{
   if(armed||!meta.url.includes('app/journey/new/trip-builder.tsx'))return;
   armed=true;
   try{const {scriptSource}=await cdp.send('Debugger.getScriptSource',{scriptId:meta.scriptId});const lines=scriptSource.split('\n');const start=lines.findIndex((line:string)=>line.includes('const persistDeviceRecovery ='));const scopeLine=lines.findIndex((line:string,index:number)=>index>start&&line.includes('const ownerId = activeBrowserOwnerId;'));
    assert.ok(start>=0&&scopeLine>start);
    injectId=(await cdp.send('Debugger.setBreakpointByUrl',{url:meta.url,lineNumber:scopeLine})).breakpointId;
   }catch{debuggerFailure=true;}
  });
  cdp.on('Debugger.paused',async(event:any)=>{try{
   // Restore only after stepping out through the actual protected return.
   if(pendingRestore){const result=await cdp.send('Debugger.evaluateOnCallFrame',{callFrameId:event.callFrames[0].callFrameId,expression:'(hydratedOwnerScopeRef.current = activeBrowserOwnerId, true)',returnByValue:true});if(result.result?.value!==true)debuggerFailure=true;pendingRestore=false;await cdp.send('Debugger.resume');return;}
   if(event.hitBreakpoints?.includes(injectId)){const result=await cdp.send('Debugger.evaluateOnCallFrame',{callFrameId:event.callFrames[0].callFrameId,expression:'(hydratedOwnerScopeRef.current = undefined, true)',returnByValue:true});if(result.result?.value!==true)debuggerFailure=true;injected++;pendingRestore=true;await cdp.send('Debugger.stepOut');return;}
   await cdp.send('Debugger.resume');
  }catch{debuggerFailure=true;pendingRestore=false;await cdp.send('Debugger.resume').catch(()=>{});}});
  await cdp.send('Debugger.enable');
  await page.waitForFunction(()=>true);
  for(let tries=0;tries<50&&!injectId&&!debuggerFailure;tries++)await new Promise(resolve=>setTimeout(resolve,20));
  assert.ok(injectId);assert.equal(debuggerFailure,false);
  // Existing module parsed by enable; the native page navigation loads the same
  // production callback, with only its unknown-scope guard input faulted.
  await page.goto(`${base}/journey/new?inspire=iceland-ring-road`);
  await page.waitForFunction(()=>Boolean((window as any).gapEvents.some((e:any)=>e.outcome==='protected-conflict')),{},{timeout:15000}).catch(()=>{assert.equal(debuggerFailure,false);assert.ok(injected>0);throw new Error('Protected entry result not observed');});
  assert.equal(debuggerFailure,false);assert.ok(injected>=1);
  const result=await page.evaluate(()=>{const g=window as any;return{writeCount:g.gapWriteCount,priorPreserved:Object.entries(g.gapBaseline??{}).every(([key,value])=>localStorage.getItem(key)===value),events:g.gapEvents};});
  assert.equal(result.priorPreserved,true);assert.equal(result.writeCount,0);assert.equal(v.writes(),0);assert.equal(await page.getByText('Saved on this device',{exact:true}).count(),0);assert.doesNotMatch(await page.locator('body').innerText(),/Browser storage is blocked/);
  assert.ok(result.events.some((e:any)=>e.scopeMatches===false));assert.ok(result.events.some((e:any)=>e.outcome==='protected-conflict'));
  if(audit){assert.ok(result.events.some((e:any)=>e.phase==='probe'&&e.writeAttempted===false));const failure=firstFailure(result.events);assert.equal(failure?.failureBoundary,'entry-scope');assert.equal(failure?.writeAttempted,false);}
  await cdp.detach();
 }finally{await v.context.close();await browser.close();}
});
