import assert from 'node:assert/strict';
import test from 'node:test';
import { chromium, type Page } from 'playwright';
import { mkdirSync } from 'node:fs';

const url = process.env.MORROVIA_STORYBOOK_URL;
const output = process.env.MORROVIA_SCREENSHOT_DIR;
const story = (name: string) => `${url}/iframe.html?id=morrovia-05-product-patterns-trip-workspace-itinerary--${name}&viewMode=story`;
async function capture(page: Page, name: string) {
  if (!output) return;
  mkdirSync(output, { recursive: true });
  await page.screenshot({ path: `${output}/${name}.png`, fullPage: true });
  await page.screenshot({ path: `${output}/${name}-viewport.png` });
}
async function open(name: string, width = 1440) {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  await page.route('**/api/journey-discover?*', route => route.fulfill({ json: { places: [] } }));
  await page.route('**/api/journey-activity-inventory', route => route.fulfill({ json: { activities: [] } }));
  await page.goto(story(name));
  await page.getByRole('button', { name: 'Calendar', exact: true }).waitFor();
  return { browser, page };
}

test('Add consumes explicit guest, identity, configuration and admission outcomes without claiming empty stock', { skip: !url, timeout: 90_000 }, async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    for (const [index, reason] of ['auth_required', 'identity_required', 'configuration_unavailable', 'filtered_empty'].entries()) {
      const width = index % 2 ? 1440 : 390;
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      const complete = { retrieval: 'completed', evidence: 'conditional', retryable: false };
      let sentIdentity = false;
      await page.route('**/api/journey-discover?*', route => {
        sentIdentity = new URL(route.request().url()).searchParams.get('canonicalPlaceId') === 'tokyo';
        return route.fulfill({ json: { places: [], assessment: reason === 'identity_required' ? { retrieval: 'blocked', evidence: 'unqualified', reason, retryable: false } : { ...complete, reason: 'successful_empty' }, counts: { raw: 0, admitted: 0, returned: 0 } } });
      });
      await page.route('**/api/journey-activity-inventory', route => route.fulfill({ status: reason === 'auth_required' ? 401 : reason === 'configuration_unavailable' ? 503 : 200, json: { activities: [], assessment: reason === 'identity_required' ? { ...complete, reason: 'successful_empty' } : { retrieval: reason === 'filtered_empty' ? 'completed' : reason === 'auth_required' ? 'blocked' : 'unavailable', evidence: 'insufficient', reason, retryable: false }, ...(reason === 'filtered_empty' ? { counts: { raw: 4, admitted: 0, returned: 0 } } : {}) } }));
      await page.goto(story('suggestion-states-tokyo'));
      await page.getByRole('button', { name: /^Add plan to .*morning$/ }).first().click();
      const dialog = page.getByRole('dialog', { name: /Add to Morning/ });
      const expected = reason === 'auth_required' ? /Sign in to see bookable experiences/ : reason === 'identity_required' ? /Confirm the destination/ : reason === 'configuration_unavailable' ? /These suggestions are unavailable/ : /returned ideas do not match/;
      await dialog.getByText(expected).first().waitFor();
      assert.equal(sentIdentity, true, 'request carries the stored pinned identity; no coordinate substitution');
      assert.equal(await dialog.getByRole('button', { name: 'Try suggestions again' }).count(), 0);
      assert.equal(await dialog.getByRole('button', { name: 'Sign in', exact: true }).count(), reason === 'auth_required' ? 1 : 0);
      assert.doesNotMatch(await dialog.innerText(), /No matching ideas yet|No local ideas were found|configuration|provider_error/i);
      await capture(page, `activity-contract-${reason}-${width}`);
      await page.close();
    }
  } finally { await browser.close(); }
});

