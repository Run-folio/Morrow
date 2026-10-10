import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import test from "node:test";

const require = createRequire(import.meta.url);
const bundled = `${homedir()}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright`;
const { chromium } = require(process.env.MORROVIA_PLAYWRIGHT_MODULE ?? (existsSync(bundled) ? bundled : "playwright"));
const url = process.env.MORROVIA_STORYBOOK_URL;
const screenshots = process.env.MORROVIA_SCREENSHOT_DIR;
const story = (name: string) => `${url}/iframe.html?id=morrovia-05-product-patterns-trip-workspace-itinerary--${name}&viewMode=story`;
const calendarDays = '#itinerary-calendar article[class*="calendarDay"]';

async function capture(page: any, name: string) {
  if (!screenshots) return;
  mkdirSync(screenshots, { recursive: true });
  await page.screenshot({ path: `${screenshots}/${name}.png`, fullPage: true });
}

test("Calendar exposes every day and keeps seven weekday columns at all review widths", { skip: !url, timeout: 120_000 }, async () => {
  const browser = await chromium.launch({ channel: process.env.MORROVIA_BROWSER_CHANNEL ?? "chrome", headless: true });
  try {
    const page = await browser.newPage();
    for (const width of [320, 390, 430, 768, 1024, 1440, 1920]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto(story("calendar-long-trip-65-days"));
      await page.locator(calendarDays).nth(64).waitFor();
      assert.equal(await page.locator(calendarDays).count(), 65);
      assert.equal(await page.locator('section[aria-label$=" planner"]').count(), 1);
      assert.equal(await page.locator('#itinerary-calendar [class*="calendarWeekdayLabels"]').first().locator('span').count(), 7);
      const layout = await page.evaluate(() => {
        const grid = document.querySelector('[class*="calendarGrid"]')!;
        return { columns: getComputedStyle(grid).gridTemplateColumns.split(' ').length, overflow: document.documentElement.scrollWidth > innerWidth };
      });
      assert.equal(layout.columns, 7);
      assert.equal(layout.overflow, false, `${width}px must not clip the page`);
      const select = page.locator('header select').first();
      const last = await select.locator('option').last().getAttribute('value');
      await select.selectOption(last!);
      await page.locator(`${calendarDays}[data-selected="true"] button`).first().waitFor();
      assert.equal(await select.inputValue(), last);
      await page.getByRole('button', { name: 'Day by day', exact: true }).click();
      assert.equal(await select.inputValue(), last, 'orientation must preserve selected day');
      await page.getByRole('button', { name: 'Calendar', exact: true }).click();
      assert.equal(await page.locator(calendarDays).count(), 65);
      await capture(page, `calendar-65-days-${width}`);
    }
    await page.goto(story('default'));
    await page.getByRole('button', { name: 'Calendar', exact: true }).waitFor();
    assert.equal(await page.locator('#itinerary-calendar').count(), 0, 'fresh Day by day remains default');
    await capture(page, 'existing-day-by-day-1920');
  } finally { await browser.close(); }
});

test("Dense Calendar opens all twelve activities and exposes multiple saved stays", { skip: !url, timeout: 60_000 }, async () => {
  const browser = await chromium.launch({ channel: process.env.MORROVIA_BROWSER_CHANNEL ?? "chrome", headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    await page.goto(story('calendar-dense-twelve-activities'));
    await page.locator('[data-itinerary-activity-id]').nth(11).waitFor();
    assert.equal(await page.locator('[data-itinerary-activity-id]').count(), 12);
    const selected = page.locator(`${calendarDays}[data-selected="true"]`);
    assert.equal(await selected.locator('ul li').count(), 5, 'four previews plus More');
    await selected.getByRole('button', { name: 'Show all 12 items for Day 2' }).click();
    assert.equal(await page.locator('[data-itinerary-activity-id]').count(), 12);
    await page.waitForFunction(() => document.querySelector('[class*="dayPanel"]') === document.activeElement);
    const firstActivity = page.locator('[data-itinerary-activity-id]').first();
    const originalIds = await page.locator('[data-itinerary-activity-id]').evaluateAll((nodes: HTMLElement[]) => nodes.map(node => node.getAttribute('data-itinerary-activity-id')));
    await firstActivity.locator('summary').focus();
    await firstActivity.locator('summary').press('Enter');
    await firstActivity.getByRole('button', { name: /Move later/ }).click();
    await page.waitForFunction(() => document.querySelector('[data-itinerary-activity-id] strong')?.textContent === 'Planned activity 2');
    const reorderedIds = await page.locator('[data-itinerary-activity-id]').evaluateAll((nodes: HTMLElement[]) => nodes.map(node => node.getAttribute('data-itinerary-activity-id')));
    assert.deepEqual([...reorderedIds].sort(), [...originalIds].sort(), 'keyboard reorder must preserve every canonical ID');
    assert.equal(reorderedIds[1], originalIds[0]);
    await capture(page, 'calendar-dense-1440');
    await page.goto(story('calendar-multiple-stays'));
    await page.locator('[class*="contextRail"]').getByText('Second saved Cusco stay', { exact: true }).waitFor();
    assert.match(await page.locator('[class*="dayPanel"]').innerText(), /Cusco stay/);
  } finally { await browser.close(); }
});

test("Calendar thumbnails load or fall back to category icons without changing slot size", { skip: !url, timeout: 60_000 }, async () => {
  const browser = await chromium.launch({ channel: process.env.MORROVIA_BROWSER_CHANNEL ?? "chrome", headless: true });
  try {
    const page = await browser.newPage();
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto(story('calendar-image-fallbacks'));
      const rows = page.locator('[data-itinerary-activity-id]');
      await rows.nth(2).waitFor();
      const loaded = page.locator('[data-itinerary-activity-id="calendar-loaded-image"] img');
      await loaded.waitFor();
      await page.waitForFunction(() => {
        const img = document.querySelector<HTMLImageElement>('[data-itinerary-activity-id="calendar-loaded-image"] img');
        return Boolean(img?.complete && img.naturalWidth);
      });
      const missing = page.locator('[data-itinerary-activity-id="idea-cusco-qorikancha"] [class*="identity"] > span').first();
      const failed = page.locator('[data-itinerary-activity-id="idea-cusco-market"] [class*="identity"] > span').first();
      await failed.locator('svg').waitFor();
      assert.equal(await missing.locator('svg').count(), 1);
      assert.equal(await failed.locator('img').count(), 0);
      const sizes = await Promise.all([loaded.locator('..'), missing, failed].map(slot => slot.evaluate((el: HTMLElement) => [el.getBoundingClientRect().width, el.getBoundingClientRect().height])));
      assert.deepEqual(sizes[0], sizes[1]);
      assert.deepEqual(sizes[0], sizes[2]);
      await capture(page, `calendar-image-fallbacks-${width}`);
    }
  } finally { await browser.close(); }
});

