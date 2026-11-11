import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const origin = process.env.MORROVIA_CALENDAR_PREVIEW_ORIGIN;
test('date and itinerary content belong to one bordered day card on desktop and mobile', {skip:!origin}, async () => {
  const {chromium} = require('playwright');
  const browser = await chromium.launch({channel:'chrome',headless:true});
  const page = await browser.newPage({viewport:{width:1440,height:1000}});
  try {
    await page.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    await page.goto(`${origin}/iframe.html?id=morrovia-05-product-patterns-trip-workspace-itinerary--calendar&viewMode=story`);
    await page.getByRole('button',{name:'Calendar',exact:true}).click({timeout:45000});
    const card = page.locator('#itinerary-calendar article[class*="calendarDay"]').filter({has:page.locator('ul')}).first();
    await card.waitFor();
    for (const width of [1440,390,320]) {
      await page.setViewportSize({width,height:1000});
      const shape = await card.evaluate(element => {
        const date = element.querySelector('time');
        const body = element.querySelector('[class*="calendarDayBody"]');
        const outer = element.getBoundingClientRect(), header = date.getBoundingClientRect();
        return {border:parseFloat(getComputedStyle(element).borderTopWidth),dateInside:header.top>=outer.top&&header.bottom<=outer.bottom&&header.left>=outer.left&&header.right<=outer.right,bodyBorder:parseFloat(getComputedStyle(body).borderTopWidth)};
      });
      assert.ok(shape.border>0, `the enclosing day, including its date, has a border at ${width}`);
      assert.equal(shape.dateInside,true);
      if(width>900) assert.equal(shape.bodyBorder,0,'the itinerary is not in a separate bordered component');
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    }
  } finally { await browser.close(); }
});