test('Retry repeats only the retryable lane and keeps a blocked guest lane distinct', { skip: !url, timeout: 60_000 }, async () => {
  const { browser, page } = await open('suggestion-states-tokyo', 390);
  try {
    let organic = 0, commercial = 0;
    await page.route('**/api/journey-discover?*', route => route.fulfill({ status: ++organic === 1 ? 503 : 200, json: { places: [], assessment: organic === 1 ? { retrieval: 'unavailable', evidence: 'insufficient', reason: 'timeout', retryable: true } : { retrieval: 'completed', evidence: 'conditional', reason: 'successful_empty', retryable: false }, ...(organic > 1 ? { counts: { raw: 0, admitted: 0, returned: 0 } } : {}) } }));
    await page.route('**/api/journey-activity-inventory', route => { commercial++; return route.fulfill({ status: 401, json: { activities: [], assessment: { retrieval: 'blocked', evidence: 'insufficient', reason: 'auth_required', retryable: false } } }); });
    await page.reload();
    await page.getByRole('button', { name: /^Add plan to .*morning$/ }).first().click();
    const dialog = page.getByRole('dialog', { name: /Add to Morning/ });
    await dialog.getByText(/search timed out/).waitFor();
    await dialog.getByText(/Sign in to see bookable experiences/).waitFor();
    await dialog.getByRole('button', { name: 'Try suggestions again' }).click();
    await dialog.getByRole('button', { name: 'Sign in', exact: true }).waitFor();
    await page.waitForFunction(() => {
      const dialog = document.querySelector('dialog[class*="contextualAddDialog"]');
      return dialog && !dialog.querySelector('[aria-busy="true"]') && !/timed out|Try suggestions again/.test(dialog.textContent ?? '');
    });
    assert.equal(organic, 2);
    assert.equal(commercial, 1, 'blocked authentication is not blindly retried');
    assert.equal(await dialog.getByRole('button', { name: 'Try suggestions again' }).count(), 0);
    assert.doesNotMatch(await dialog.innerText(), /No matching ideas yet/);
    await capture(page, 'activity-contract-retry-390');
  } finally { await browser.close(); }
});

test('Calendar ideas occupy the independently scrolling sidebar beside all three weeks', { skip: !url, timeout: 60_000 }, async () => {
  const { browser, page } = await open('calendar-sidebar-ideas');
  try {
    await page.locator('#itinerary-calendar').waitFor();
    await page.getByText('Shortlist for', { exact: false }).waitFor();
    await capture(page, 'calendar-sidebar-1440');
    const calendar = await page.locator('#itinerary-calendar').boundingBox();
    const ideas = await page.locator('[class*="ideasSection"]').boundingBox();
    assert.ok(calendar && ideas && ideas.x >= calendar.x + calendar.width - 1, 'ideas belong beside the calendar');
    assert.equal(await page.locator('dialog[class*="calendarDaySheet"]').evaluate(el => {
      const css = getComputedStyle(el);
      return css.overflowY === 'auto' && el.scrollHeight > el.clientHeight;
    }), true, 'sidebar content scrolls independently');
    assert.equal(await page.locator('section[aria-label$=" planner"]').count(), 1);
    await page.getByRole('button', { name: 'Ideas for Day 1', exact: true }).click();
    await page.waitForFunction(() => {
      const heading = [...document.querySelectorAll('h4')].find(node => node.textContent === 'Shortlist for Cusco');
      const rect = heading?.getBoundingClientRect();
      return rect && rect.top >= 0 && rect.bottom <= innerHeight;
    });
    const exposed = await page.getByText('Shortlist for Cusco', { exact: true }).boundingBox();
    assert.ok(exposed && exposed.y >= 0 && exposed.y + exposed.height <= 900, 'the visible Ideas action exposes the sidebar shortlist');
    await capture(page, 'calendar-sidebar-ideas-exposed-1440');
  } finally { await browser.close(); }
});

