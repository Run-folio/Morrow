import assert from 'node:assert/strict';
import test from 'node:test';
import {builderBrowserTestsEnabled,renderBuilder} from './helpers/builder-render.ts';
import {selectedStopsHomepageInput} from './fixtures/homepage-dual-entry.ts';
import {selectedTransferPlace} from './fixtures/accepted-transfer-place.ts';
import {canonicalTripForOwner} from '../lib/easyt/trip-promotion.ts';
import type {EasyTTrip} from '../lib/easyt/trip.ts';

test('actual guest build and explicit simulated sign-in save survives every workspace and Overview action plus reopen',
 {skip:!builderBrowserTestsEnabled,timeout:90000},async t=>{
 const snapshot=selectedStopsHomepageInput(null,[['madrid','Madrid'],['lisbon','Lisbon'],['porto','Porto']]);
 snapshot.origin={state:'selected',value:selectedTransferPlace('London','United Kingdom','reference:geonames:2643743','endpoint')};
 snapshot.tripType={state:'selected',value:'one_way'};
 snapshot.dates={state:'selected',value:{start:'2026-11-01',end:'2026-11-08'}};
 let account:EasyTTrip|null=null;const writes:string[]=[];
 const h=await renderBuilder({path:'/',storedInput:{snapshot:JSON.parse(JSON.stringify(snapshot))},seedRecovery:false,forceResolver:true,simulatedSignIn:true,
 geocodeCandidates:Object.fromEntries([
  ['Madrid','Spain',[-3.7038,40.4168]],['Lisbon','Portugal',[-9.1393,38.7223]],['Porto','Portugal',[-8.6291,41.1579]],
 ].map(([name,country,coordinates])=>[String(name),[{name,country,coordinates,canonicalPlaceId:String(name).toLowerCase(),providerId:'core-fixture:'+String(name).toLowerCase(),kind:'city',placeType:'city',routability:'direct_destination',matchQuality:'exact',rankScore:200}]])),
 accountRequest:({method,trip})=>{
  if(method==='GET')return account?{status:200,body:{trip:account}}:{status:404,body:{error:'Trip not found'}};
  writes.push(method);account=canonicalTripForOwner('owner-a',trip as EasyTTrip);return {status:method==='POST'?201:200,body:{trip:account,outcome:'promoted'}};
 }});
 try{
  await h.page.getByRole('button',{name:'Plan my trip',exact:true}).click();
  await h.page.locator('[data-builder-edit-session="active"]').waitFor();
  await h.page.getByText('Saved on this device',{exact:true}).first().waitFor();
  await h.page.getByRole('button',{name:/^Build trip/}).click();
  await h.page.getByRole('region',{name:'Trip overview',exact:true}).waitFor();
  const id=new URL(h.page.url()).pathname.split('/')[2],base=`/journey/${id}`;
  const guestBytes=await h.page.evaluate(()=>Object.fromEntries(Object.keys(localStorage).filter(k=>k.includes(':guest:')||k==='easyt-home-trip-draft').map(k=>[k,localStorage.getItem(k)])));
  assert.deepEqual(writes,[]);
  await h.page.getByRole('link',{name:'Sign up to keep this route across devices',exact:true}).click();
  await h.page.getByRole('button',{name:'Complete simulated sign in',exact:true}).click();
  await h.page.getByText('Saved to your account',{exact:true}).first().waitFor();
  await h.page.getByRole('region',{name:'Trip overview',exact:true}).waitFor();
  assert.ok(writes.some(method=>method==='POST'));const afterSaveWrites=writes.length;
  const nav=h.page.getByRole('navigation',{name:'Trip workspace'});
  for(const label of ['Itinerary','Explore','Stay','Transport','Overview']){
   await nav.getByRole('link',{name:label,exact:true}).click();await nav.waitFor();
   assert.equal(await h.page.getByRole('heading',{name:'That route has moved.',exact:true}).count(),0);
   await h.page.reload();await nav.waitFor();
  }
  await h.page.goto(new URL(base,h.page.url()).href);await h.page.getByRole('region',{name:'Trip overview',exact:true}).waitFor();
  // Exercise the actual Overview action hrefs, including stop/day and route/map targets.
  const hrefs:string[]=await h.page.getByRole('region',{name:'Trip overview',exact:true}).locator('a[href]').evaluateAll((anchors:HTMLAnchorElement[])=>[...new Set(anchors.map(a=>a.getAttribute('href')!).filter(href=>href.startsWith('/journey/')))]);
  assert.ok(hrefs.some(href=>href.includes('/map')));assert.ok(hrefs.some(href=>href.includes('/itinerary')));
  t.diagnostic('Overview actions: '+JSON.stringify(hrefs));
  for(const href of hrefs){
   await h.page.goto(new URL(base,h.page.url()).href);await h.page.getByRole('region',{name:'Trip overview',exact:true}).waitFor();
   await h.page.getByRole('region',{name:'Trip overview',exact:true}).locator('a[href='+JSON.stringify(href)+']').first().click();
   await h.page.waitForURL((url:URL)=>url.pathname+url.search===href);
   if(href.startsWith('/journey/new?'))await h.page.locator('[data-builder-edit-session="active"]').waitFor();else if(href.includes('/map'))await h.page.getByRole('button',{name:'Back to trip',exact:true}).waitFor();else await nav.waitFor();
   await h.page.reload();if(href.startsWith('/journey/new?'))await h.page.locator('[data-builder-edit-session="active"]').waitFor();else if(href.includes('/map'))await h.page.getByRole('button',{name:'Back to trip',exact:true}).waitFor();else await nav.waitFor();
  }
  // The existing shared edit link leaves the workspace layout for the real Builder.
  await h.page.goto(new URL(base,h.page.url()).href);await h.page.getByRole('region',{name:'Trip overview',exact:true}).waitFor();
  await h.page.getByRole('link',{name:'Edit trip brief',exact:true}).click();await h.page.locator('[data-builder-edit-session="active"]').waitFor();
  assert.equal(new URL(h.page.url()).pathname+new URL(h.page.url()).search,`/journey/new?trip=${id}`);
  await h.page.reload();await h.page.locator('[data-builder-edit-session="active"]').waitFor();
  await h.page.goto(new URL(base,h.page.url()).href);await h.page.getByRole('region',{name:'Trip overview',exact:true}).waitFor();
  const afterGuest=await h.page.evaluate((keys:string[])=>Object.fromEntries(keys.map(k=>[k,localStorage.getItem(k)])),Object.keys(guestBytes));
  assert.deepEqual(afterGuest,guestBytes,'every original guest/device record stays byte-identical');
  const savedAccount=account as EasyTTrip|null;assert.equal(savedAccount?.ownerId,'owner-a');assert.deepEqual(savedAccount?.stops.map(s=>s.name),['Madrid','Lisbon','Porto']);
  t.diagnostic(JSON.stringify({controlledAuth:true,realHostedAuth:false,tripId:id,tabs:['Itinerary','Explore','Stay','Transport','Overview'],overviewHrefs:hrefs,writesAfterExplicitSave:afterSaveWrites,totalWrites:writes.length,originalGuestRecords:Object.keys(guestBytes).length}));
  assert.equal(writes.length,afterSaveWrites,'read-only navigation, edit reopen and reload do not write the account again');
  assert.deepEqual(h.errors,[]);
 }catch(error){t.diagnostic('URL: '+h.page.url());t.diagnostic((await h.page.locator('body').innerText()).slice(-5000));throw error;}finally{await h.close();}
});
