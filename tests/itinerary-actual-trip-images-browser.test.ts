import assert from 'node:assert/strict';
import test from 'node:test';
import {createHash} from 'node:crypto';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import sharp from 'sharp';
import type {Route} from 'playwright';
import {builderBrowserTestsEnabled,renderBuilder} from './helpers/builder-render.ts';
import {itineraryPresentationImages} from '../lib/easyt/itinerary-presentation-images.ts';
import {itineraryImageIdentity} from '../lib/easyt/itinerary-image-policy.ts';
import {routePhotoForSource} from '../lib/easyt/route-images.ts';
import type {EasyTTrip} from '../lib/easyt/trip.ts';

const snapshot=process.env.MORROVIA_ACTUAL_ITINERARY_SNAPSHOT;
const enabled=builderBrowserTestsEnabled&&Boolean(snapshot);
const root='output/qa/unique-day-images';

for(const scenario of ['actual-saved','fully-populated'] as const) for(const browserName of ['chromium','webkit'] as const) test(`${browserName}: ${scenario} 29-day itinerary renders unique real photos and withholds unverified suppliers and resolves reviewed activity/place covers`,{skip:!enabled,timeout:120_000},async()=>{
 const trip=JSON.parse(readFileSync(snapshot!,'utf8')) as EasyTTrip;
 assert.equal(trip.planItems.length,29);
 assert.equal(trip.ownerId,null,'Only an account-free local copy is accepted');
 const actualActivityDays=(trip.brief.itineraryIdeas??[]).filter(i=>'dayId' in i&&i.dayId);
 assert.equal(actualActivityDays.length,4);
 if(scenario==='fully-populated'){
  const choices=itineraryPresentationImages(trip,{reviewedOnly:true}).dayById;
  for(const day of trip.planItems){
   day.notes=['Neighbourhood walk','Local lunch','Evening stroll'];day.noteDayParts=['morning','midday','evening'];
   trip.brief.customActivities??={};trip.brief.customActivities[day.dayNumber]=[...day.notes];
   if(actualActivityDays.some(idea=>idea.dayId===day.id))continue;
   const image=choices[day.id]!;const record=routePhotoForSource(image.src)!;
   trip.brief.itineraryIdeas??=[];trip.brief.itineraryIdeas.push({id:`qa-${day.id}`,stopId:day.stopId,dayId:day.id,placeId:`qa:${record.key}`,category:'activity',title:record.activitySubjects?.[0]??record.alt,image:image.src,sourceUrl:record.sourceUrl,source:'destination-highlight',reasons:[]});
  }
 }
 const before=JSON.stringify(trip);
 const selected=itineraryPresentationImages(trip,{reviewedOnly:true}).dayById;
 const providers=JSON.parse(readFileSync(`${root}/provider-image-review.json`,'utf8')) as Array<{image:string;path:string;status:number}>;
 assert.ok(providers.every(p=>p.status===200&&p.path),'Use actual retrieved provider bytes, never substituted fixture pictures');
 const bodyFor=(source:string)=>source.startsWith('/')?readFileSync(`public${source}`):readFileSync(providers.find(p=>p.image===source)!.path);
 const view=await renderBuilder({path:`/journey/${trip.id}/itinerary?day=1`,initialTrip:trip,styled:true,browserName});
 const rows:Array<Record<string,unknown>>=[];const directory=`output/playwright/review-hold-${scenario}-${browserName}`;mkdirSync(directory,{recursive:true});
 try{
  await view.page.route('**/journey/immersive/*.webp',(route:Route)=>route.fulfill({contentType:'image/webp',body:readFileSync(`public${new URL(route.request().url()).pathname}`)}));
  await view.page.route('https://hare-media-cdn.tripadvisor.com/**',(route:Route)=>{const p=providers.find(p=>p.image===route.request().url());return p?route.fulfill({contentType:'image/jpeg',body:readFileSync(p.path)}):route.abort();});
  await view.page.reload();await view.page.setViewportSize({width:1440,height:1000});
  await view.page.getByRole('button',{name:'Calendar',exact:true}).click();
  const cards=view.page.locator('#itinerary-calendar article');assert.equal(await cards.count(),29);
  for(let index=0;index<29;index++){
   const day=trip.planItems[index];const card=cards.nth(index);if(scenario==='fully-populated')assert.ok((await card.innerText()).includes('Neighbourhood walk'),'Each populated test day renders actual plan rows');const img=card.locator('[data-itinerary-photo="calendar"] img');
   await img.scrollIntoViewIfNeeded();
   await view.page.waitForFunction((img:HTMLImageElement)=>img.complete&&img.naturalWidth>0,await img.elementHandle());
   const rendered=await img.evaluate((img:HTMLImageElement)=>({src:new URL(img.currentSrc).pathname,full:img.currentSrc,naturalWidth:img.naturalWidth}));
   const source=rendered.full.startsWith('http://localhost')||rendered.full.startsWith('http://127.0.0.1')?rendered.src:rendered.full;
   const expected=selected[day.id]!;assert.ok(expected,`Day ${day.dayNumber} has legitimate coverage`);
   const identity=itineraryImageIdentity({src:source,alt:''});assert.equal(identity,itineraryImageIdentity(expected));
   const pixels=await sharp(bodyFor(source)).resize(32,32,{fit:'fill'}).removeAlpha().raw().toBuffer();
   rows.push({day:day.dayNumber,identity,source,naturalWidth:rendered.naturalWidth,pixelHash:createHash('sha256').update(pixels).digest('hex'),activity:expected.activityTitle??null});
  }
  assert.ok(rows.every(r=>String(r.source).startsWith('/journey/')),'Day covers contain no unverified supplier URLs');
  assert.equal(new Set(rows.map(r=>r.identity)).size,29,'No repeated asset identity across any days');
  assert.equal(new Set(rows.map(r=>r.pixelHash)).size,29,'Actual decoded image pixels are distinct, not just URLs');
  await view.page.locator('#itinerary-calendar').scrollIntoViewIfNeeded();
  await view.page.screenshot({path:`${directory}/calendar-all-29-days.png`,fullPage:true});
  await view.page.addScriptTag({path:resolve('node_modules/axe-core/axe.min.js')});
  const audit=await view.page.evaluate(async()=> (window as any).axe.run(document.querySelector('section[aria-label="Trip itinerary"]'),{runOnly:{type:'tag',values:['wcag2a','wcag2aa']}}));
  assert.deepEqual(audit.violations.map((v:any)=>({id:v.id,nodes:v.nodes.map((n:any)=>n.target)})),[]);
  await view.page.setViewportSize({width:390,height:1000});await view.page.getByRole('button',{name:'Day by day',exact:true}).click();
  for(let index=0;index<29;index++){
   if(index)await view.page.getByRole('tablist',{name:'Day by day',exact:true}).getByRole('tab',{selected:true}).press('ArrowRight');
   const day=trip.planItems[index];const photo=view.page.locator('[data-itinerary-photo="day"]');const img=photo.locator('img');await img.scrollIntoViewIfNeeded();
   await view.page.waitForFunction(()=>{const img=document.querySelector('[data-itinerary-photo="day"] img') as HTMLImageElement|null;return img?.complete&&img.naturalWidth>0});
   const src=await img.getAttribute('src');assert.equal(itineraryImageIdentity({src:src!,alt:''}),itineraryImageIdentity(selected[day.id]!));
   assert.ok((await photo.boundingBox())!.height<=141);
   const activity=actualActivityDays.find(idea=>idea.dayId===day.id);
   if(activity&&selected[day.id]?.activityTitle){
    assert.equal(await photo.getAttribute('data-itinerary-image-kind'),'activity');
    if(day.dayNumber===2)await photo.getByText(/^Place photo ·/).waitFor();
    assert.ok((await photo.innerText()).includes('title' in activity?activity.title:''));
    const label=photo.getByText('title' in activity?activity.title:'',{exact:false});
    assert.notEqual(await label.evaluate((el:HTMLElement)=>getComputedStyle(el).backgroundColor),'rgba(0, 0, 0, 0)','Activity label stays readable on an opaque surface above the photo');
    await photo.getByRole('button',{name:/Photo credit/}).click();
    const dialog=view.page.getByRole('dialog',{name:'Photo information',exact:true});await dialog.waitFor();
    assert.equal(await dialog.locator(`a[href="${selected[day.id]!.sourceUrl}"]`).count(),1);
    await view.page.keyboard.press('Escape');
   }else if(activity){
    assert.equal(selected[day.id]?.activityTitle,undefined,'Unverified activity image is not replaced by a false activity match');
    assert.equal(await photo.getAttribute('data-itinerary-image-kind'),'destination');
    await photo.getByText('Destination photo',{exact:true}).waitFor({timeout:2000});
   }
   await photo.screenshot({path:`${directory}/day-${String(day.dayNumber).padStart(2,'0')}.png`});
   assert.equal(await view.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  }
  await view.page.addScriptTag({path:resolve('node_modules/axe-core/axe.min.js')});
  const mobileAudit=await view.page.evaluate(async()=> (window as any).axe.run(document.querySelector('section[aria-label="Trip itinerary"]'),{runOnly:{type:'tag',values:['wcag2a','wcag2aa']}}));
  assert.deepEqual(mobileAudit.violations.map((v:any)=>v.id),[]);
  assert.deepEqual(view.errors,[]);assert.equal(JSON.stringify(trip),before);
  writeFileSync(`output/qa/review-hold/${scenario}-${browserName}-visible-coverage.json`,JSON.stringify(rows,null,2)+'\n');
 }catch(error){await view.page.screenshot({path:`${directory}/failure.png`,fullPage:false});writeFileSync(`${directory}/failure-dom.txt`,await view.page.locator('body').innerText());throw error;}finally{await view.close()}
});