test('Calendar event overlay closes repeatedly with context, focus and both scroll positions intact', { skip: !url, timeout: 60_000 }, async () => {
  const { browser, page } = await open('calendar-image-fallbacks');
  try {
    const sheet = page.locator('dialog[class*="calendarDaySheet"]');
    await page.locator('#itinerary-calendar article[class*="calendarDay"]').first().locator('button').first().click();
    const origin = sheet.getByRole('button', { name: 'Walk San Blas before dinner', exact: true });
    const selection = await page.locator('header select').first().inputValue();
    for (const dismissal of ['Escape', 'Close', 'Back to day']) {
      await origin.scrollIntoViewIfNeeded();
      const scroll = await sheet.evaluate(el => el.scrollTop);
      const windowY = await page.evaluate(() => scrollY);
      await origin.click();
      await capture(page, `calendar-event-${dismissal.replaceAll(' ', '-')}-1440`);
      const detail = page.locator('dialog[class*="calendarItemDialog"]');
      assert.equal(await detail.count(), 1, 'calendar item must have a shared content overlay');
      assert.equal(await detail.evaluate(el => el.matches(':modal')), true);
      assert.equal(await detail.evaluate(el => el.contains(document.activeElement)), true);
      if (dismissal === 'Escape') await page.keyboard.press('Escape');
      else await detail.getByRole('button', { name: dismissal, exact: true }).click();
      await page.waitForFunction(() => !document.querySelector('dialog[class*="calendarItemDialog"]')?.matches(':modal'));
      assert.equal(await origin.evaluate(el => el === document.activeElement), true);
      assert.equal(await sheet.evaluate(el => el.scrollTop), scroll);
      assert.equal(await page.evaluate(() => scrollY), windowY);
      assert.equal(await page.locator('header select').first().inputValue(), selection);
    }
  } finally { await browser.close(); }
});

test('Add panel reports unavailable discovery and offers retry instead of an empty inventory', { skip: !url, timeout: 60_000 }, async () => {
  const { browser, page } = await open('suggestion-states-tokyo', 390);
  try {
    await page.route('**/api/journey-discover?*', route => route.fulfill({ json: { places: [], unavailable: true } }));
    await page.route('**/api/journey-activity-inventory', route => route.fulfill({ status: 503, json: { activities: [] } }));
    await page.reload();
    await page.waitForResponse(response => response.url().includes('journey-activity-inventory'));
    await page.getByRole('button', { name: /^Add plan to .*morning$/ }).first().click();
    const dialog = page.locator('dialog[class*="contextualAddDialog"]');
    await dialog.getByLabel('Search ideas', { exact: true }).waitFor();
    await capture(page, 'activity-unavailable-390');
    assert.match(await dialog.innerText(), /Suggestions are unavailable/i);
    assert.doesNotMatch(await dialog.innerText(), /No matching ideas yet/);
    assert.equal(await dialog.getByRole('button', { name: 'Try suggestions again', exact: true }).count(), 1);
  } finally { await browser.close(); }
});

test('Add panel explains duration filtering without treating returned products as empty', { skip: !url, timeout: 60_000 }, async () => {
  const { browser, page } = await open('suggestion-duration-filtered');
  try {
    await page.getByRole('button', { name: /^Add plan to .*morning$/ }).first().click();
    const dialog = page.locator('dialog[class*="contextualAddDialog"]');
    await dialog.getByLabel('Search ideas', { exact: true }).waitFor();
    await capture(page, 'activity-duration-filter-1440');
    assert.match(await dialog.innerText(), /No ideas fit Morning/);
    assert.doesNotMatch(await dialog.innerText(), /No matching ideas yet/);
    await dialog.getByRole('button', { name: 'Close Add panel', exact: true }).click();
  } finally { await browser.close(); }
});

