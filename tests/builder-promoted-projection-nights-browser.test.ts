import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { renderBuilder, builderBrowserTestsEnabled } from './helpers/builder-render.ts';
import { selectedStopsHomepageInput } from './fixtures/homepage-dual-entry.ts';
import { selectedTransferPlace } from './fixtures/accepted-transfer-place.ts';
import { canonicalTripForOwner } from '../lib/easyt/trip-promotion.ts';
import { requireReadableTripDocument } from '../lib/easyt/trip-document.ts';
import { nextTripUpdatedAt } from '../lib/easyt/trip-continuity.ts';
import { jsonbObjectOrder } from './fixtures/save-reopen-trip.ts';
import type { EasyTTrip } from '../lib/easyt/trip.ts';

// Test-only observation and one deterministic post-write gate. All production
// persistence, scheduling, reconciliation, guard results and UI handlers run.
const probe = `
const __overlap = (() => {
  const aliases = new Map<string,number>();
  return (window as any).__projectionNights = {
    trace: [] as any[], mounts: 0, retires: 0, armed: false, held: false,
    release: null as null | (() => void), activeOrigin: null as null | string,
    alias(handle: any) {
      if (!handle?.writeId) return null;
      const key = JSON.stringify([handle.ownerId,handle.tripId,handle.writeId]);
      if (!aliases.has(key)) aliases.set(key, aliases.size + 1);
      return aliases.get(key);
    }
  };
})();
`;
function sourceOverrides() {
  const result = new Map<string,string>();
  const edit = (relative: string, changes: Array<[string,string]>) => {
    const path = fileURLToPath(new URL('../' + relative, import.meta.url));
    let source = readFileSync(path, 'utf8');
    for (const [needle,replacement] of changes) {
      assert.equal(source.split(needle).length, 2, 'unique instrumentation anchor: ' + relative + ': ' + needle.slice(0,75));
      source = source.replace(needle,replacement);
    }
    result.set(path,source);
  };
  edit('app/journey/new/trip-builder.tsx', [
    ['"use client";', '"use client";\n' + probe],
    ['const result=await saveTripRecovery(trip,{...options,newTripOrClone:builderInitialOverflowRef.current});', `
      const p = (window as any).__projectionNights;
      const origin = options.projectionOnly ? 'projection' : 'authored';
      const event = {kind:'start',origin,predecessor:p.alias(options.replace),inputRevision:options.draft.inputRevision};
      p.trace.push(event); p.activeOrigin=origin;
      const result=await saveTripRecovery(trip,{...options,newTripOrClone:builderInitialOverflowRef.current});
      p.activeOrigin=null;
      p.trace.push({kind:'result',origin,handle:p.alias(result.handle),stored:result.stored,
        writeAttempted:result.writeAttempted,blocked:result.blockedByExistingRecovery,
        failureReason:result.failureReason,failureBoundary:result.failureBoundary,projectionDeferred:result.projectionDeferred,
        readback:result.readbackConfirmed,pointer:result.pointerAcknowledged,
        scopeMatches:result.handle.ownerId===options.ownerId && result.handle.tripId===trip.id});
      if (p.armed && options.projectionOnly) {
        p.armed=false; p.held=true;
        p.trace.push({kind:'held',origin,handle:p.alias(result.handle),stored:result.stored});
        await new Promise<void>(resolve => {p.release=resolve;});
        p.held=false; p.trace.push({kind:'released',origin});
      }
    `],
    ['const adjustAllocatedDays = async (stopId: string, delta: number) => {', `const adjustAllocatedDays = async (stopId: string, delta: number) => {
      (window as any).__projectionNights.trace.push({kind:'nights-ui'});`],
  ]);
  edit('app/journey/new/use-builder-edit-session.ts', [
    ['session = created;', `session = created; (window as any).__projectionNights.mounts++;`],
    ['return () => { active = false; unsubscribe?.(); session?.dispose(); };', `return () => { (window as any).__projectionNights.retires++; active = false; unsubscribe?.(); session?.dispose(); };`],
  ]);
  edit('lib/easyt/persistence-outcome.ts', [
    ['export function reportQaProtectedWriteRefusal(check: QaProtectedWriteCheck, isCurrent: () => boolean, writeAttempted: boolean | undefined, readReason?: string) {', `export function reportQaProtectedWriteRefusal(check: QaProtectedWriteCheck, isCurrent: () => boolean, writeAttempted: boolean | undefined, readReason?: string) {
      const p=(window as any).__projectionNights;
      p?.trace.push({kind:'lower-refusal',origin:p.activeOrigin,check,readReason,writeAttempted});`],
  ]);
  edit('lib/easyt/trip-builder-async-edit-session.ts', [
    ["if (scopeMatches && result.blockedByExistingRecovery) saveFailure('protected',", `if (scopeMatches && result.blockedByExistingRecovery) (window as any).__projectionNights?.trace.push({kind:'protected-branch',origin:continuation?.projectionOnly?'projection':'authored',acceptedRevision,inputRevision,scopeMatches});
        if (scopeMatches && result.blockedByExistingRecovery) saveFailure('protected',`],
  ]);
  return result;
}

