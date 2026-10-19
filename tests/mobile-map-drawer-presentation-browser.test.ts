import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdirSync, writeFileSync} from 'node:fs';
import {chromium, type Page} from 'playwright';

const enabled = process.env.MORROVIA_DRAWER_PRESENTATION_TESTS === '1';
const base = process.env.MORROVIA_STORYBOOK_URL ?? 'http://127.0.0.1:6014';
const shots = process.env.MORROVIA_DRAWER_SCREENSHOTS ?? 'output/playwright/mobile-drawer';
const prefix = 'morrovia-05-product-patterns-trip-workspace-map--';
async function settled(page: Page) {
  await page.locator('#map-contextual-sheet').evaluate(async (element) => {
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    await Promise.all(element.getAnimations().map(animation => animation.finished.catch(() => {})));
  });
}
async function measure(page: Page) {
  return page.locator('#map-contextual-sheet').evaluate((element) => {
    const main = element.closest('main')!;
    const body = element.querySelector('#map-contextual-sheet-content')!;
    const finder = element.querySelector('#shape-day-workspace');
    const header = element.querySelector('header')!;
    const rect = (node: Element) => { const r = node.getBoundingClientRect(); return {top:r.top,bottom:r.bottom,height:r.height,width:r.width}; };
    return {sheet:rect(element),main:rect(main),body:rect(body),header:rect(header),state:element.getAttribute('data-mobile-drawer-state'),size:element.getAttribute('data-mobile-drawer-size'),finderGrip:finder ? getComputedStyle(finder,'::before').content : null,finderMinimum:finder ? getComputedStyle(finder).minHeight : null,bodyScroll:getComputedStyle(body).overflowY,bodyScrollHeight:body.scrollHeight,bodyClientHeight:body.clientHeight,mapStatus:main.querySelector('.planner-map')?.getAttribute('data-basemap-status'),nestedScroll:finder ? [...finder.querySelectorAll('*')].filter(e => ['auto','scroll'].includes(getComputedStyle(e).overflowY) && e.scrollHeight > e.clientHeight + 1).length : 0,overflow:document.documentElement.scrollWidth > innerWidth};
  });
}
for (const [width,height] of [[360,667],[390,844],[390,600],[844,390],[980,900],[981,1000],[1440,1000]]) {
  test(`${width}x${height} drawer presentation and planner continuity`, {skip:!enabled,timeout:90000}, async () => {
    assert.ok(['127.0.0.1','localhost'].includes(new URL(base).hostname));
    const browser = await chromium.launch({channel:'chrome',headless:true});
    const context = await browser.newContext({viewport:{width,height},serviceWorkers:'block'});
    let writes = 0;
    await context.route('**/api/**', async route => {
      const request = route.request();
      if (!['GET','HEAD','OPTIONS'].includes(request.method())) {
        if (new URL(request.url()).pathname.startsWith('/api/easyt/trips')) writes++;
        return route.fulfill({status:503,contentType:'application/json',body:'{"error":"isolated read-only fixture"}'});
      }
      return route.fulfill({status:200,contentType:'application/json',body:'{"places":[],"place":null,"properties":[],"configured":false}'});
    });
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    const errors:string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    try {
      await page.goto(`${base}/iframe.html?id=${prefix}mobile-drawer-qualified-trip&viewMode=story`,{waitUntil:'domcontentloaded'});
      const finder = page.locator('#shape-day-workspace');
      const sheet = page.locator('#map-contextual-sheet');
      await finder.getByRole('tab',{name:'Plan',exact:true}).waitFor();
      await settled(page);
      await page.locator('.planner-map[data-basemap-status="detailed"], .planner-map[data-basemap-status="fallback"]').waitFor({timeout:25000});
      mkdirSync(shots,{recursive:true});
      if (width <= 980) {
        const initial = await measure(page);
        assert.equal(initial.state,'open');
        assert.equal(initial.size,'intermediate');
        assert.ok(initial.sheet.height <= height * .5 + 2);
        assert.ok(initial.sheet.top - initial.main.top >= 72 + 112 - 2);
        assert.equal(initial.finderGrip,'none');
        assert.equal(initial.finderMinimum,'0px');
        assert.equal(initial.bodyScroll,'auto');
        assert.ok(initial.bodyScrollHeight > initial.bodyClientHeight,'long itineraries remain available in the drawer scroll area');
        assert.equal(initial.nestedScroll,0);
        assert.equal(await finder.getByRole('heading',{name:'Bogotá',exact:true}).isVisible(),false);
        assert.equal(await finder.getByRole('button',{name:/^Close .* planning$/}).isVisible(),false);
        assert.equal(initial.overflow,false);
        await page.screenshot({path:`${shots}/drawer-${width}x${height}-intermediate.png`});
        const toggle = sheet.locator(':scope > header button');
        await toggle.click(); await settled(page);
        const expanded = await measure(page);
        assert.equal(expanded.size,'expanded');
        assert.ok(expanded.sheet.height >= initial.sheet.height - 1);
        assert.ok(expanded.sheet.top - expanded.main.top >= 72 + 112 - 2);
        await page.screenshot({path:`${shots}/drawer-${width}x${height}-expanded.png`});
        // Keyboard and pointer use the same header control; collapsing keeps tab/selection state.
        await toggle.press('Enter'); await settled(page);
        const collapsed = await measure(page);
        assert.equal(collapsed.state,'collapsed');
        assert.ok(collapsed.sheet.height >= 44 && collapsed.sheet.height <= 56);
        assert.equal(collapsed.body.height,0);
        await page.screenshot({path:`${shots}/drawer-${width}x${height}-collapsed.png`});
        await toggle.press('Enter'); await settled(page);
        assert.equal(await finder.getByRole('tab',{name:'Plan',exact:true}).getAttribute('aria-selected'),'true');
        for (const tab of ['Stay','Eat','See','Plan']) {
          await finder.getByRole('tab',{name:tab,exact:true}).click();
          assert.equal(await finder.getByRole('tab',{name:tab,exact:true}).getAttribute('aria-selected'),'true');
        }
        writeFileSync(`${shots}/drawer-${width}x${height}-geometry.json`,JSON.stringify({initial,expanded,collapsed},null,2));
        if(width===390 && height===844) {
          await finder.getByText('Synthetic itinerary activity 20',{exact:true}).scrollIntoViewIfNeeded();
          const last=await finder.getByText('Synthetic itinerary activity 20',{exact:true}).boundingBox();
          const body=await page.locator('#map-contextual-sheet-content').boundingBox();
          assert.ok(last && body && last.y >= body.y && last.y + last.height <= body.y + body.height);
          await page.screenshot({path:`${shots}/drawer-390-long-itinerary-scrolled.png`});
          await page.getByRole('button',{name:'Whole route',exact:true}).click(); await settled(page);
          assert.equal(await sheet.getAttribute('data-mobile-drawer-state'),'collapsed');
          await page.screenshot({path:`${shots}/drawer-390-whole-route-collapsed.png`});
        }
      } else {
        assert.equal(await sheet.locator(':scope > header').isVisible(),false);
        assert.equal(await finder.getByRole('heading',{name:'Bogotá',exact:true}).isVisible(),true);
        for (const tab of ['Plan','Stay','Eat','See']) assert.equal(await finder.getByRole('tab',{name:tab,exact:true}).isVisible(),true);
        await page.screenshot({path:`${shots}/drawer-${width}x${height}-desktop.png`});
      }
      assert.equal(writes,0);
      assert.deepEqual(errors,[]);
    } finally { await browser.close(); }
  });
}