test('Transport rows and global summary distinguish pending, settled unknown, failed and supported results', { skip: !url, timeout: 90_000 }, async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage();
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      for (const state of ['settled-unknown', 'pending', 'failed', 'supported', 'blocked', 'timeout', 'no-route', 'not-attempted']) {
        await page.goto(`${url}/iframe.html?id=morrovia-05-product-patterns-builder-route-allocation--transport-${state}&viewMode=story`);
        await page.getByText('Tokyo', { exact: true }).first().waitFor();
        const text = await page.locator('main').innerText();
        assert.doesNotMatch(text, /Details up to date/);
        if (state === 'pending') assert.match(text, /Checking transport options/);
        else assert.doesNotMatch(text, /Checking transport options/);
        if (state === 'settled-unknown') assert.match(text, /0 of 2 transfers · 2 need checking/);
        if (state === 'failed') {
          assert.match(text, /2 could not be checked/);
          assert.equal(await page.getByRole('button', { name: 'Try again', exact: true }).count(), 2);
        }
        if (state === 'supported') { assert.match(text, /2 of 2 transfers/); assert.match(text, /Rail/); }
        if (state === 'blocked') { assert.match(text, /2 could not be checked/); assert.equal(await page.getByRole('button', { name: 'Try again', exact: true }).count(), 0); }
        if (state === 'timeout') { assert.match(text, /timed out/); assert.equal(await page.getByRole('button', { name: 'Try again', exact: true }).count(), 2); }
        if (state === 'no-route' || state === 'not-attempted') { assert.match(text, /0 of 2 transfers · 2 need checking/); assert.equal(await page.getByRole('button', { name: 'Try again', exact: true }).count(), 0); }
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        await capture(page, `transport-${state}-${width}`);
      }
    }
  } finally { await browser.close(); }
});

test('Activity Add distinguishes discovery unavailability, request failure, genuine empty and active loading', { skip: !url, timeout: 90_000 }, async () => {
  const { browser, page } = await open('suggestion-states-tokyo', 390);
  try {
    for (const state of ['discovery-unavailable', 'inventory-failed', 'empty', 'loading']) {
      let release: (() => void) | undefined;
      const held = new Promise<void>(resolve => { release = resolve; });
      await page.route('**/api/journey-discover?*', async route => {
        if (state === 'loading') await held;
        await route.fulfill({ json: { places: [], unavailable: state === 'discovery-unavailable' } });
      });
      await page.route('**/api/journey-activity-inventory', route => route.fulfill({ status: state === 'inventory-failed' ? 503 : 200, json: { activities: [] } }));
      await page.reload();
      await page.getByRole('button', { name: /^Add plan to .*morning$/ }).first().click();
      const dialog = page.locator('dialog[class*="contextualAddDialog"]');
      if (state === 'loading') {
        await dialog.getByText('Finding ideas', { exact: true }).waitFor();
        assert.doesNotMatch(await dialog.innerText(), /No matching ideas yet|unavailable/i);
      } else if (state === 'empty') {
        await dialog.getByText('No matching ideas yet. Search another category or add your own.', { exact: true }).waitFor();
        assert.doesNotMatch(await dialog.innerText(), /unavailable|Finding ideas/i);
      } else {
        await dialog.getByRole('button', { name: 'Try suggestions again', exact: true }).waitFor();
        assert.doesNotMatch(await dialog.innerText(), /No matching ideas yet|Finding ideas/i);
      }
      await capture(page, `activity-${state}-390`);
      release?.();
      await dialog.getByRole('button', { name: 'Close Add panel', exact: true }).click();
    }
  } finally { await browser.close(); }
});

