import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {renderBuilder,builderBrowserTestsEnabled} from './helpers/builder-render.ts';
import {canonicalRouteFixture} from './fixtures/batch14-route-documents.ts';
const opts={skip:!builderBrowserTestsEnabled,timeout:90000};
const settle=(p:any)=>p.evaluate(()=>new Promise<void>(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>r()))));
test('mobile shell Map controls align right, retain targets and keyboard order, and hide only its ellipsis',opts,async()=>{
 const trip=canonicalRouteFixture();const h=await renderBuilder({path:`/journey/${trip.id}/map?returnTo=${encodeURIComponent(`/journey/${trip.id}/itinerary?day=2&itineraryView=calendar`)}`,shellCanonicalTrip:trip,styled:true,offlineOnly:true});
 try{const p=h.page;for(const width of [320,390,430,768,844]){await p.setViewportSize({width,height:844});await settle(p);const back=p.locator('[data-map-expand-control]'),whole=p.locator('[data-map-route-reset]');await back.waitFor();
  const geometry=await back.evaluate((e:any)=>{const h=e.closest('header'),a=e.parentElement,b=e.getBoundingClientRect(),r=a.getBoundingClientRect(),s=h.getBoundingClientRect();return{gap:s.right-r.right,right:r.right,left:a.querySelector('[data-map-route-reset]').getBoundingClientRect().left,stripLeft:s.left,stripWidth:s.width,w:b.width,h:b.height}});
  assert.ok(geometry.gap<=20&&geometry.left>=geometry.stripLeft+geometry.stripWidth/3,`${width}: ${JSON.stringify(geometry)}`);assert.ok(geometry.w>=43.9&&geometry.h>=43.9);
  assert.equal(await p.locator('summary[aria-label="Trip actions"]').isVisible(),false);if(width===320){await p.locator('[data-map-expand-control],[data-map-route-reset]').evaluateAll((es:any[])=>es.forEach(e=>e.style.fontSize='18px'));await settle(p);assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'enlarged action text wraps without overflow');await p.locator('[data-map-expand-control],[data-map-route-reset]').evaluateAll((es:any[])=>es.forEach(e=>e.style.fontSize=''));await settle(p);}await whole.focus();await p.keyboard.press('Tab');assert.equal(await back.evaluate((e:any)=>document.activeElement===e),true);await p.keyboard.press('Tab');assert.notEqual(await p.evaluate(()=>document.activeElement?.getAttribute('aria-label')),'Trip actions');
  for(let i=0;i<2;i++){await whole.click();assert.equal(await whole.getAttribute('aria-pressed'),'true');}assert.equal(await p.locator('dialog:modal').count(),0);
 }
 await p.setViewportSize({width:1440,height:1000});await settle(p);const menu=p.locator('summary[aria-label="Trip actions"]');assert.equal(await menu.isVisible(),true);await menu.click();assert.equal(await p.getByRole('button',{name:'Play journey sequence',exact:true}).isVisible(),true);await p.getByRole('button',{name:'Play journey sequence',exact:true}).click();await p.setViewportSize({width:390,height:844});await p.locator('[data-route-stop-navigation] button').nth(1).click();await p.setViewportSize({width:1440,height:1000});await settle(p);assert.equal(await p.getByRole('button',{name:'Play journey sequence',exact:true}).isVisible(),true,'existing manual stop selection still cancels playback after resizing');
 assert.deepEqual(h.errors,[]);
 }finally{await h.close();}
});


test('mobile Map repeatedly returns to its Calendar scope without modal stacking',opts,async()=>{
 const trip=canonicalRouteFixture(),returnPath=`/journey/${trip.id}/itinerary?day=2&itineraryView=calendar`;
 const h=await renderBuilder({path:`/journey/${trip.id}/map?returnTo=${encodeURIComponent(returnPath)}`,shellCanonicalTrip:trip,styled:true,offlineOnly:true});
 try{const p=h.page;await p.setViewportSize({width:390,height:844});for(let i=0;i<3;i++){
  await p.locator('[data-map-expand-control]').click();await p.waitForURL((u:URL)=>u.pathname.endsWith('/itinerary'));assert.equal(new URL(p.url()).searchParams.get('day'),'2');assert.equal(new URL(p.url()).searchParams.get('itineraryView'),'calendar');assert.equal(await p.locator('dialog:modal').count(),0);
  await p.getByRole('button',{name:'Map',exact:true}).click();await p.waitForURL((u:URL)=>u.pathname.endsWith('/map'));await p.locator('[data-map-expand-control]').waitFor();assert.equal(await p.locator('summary[aria-label="Trip actions"]').isVisible(),false);assert.equal(await p.locator('dialog:modal').count(),0);
 }assert.deepEqual(h.errors,[]);
 }finally{await h.close();}
});
