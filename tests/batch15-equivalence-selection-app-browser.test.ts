import assert from 'node:assert/strict';
import test from 'node:test';
import {renderBuilder} from './helpers/builder-render.ts';
import {canonicalRouteFixture} from './fixtures/batch14-route-documents.ts';
import {requireReadableTripDocument} from '../lib/easyt/trip-document.ts';
import {canonicalTripForOwner} from '../lib/easyt/trip-promotion.ts';
import {nextTripUpdatedAt} from '../lib/easyt/trip-continuity.ts';
import {searchReferencePlaces} from '../lib/easyt/place-reference.server.ts';
import {findCatalogPlaceById} from '../lib/easyt/place-catalog.ts';
import {REFERENCE_SNAPSHOT_ID} from '../lib/easyt/place-reference.ts';
const enabled=process.env.MORROVIA_BUILDER_APP_BROWSER_TESTS==='1';
const rows=searchReferencePlaces('Xi’an').filter(row=>row.canonicalName==='Xi’an');
assert.equal(rows.length,5);
const manila=searchReferencePlaces('Manila',{explicitCountryNames:['Philippines']}).find(row=>row.canonicalPlaceId==='reference:geonames:1701668')!;
function response(row:typeof manila){return {canonicalPlaceId:row.canonicalPlaceId,name:row.canonicalName,country:row.parentCountries![0],region:row.parentRegionId,administrativeHierarchy:row.administrativeHierarchy,coordinates:row.coordinates,placeType:row.placeType,kind:row.placeType,routability:row.routability,providerId:row.providerId,providerSourceLabel:row.providerSourceLabel,referenceSnapshotId:REFERENCE_SNAPSHOT_ID};}
const catalogueManila=findCatalogPlaceById('manila')!;
const authoredManila={...manila,canonicalPlaceId:'manila',coordinates:[...catalogueManila.coordinates!] as [number,number],providerId:catalogueManila.provenance.id};
for(const selected of [...rows,manila,authoredManila])test(`published origin ${selected.canonicalPlaceId} survives actual autocomplete, Builder save and reload with repeated stays`,{skip:!enabled,timeout:45000},async()=>{
 let cloud=requireReadableTripDocument(canonicalTripForOwner('owner-a',canonicalRouteFixture()));
 const repeat={...cloud.stops[0]!,id:cloud.id+'-stop-repeat-tokyo-occurrence',order:cloud.stops.length,arrivalDate:'2026-10-19',departureDate:'2026-10-23'};
 assert.equal(typeof repeat.nights,'number');
 cloud.stops.push(repeat);cloud.endDate='2026-10-23';cloud.brief.nightAllocations![repeat.id]=repeat.nights!;cloud.brief.intent.route.orderedStopIds.push(repeat.id);
 cloud.brief.intent.route.destinations.push({...structuredClone(cloud.brief.intent.route.destinations[0]!),id:'intent:repeat-tokyo-occurrence',stopIds:[repeat.id]});
 const before=structuredClone(cloud);let writes=0;
 const candidates=selected.canonicalName==='Manila'?[manila]:rows;
 const view=await renderBuilder({initialTrip:cloud,seedRecovery:false,ownerId:'owner-a',query:`?trip=${cloud.id}`,geocodeCandidates:{[selected.canonicalName]:candidates.map(response)},accountRequest:({method,trip})=>{
  if(method==='GET')return {status:200,body:{trip:cloud}};
  const next=requireReadableTripDocument(trip);assert.equal(next.updatedAt,cloud.updatedAt);writes++;cloud=requireReadableTripDocument(canonicalTripForOwner('owner-a',next,nextTripUpdatedAt(cloud.updatedAt)));return {status:200,body:{trip:cloud}};
 }});view.page.setDefaultTimeout(7000);
 try{
  await view.page.locator('[data-builder-top-controls]').waitFor();
  await view.page.getByRole('combobox',{name:'Start from',exact:true}).fill(selected.canonicalName);
  const options=view.page.getByRole('option').filter({hasText:selected.canonicalName});await options.first().waitFor();
  // Wait for the real component's asynchronous provider projection, then assert
  // each namesake remains selectable using verified province/source labels.
  await view.page.waitForTimeout(500);
  const labels=await options.allTextContents();assert.equal(new Set(labels).size,labels.length);
  const wanted=selected.canonicalName==='Manila'?options.filter({hasText:selected.canonicalPlaceId==='manila'?'Morrovia curated place catalog':'GeoNames'}):options.filter({hasText:selected.parentRegionId!});
  assert.equal(await wanted.count(),1);await wanted.click();
  for(let i=0;i<70&&cloud.brief.intent.route.origin?.canonicalPlaceId!==selected.canonicalPlaceId;i++)await view.page.waitForTimeout(100);
  assert.equal(cloud.brief.intent.route.origin?.canonicalPlaceId,selected.canonicalPlaceId);assert(writes>0);
  assert.deepEqual(cloud.brief.intent.route.origin?.coordinates,selected.coordinates);
  assert.equal(cloud.brief.intent.route.origin?.providerId,selected.canonicalPlaceId==='manila'?undefined:selected.providerId);
  assert.deepEqual(cloud.stops,before.stops);assert.deepEqual(cloud.brief.intent.route.destinations,before.brief.intent.route.destinations);
  assert.equal(cloud.stops.filter(stop=>stop.canonicalPlaceId===repeat.canonicalPlaceId).length,2);
  await view.page.getByText('Saved to your account',{exact:true}).waitFor();await view.page.reload();await view.page.locator('[data-builder-top-controls]').waitFor();
  assert.equal(await view.page.getByRole('combobox',{name:'Start from',exact:true}).inputValue(),selected.canonicalName);
  assert.equal(cloud.brief.intent.route.origin?.canonicalPlaceId,selected.canonicalPlaceId);assert.deepEqual(cloud.stops,before.stops);assert.deepEqual(view.errors,[]);
 }finally{await view.close();}
});