test('Useful activity results survive a failed same-destination retry and filters explain unmatched results', { skip: !url, timeout: 60_000 }, async () => {
  const { browser, page } = await open('suggestion-states-cusco');
  try {
    let tries = 0;
    await page.route('**/api/journey-discover?*', route => route.fulfill({ json: ++tries === 1 ? { places: [{ id: 'cusco-museum', title: 'Museo Inka', area: 'Cusco', type: 'Museum', tags: ['Culture'], description: 'A major visitor museum for Inca history.', coordinates: [-71.979, -13.516], qualityScore: 18 }] } : { places: [], unavailable: true } }));
    await page.route('**/api/journey-activity-inventory', route => route.fulfill({ status: 503, json: { activities: [] } }));
    await page.reload();
    await page.getByText('Museo Inka', { exact: true }).first().waitFor();
    await page.getByRole('button', { name: 'Try suggestions again', exact: true }).first().click();
    await page.getByRole('button', { name: 'Try suggestions again', exact: true }).first().waitFor();
    assert.ok(tries >= 2);
    assert.equal(await page.getByText('Museo Inka', { exact: true }).count(), 1);
    await capture(page, 'activity-retained-on-failure-1440');
    await page.getByRole('button', { name: /^Add plan to .*morning$/ }).first().click();
    const dialog = page.locator('dialog[class*="contextualAddDialog"]');
    assert.equal(await dialog.getByText('Museo Inka', { exact: true }).count(), 1);
    await dialog.getByRole('button', { name: 'Close Add panel', exact: true }).click();
    // Production component with known available fixtures isolates category/search filtering.
    await page.goto(story('contextual-add-panel'));
    await page.locator('dialog:modal').getByLabel('Search ideas', { exact: true }).fill('zz-no-result');
    await page.locator('dialog:modal').getByText('No ideas match these filters. Try another category or clear your search.', { exact: true }).waitFor();
    await capture(page, 'activity-search-filtered-1440');
  } finally { await browser.close(); }
});

test('Long calendar event overlays scroll independently, trap focus and restore the selected day at responsive widths', { skip: !url, timeout: 120_000 }, async () => {
  const { browser, page } = await open('calendar-long-event-detail');
  try {
    for (const width of [320, 390, 430, 768, 1024, 1440, 1920]) {
      await page.setViewportSize({ width, height: 900 });
      await page.reload();
      await page.getByRole('button', { name: 'Ideas for Day 1', exact: true }).click();
      const sheet = page.locator('dialog[class*="calendarDaySheet"]');
      const origin = sheet.getByRole('button', { name: /^Historic district walk/ });
      await origin.scrollIntoViewIfNeeded();
      const position = await sheet.evaluate(el => el.scrollTop);
      const pageY = await page.evaluate(() => scrollY);
      const bounds = await origin.boundingBox();
      assert.ok(bounds && bounds.y >= 0 && bounds.y + bounds.height <= 900, 'event is visible before the pointer opens it');
      assert.equal(await origin.evaluate(el => { const r = el.getBoundingClientRect(); return el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)); }), true);
      // A physical pointer click preserves the measured pre-click context; locator.click may scroll again.
      await page.mouse.click(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
      const dialog = page.locator('dialog[class*="calendarItemDialog"]');
      await dialog.getByRole('button', { name: 'Back to day', exact: true }).waitFor();
      assert.equal(await dialog.evaluate(el => el.matches(':modal') && el.contains(document.activeElement)), true);
      const body = dialog.locator('[class*="calendarItemBody"]');
      assert.equal(await body.evaluate(el => el.scrollHeight > el.clientHeight && getComputedStyle(el).overflowY === 'auto'), true);
      await body.evaluate(el => el.scrollTo(0, el.scrollHeight));
      for (const name of ['Close', 'Back to day']) {
        assert.equal(await dialog.getByRole('button', { name, exact: true }).evaluate(el => {
          const r = el.getBoundingClientRect(); const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
          return r.top >= 0 && r.bottom <= innerHeight && Boolean(hit && el.contains(hit));
        }), true);
      }
      for (let step = 0; step < 7; step++) {
        await page.keyboard.press(step % 2 ? 'Shift+Tab' : 'Tab');
        assert.equal(await dialog.evaluate(el => el.contains(document.activeElement)), true);
      }
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await capture(page, `calendar-long-detail-${width}`);
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => !document.querySelector('dialog[class*="calendarItemDialog"]')?.matches(':modal'));
      await page.waitForFunction(({ pageY, position }) => scrollY === pageY && document.querySelector('dialog[class*="calendarDaySheet"]')?.scrollTop === position, { pageY, position });
      assert.equal(await origin.evaluate(el => document.activeElement === el), true);
      assert.equal(await sheet.evaluate(el => el.scrollTop), position);
      assert.equal(await page.evaluate(() => scrollY), pageY);
      await capture(page, `calendar-ideas-return-${width}`);
      if (width < 1100) await sheet.getByRole('button', { name: 'Close day details', exact: true }).click();
    }
  } finally { await browser.close(); }
});

