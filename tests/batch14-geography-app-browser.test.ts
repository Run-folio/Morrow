import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {renderBuilder} from './helpers/builder-render.ts';
import {canonicalRouteFixture} from './fixtures/batch14-route-documents.ts';
import {requireReadableTripDocument} from '../lib/easyt/trip-document.ts';
import {canonicalTripForOwner} from '../lib/easyt/trip-promotion.ts';
import {nextTripUpdatedAt} from '../lib/easyt/trip-continuity.ts';
import {geographicallyReady,stopGeographicPlace} from '../lib/easyt/geographic-binding.ts';
const enabled=process.env.MORROVIA_BUILDER_APP_BROWSER_TESTS==='1';
const f=JSON.parse(readFileSync(new URL('./fixtures/batch14-city-region-candidates.json',import.meta.url),'utf8'))[0];
async function fixture(candidates:unknown[],preGeography=false) {
 const saved=preGeography?JSON.parse(readFileSync(new URL('./fixtures/batch14-pre-geography-pending.json',import.meta.url),'utf8')).trip:canonicalRouteFixture();
 let cloud=requireReadableTripDocument(canonicalTripForOwner('owner-a',saved));
 const s=cloud.stops[0]!;if(!preGeography)Object.assign(s,{name:'Lima',country:'Peru',canonicalPlaceId:'lima',providerId:f.choices[0].providerId,longitude:f.choices[0].coordinates[0],latitude:f.choices[0].coordinates[1]});
 cloud.brief.intent.route.destinations.find(i=>i.stopIds.includes(s.id))!.selectedPlace=stopGeographicPlace(s);
 let writes=0;const view=await renderBuilder({initialTrip:cloud,seedRecovery:false,ownerId:'owner-a',query:`?trip=${cloud.id}`,geocodeCandidates:{[s.name]:candidates},accountRequest:({method,trip})=>{
  if(method==='GET')return {status:200,body:{trip:cloud}};
  const next=requireReadableTripDocument(trip);if(next.updatedAt!==cloud.updatedAt)return {status:409,body:{trip:cloud}};
  writes++;cloud={...next,updatedAt:nextTripUpdatedAt(cloud.updatedAt)};return {status:200,body:{trip:cloud}};
 }});view.page.setDefaultTimeout(6000);await view.page.locator('[data-builder-top-controls]').waitFor();
 return {view,cloud:()=>cloud,writes:()=>writes};
}
async function until(h:Awaited<ReturnType<typeof fixture>>,condition:()=>boolean){for(let i=0;i<70;i++){if(condition())return;await h.view.page.waitForTimeout(100)}assert.ok(condition())}
test('saved incompatible provider location remains editable/saveable and recoverable after reload',{skip:!enabled,timeout:30000},async()=>{
 const h=await fixture([f.choices[0]]);try {
  const original=structuredClone(h.cloud());const choose=h.view.page.getByRole('button',{name:'Choose place Lima',exact:true});await choose.waitFor();
  assert.equal(await h.view.page.getByRole('button',{name:'Build trip',exact:false}).isDisabled(),true);
  assert.equal(await h.view.page.getByText('What this means',{exact:true}).count(),0,'geography has an affected-row action and Build explanation, not an empty duplicate panel');
  await choose.click();await h.view.page.getByRole('dialog').getByText("We couldn't confirm this place. Close and try again.",{exact:true}).waitFor();
  assert.equal(h.writes(),0);assert.deepEqual(h.cloud(),original);
  await h.view.page.getByRole('dialog').getByRole('button',{name:'Finish later',exact:true}).click();
  await h.view.page.getByRole('combobox',{name:'Budget',exact:true}).selectOption('high');await until(h,()=>h.cloud().brief.budgetBand==='high');
  assert.deepEqual([h.cloud().stops[0]!.longitude,h.cloud().stops[0]!.latitude],f.choices[0].coordinates);
  await h.view.page.reload();await choose.waitFor();assert.equal(geographicallyReady(stopGeographicPlace(h.cloud().stops[0]!)),false);assert.deepEqual(h.view.errors,[]);
 }finally{await h.view.close()}
});
test('pre-geography failed work reloads with target recovery; a sibling budget edit does not discard same-point verification',{skip:!enabled,timeout:30000},async()=>{
 const frozen=JSON.parse(readFileSync(new URL('./fixtures/batch14-pre-geography-pending.json',import.meta.url),'utf8')).trip;
 const s=frozen.stops[0],candidate={name:s.name,country:s.country,canonicalPlaceId:s.canonicalPlaceId,providerId:s.providerId,
   coordinates:[s.longitude,s.latitude],placeType:'city',routability:'direct_destination'};
 const h=await fixture([candidate],true);try{
  const before=structuredClone(h.cloud());assert.ok(before.brief.cascadeStatus?.routeReconciliation?.residual.some(unit=>unit.phase==='failed'));
  await h.view.page.reload();await h.view.page.getByRole('button',{name:'Choose place Tokyo',exact:true}).click();
  const choice=h.view.page.getByRole('dialog').getByRole('button',{name:/^Tokyo/});await choice.waitFor();assert.equal(h.writes(),0);
  // A separate accepted edit can arrive while clarification is open (for example another input owner).
  await h.view.page.getByRole('combobox',{name:'Budget',exact:true}).selectOption('high',{force:true});await until(h,()=>h.cloud().brief.budgetBand==='high');
  await choice.click();await until(h,()=>geographicallyReady(stopGeographicPlace(h.cloud().stops[0]!)));
  assert.deepEqual(h.cloud().stops.map(stop=>[stop.id,stop.nights,stop.arrivalDate,stop.departureDate]),before.stops.map(stop=>[stop.id,stop.nights,stop.arrivalDate,stop.departureDate]));
  assert.deepEqual(h.cloud().brief.intent.route.orderedStopIds,before.brief.intent.route.orderedStopIds);
  await h.view.page.reload();await h.view.page.locator('[data-builder-top-controls]').waitFor();assert.equal(await h.view.page.getByRole('button',{name:'Choose place Tokyo',exact:true}).count(),0);assert.deepEqual(h.view.errors,[]);
 }finally{await h.view.close()}
});
test('deliberate saved-place recovery accepts city once, preserving IDs, nights, manual order and reload proof',{skip:!enabled,timeout:30000},async()=>{
 const h=await fixture(f.choices);try{
  const before=structuredClone(h.cloud());await h.view.page.getByRole('button',{name:'Choose place Lima',exact:true}).click();
  const dialog=h.view.page.getByRole('dialog');await dialog.getByRole('button',{name:/^Lima/}).waitFor();
  assert.equal(h.writes(),0,'lookup is a proposal until traveller accepts');
  assert.equal(await dialog.getByRole('button',{name:'Province of Lima',exact:true}).count(),0);
  await dialog.getByRole('button',{name:/^Lima/}).click();await until(h,()=>geographicallyReady(stopGeographicPlace(h.cloud().stops[0]!)));
  assert.deepEqual(h.cloud().stops.map(s=>[s.id,s.nights]),before.stops.map(s=>[s.id,s.nights]));
  assert.deepEqual(h.cloud().brief.intent.route.orderedStopIds,before.brief.intent.route.orderedStopIds);
  assert.deepEqual([h.cloud().stops[0]!.longitude,h.cloud().stops[0]!.latitude],f.expected.coordinates);
  await h.view.page.reload();await h.view.page.locator('[data-builder-top-controls]').waitFor();assert.equal(await h.view.page.getByRole('button',{name:'Choose place Lima',exact:true}).count(),0);
  assert.equal(geographicallyReady(stopGeographicPlace(h.cloud().stops[0]!)),true);assert.deepEqual(h.view.errors,[]);
 }finally{await h.view.close()}
});
