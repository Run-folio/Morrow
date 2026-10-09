import assert from 'node:assert/strict';
import test from 'node:test';
import {renderBuilder} from './helpers/builder-render.ts';
import {canonicalRouteFixture} from './fixtures/batch14-route-documents.ts';
import {requireReadableTripDocument} from '../lib/easyt/trip-document.ts';
import {canonicalTripForOwner} from '../lib/easyt/trip-promotion.ts';
import {nextTripUpdatedAt} from '../lib/easyt/trip-continuity.ts';
import {allocateTripNights} from '../lib/easyt/night-allocation.ts';
import {prepareBuilderHandlerEdit} from '../lib/easyt/trip-builder-handler-contract.ts';
import {builderDocumentFingerprint} from '../lib/easyt/trip-builder-document-commit.ts';
import {pendingBuilderReconciliationUnits,reconcileBuilderDependencies} from '../lib/easyt/trip-builder-reconciliation.ts';
const enabled=process.env.MORROVIA_BUILDER_APP_BROWSER_TESTS==='1';
for(const protectedNights of [false,true])test(`calendar shortening ${protectedNights?'reports protected nights once and remains editable':'autosaves balanced generated nights and reloads'}`,{skip:!enabled,timeout:35000},async()=>{
 let cloud=requireReadableTripDocument(canonicalTripForOwner('owner-a',canonicalRouteFixture()));
 cloud.endDate='2026-10-24';cloud.stops=cloud.stops.slice(0,2).map(stop=>({...stop,nights:7}));cloud.planItems=[];cloud.brief.bookings=[];
 cloud.brief.intent.timing={flexibility:'fixed',durationDays:15};
 cloud.brief.intent.route.orderAuthority='optimizable';cloud.brief.intent.route.orderedStopIds=cloud.stops.map(stop=>stop.id);
 cloud.brief.intent.route.destinations=cloud.brief.intent.route.destinations.slice(0,2).map(intent=>({...intent,requestedNights:protectedNights?7:null}));
 cloud.brief.manualNightStopIds=protectedNights?cloud.stops.map(stop=>stop.id):[];
 cloud.brief.nightAllocations=Object.fromEntries(cloud.stops.map(stop=>[stop.id,7]));cloud.brief.nightAllocation=allocateTripNights({totalNights:14,stops:cloud.stops});
 cloud.brief.nightAllocation.stops=cloud.brief.nightAllocation.stops.map(stop=>({...stop,nights:7,isManual:protectedNights,isFixed:false}));
 cloud.brief.nightAllocation.allocations={...cloud.brief.nightAllocations};
 if(protectedNights){const accepted=prepareBuilderHandlerEdit(cloud,{kind:'dates',startDate:cloud.startDate,endDate:'2026-10-21'},builderDocumentFingerprint(cloud));assert.ok(accepted.ok);cloud=requireReadableTripDocument(reconcileBuilderDependencies(accepted.trip,pendingBuilderReconciliationUnits(accepted.trip).filter(unit=>unit.kind==='schedule'||unit.kind==='assessment')).trip);}
 const view=await renderBuilder({initialTrip:cloud,seedRecovery:false,ownerId:'owner-a',query:`?trip=${cloud.id}`,accountRequest:({method,trip})=>{if(method==='GET')return {status:200,body:{trip:cloud}};const candidate=requireReadableTripDocument(trip);assert.equal(candidate.updatedAt,cloud.updatedAt);cloud={...candidate,updatedAt:nextTripUpdatedAt(cloud.updatedAt)};return {status:200,body:{trip:cloud}}}});
 try{
  await view.page.locator('[data-builder-top-controls]').waitFor();
  if(!protectedNights){await view.page.getByRole('button',{name:/Travel dates/}).click();
  await view.page.getByRole('dialog').locator('[data-date="2026-10-10"]').click();
  await view.page.getByRole('dialog').locator('[data-date="2026-10-21"]').click();}
  for(let i=0;i<70&&cloud.endDate!=='2026-10-21';i++)await view.page.waitForTimeout(100);
  assert.equal(cloud.endDate,'2026-10-21');
  if(protectedNights){
   assert.deepEqual(cloud.stops.map(stop=>stop.nights),[7,7]);
   await view.page.locator('[data-builder-top-controls]').getByText(/beyond the trip end/).first().waitFor({timeout:3000});
   assert.equal(await view.page.locator('[data-builder-top-controls]').getByText(/beyond the trip end/).count(),1);
   await view.page.getByRole('combobox',{name:'Budget',exact:true}).selectOption('high');
   for(let i=0;i<50&&cloud.brief.budgetBand!=='high';i++)await view.page.waitForTimeout(100);
   assert.equal(cloud.brief.budgetBand,'high','a real timing conflict must not block ordinary autosave');
  }else{
   assert.equal(cloud.stops.reduce((sum,stop)=>sum+(stop.nights??0),0),11);
   assert.deepEqual(cloud.brief.cascadeStatus?.conflicts,[]);
   const accepted=structuredClone(cloud.stops);await view.page.reload();await view.page.locator('[data-builder-top-controls]').waitFor();
   assert.deepEqual(cloud.stops,accepted);assert.equal(cloud.endDate,'2026-10-21');
  }
  assert.deepEqual(view.errors,[]);
 }finally{await view.close()}
});
