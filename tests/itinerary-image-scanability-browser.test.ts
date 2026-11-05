import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdirSync,readFileSync} from 'node:fs';
import type {Route} from 'playwright';
import {builderBrowserTestsEnabled,renderBuilder} from './helpers/builder-render.ts';
import {photoLedItineraryTrip} from './fixtures/photo-led-itinerary.ts';

for(const browserName of ['chromium','webkit'] as const) test(`${browserName}: day photographs stay compact on wide desktop and mobile and calendar photos do not repeat`, {skip:!builderBrowserTestsEnabled,timeout:60_000}, async()=>{
 const trip=photoLedItineraryTrip();
 const before=JSON.stringify(trip);
 const view=await renderBuilder({path:`/journey/${trip.id}/itinerary?day=1`,initialTrip:trip,styled:true,browserName});
 try{
  await view.page.route('**/journey/immersive/*.webp',(route:Route)=>route.fulfill({contentType:'image/webp',body:readFileSync(`public${new URL(route.request().url()).pathname}`)}));
  await view.page.reload();
  for(const width of [2048,1440,1024,768,390,320]){
   await view.page.setViewportSize({width,height:1000});
   const photo=view.page.locator('[data-itinerary-photo="day"]');await photo.waitFor();
   const box=(await photo.boundingBox())!;
   assert.ok(box.height <= (width<=700?140:192)+1,`${width}px day photo is ${box.height}px tall`);
   assert.equal(await view.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
   if([2048,390].includes(width)){mkdirSync('output/playwright',{recursive:true});await view.page.screenshot({path:`output/playwright/compact-day-photo-${width}-${browserName}.png`,fullPage:false});}
  }
  await view.page.setViewportSize({width:2048,height:1136});
  await view.page.getByRole('button',{name:'Calendar',exact:true}).click();
  const sources=await view.page.locator('#itinerary-calendar [data-itinerary-photo] img').evaluateAll((images:HTMLImageElement[])=>images.map(img=>img.getAttribute('src')));
  assert.equal(sources.length,2,'Tokyo and Kyoto each contribute one reviewed cover');
  assert.equal(new Set(sources).size,sources.length,'Calendar never repeats the same photograph');
  assert.equal(await view.page.locator('#itinerary-calendar article').count(),7,'Every day and its controls remain present');
  await view.page.screenshot({path:`output/playwright/compact-calendar-2048-${browserName}.png`,fullPage:false});
  assert.equal(JSON.stringify(trip),before);
  assert.deepEqual(view.errors,[]);
 }finally{await view.close()}
});
