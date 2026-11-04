import assert from 'node:assert/strict';
import test from 'node:test';
import type { Route } from 'playwright';
import { readFileSync, mkdirSync } from 'node:fs';
import { builderBrowserTestsEnabled, renderBuilder } from './helpers/builder-render.ts';
import { japanTrip } from './fixtures/transport-choice.ts';
import { insertItineraryActivity } from '../lib/easyt/itinerary-mutations.ts';

function fixture() {
  let trip = japanTrip();
  trip.planItems = Array.from({length: 7}, (_, i) => ({...trip.planItems[0], id: `day-${i+1}`, dayNumber: i+1, date: `2027-04-0${i+1}`, stopId: i < 3 ? 'tokyo' : 'kyoto', type: i === 3 ? 'transport' as const : 'open' as const, title: i === 3 ? 'Tokyo to Kyoto' : i < 3 ? 'Tokyo' : 'Kyoto', notes: []}));
  for (let n=1;n<=7;n++) for (const [part,title] of [['morning','Neighbourhood walk'],['afternoon','Garden visit'],['evening','Local dinner']] as const) {
    trip = insertItineraryActivity(trip,n,trip.planItems[n-1].notes.length,title,part).trip;
  }
  return trip;
}

test('photo-led calendar and mobile agenda retain navigation, details and resilient reviewed photos', {skip: !builderBrowserTestsEnabled,timeout: 90_000}, async () => {
  const trip = fixture();
  const view = await renderBuilder({path:`/journey/${trip.id}/itinerary?day=4`,initialTrip:trip,styled:true});
  try {
    await view.page.route('**/journey/immersive/*.webp', (route: Route) => route.fulfill({contentType:'image/webp',body:readFileSync(`public${new URL(route.request().url()).pathname}`)}));
    await view.page.reload();
    await view.page.setViewportSize({width:1440,height:1100});
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
