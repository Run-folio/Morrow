import assert from 'node:assert/strict';
import test from 'node:test';
import {execFileSync} from 'node:child_process';
import {resolve} from 'node:path';
import {routeDestinationPhoto,routePhotoForSource} from '../lib/easyt/route-images.ts';
import type { Route } from 'playwright';
import { readFileSync, mkdirSync } from 'node:fs';
import { builderBrowserTestsEnabled, renderBuilder } from './helpers/builder-render.ts';
import {photoLedItineraryTrip as fixture} from './fixtures/photo-led-itinerary.ts';



test('photo-led calendar and mobile agenda retain navigation, details and resilient reviewed photos', {skip: !builderBrowserTestsEnabled,timeout: 90_000}, async () => {
  const trip = fixture();
  const view = await renderBuilder({path:`/journey/${trip.id}/itinerary?day=4`,initialTrip:trip,styled:true});
  try {
    await view.page.route('**/journey/immersive/*.webp', (route: Route) => route.fulfill({contentType:'image/webp',body:readFileSync(`public${new URL(route.request().url()).pathname}`)}));
    await view.page.reload();
    await view.page.setViewportSize({width:1440,height:1100});
    const initialTitle=await view.page.locator('#trip-shell-title').innerText();
    const initialDates=await view.page.locator('dl').first().innerText();
    const heroImage = view.page.locator('[data-itinerary-photo="day"] img');
    await heroImage.waitFor();
    await view.page.waitForFunction(() => [...document.images].some(img => img.closest('[data-itinerary-photo="day"]') && img.complete && img.naturalWidth > 0));
    const selected = await heroImage.evaluate((img: HTMLImageElement) => ({src:new URL(img.currentSrc).pathname, width:img.getBoundingClientRect().width}));
    const selectedVariant = routePhotoForSource(selected.src)?.variants.find(v => v.src === selected.src);
    assert.ok(selectedVariant && selectedVariant.width >= selected.width, `Hero source ${selectedVariant?.width}px must cover ${selected.width}px`);
    await view.page.getByRole('button',{name:'Calendar',exact:true}).click();
    const photos = view.page.locator('#itinerary-calendar [data-itinerary-photo]');
    await photos.first().waitFor({timeout:3000});
    assert.equal(await photos.count(),7);
    assert.equal(await photos.locator('img:not([loading="lazy"])').count(),0);
    assert.ok(await photos.first().locator('img').getAttribute('srcset'));
    mkdirSync('output/playwright',{recursive:true});
    await view.page.screenshot({path:'output/playwright/photo-calendar-1440.png',fullPage:true});
    for (const width of [1024,768,390,320]) {
      await view.page.setViewportSize({width,height:1000});
      await view.page.getByRole('button',{name:'Day by day',exact:true}).click();
      const tabs = view.page.getByRole('tablist',{name:'Day by day',exact:true});
      await tabs.getByRole('tab',{selected:true}).press('ArrowRight');
      await tabs.getByRole('tab',{selected:true}).press('ArrowLeft');
      const panel = view.page.getByRole('tabpanel');
      const photo = panel.locator('[data-itinerary-photo]').first();
      await photo.waitFor();
      if(width <= 540) {
        const photoBox=(await photo.boundingBox())!;
        assert.ok(photoBox.width > width * .8);
        const planner=panel.locator('section[aria-label="Day 4 planner"]');
        assert.ok((await planner.boundingBox())!.y > photoBox.y);
        await panel.getByRole('heading',{name:'Tokyo → Kyoto',exact:true}).waitFor();
        const stay = panel.getByRole('region', {name:/Stay: Kyoto test stay/});
        await stay.waitFor();
        assert.ok((await stay.boundingBox())!.y > (await planner.boundingBox())!.y);
        assert.match(await stay.innerText(), /Selected · not booked/);
        const stayTitle=(await stay.locator('strong').boundingBox())!;
        const stayStatus=(await stay.getByText('Selected · not booked',{exact:true}).boundingBox())!;
        assert.ok(stayStatus.y >= stayTitle.y + stayTitle.height - 1, 'Stay status is stacked below its title');
        await planner.locator('[data-itinerary-activity-id]').last().locator('summary').focus();
        await view.page.keyboard.press('Tab');
        assert.equal(await stay.getByRole('button',{name:/Kyoto test stay/}).evaluate((el: Element)=>el===document.activeElement),true, 'Tab moves from the final activity to the stay');
        assert.equal(await panel.evaluate((element: HTMLElement) => {
          const planner=element.querySelector('section[aria-label="Day 4 planner"]')!;
          const stay=element.querySelector('section[aria-label^="Stay:"]')!;
          return Boolean(planner.compareDocumentPosition(stay) & Node.DOCUMENT_POSITION_FOLLOWING);
        }), true, 'Keyboard and reading order must follow the visual planner → stay order');
        assert.ok((await panel.getByRole('button',{name:'Add plan',exact:true}).boundingBox())!.y > (await stay.boundingBox())!.y);

      }
      assert.equal(await view.page.locator('#trip-shell-title').innerText(),initialTitle);
      assert.equal(await view.page.locator('dl').first().innerText(),initialDates);
      if(width<=540){
        const mapHref=await panel.getByRole('link',{name:'Explore map',exact:true}).getAttribute('href');
        const mapUrl=new URL(mapHref!,view.page.url());
        const returnUrl=new URL(mapUrl.searchParams.get('returnTo')!,view.page.url());
        assert.equal(returnUrl.pathname,`/journey/${trip.id}/itinerary`);
        assert.equal(returnUrl.searchParams.get('day'),'4');
        assert.equal(returnUrl.searchParams.get('itineraryView'),'days');
      }
      assert.equal(await view.page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth),true,`${width}px overflow`);
      await view.page.screenshot({path:`output/playwright/photo-agenda-${width}.png`,fullPage:true});
    }
    await view.page.getByRole('button',{name:'Add plan',exact:true}).click();
    await view.page.getByRole('dialog',{name:'Add a plan',exact:true}).waitFor();
    await view.page.keyboard.press('Escape');
    await view.page.route('**/journey/immersive/*.webp',(route: Route)=>route.abort());
    await view.page.reload();
    await view.page.locator('[data-itinerary-photo] [role="img"]').first().waitFor();
    assert.deepEqual(view.errors,[]);
  } finally {await view.close();}
});