test("Calendar Add and completed drag update one canonical item, while cancelled drag preserves it", { skip: !url, timeout: 60_000 }, async () => {
  const browser = await chromium.launch({ channel: process.env.MORROVIA_BROWSER_CHANNEL ?? "chrome", headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    await page.goto(story('calendar-add-outcome'));
    await page.locator('[data-itinerary-activity-id]').nth(1).waitFor();
    assert.equal(await page.locator('[data-itinerary-activity-id]').count(), 2);
    await page.goto(story('calendar-activity-drag'));
    const target = page.locator(calendarDays).nth(1);
    await target.getByRole('button', { name: /^Walk San Blas before dinner,/ }).waitFor();
    assert.equal(await page.locator('#itinerary-calendar button strong').filter({ hasText: /^Walk San Blas before dinner$/ }).count(), 1);
    const before = await page.locator('#itinerary-calendar').innerText();
    const dragSource = target.locator('button[draggable="true"]').first();
    await dragSource.evaluate((el: HTMLElement) => {
      const transfer = new DataTransfer();
      el.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: transfer }));
      el.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer: transfer }));
    });
    assert.equal(await page.locator('#itinerary-calendar').innerText(), before);
    assert.equal(await page.locator('[data-drop-eligible="true"]').count(), 0);
  } finally { await browser.close(); }
});


test("Calendar Move dialog matches drag and cancelling preserves source", { skip: !url, timeout: 60_000 }, async () => {
  const browser = await chromium.launch({ channel: process.env.MORROVIA_BROWSER_CHANNEL ?? "chrome", headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    await page.goto(story('calendar-image-fallbacks'));
    await page.locator('[data-itinerary-activity-id]').nth(2).waitFor();
    await page.locator(calendarDays).first().locator('button').first().click();
    await page.locator('[data-itinerary-activity-id]').getByRole('button', { name: 'Walk San Blas before dinner', exact: true }).click();
    await page.getByRole('button', { name: 'Move to…', exact: true }).click();
    const dialog = page.locator('dialog[open]');
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    assert.match(await page.locator(calendarDays).first().innerText(), /Walk San Blas before dinner/);
    await page.locator('[data-itinerary-activity-id]').getByRole('button', { name: 'Walk San Blas before dinner', exact: true }).click();
    await page.getByRole('button', { name: 'Move to…', exact: true }).click();
    await dialog.locator('select').first().selectOption('day-2');
    await dialog.getByRole('button', { name: 'Move activity', exact: true }).click();
    await page.locator(calendarDays).nth(1).getByRole('button', { name: /^Walk San Blas before dinner,/ }).waitFor();
    assert.doesNotMatch(await page.locator(calendarDays).first().innerText(), /Walk San Blas before dinner/);
    assert.equal(await page.locator('#itinerary-calendar button strong').filter({ hasText: /^Walk San Blas before dinner$/ }).count(), 1);
  } finally { await browser.close(); }
});

test("Touch Calendar selects an inline day and returns keyboard focus to the overview", { skip: !url, timeout: 60_000 }, async () => {
  const browser = await chromium.launch({ channel: process.env.MORROVIA_BROWSER_CHANNEL ?? "chrome", headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await page.goto(story('calendar-image-fallbacks'));
    await page.locator('[data-itinerary-activity-id]').nth(2).waitFor();
    await page.locator(calendarDays).nth(2).locator('button').first().tap();
    assert.equal(await page.locator('header select').first().inputValue(), 'day-3');
    await page.getByRole('button', { name: 'Back to calendar', exact: true }).tap();
    assert.equal(await page.locator('#itinerary-calendar [aria-pressed="true"]').first().evaluate((el: HTMLElement) => el === document.activeElement), true);
    assert.equal(await page.locator('#itinerary-calendar button[draggable="true"]').count(), 0);
    await capture(page, 'calendar-touch-390');
  } finally { await browser.close(); }
});
