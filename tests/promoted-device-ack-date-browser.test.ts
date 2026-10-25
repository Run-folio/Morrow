import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {renderBuilder} from './helpers/builder-render.ts';
import {canonicalRouteFixture} from './fixtures/batch14-route-documents.ts';
import {requireReadableTripDocument} from '../lib/easyt/trip-document.ts';
import {prepareBuilderHandlerEdit} from '../lib/easyt/trip-builder-handler-contract.ts';
import {builderDocumentFingerprint} from '../lib/easyt/trip-builder-document-commit.ts';
import {accountNormalization,transferResponse,proveSuccessfulContract} from './helpers/successful-transfer-fixture.ts';
import {jsonbObjectOrder} from './fixtures/save-reopen-trip.ts';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
import {tripFromBuilder} from '../lib/easyt/trip.ts';
import {acceptedGeographicPlace} from '../lib/easyt/geographic-binding.ts';
import {projectBuilderCalendar} from '../lib/easyt/trip-builder-calendar.ts';
import {selectedStopsHomepageInput} from './fixtures/homepage-dual-entry.ts';
import {selectedTransferPlace} from './fixtures/accepted-transfer-place.ts';
const creationMode=process.env.CALENDAR_CREATION??'guest';assert.ok(['signed-in','guest'].includes(creationMode));
const sourceMode=process.env.CALENDAR_SOURCE??'candidate';
const ackFailure=process.env.PRIMARY_DATE_ACK_FAILURE==='1';
const out=process.env.PRIMARY_DATE_EVIDENCE;
const sha=sourceMode==='baseline'?'00adb52f96d20870b145d9efe4efbb8a315d34bb':'2b870a82958f0e4e63b44ec66a24db3ab6791ec5';
const files:any[]=[];
function overrides(){
 const result=new Map<string,string>();
 if(sourceMode==='baseline'){for(const f of execFileSync('git',['diff','--name-only',sha,'2b870a82958f0e4e63b44ec66a24db3ab6791ec5'],{cwd:root,encoding:'utf8'}).trim().split('\n').filter(f=>/^(app|lib|components)\//.test(f)&&/\.tsx?$/.test(f))){try{const text=execFileSync('git',['show',sha+':'+f],{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']});result.set(root+f,text);files.push({file:f,sha256:createHash('sha256').update(text).digest('hex'),baselineOverride:true});}catch{assert.equal(execFileSync('git',['cat-file','-e','2b870a82958f0e4e63b44ec66a24db3ab6791ec5:'+f],{cwd:root}).length,0);result.set(root+f,"throw new Error('New candidate-only module unexpectedly used by baseline');");}}}
 const edit=(file:string,pairs:[string,string][])=>{let source=result.get(root+file)??readFileSync(root+file,'utf8');if(sourceMode!=='candidate')assert.equal(source,execFileSync('git',['show',sha+':'+file],{cwd:root,encoding:'utf8'}));files.push({file,sha256:createHash('sha256').update(source).digest('hex')});for(const [a,b]of pairs){assert.equal(source.split(a).length,2,'unique observation anchor '+file);source=source.replace(a,b)}result.set(root+file,source)};
 edit('app/journey/new/trip-builder.tsx',[
 ['"use client";',`"use client";const __cal=(window as any).__calendar={trace:[],snapshots:[],current:null};`],
 ['const updateTravelRange = async (requestedStart: string, requestedEnd: string) => {',`const updateTravelRange = async (requestedStart: string, requestedEnd: string) => { __cal.trace.push({kind:'date-handler',requestedStart,requestedEnd,editorPresent:Boolean(builderEditSessionRef.current)});`],
 ['const result=await acknowledgeTripBuildSave(reviewed,canonical,handle,{isCurrent:guard?.isCurrent??(()=>builderMountedRef.current&&activeBrowserOwnerIdRef.current===handle.ownerId)});',
  `const result=await acknowledgeTripBuildSave(reviewed,canonical,handle,{isCurrent:guard?.isCurrent??(()=>builderMountedRef.current&&activeBrowserOwnerIdRef.current===handle.ownerId)});
   const p=(window as any).__calendar;if(p.holdAck&&result.outcome==='acknowledged'){p.ackHeld=true;await new Promise<void>(resolve=>{p.releaseAck=resolve;});if(${ackFailure})throw new Error('Synthetic ACK readback timeout');}`],
 ['const result = await editor.acceptBatch(edits, options?.expectedInputRevision ?? editor.getSnapshot().inputRevision, options?.acceptedInputs);',
  `const result = await editor.acceptBatch(edits, options?.expectedInputRevision ?? editor.getSnapshot().inputRevision, options?.acceptedInputs);
   (window as any).__calendar.trace.push({kind:'command-finished',kinds:edits.map(edit=>edit.kind),ok:result.ok});`],
 ]);
 edit('app/journey/new/use-builder-edit-session.ts',[
 ['const publish = () => { if (isCurrent()) setMounted({ scope, session: created, snapshot: created.getSnapshot() }); };',`const publish = () => { if (isCurrent()) {const s=created.getSnapshot(),p=(window as any).__calendar;const v={browserOwnerPresent:s.browserOwnerId!==null,tripOwnerPresent:s.trip.ownerId!==null,recoveryPresent:Boolean(s.recovery),recoveryBackend:s.recovery?.backend??'native-or-absent',historicalRecovery:s.historicalRecovery,start:s.trip.startDate,end:s.trip.endDate,order:s.trip.stops.map(x=>x.name),nights:s.trip.stops.map(x=>x.nights),acceptedRevision:s.acceptedRevision,inputRevision:s.inputRevision,saveState:s.saveState,error:s.error?{category:s.error.category,message:s.error.message,deviceOutcome:s.error.deviceOutcome}:null,residual:s.trip.brief.cascadeStatus?.routeReconciliation?.residual?.map(x=>({kind:x.kind,phase:x.phase}))??[]};p.current=v;p.snapshots.push(v);setMounted({scope,session:created,snapshot:s});} };`],
 ]);
 edit('lib/easyt/trip-builder-async-edit-session.ts',[
 ['try { result = await options.saveRecovery(frozen, metadata); }',`try {(window as any).__calendar.trace.push({kind:'device-start',start:frozen.startDate,end:frozen.endDate,projection:Boolean(continuation?.projectionOnly),acceptedRevision,inputRevision});result = await options.saveRecovery(frozen, metadata);(window as any).__calendar.trace.push({kind:'device-result',start:frozen.startDate,end:frozen.endDate,projection:Boolean(continuation?.projectionOnly),stored:result.stored,blocked:result.blockedByExistingRecovery,attempted:result.writeAttempted,reason:result.failureReason,readback:result.readbackConfirmed,pointer:result.pointerAcknowledged});}`],
 ["if (devicePending && !await awaitDeviceWrites()) return { ok: false as const, reason: 'stale-source' as const };",
  "if(devicePending)(window as any).__calendar.commandWaiting=true; if (devicePending && !await awaitDeviceWrites()) return { ok: false as const, reason: 'stale-source' as const };"],
 ]);
 edit('lib/easyt/persistence-outcome.ts',[
 ['export function reportQaProtectedWriteRefusal(check: QaProtectedWriteCheck, isCurrent: () => boolean, writeAttempted: boolean | undefined, readReason?: string) {',`export function reportQaProtectedWriteRefusal(check: QaProtectedWriteCheck, isCurrent: () => boolean, writeAttempted: boolean | undefined, readReason?: string) { (window as any).__calendar?.trace.push({kind:'protected-check',check,writeAttempted,readReason});`],
 ['export function reportPersistenceOutcome(stage: PersistenceStage, result: RecoveryPersistenceEvidence) {',`export function reportPersistenceOutcome(stage: PersistenceStage, result: RecoveryPersistenceEvidence) { (window as any).__calendar?.trace.push({kind:'outcome',stage,stored:result.stored,blocked:result.blockedByExistingRecovery,reason:result.failureReason,attempted:result.writeAttempted});`],
 ]);return result;
}

test('promoted reopened guest date edit during completed durable ACK awaiting editor delivery', {skip:process.env.MORROVIA_BUILDER_BROWSER_TESTS!=='1',timeout:120000},async()=>{
 const evidence:any={sha,creationMode,browser:process.env.PRIMARY_DATE_BROWSER??'webkit',contract:await proveSuccessfulContract(),sources:files,milestones:[],requests:[],transfers:[]};
 const snapshot=selectedStopsHomepageInput(creationMode==='guest'?null:'owner-a',[['tokyo','Tokyo'],['kyoto','Kyoto'],['hiroshima','Hiroshima']]);
 snapshot.origin={state:'selected',value:selectedTransferPlace('London','United Kingdom','reference:geonames:2643743','endpoint')};snapshot.tripType={state:'selected',value:'return_to_start'};snapshot.dates={state:'selected',value:{start:'2027-11-10',end:'2027-11-24'}};
 const city=(id:string,name:string,country:string,coordinates:number[])=>({name,country,canonicalPlaceId:id,providerId:'fixture:'+id,coordinates,kind:'city',placeType:'city',routability:'direct_destination'});
 let cloud:any=null;

 let armed=false,held=false,release=()=>{};const gate=new Promise<void>(r=>{release=r});let h:any;
 try{
 h=await renderBuilder({browserName:process.env.PRIMARY_DATE_BROWSER==='chromium'?'chromium':'webkit',path:'/',storedInput:{snapshot},seedRecovery:false,ownerId:creationMode==='guest'?undefined:'owner-a',simulatedSignIn:creationMode==='guest',forceResolver:true,offlineOnly:true,sourceOverrides:overrides(),geocodeCandidates:{Tokyo:[city('tokyo','Tokyo','Japan',[139.6917,35.6895])],Kyoto:[city('kyoto','Kyoto','Japan',[135.7681,35.0116])],Hiroshima:[city('hiroshima','Hiroshima','Japan',[132.4553,34.3853])]},
 transferRequest:async({legs})=>{const r=await transferResponse(legs);evidence.transfers.push({count:legs.length,status:r.status,completed:r.body.assessments?.filter((a:any)=>a.state.retrieval==='completed').length});return r;},
 accountRequest:async({method,trip})=>{
 if(method==='GET'&&!cloud)return {status:404,body:{error:'not-found'}};
 if(method==='GET'){evidence.requests.push({method,status:200,start:cloud.startDate,end:cloud.endDate});return {status:200,body:{trip:jsonbObjectOrder(await accountNormalization(cloud,'GET'))}}}
 const next=requireReadableTripDocument(trip);if(cloud&&next.updatedAt!==cloud.updatedAt){evidence.requests.push({method,status:409});return {status:409,body:{trip:cloud,conflictReason:'cloud-changed'}}}
 cloud=await accountNormalization(next,method as 'POST'|'PUT');const response=structuredClone(cloud);const row={method,status:method==='POST'?201:200,start:cloud.startDate,end:cloud.endDate,held:false,released:false};evidence.requests.push(row);
 if(armed&&!held&&next.startDate==='2027-11-11'){held=true;row.held=true;await gate;row.released=true;}
 return {status:row.status,body:{trip:jsonbObjectOrder(response),outcome:method==='POST'?'promoted':'updated'}};
 }});
 const page=h.page;page.setDefaultTimeout(6000);
 const settled=async()=>{await page.waitForFunction(()=>{const s=(window as any).__calendar.current;return s?.error||s?.saveState==='cloud'||s?.saveState==='saved'},{},{timeout:12000});const s=await page.evaluate(()=>(window as any).__calendar.current);assert.equal(s.error,null,JSON.stringify(s));await page.getByText('Saved to your account',{exact:true}).first().waitFor();};
 await page.getByRole('button',{name:'Plan my trip',exact:true}).click();await page.locator('[data-builder-edit-session="active"]').waitFor();
 await page.getByRole('button',{name:/^Build trip/}).click();await page.getByRole('region',{name:'Trip overview',exact:true}).waitFor();
 if(creationMode==='guest'){await page.getByRole('link',{name:'Sign up to keep this route across devices',exact:true}).click();await page.getByRole('button',{name:'Complete simulated sign in',exact:true}).click();}
 if(creationMode==='guest')await page.getByText('Saved to your account',{exact:true}).first().waitFor();for(let i=0;i<100&&!cloud;i++)await page.waitForTimeout(50);assert.ok(cloud);evidence.milestones.push(creationMode==='guest'?'guest-promoted-account-ack':'signed-in-created-account-ack');
 await page.getByRole('link',{name:'Edit trip brief',exact:true}).click();await page.locator('[data-builder-edit-session="active"]').waitFor();await settled();
 await page.reload();await page.locator('[data-builder-edit-session="active"]').waitFor();await settled();evidence.milestones.push('saved-trip-reopened');
 const beforePreviewRequests=evidence.requests.filter((r:any)=>r.method!=='GET').length;
 await page.getByRole('button',{name:/Travel dates/}).click();await page.locator('button[data-date="2027-11-11"]').click();await page.keyboard.press('Escape');
 assert.equal(await page.evaluate(()=>(window as any).__calendar.trace.filter((e:any)=>e.kind==='date-handler').length),0);
 assert.deepEqual([cloud.startDate,cloud.endDate],['2027-11-10','2027-11-24']);
 assert.equal(evidence.requests.filter((r:any)=>r.method!=='GET').length,beforePreviewRequests);evidence.milestones.push('partial-range-cancelled-without-save');
 await page.evaluate(()=>{(window as any).__calendar.holdAck=true;});
 await page.getByRole('button',{name:/Remove one night from Kyoto/}).click();
 await page.waitForFunction(()=>(window as any).__calendar.ackHeld);evidence.milestones.push('real-durable-ack-complete-editor-delivery-held');
 evidence.beforeDate=await page.evaluate(()=>(window as any).__calendar);
 await page.getByRole('button',{name:/Travel dates/}).click();await page.locator('button[data-date="2027-11-11"]').click();
 assert.equal(await page.locator('button[data-date="2027-11-11"]').getAttribute('aria-selected'),'true','first boundary is visible immediately as local preview');
 assert.equal(await page.evaluate(()=>(window as any).__calendar.trace.filter((e:any)=>e.kind==='date-handler').length),0,'partial start does not submit a canonical edit');
 await page.locator('button[data-date="2027-11-25"]').click();
 await page.waitForFunction(()=>(window as any).__calendar.commandWaiting);
 evidence.bothSelectionsWhileHeld=await page.evaluate(()=>{const p=(window as any).__calendar;return {holdActive:p.holdAck,handlers:p.trace.filter((e:any)=>e.kind==='date-handler'),finished:p.trace.filter((e:any)=>e.kind==='command-finished'&&e.kinds.includes('dates')).length}});
 assert.equal(evidence.bothSelectionsWhileHeld.holdActive,true);assert.equal(evidence.bothSelectionsWhileHeld.finished,0);
 assert.deepEqual(evidence.bothSelectionsWhileHeld.handlers.map((e:any)=>[e.requestedStart,e.requestedEnd]),[['2027-11-11','2027-11-25']],'one coherent full-range callback');
 assert.equal(await page.getByRole('button',{name:/Travel dates/}).isDisabled(),true,'submitted range stays visibly pending rather than accepting an unreviewed second range');
 evidence.beforeRelease=await page.evaluate(()=>(window as any).__calendar);
 assert.equal(evidence.beforeRelease.current.error,null,'date edit must not use a physically retired recovery predecessor');
 assert.equal(evidence.beforeRelease.commandWaiting,true,'actual picker command waits for durable ACK/editor completion');
 await page.evaluate(()=>{const p=(window as any).__calendar;p.holdAck=false;p.releaseAck();});
 await page.waitForFunction(()=>(window as any).__calendar.trace.some((e:any)=>e.kind==='command-finished'&&e.kinds.includes('dates')));
 evidence.afterDate=await page.evaluate(()=>(window as any).__calendar);
 if(ackFailure){
  assert.equal(evidence.afterDate.current.start,'2027-11-10');assert.equal(cloud.startDate,'2027-11-10');
  assert.equal(evidence.afterDate.current.error?.deviceOutcome,'protected-conflict');
  assert.ok(evidence.afterDate.trace.some((e:any)=>e.kind==='protected-check'&&e.check==='body-replacement'&&e.writeAttempted===false));
  assert.equal(await page.getByRole('button',{name:/Travel dates/}).locator('..').locator('..').getAttribute('aria-busy'),null,'local range submission settled after failure');
  evidence.milestones.push('timeout-releases-queue-and-preserves-protected-predecessor');evidence.result='pass';return;
 }
 await settled();assert.equal(evidence.afterDate.current.error,null);assert.equal(cloud.startDate,'2027-11-11');
 assert.equal(cloud.endDate,'2027-11-25');
 await page.reload();await page.locator('[data-builder-edit-session="active"]').waitFor();await settled();assert.deepEqual(await page.evaluate(()=>{const s=(window as any).__calendar.current;return[s.start,s.end]}),['2027-11-11','2027-11-25']);evidence.milestones.push('date-saved-and-reopened');evidence.result='pass';
 }catch(error){evidence.result='fail';evidence.failure=String(error);if(h){evidence.observed=await h.page.evaluate(()=>(window as any).__calendar).catch(()=>null);evidence.visible=await h.page.locator('body').innerText().catch(()=>'');evidence.errors=h.errors;}throw error;
 }finally{release();if(h){await h.page.evaluate(()=>{const p=(window as any).__calendar;p.holdAck=false;p.releaseAck?.();}).catch(()=>{});await h.close();}evidence.resourcesClosed=true;if(out)writeFileSync(out,JSON.stringify(evidence,null,2)+'\n');}
});