test('mobile bottom navigation exactly matches the pre-design navigation and remains usable', {skip: !builderBrowserTestsEnabled, timeout:60_000}, async () => {
  const trip = fixture();
  const frozen = new Map([[resolve('components/easyt/trip-itinerary-workspace.tsx'), execFileSync('git',['show','acddff5:components/easyt/trip-itinerary-workspace.tsx'],{encoding:'utf8'})]]);
  const snapshots: unknown[] = [];
  for (const sourceOverrides of [frozen,undefined]) {
    const view = await renderBuilder({path:`/journey/${trip.id}/itinerary?day=4`,initialTrip:trip,styled:true,sourceOverrides});
    try {
      await view.page.setViewportSize({width:390,height:844});
      const nav = view.page.getByRole('navigation',{name:'Trip workspace',exact:true});
      await nav.waitFor();
      await view.page.waitForFunction(()=>document.querySelector('nav[data-mobile]'));
      snapshots.push(await nav.evaluate((element: HTMLElement) => {
        const css=getComputedStyle(element),box=element.getBoundingClientRect();
        return {text:element.innerText,position:css.position,bottom:css.bottom,background:css.backgroundColor,color:css.color,font:css.font,box:{x:box.x,y:box.y,width:box.width,height:box.height}, controls:[...element.querySelectorAll('a,button')].map(el=>({tag:el.tagName,label:el.getAttribute('aria-label'),text:el.textContent,href:el.getAttribute('href'),current:el.getAttribute('aria-current')}))};
      }));
      await nav.getByRole('button',{name:'More',exact:true}).click();
      await view.page.getByRole('dialog',{name:'More trip sections',exact:true}).waitFor();
      await view.page.keyboard.press('Escape');
      await nav.getByRole('link',{name:'Transport',exact:true}).waitFor();
      assert.deepEqual(view.errors,[]);
    } finally {await view.close();}
  }
  assert.deepEqual(snapshots[1],snapshots[0]);
});


