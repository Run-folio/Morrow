import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdirSync,readFileSync} from 'node:fs';
import type {Route} from 'playwright';
import {builderBrowserTestsEnabled,renderBuilder} from './helpers/builder-render.ts';
import {itineraryDestinationPhotos, routePhotoForSource} from '../lib/easyt/route-images.ts';
import {itineraryPresentationImages} from '../lib/easyt/itinerary-presentation-images.ts';
import {photoLedItineraryTrip} from './fixtures/photo-led-itinerary.ts';

for(const browserName of ['chromium','webkit'] as const) test(`${browserName}: day photographs stay compact on wide desktop and mobile and every calendar day retains relevant photography`, {skip:!builderBrowserTestsEnabled,timeout:60_000}, async()=>{
 const trip=photoLedItineraryTrip();
 const activityPhoto=itineraryDestinationPhotos('Tokyo','Japan').find(photo=>photo.key==='day-tokyo-big-sight')!;
 trip.brief.itineraryIdeas=[{id:'reviewed-big-sight',stopId:'tokyo',dayId:'day-2',placeId:'big-sight',title:'Tokyo Big Sight visit',category:'activity',image:activityPhoto.variants[0].src,source:'destination-highlight',reasons:[]}];
 const expected=itineraryPresentationImages(trip,{reviewedOnly:true}).dayById;
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
   if([2048,390].includes(width)){mkdirSync('output/playwright',{recursive:true});await view.page.screenshot({path:`output/playwright/daily-day-photo-${width}-${browserName}.png`,fullPage:false});}
  }
  await view.page.setViewportSize({width:2048,height:1136});
  await view.page.getByRole('button',{name:'Calendar',exact:true}).click();
  const sources=await view.page.locator('#itinerary-calendar [data-itinerary-photo] img').evaluateAll((images:HTMLImageElement[])=>images.map(img=>img.getAttribute('src')));
  assert.equal(sources.length,7,'Every covered day retains a photograph');
  assert.equal(new Set(sources).size,7,'Every day uses a distinct reviewed photograph');
  assert.equal(await view.page.locator('#itinerary-calendar article').count(),7,'Every day and its controls remain present');
  await view.page.screenshot({path:`output/playwright/daily-calendar-2048-${browserName}.png`,fullPage:true});
  for(const day of trip.planItems){
   await view.page.locator('#itinerary-calendar article').filter({has:view.page.getByRole('button',{name:new RegExp(`^Day ${day.dayNumber},`)})}).getByRole('button',{name:new RegExp(`^Day ${day.dayNumber},`)}).click();
   const selected=view.page.locator('[data-itinerary-photo="day"] img');
   await selected.waitFor();
   assert.equal(routePhotoForSource(await selected.getAttribute('src')??'')?.sourceUrl,expected[day.id]?.sourceUrl,`Day ${day.dayNumber} uses its own selected image`);
   {
    await view.page.setViewportSize({width:390,height:1000});
    await view.page.getByRole('button',{name:'Day by day',exact:true}).click();
    const mobilePhoto=view.page.locator('[data-itinerary-photo="day"] img');
    assert.equal(routePhotoForSource(await mobilePhoto.getAttribute('src')??'')?.sourceUrl,expected[day.id]?.sourceUrl,`Mobile day ${day.dayNumber} keeps its selected image`);
    assert.ok((await mobilePhoto.boundingBox())!.height<=141);
    if(day.dayNumber===2) await view.page.screenshot({path:`output/playwright/daily-activity-day-390-${browserName}.png`,fullPage:false});
    await view.page.setViewportSize({width:2048,height:1136});
    await view.page.getByRole('button',{name:'Calendar',exact:true}).click();
   }
  }
  assert.equal(expected['day-2']?.sourceUrl,activityPhoto.sourceUrl,'Scheduled activity supplies day 2 photo');
  assert.equal(JSON.stringify(trip),before);
  assert.deepEqual(view.errors,[]);
 }finally{await view.close()}
});
