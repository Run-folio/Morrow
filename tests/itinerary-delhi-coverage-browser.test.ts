import assert from'node:assert/strict';
import test from'node:test';
import{createHash}from'node:crypto';
import{readFileSync,mkdirSync,writeFileSync}from'node:fs';
import{resolve}from'node:path';
import sharp from'sharp';
import type{Route}from'playwright';
import{builderBrowserTestsEnabled,renderBuilder}from'./helpers/builder-render.ts';
import{delhiCoverageTrip}from'./fixtures/delhi-photo-coverage.ts';
import{itineraryPresentationImages}from'../lib/easyt/itinerary-presentation-images.ts';
import{itineraryImageIdentity}from'../lib/easyt/itinerary-image-policy.ts';
import{canonicalImageSource}from'../lib/easyt/image-source-identity.ts';

const evidence=process.env.MORROVIA_DELHI_IMAGE_EVIDENCE;
for(const browserName of['chromium','webkit']as const)test(`${browserName}: Delhi29 shows13 distinct verified photos and16 days without a photo slot`,{skip:!builderBrowserTestsEnabled||!evidence,timeout:120_000},async()=>{
 const trip=delhiCoverageTrip(),before=JSON.stringify(trip),expected=itineraryPresentationImages(trip,{reviewedOnly:true}).dayById;
 const cdn=JSON.parse(readFileSync(evidence!,'utf8'))as Array<{src:string;path:string;type:string}>;
 const directory=`output/playwright/review-hold-delhi-${browserName}`;mkdirSync(directory,{recursive:true});
 const rows:Array<{day:number;kind:'photo'|'non-photo';identity?:string;pixelHash?:string;source?:string}>=[];
 const view=await renderBuilder({path:`/journey/${trip.id}/itinerary?day=1`,initialTrip:trip,styled:true,browserName});
 try{
  await view.page.route('**/journey/immersive/*.webp',(r:Route)=>r.fulfill({contentType:'image/webp',body:readFileSync(`public${new URL(r.request().url()).pathname}`)}));
  await view.page.route('https://images.unsplash.com/**',(r:Route)=>{const image=cdn.find(i=>canonicalImageSource(i.src)===canonicalImageSource(r.request().url()));return image?r.fulfill({contentType:image.type,body:readFileSync(image.path)}):r.abort()});
  await view.page.reload();await view.page.setViewportSize({width:1440,height:1000});await view.page.getByRole('button',{name:'Calendar',exact:true}).click();
  const cards=view.page.locator('#itinerary-calendar article');assert.equal(await cards.count(),29);
  for(let index=0;index<29;index++){
   const day=trip.planItems[index],photo=cards.nth(index).locator('[data-itinerary-photo="calendar"]');await photo.scrollIntoViewIfNeeded();
   const img=photo.locator('img');
   if(expected[day.id]){
    await view.page.waitForFunction((img:HTMLImageElement)=>img.complete&&img.naturalWidth>0,await img.elementHandle());
    const full=await img.evaluate((img:HTMLImageElement)=>img.currentSrc);const source=new URL(full).hostname==='127.0.0.1'?new URL(full).pathname:full;
    const body=source.startsWith('/')?readFileSync(`public${source}`):readFileSync(cdn.find(i=>canonicalImageSource(i.src)===canonicalImageSource(source))!.path);
    const pixels=await sharp(body).resize(32,32,{fit:'fill'}).removeAlpha().raw().toBuffer();const identity=itineraryImageIdentity({src:source,alt:''});
    assert.equal(identity,itineraryImageIdentity(expected[day.id]!));rows.push({day:index+1,kind:'photo',identity,source,pixelHash:createHash('sha256').update(pixels).digest('hex')});
   }else{
    assert.equal(await img.count(),0,'Exhaustion never borrows or repeats a picture');
    assert.equal(await photo.count(),0,'Exhausted days omit the photo slot and its placeholder');
    assert.equal(await cards.nth(index).getByText('No day photo',{exact:true}).count(),0);
    rows.push({day:index+1,kind:'non-photo'});
   }
  }
  const photos=rows.filter(r=>r.kind==='photo');assert.equal(photos.length,13);assert.equal(rows.filter(r=>r.kind==='non-photo').length,16);
  assert.equal(new Set(photos.map(r=>r.identity)).size,13);assert.equal(new Set(photos.map(r=>r.pixelHash)).size,13);
  await view.page.screenshot({path:`${directory}/calendar-all29.png`,fullPage:true});
  await view.page.addScriptTag({path:resolve('node_modules/axe-core/axe.min.js')});
  const audit=await view.page.evaluate(async()=> (window as any).axe.run(document.querySelector('section[aria-label="Trip itinerary"]'),{runOnly:{type:'tag',values:['wcag2a','wcag2aa']}}));assert.deepEqual(audit.violations.map((v:any)=>v.id),[]);
  await view.page.setViewportSize({width:390,height:1000});await view.page.getByRole('button',{name:'Day by day',exact:true}).click();
  for(let index=0;index<29;index++){
   if(index)await view.page.getByRole('tablist',{name:'Day by day',exact:true}).getByRole('tab',{selected:true}).press('ArrowRight');
   const photo=view.page.locator('[data-itinerary-photo="day"]');
   if(expected[trip.planItems[index].id]){
    await photo.scrollIntoViewIfNeeded();const img=photo.locator('img');await view.page.waitForFunction((img:HTMLImageElement)=>img.complete&&img.naturalWidth>0,await img.elementHandle());
    assert.equal(itineraryImageIdentity({src:(await img.getAttribute('src'))!,alt:''}),rows[index].identity);
   }else{
    assert.equal(await photo.count(),0,'No photo slot or placeholder after unique coverage is exhausted');
    assert.equal(await view.page.getByText('No day photo',{exact:true}).count(),0);
   }
   if(expected[trip.planItems[index].id]) { assert.ok((await photo.boundingBox())!.height<=141);await photo.screenshot({path:`${directory}/day-${String(index+1).padStart(2,'0')}.png`}); }
   assert.equal(await view.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  }
  await view.page.addScriptTag({path:resolve('node_modules/axe-core/axe.min.js')});
  const mobile=await view.page.evaluate(async()=> (window as any).axe.run(document.querySelector('section[aria-label="Trip itinerary"]'),{runOnly:{type:'tag',values:['wcag2a','wcag2aa']}}));assert.deepEqual(mobile.violations.map((v:any)=>v.id),[]);
  assert.deepEqual(view.errors,[]);assert.equal(JSON.stringify(trip),before);writeFileSync(`output/qa/review-hold/delhi-${browserName}-visible-coverage.json`,JSON.stringify(rows,null,2)+'\n');
 }finally{await view.close()}
});