test('photo credit remains available when saved days use different variants of the same reviewed photograph', {skip: !builderBrowserTestsEnabled,timeout:45_000}, async () => {
  const trip=fixture();
  const photo=routeDestinationPhoto('Tokyo','Japan')!;
  trip.planItems[0].image=photo.variants.at(-1)!.src;
  trip.planItems[1].image=photo.variants[0].src;
  const view=await renderBuilder({path:`/journey/${trip.id}/itinerary?day=1`,initialTrip:trip,styled:true});
  try {
    await view.page.route('**/journey/immersive/*.webp',(route: Route)=>route.fulfill({contentType:'image/webp',body:readFileSync(`public${new URL(route.request().url()).pathname}`)}));
    await view.page.reload();
    await view.page.locator('[data-itinerary-photo="day"] button[aria-haspopup="dialog"]').waitFor();
    const tabs=view.page.getByRole('tablist',{name:'Day by day',exact:true});
    await tabs.getByRole('tab',{selected:true}).press('ArrowRight');
    await view.page.waitForFunction(()=>location.search.includes('day=2'));
    await view.page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
    assert.equal(await view.page.locator('[data-itinerary-photo="day"] button[aria-haspopup="dialog"]').count(),1);
    await view.page.locator('[data-itinerary-photo="day"] button[aria-haspopup="dialog"]').click();
    await view.page.getByRole('dialog',{name:'Photo information',exact:true}).waitFor();
    await view.page.keyboard.press('Escape');
    assert.deepEqual(view.errors,[]);
  } finally {await view.close();}
});

test('mobile Add plan retains its chosen day and period after a durable save and reopen', {skip: !builderBrowserTestsEnabled,timeout:60_000}, async () => {
  const trip=fixture();
  const view=await renderBuilder({path:`/journey/${trip.id}/itinerary?day=4`,initialTrip:trip,styled:true});
  try {
    await view.page.setViewportSize({width:390,height:844});
    await view.page.getByRole('button',{name:'Add plan',exact:true}).click();
    const chooser=view.page.getByRole('dialog',{name:'Add a plan',exact:true});
    await chooser.getByRole('button',{name:'Evening',exact:true}).click();
    await chooser.getByRole('button',{name:'New plan',exact:true}).click();
    const add=view.page.getByRole('dialog',{name:'Add to Evening on Day 4',exact:true});
    await add.getByRole('textbox',{name:'Add your own',exact:true}).fill('Evening market visit');
    await add.getByRole('button',{name:'Add to Evening',exact:true}).click();
    const planner=view.page.locator('section[aria-label="Day 4 planner"]');
    await planner.locator('[data-day-part="evening"]').getByText('Evening market visit',{exact:true}).waitFor();
    const fresh=await view.page.context().newPage();
    await fresh.setViewportSize({width:390,height:844});
    await fresh.goto(view.page.url());
    await fresh.locator('section[aria-label="Day 4 planner"] [data-day-part="evening"]').getByText('Evening market visit',{exact:true}).waitFor();
    await fresh.getByRole('tab',{selected:true}).press('ArrowLeft');
    assert.equal(await fresh.getByText('Evening market visit',{exact:true}).count(),0);
    await fresh.getByRole('tab',{selected:true}).press('ArrowRight');
    await fresh.locator('section[aria-label="Day 4 planner"] [data-day-part="evening"]').getByText('Evening market visit',{exact:true}).waitFor();
    assert.deepEqual(view.errors,[]);
    await fresh.close();
  } finally {await view.close();}
});