const town = {name:'Hirayu Onsen',label:'Hirayu Onsen, Takayama, Gifu, Japan',country:'Japan',region:'Gifu',locality:'Takayama',canonicalPlaceId:'open-world:photon:N:2481035449',providerId:'photon:N:2481035449',coordinates:[137.5536701,36.1914892],kind:'town',placeType:'town',routability:'direct_destination',matchQuality:'exact',rankScore:200};

test('promoted mounted Builder serializes nights behind a real automatic projection recovery write',
 {skip:!builderBrowserTestsEnabled,timeout:120000},async t=>{
  const snapshot=selectedStopsHomepageInput(null,[['tokyo','Tokyo'],['kanazawa','Kanazawa'],['takayama','Takayama']]);
  snapshot.origin={state:'selected',value:selectedTransferPlace('London','United Kingdom','reference:geonames:2643743','endpoint')};
  snapshot.tripType={state:'selected',value:'one_way'};
  snapshot.dates={state:'selected',value:{start:'2027-03-02',end:'2027-03-23'}};
  let account:EasyTTrip|null=null,conflicts=0,reads=0,holdTransfer=false,transferHeld=false;
  let releaseTransfer:()=>void=()=>{}, releaseAck:()=>void=()=>{};
  let holdAck=false,ackHeld=false;
  const ackGate=new Promise<void>(resolve=>{releaseAck=resolve;});
  const transferGate=new Promise<void>(resolve=>{releaseTransfer=resolve;});
  const writes:Array<{method:string,revisionMatches:boolean,ack:number}>=[],milestones:string[]=[];
  const current=():EasyTTrip=>{assert.ok(account);return account;};
  const h=await renderBuilder({path:'/',storedInput:{snapshot},seedRecovery:false,forceResolver:true,
    simulatedSignIn:true,offlineOnly:true,sourceOverrides:sourceOverrides(),
    geocodeCandidates:{
      Tokyo:[{name:'Tokyo',country:'Japan',canonicalPlaceId:'tokyo',providerId:'fixture:tokyo',coordinates:[139.6917,35.6895],kind:'city',placeType:'city',routability:'direct_destination'}],
      Kanazawa:[{name:'Kanazawa',country:'Japan',canonicalPlaceId:'kanazawa',providerId:'fixture:kanazawa',coordinates:[136.6562,36.5613],kind:'city',placeType:'city',routability:'direct_destination'}],
      Takayama:[{name:'Takayama',country:'Japan',canonicalPlaceId:'takayama',providerId:'fixture:takayama',coordinates:[137.2535,36.1458],kind:'city',placeType:'city',routability:'direct_destination'}],
      Hirayu:[town],'Hirayu Onsen':[town],
    },
    transferRequest:async({legs})=>{
      if(holdTransfer){transferHeld=true;await transferGate;}
      // Real reconciliation must turn its pending work into a stored projection;
      // the explicit held/stored assertion below rejects a no-op fixture run.
      return {status:200,body:{legs,assessments:[],failedLegIds:[]}};
    },
    accountRequest:async({method,trip})=>{
      if(method==='GET'){reads++;return account?{status:200,body:{trip:jsonbObjectOrder(account)}}:{status:404,body:{error:'Trip not found'}};}
      const submitted=requireReadableTripDocument(trip);
      const revisionMatches=method==='POST'?account===null:account!==null&&submitted.updatedAt===account.updatedAt;
      if(!revisionMatches){conflicts++;return {status:409,body:{error:'Synthetic account revision conflict',trip:account?jsonbObjectOrder(account):null,conflictReason:'cloud-changed'}};}
      account=requireReadableTripDocument(canonicalTripForOwner('owner-a',account?.status==='planned'&&submitted.status==='draft'?{...submitted,status:'planned'}:submitted,nextTripUpdatedAt(account?.updatedAt??submitted.updatedAt)));
      writes.push({method,revisionMatches,ack:writes.length+1});
      const response={status:method==='POST'?201:200,body:{trip:jsonbObjectOrder(account),outcome:method==='POST'?'promoted':'updated'}};
      if(holdAck && method==='PUT'){holdAck=false;ackHeld=true;await ackGate;}
      return response;
    },
  });
  const page=h.page;page.setDefaultTimeout(8000);
  const until=async(check:()=>boolean,label:string)=>{for(let i=0;i<160&&!check();i++)await page.waitForTimeout(50);assert.ok(check(),label);};
  const saved=async()=>{await page.getByText('Saved to your account',{exact:true}).first().waitFor();assert.equal(conflicts,0);};
  const evidence=()=>page.evaluate(()=>{
    const p=(window as any).__projectionNights;
    return {trace:p.trace,mounts:p.mounts,retires:p.retires,held:p.held};
  });
  try{
    await page.getByRole('button',{name:'Plan my trip',exact:true}).click();
    await page.locator('[data-builder-edit-session="active"]').waitFor();
    await page.getByRole('button',{name:/^Build trip/}).click();
    await page.getByRole('region',{name:'Trip overview',exact:true}).waitFor();
    await page.getByRole('link',{name:'Sign up to keep this route across devices',exact:true}).click();
    await page.getByRole('button',{name:'Complete simulated sign in',exact:true}).click();await saved();
    assert.equal(writes[0]?.method,'POST');milestones.push('guest-promoted-account-ack');
    await page.getByRole('link',{name:'Edit trip brief',exact:true}).click();
    await page.locator('[data-builder-edit-session="active"]').waitFor();
    assert.ok(reads>0,'exact account read must occur');
    const beforeAdd=writes.length;
    await page.getByRole('button',{name:'Add destination',exact:true}).click();
    await page.getByRole('combobox',{name:'Add a stop',exact:true}).fill('Hirayu');
    await page.getByRole('option',{name:/^Hirayu Onsen/}).first().click();
    await until(()=>writes.length>beforeAdd&&current().stops.some(s=>s.canonicalPlaceId===town.canonicalPlaceId),'add-stop account ACK');await saved();
    milestones.push('add-stop-ack');
    const lifecycle=await evidence(),beforeOrder=writes.length;
    holdTransfer=true;holdAck=true;
    await page.getByLabel('Actions for Takayama',{exact:true}).click();
    await page.locator('[data-builder-route-workspace]').getByRole('button',{name:'Earlier',exact:true}).last().click();
    await until(()=>transferHeld,'actual scheduler must dispatch transfer reconciliation');
    await until(()=>ackHeld&&writes.length>beforeOrder&&current().stops[1]?.name==='Takayama','authored reorder server commit with ACK response held');
    milestones.push('reorder-server-committed-ack-and-transfer-held');
    await page.evaluate(()=>{const p=(window as any).__projectionNights;p.trace=[];p.armed=true;});
    holdTransfer=false;releaseTransfer();
    await page.waitForFunction(()=>(window as any).__projectionNights.held===true);
    const held=await evidence(),reservation=held.trace.find((e:any)=>e.kind==='held');
    assert.equal(reservation?.stored,true,'test requires a real durable projection, not a deferred or no-op response');
    assert.ok(reservation.handle);milestones.push('projection-written-result-held');
    const nights=current().stops.find(s=>s.name==='Tokyo')!.nights!,beforeNights=writes.length;
    // The outer handler is observed before its device-write wait. The inner
    // updateAllocatedDays intentionally cannot run until we release projection.
    await page.getByRole('button',{name:/^Add one night to Tokyo/}).click();
    await page.waitForFunction(()=>(window as any).__projectionNights.trace.some((e:any)=>e.kind==='nights-ui'));
    await page.waitForTimeout(75); // allow real event/timer turns while device reservation remains held
    const waiting=await evidence();
    assert.equal(waiting.held,true);
    assert.equal(waiting.trace.filter((e:any)=>e.kind==='start'&&e.origin==='authored').length,0,'nights must wait before issuing its physical recovery write');
    assert.equal(current().stops.find(s=>s.name==='Tokyo')!.nights,nights);
    await page.evaluate(()=>(window as any).__projectionNights.release());
    await page.waitForFunction(()=>(window as any).__projectionNights.trace.some((e:any)=>e.kind==='result'&&e.origin==='authored'));
    // Device writes do not await account ACK: only now release that independent
    // response, allowing the pending nights save to rebase against its revision.
    releaseAck();
    await until(()=>writes.length>beforeNights&&current().stops.find(s=>s.name==='Tokyo')!.nights===nights+1,'queued nights receives exact current-revision account ACK');await saved();
    const final=await evidence();
    const authored=final.trace.find((e:any)=>e.kind==='start'&&e.origin==='authored');
    assert.equal(authored?.predecessor,reservation.handle,'queued nights must use newly stored projection predecessor');
    assert.equal(final.mounts,lifecycle.mounts,'same mounted session throughout overlap');
    assert.equal(final.retires,lifecycle.retires,'no session retirement during overlap');
    assert.equal(final.trace.some((e:any)=>e.kind==='protected-branch'||e.kind==='lower-refusal'),false);
    assert.equal(await page.getByText('Another device recovery is protected. Reopen it before editing.',{exact:true}).count(),0);
    assert.deepEqual(h.errors,[]);milestones.push('queued-nights-ack');
    t.diagnostic(JSON.stringify({milestones,writes,conflicts,...final,realScheduler:true,realReactAndIndexedDb:true,syntheticAuthAndAccount:true}));
  }catch(error){t.diagnostic(JSON.stringify({milestones,writes,conflicts,...await evidence()}));throw error;}
  finally{
    holdTransfer=false;holdAck=false;releaseTransfer();releaseAck();
    await page.evaluate(()=>(window as any).__projectionNights?.release?.()).catch(()=>{});
    await h.close();
  }
});