test('Search rows retain distinct identities and readable geographical labels on mobile and desktop', { skip: !url, timeout: 60_000 }, async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage();
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`${url}/iframe.html?id=morrovia-02-controls-canonical-place-choices--same-country-namesakes&viewMode=story`);
      await page.getByRole('combobox').focus();
      await page.getByRole('option').nth(4).waitFor();
      const labels = await page.getByRole('option').allTextContents();
      assert.ok(labels.length >= 5, 'separate reference records stay selectable');
      assert.ok(labels.every(label => /China/.test(label)));
      assert.ok(labels.every(label => !/GeoNames|curated place catalog|Location to confirm/.test(label)));
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await capture(page, `search-namesakes-${width}`);
    }
  } finally { await browser.close(); }
});

test('A delayed suggestion response cannot replace the newly selected day', { skip: !url, timeout: 60_000 }, async () => {
  const { browser, page } = await open('suggestion-live-days');
  try {
    let release: (() => void) | undefined;
    const held = new Promise<void>(resolve => { release = resolve; });
    let calls = 0;
    const museum = (title: string) => ({ id: title, title, area: 'Cusco', type: 'Museum', tags: ['Culture'], description: 'A museum of regional history and culture.', coordinates: [-71.979, -13.516], qualityScore: 18 });
    await page.route('**/api/journey-discover?*', async route => {
      const first = ++calls === 1;
      if (first) await held;
      try { await route.fulfill({ json: { places: [museum(first ? 'Previous day museum' : 'Current day museum')] } }); } catch { /* Navigation aborted the old request. */ }
    });
    const request = page.waitForRequest(r => r.url().includes('journey-discover'));
    await page.reload();
    await request;
    await page.locator('header select').first().selectOption('day-2');
    await page.getByText('Current day museum', { exact: true }).waitFor();
    release?.();
    await page.waitForTimeout(100);
    assert.equal(await page.getByText('Previous day museum', { exact: true }).count(), 0);
    assert.equal(await page.getByText('Current day museum', { exact: true }).count(), 1);
    assert.equal(await page.locator('header select').first().inputValue(), 'day-2');
  } finally { await browser.close(); }
});

test('Activity unavailable presentation is consistent for Tokyo, Cusco, Rome and Nairobi', { skip: !url, timeout: 60_000 }, async () => {
  const { browser, page } = await open('suggestion-states-tokyo');
  try {
    await page.route('**/api/journey-discover?*', route => route.fulfill({ json: { places: [], unavailable: true } }));
    await page.route('**/api/journey-activity-inventory', route => route.fulfill({ status: 401, json: { activities: [] } }));
    for (const [index, name] of ['tokyo', 'cusco', 'rome', 'nairobi'].entries()) {
      await page.setViewportSize({ width: index % 2 ? 1440 : 390, height: 900 });
      await page.goto(story(`suggestion-states-${name}`));
      await page.getByRole('button', { name: /^Add plan to .*morning$/ }).first().click();
      const dialog = page.locator('dialog[class*="contextualAddDialog"]');
      await dialog.getByRole('button', { name: 'Try suggestions again', exact: true }).waitFor();
      assert.doesNotMatch(await dialog.innerText(), /No matching ideas yet/);
      await capture(page, `activity-${name}-unavailable-${index % 2 ? 1440 : 390}`);
    }
  } finally { await browser.close(); }
});