test('84-day photo calendar reuses local responsive images without per-day provider requests', {skip: !builderBrowserTestsEnabled,timeout:60_000}, async () => {
  const trip=fixture();
  const start=new Date('2027-04-01T12:00:00Z');
  const date=(n: number)=>new Date(start.getTime()+n*86400000).toISOString().slice(0,10);
  trip.endDate=date(84);
  trip.stops[1]={...trip.stops[1],nights:81,departureDate:trip.endDate};
  trip.planItems=Array.from({length:84},(_,i)=>({...trip.planItems[Math.min(i,6)],id:`long-day-${i+1}`,dayNumber:i+1,date:date(i),notes:[],noteDayParts:[],type:i===3?'transport' as const:'open' as const}));
  const view=await renderBuilder({path:`/journey/${trip.id}/itinerary?day=4`,initialTrip:trip,styled:true});
  const assets=new Set<string>();let lookups=0;
  try {
    await view.page.route('**/journey/immersive/*.webp',(route: Route)=>{assets.add(new URL(route.request().url()).pathname);return route.fulfill({contentType:'image/webp',body:readFileSync(`public${new URL(route.request().url()).pathname}`)});});
    await view.page.route('**/api/journey-route-image**',(route: Route)=>{lookups++;return route.abort();});
    await view.page.setViewportSize({width:1440,height:1000});
    await view.page.reload();
    await view.page.getByRole('button',{name:'Calendar',exact:true}).click();
    const photos=view.page.locator('#itinerary-calendar [data-itinerary-photo]');
    assert.equal(await photos.count(),84);
    assert.equal(await photos.locator('img:not([loading="lazy"])').count(),0);
    await photos.last().scrollIntoViewIfNeeded();
    assert.equal(lookups,0);
    assert.ok(assets.size<=3,`84 days should share a small number of image variants, saw ${assets.size}`);
    assert.equal(await view.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    assert.deepEqual(view.errors,[]);
  } finally {await view.close();}
});

test('photo-led desktop and mobile views meet WCAG A/AA checks and contain enlarged long titles', {skip: !builderBrowserTestsEnabled,timeout:60_000}, async () => {
  const trip=fixture();
  const view=await renderBuilder({path:`/journey/${trip.id}/itinerary?day=4`,initialTrip:trip,styled:true});
  try {
    for (const width of [1440,390]) {
      await view.page.setViewportSize({width,height:1000});
      await view.page.getByRole('button',{name:width===1440?'Calendar':'Day by day',exact:true}).click();
      await view.page.addScriptTag({path:resolve('node_modules/axe-core/axe.min.js')});
      const results=await view.page.evaluate(async()=> (window as any).axe.run(document.querySelector('section[aria-label="Trip itinerary"]'),{runOnly:{type:'tag',values:['wcag2a','wcag2aa']}}));
      assert.deepEqual(results.violations.map((v: any)=>({id:v.id,impact:v.impact,nodes:v.nodes.map((n: any)=>n.target)})),[],`${width}px accessibility`);
    }
    await view.page.setViewportSize({width:320,height:844});
    await view.page.getByRole('heading',{name:'Tokyo → Kyoto',exact:true}).evaluate((element: HTMLElement)=>{element.textContent='Tokyo → SaintRemyDeProvenceAndSurroundingNeighbourhoodsWithoutBreaks';element.style.fontSize='48px';});
    assert.equal(await view.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  } finally {await view.close();}
});

test('mobile photo calendar keeps one modal and retains drafts across detail and Add transitions', {skip: !builderBrowserTestsEnabled,timeout:60_000}, async () => {
  const trip=fixture();
  const view=await renderBuilder({path:`/journey/${trip.id}/itinerary?day=4`,initialTrip:trip,styled:true});
  try {
    await view.page.setViewportSize({width:390,height:844});
    await view.page.getByRole('button',{name:'Calendar',exact:true}).click();
    await view.page.getByRole('button',{name:/^Day 4, Kyoto,/}).click();
    assert.equal(await view.page.locator('dialog:modal').count(),1);
    const note=view.page.getByRole('textbox',{name:/add day note/i});
    await note.fill('Unsubmitted day note remains available');
    const activity=view.page.locator('dialog:modal [data-itinerary-activity-id]').first().getByRole('button').first();
    await activity.click();
    await view.page.getByRole('button',{name:'Back to day',exact:true}).waitFor();
    assert.equal(await view.page.locator('dialog:modal').count(),1);
    await view.page.getByRole('button',{name:'Back to day',exact:true}).click();
    assert.equal(await note.inputValue(),'Unsubmitted day note remains available');
    await view.page.getByRole('button',{name:'Add plan',exact:true}).click();
    const chooser=view.page.getByRole('dialog',{name:'Add a plan',exact:true});
    await chooser.waitFor();
    assert.equal(await view.page.locator('dialog:modal').count(),1);
    await chooser.getByRole('button',{name:'New plan',exact:true}).click();
    const add=view.page.getByRole('dialog',{name:'Add to Morning on Day 4',exact:true});
    await add.getByRole('textbox',{name:'Add your own',exact:true}).fill('Unsaved photo calendar draft');
    await view.page.setViewportSize({width:1440,height:1000});
    await view.page.setViewportSize({width:390,height:844});
    assert.equal(await add.getByRole('textbox',{name:'Add your own',exact:true}).inputValue(),'Unsaved photo calendar draft');
    assert.equal(await view.page.locator('dialog:modal').count(),1);
    await add.getByRole('button',{name:'Close Add panel',exact:true}).click();
    await view.page.getByRole('button',{name:'Close day details',exact:true}).click();
    assert.equal(await view.page.locator('dialog:modal').count(),0);
    assert.deepEqual(view.errors,[]);
  } finally {await view.close();}
});