test('Google canvas, selected pins and places share one mobile drawer header', {skip:!enabled,timeout:90000}, async () => {
  const browser = await chromium.launch({channel:'chrome',headless:true});
  const context = await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
  let writes = 0;
  await context.route('**/api/**', async route => {
    if (!['GET','HEAD','OPTIONS'].includes(route.request().method()) && new URL(route.request().url()).pathname.startsWith('/api/easyt/trips')) writes++;
    return route.fulfill({status:200,contentType:'application/json',body:'{"places":[],"place":null,"activities":[],"properties":[],"configured":false}'});
  });
  const page = await context.newPage(); page.setDefaultTimeout(15000);
  try {
    await page.goto(`${base}/iframe.html?id=${prefix}mobile-drawer-qualified-google&viewMode=story`);
    await page.locator('main[data-google-discovery="true"]').waitFor();
    const sheet = page.locator('#map-contextual-sheet');
    await settled(page);
    const overlap = () => page.evaluate(() => {
      const map=document.querySelector('.planner-map')!.getBoundingClientRect();
      const drawer=document.querySelector('#map-contextual-sheet')!.getBoundingClientRect();
      return Math.max(0,map.bottom-drawer.top);
    });
    assert.ok(await overlap() <= 1,'a resized Google canvas has no drawer overlap to subtract again');
    await sheet.locator(':scope > header button').click(); await settled(page);
    assert.ok(await overlap() <= 1);
    await page.screenshot({path:`${shots}/drawer-390-google-expanded.png`});
    await page.goto(`${base}/iframe.html?id=${prefix}mobile-drawer-qualified-pin&viewMode=story`);
    const close=sheet.getByRole('button',{name:'Close selected pin details',exact:true});
    await close.waitFor(); await settled(page);
    assert.equal(await sheet.getByRole('button',{name:'Close selected pin details',exact:true}).count(),1);
    assert.equal(await sheet.locator('[class*="mapContextHeading"]').isVisible(),false);
    await page.screenshot({path:`${shots}/drawer-390-selected-pin.png`});
    await close.click(); await settled(page);
    assert.equal(await sheet.getAttribute('data-mobile-drawer-state'),'collapsed');
    await page.goto(`${base}/iframe.html?id=${prefix}mobile-drawer-qualified-stay&viewMode=story`);
    await sheet.getByRole('button',{name:'Close details for Synthetic Bogotá courtyard stay',exact:true}).waitFor();
    await settled(page);
    assert.equal(await sheet.getByRole('button',{name:'Close details for Synthetic Bogotá courtyard stay',exact:true}).count(),1);
    assert.equal(await sheet.locator('[class*="mapSelectionClose"]').isVisible(),false);
    const duplicateTitle = await sheet.getByRole('heading',{name:'Synthetic Bogotá courtyard stay',exact:true}).boundingBox();
    assert.ok(duplicateTitle && duplicateTitle.width <= 1 && duplicateTitle.height <= 1,'the body title stays accessible without repeating it visually');
    assert.equal(await sheet.getByText('A synthetic stay used to review the selected-place header, location and booking actions.',{exact:true}).isVisible(),true);
    await page.screenshot({path:`${shots}/drawer-390-selected-stay.png`});
    assert.equal(writes,0);
  } finally { await browser.close(); }
});
