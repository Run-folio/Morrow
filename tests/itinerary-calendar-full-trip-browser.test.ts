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

// The responsive date navigation uses a native select on desktop and the canonical picker on mobile.
async function selectedDay(page: any) {
  await page.waitForFunction(() => {
    const toolbar = document.querySelector('[class*="workspaceToolbar"]');
    return matchMedia('(max-width: 700px)').matches
      ? toolbar?.querySelector('button[aria-haspopup="dialog"]')
      : toolbar?.querySelector('select');
  });
  const select = page.locator('[class*="workspaceToolbar"] select');
  if (await select.count()) return select.inputValue();
  const label = await page.locator('[class*="workspaceToolbar"] button[aria-haspopup="dialog"]').textContent();
  const match = label?.match(/ · Day (\d+) · /);
  assert.ok(match, 'the mobile date control must expose its canonical day');
  return `day-${match[1]}`;
}

async function chooseDay(page: any, dayNumber: number) {
  await selectedDay(page);
  const select = page.locator('[class*="workspaceToolbar"] select');
  if (await select.count()) await select.selectOption(`day-${dayNumber}`);
  else {
    await page.getByRole('button', { name: 'Choose a day', exact: true }).click();
    await page.getByRole('dialog', { name: 'Choose a day', exact: true })
      .getByRole('button', { name: new RegExp(` · Day ${dayNumber} · `) }).click();
  }
}

async function openMorningAdd(page: any, sheet: any) {
  const direct = sheet.getByRole('button', { name: /^Add plan to .*morning$/ });
  if (await direct.count()) await direct.first().click();
  else {
    await sheet.getByRole('button', { name: 'Add plan', exact: true }).click();
    const chooser = page.getByRole('dialog', { name: 'Add a plan', exact: true });
    await chooser.getByRole('button', { name: 'Morning', exact: true }).click();
    await chooser.getByRole('button', { name: 'New plan', exact: true }).click();
  }
}

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
      const last = 'day-65';
      await chooseDay(page, 65);
      await page.locator(`${calendarDays}[data-selected="true"] button`).first().waitFor();
      assert.equal(await selectedDay(page), last);
      await page.getByRole('button', { name: 'Day by day', exact: true }).click();
      assert.equal(await selectedDay(page), last, 'orientation must preserve selected day');
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
    // Rows render before the inherited Storybook play switches to Calendar.
    const selected = page.locator(`${calendarDays}[data-selected="true"]`);
    await selected.getByRole('button', { name: 'Show all 12 items for Day 2' }).waitFor();
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
      // Route restoration starts on Day 1; the three image fixtures belong to Day 2.
      await page.locator(calendarDays).nth(1).locator('button').first().click();
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
      const sizes = await Promise.all([loaded.locator('..'), missing, failed].map(slot => slot.evaluate((el: HTMLElement) => { const css = getComputedStyle(el); return [css.width, css.height]; })));
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
    await page.locator(calendarDays).first().locator('button').first().click();
    await page.locator('[data-itinerary-activity-id]').getByRole('button', { name: 'Walk San Blas before dinner', exact: true }).waitFor();
    await page.locator('[data-itinerary-activity-id]').getByRole('button', { name: 'Walk San Blas before dinner', exact: true }).click();
    await page.getByRole('button', { name: 'Move to…', exact: true }).click();
    const dialog = page.locator('dialog:modal');
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    assert.match(await page.locator(calendarDays).first().innerText(), /Walk San Blas before dinner/);
    // Cancelling Move returns to the existing item details, not the underlying card.
    await page.getByRole('button', { name: 'Back to day', exact: true }).click();
    await page.locator('[data-itinerary-activity-id]').getByRole('button', { name: 'Walk San Blas before dinner', exact: true }).click();
    await page.getByRole('button', { name: 'Move to…', exact: true }).click();
    await dialog.locator('select').first().selectOption('day-2');
    await dialog.getByRole('button', { name: 'Move activity', exact: true }).click();
    await page.locator(calendarDays).nth(1).getByRole('button', { name: /^Walk San Blas before dinner,/ }).waitFor();
    assert.doesNotMatch(await page.locator(calendarDays).first().innerText(), /Walk San Blas before dinner/);
    assert.equal(await page.locator('#itinerary-calendar button strong').filter({ hasText: /^Walk San Blas before dinner$/ }).count(), 1);
  } finally { await browser.close(); }
});

test("Touch Calendar opens a day sheet and returns keyboard focus to the overview", { skip: !url, timeout: 60_000 }, async () => {
  const browser = await chromium.launch({ channel: process.env.MORROVIA_BROWSER_CHANNEL ?? "chrome", headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await page.goto(story('calendar-image-fallbacks'));
    await page.locator(calendarDays).nth(2).waitFor();
    await page.locator(calendarDays).nth(2).locator('button').first().tap();
    assert.equal(await selectedDay(page), 'day-3');
    await page.getByRole('button', { name: 'Close day details', exact: true }).tap();
    assert.equal(await page.locator('#itinerary-calendar [aria-pressed="true"]').first().evaluate((el: HTMLElement) => el === document.activeElement), true);
    assert.equal(await page.locator('#itinerary-calendar button[draggable="true"]').count(), 0);
    await capture(page, 'calendar-touch-390');
  } finally { await browser.close(); }
});

test("Mobile day sheet traps focus and uses existing image-first planner", { skip: !url, timeout: 60_000 }, async () => {
  const browser = await chromium.launch({ channel: process.env.MORROVIA_BROWSER_CHANNEL ?? "chrome", headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    await page.goto(story('calendar-image-fallbacks'));
    await page.locator(calendarDays).nth(1).locator('button').first().click();
    const sheet = page.locator('dialog[class*="calendarDaySheet"]');
    await sheet.locator('[data-calendar-sheet-heading]').waitFor();
    assert.equal(await sheet.evaluate((el: HTMLElement) => el.contains(document.activeElement)), true);
    assert.equal(await page.locator('[aria-label$=" planner"]').count(), 1);
    await capture(page, "calendar-mobile-sheet-top-390");
    for (let i = 0; i < 40; i++) {
      await page.keyboard.press('Tab');
      assert.equal(await sheet.evaluate((el: HTMLElement) => el.contains(document.activeElement)), true);
    }
    const surface = await sheet.evaluate((el: HTMLElement) => ({scroll: el.scrollHeight > el.clientHeight, locked: document.body.style.overflow}));
    assert.equal(surface.scroll, true);
    assert.equal(surface.locked, 'hidden');
    await sheet.locator('[data-itinerary-activity-id="calendar-loaded-image"] img').waitFor();
    await capture(page, 'calendar-mobile-sheet-images-390');
    await page.getByRole('button', { name: 'Close day details', exact: true }).click();
    assert.equal(await page.locator('#itinerary-calendar [aria-pressed="true"]').first().evaluate((el: HTMLElement) => el === document.activeElement), true);
  } finally { await browser.close(); }
});

test("Mobile day sheet opens explicitly, stays closed on restore, and returns an unobscured selected date", { skip: !url, timeout: 90_000 }, async () => {
  const browser = await chromium.launch({ channel: process.env.MORROVIA_BROWSER_CHANNEL ?? "chrome", headless: true });
  try {
    for (const width of [320, 390, 899, 900, 901, 1099]) {
      const page = await browser.newPage({ viewport: { width, height: 844 } });
      await page.goto(story('calendar-long-trip-65-days'));
      await page.locator(calendarDays).nth(64).waitFor();
      const sheet = page.locator('dialog[class*="calendarDaySheet"]');
      assert.equal(await sheet.evaluate((el: HTMLDialogElement) => el.open), false, 'restore is passive');
      await chooseDay(page, 3);
      assert.equal(await sheet.evaluate((el: HTMLDialogElement) => el.open), false, 'date navigation is passive');
      const cell = page.locator(calendarDays).nth(1).locator('button').first();
      await cell.focus();
      await cell.press(width === 320 ? 'Space' : 'Enter');
      await sheet.waitFor({ state: 'visible' });
      assert.equal(await sheet.evaluate((el: HTMLDialogElement) => el.matches(':modal') && el.contains(document.activeElement)), true);
      assert.match(await sheet.getAttribute('aria-label') ?? '', /^Day 2: Cusco$/);
      assert.equal(await sheet.locator('[data-calendar-sheet-heading]').textContent(), 'Cusco');
      assert.equal(await sheet.locator('[class*="dayHeaderContent"] time').getAttribute('datetime'), '2026-08-22');
      assert.equal(await page.locator('[aria-label$=" planner"]').count(), 1);
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => !document.querySelector<HTMLDialogElement>('dialog[class*="calendarDaySheet"]')?.open);
      await page.waitForFunction(() => {
        const cell = document.querySelector<HTMLElement>('#itinerary-calendar button[aria-pressed="true"]');
        if (!cell || document.activeElement !== cell) return false;
        const r = cell.getBoundingClientRect();
        const offset = parseFloat(getComputedStyle(document.querySelector('.journey-design') ?? document.documentElement).getPropertyValue('--morrovia-navigation-height')) || 60;
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return r.top >= offset && r.bottom <= innerHeight && Boolean(hit && cell.contains(hit));
      });
      await capture(page, `calendar-sheet-return-${width}`);
      await page.close();
    }
  } finally { await browser.close(); }
});

test("Mobile day sheet preserves Add drafts through child-modal resize and commits only confirmation", { skip: !url, timeout: 90_000 }, async () => {
  const browser = await chromium.launch({ channel: process.env.MORROVIA_BROWSER_CHANNEL ?? "chrome", headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 844 } });
    await page.goto(story('calendar-image-fallbacks'));
    await page.locator(calendarDays).nth(1).locator('button').first().click();
    const sheet = page.locator('dialog[class*="calendarDaySheet"]');
    const before = await page.locator('[data-itinerary-activity-id]').evaluateAll((nodes: HTMLElement[]) => nodes.map(n => n.dataset.itineraryActivityId));
    await openMorningAdd(page, sheet);
    const add = page.locator('dialog[class*="contextualAddDialog"]');
    await add.getByLabel('Add your own', { exact: true }).fill('Preserved mobile draft');
    for (const width of [899, 900, 901, 1099, 1100, 1101, 390]) {
      await page.setViewportSize({ width, height: 844 });
      assert.equal(await add.getByLabel('Add your own', { exact: true }).inputValue(), 'Preserved mobile draft');
      assert.equal(await add.evaluate((el: HTMLDialogElement) => el.matches(':modal')), true);
      await page.waitForFunction(() => document.querySelector('dialog[class*="contextualAddDialog"]')?.contains(document.activeElement));
      assert.equal(await page.locator('[aria-label$=" planner"]').count(), 1);
    }
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector<HTMLDialogElement>('dialog[class*="contextualAddDialog"]')?.open);
    assert.equal(await sheet.evaluate((el: HTMLDialogElement) => el.matches(':modal')), true, 'child Escape must keep day sheet open');
    assert.deepEqual(await page.locator('[data-itinerary-activity-id]').evaluateAll((nodes: HTMLElement[]) => nodes.map(n => n.dataset.itineraryActivityId)), before);
    await openMorningAdd(page, sheet);
    await add.getByLabel('Add your own', { exact: true }).fill('Confirmed mobile plan');
    await add.getByRole('button', { name: 'Add to Morning', exact: true }).click();
    await sheet.getByRole('button', { name: 'Confirmed mobile plan', exact: true }).waitFor();
    assert.equal(await page.locator('[data-itinerary-activity-id]').count(), before.length + 1);
    await sheet.getByRole('button', { name: 'Close day details', exact: true }).click();
    await page.getByRole('button', { name: 'Day by day', exact: true }).click();
    assert.equal(await page.locator('[data-itinerary-activity-id]').getByRole('button', { name: 'Confirmed mobile plan', exact: true }).count(), 1);
  } finally { await browser.close(); }
});

test("Mobile item details, Move and Remove Escape keep the day and canonical activities", { skip: !url, timeout: 90_000 }, async () => {
  const browser = await chromium.launch({ channel: process.env.MORROVIA_BROWSER_CHANNEL ?? "chrome", headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 320, height: 844 } });
    await page.goto(story('calendar-image-fallbacks'));
    await page.locator(calendarDays).first().locator('button').first().click();
    const sheet = page.locator('dialog[class*="calendarDaySheet"]');
    const activity = sheet.getByRole('button', { name: 'Walk San Blas before dinner', exact: true });
    await activity.click();
    await page.waitForFunction(() => document.querySelector('[data-calendar-item-back]') === document.activeElement);
    const before = await sheet.locator('[data-itinerary-activity-id]').count();
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => document.querySelector('dialog[class*="calendarDaySheet"]')?.matches(':modal'));
    assert.equal(await sheet.evaluate((el: HTMLDialogElement) => el.matches(':modal')), true);
    await activity.click();
    await page.waitForFunction(() => document.querySelector('[data-calendar-item-back]') === document.activeElement);
    await sheet.getByRole('button', { name: 'Move to…', exact: true }).click();
    await page.locator('dialog:modal').last().waitFor();
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => document.querySelector('dialog[class*="calendarDaySheet"]')?.matches(':modal'));
    assert.equal(await sheet.evaluate((el: HTMLDialogElement) => el.matches(':modal')), true);
    await sheet.getByRole('button', { name: 'Back to day', exact: true }).click();
    await activity.click();
    await page.waitForFunction(() => document.querySelector('[data-calendar-item-back]') === document.activeElement);
    await sheet.getByRole('button', { name: 'Remove', exact: true }).click();
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => document.querySelector('dialog[class*="calendarDaySheet"]')?.matches(':modal'));
    assert.equal(await sheet.evaluate((el: HTMLDialogElement) => el.matches(':modal')), true);
    assert.equal(await sheet.locator('[data-itinerary-activity-id]').count(), before);
    const detail = sheet.locator('dialog[class*="calendarItemDialog"]');
    assert.equal(await detail.evaluate((el: HTMLDialogElement) => el.open && Boolean(el.closest('dialog:modal')) && el.contains(document.activeElement)), true, 'Remove dismissal returns focus to the item presentation in its existing modal owner');
    assert.equal(await page.locator('dialog:modal').count(), 1, 'compact item details keep one native modal owner');
    for (const name of ['Close', 'Back to day']) {
      assert.equal(await detail.getByRole('button', { name, exact: true }).evaluate((el: HTMLElement) => {
        const r = el.getBoundingClientRect();
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return r.top >= 0 && r.bottom < innerHeight && Boolean(hit && el.contains(hit));
      }), true, `${name} must remain unobscured after child dismissal`);
    }
    await capture(page, 'calendar-mobile-sheet-item-320');
    await detail.getByRole('button', { name: 'Back to day', exact: true }).click();
    assert.equal(await sheet.evaluate((el: HTMLDialogElement) => el.matches(':modal')), true);
    await page.waitForFunction(() => document.activeElement?.closest('[data-itinerary-activity-id]')?.getAttribute('data-itinerary-activity-id') === 'day-1-activity-walk san blas before dinner');
    assert.equal(await activity.evaluate((el: HTMLElement) => document.activeElement === el), true);
  } finally { await browser.close(); }
});

test("Mobile busy day and multiple stays remain accessible inside the scrolling sheet", { skip: !url, timeout: 60_000 }, async () => {
  const browser = await chromium.launch({ channel: process.env.MORROVIA_BROWSER_CHANNEL ?? "chrome", headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 320, height: 844 } });
    await page.goto(story('calendar-dense-twelve-activities'));
    await page.locator(calendarDays).nth(1).locator('button').first().click();
    const sheet = page.locator('dialog[class*="calendarDaySheet"]');
    assert.equal(await sheet.locator('[data-itinerary-activity-id]').count(), 12);
    await sheet.locator('[data-itinerary-activity-id]').last().scrollIntoViewIfNeeded();
    assert.equal(await sheet.evaluate((el: HTMLElement) => el.scrollTop > 0 && el.scrollHeight > el.clientHeight), true);
    await capture(page, 'calendar-mobile-sheet-dense-320');
    await page.goto(story('calendar-multiple-stays'));
    await page.locator(calendarDays).first().locator('button').first().click();
    await sheet.getByText('Second saved Cusco stay', { exact: true }).scrollIntoViewIfNeeded();
    assert.match(await sheet.locator('[class*="dayPanel"]').innerText(), /Cusco stay/);
    await capture(page, 'calendar-mobile-sheet-stays-320');
  } finally { await browser.close(); }
});

test("Desktop detail adapts across both breakpoints and returns to the same mobile day", { skip: !url, timeout: 60_000 }, async () => {
  const browser = await chromium.launch({ channel: process.env.MORROVIA_BROWSER_CHANNEL ?? "chrome", headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 844 } });
    await page.goto(story('calendar-image-fallbacks'));
    await page.locator(calendarDays).first().locator('button').first().click();
    const sheet = page.locator('dialog[class*="calendarDaySheet"]');
    await sheet.getByRole('button', { name: 'Walk San Blas before dinner', exact: true }).click();
    for (const width of [1101, 1100, 1099, 901, 900, 899, 390]) {
      await page.setViewportSize({ width, height: 844 });
      await page.waitForFunction((compact: boolean) => document.querySelector<HTMLDialogElement>('dialog[class*="calendarDaySheet"]')?.matches(':modal') === compact, width < 1100);
      assert.equal(await page.locator('[aria-label$=" planner"]').count(), 1);
      assert.equal(await selectedDay(page), 'day-1');
    }
    await sheet.getByRole('button', { name: 'Back to day', exact: true }).waitFor();
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => document.querySelector('dialog[class*="calendarDaySheet"]')?.matches(':modal'));
    assert.equal(await sheet.evaluate((el: HTMLDialogElement) => el.matches(':modal')), true);
    await sheet.getByRole('button', { name: 'Walk San Blas before dinner', exact: true }).waitFor();
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector<HTMLDialogElement>('dialog[class*="calendarDaySheet"]')?.open);
  } finally { await browser.close(); }
});

test("Rendered Day by day and Calendar preserve identity, ordering and one canonical planner", { skip: !url, timeout: 60_000 }, async () => {
  const browser = await chromium.launch({ channel: process.env.MORROVIA_BROWSER_CHANNEL ?? "chrome", headless: true });
  try {
    for (const width of [390, 1440]) {
      const page = await browser.newPage({ viewport: { width, height: 1000 } });
      await page.goto(story('calendar-image-fallbacks'));
      await page.locator(calendarDays).nth(1).waitFor();
      const title = await page.locator('#trip-shell-title').innerText();
      const dates = page.locator('dl').first().locator('div').filter({ has: page.getByText('Dates', { exact: true }) }).locator('dd');
      const range = await dates.innerText();
      // Both views must compare the same canonical day, independent of restored route state.
      await page.locator(calendarDays).nth(1).locator('button').first().click();
      if (width < 1100) await page.getByRole('button', { name: 'Close day details', exact: true }).click();
      await page.getByRole('button', { name: 'Day by day', exact: true }).click();
      const route = page.locator('[data-route-stop-navigation][aria-label="Route destinations"]');
      const timeline = await route.textContent();
      const destinations = await route.locator('strong').allTextContents();
      assert.ok(title.trim().length > 0 && range.includes('2026') && timeline?.includes('Cusco'));
      const daysIds = await page.locator('[data-itinerary-activity-id]').evaluateAll((nodes: HTMLElement[]) => nodes.map(n => n.dataset.itineraryActivityId));
      for (const view of ['days', 'calendar']) {
        if (view === 'calendar') {
          await page.getByRole('button', { name: 'Calendar', exact: true }).click();
          if (width < 1100) await page.locator(calendarDays).nth(1).locator('button').first().click();
        }
        assert.equal(await page.locator('[aria-label$=" planner"]').count(), 1);
        assert.deepEqual(await page.locator('[data-itinerary-activity-id]').evaluateAll((nodes: HTMLElement[]) => nodes.map(n => n.dataset.itineraryActivityId)), daysIds);
        assert.equal(await page.locator('#trip-shell-title').innerText(), title);
        assert.equal(await dates.innerText(), range);
        if (view === 'days') assert.equal(await route.textContent(), timeline);
        else {
          // Calendar owns the same ordered destinations through its weekly overnight bands.
          const bands: string[] = await page.locator('[role="group"][aria-label="Overnight destinations"] > div > span').allTextContents();
          const calendarDestinations = bands.map(label => label.split(' · ')[0]).filter((name, index, names) => index === 0 || name !== names[index - 1]);
          assert.deepEqual(calendarDestinations, destinations, 'Calendar must preserve every canonical route destination in order');
        }
        const order = await page.evaluate((calendar: boolean) => {
          const planner = document.querySelector('[aria-label$=" planner"]')!;
          const ideas = document.querySelector('details[id$="-ideas"]')!;
          const context = document.querySelector('[class*="contextRail"]')!;
          const follows = (a: Element, b: Element) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
          return { plannerBeforeIdeas: follows(planner, ideas), plannerBeforeContext: follows(planner, context), contextOwnership: context.contains(ideas) };
        }, view === 'calendar');
        assert.deepEqual(order, { plannerBeforeIdeas: true, plannerBeforeContext: true, contextOwnership: true });
        if (view === 'calendar') {
          assert.match(await page.locator('[class*="dayPanel"]').getAttribute('aria-label') ?? '', /Day 2: Cusco/);
          if (width < 1100) {
            const sheet = page.locator('dialog[class*="calendarDaySheet"]');
            await sheet.getByRole('heading', { name: 'Cusco', exact: true }).waitFor();
            assert.equal(await sheet.locator('[class*="dayHeaderContent"] time').getAttribute('datetime'), '2026-08-22', 'the visible destination heading keeps the exact Day 2 date');
          }
          else assert.equal(await page.locator('[class*="dayPanel"]').evaluate((el: HTMLElement) => el.getBoundingClientRect().left > innerWidth / 2), true);
        }
      }
      if (width < 1100) await page.getByRole('button', { name: 'Close day details', exact: true }).click();
      await page.getByRole('button', { name: 'Day by day', exact: true }).click();
      assert.equal(await route.textContent(), timeline, 'returning from Calendar preserves the exact route timeline');
      assert.deepEqual(await page.locator('[data-itinerary-activity-id]').evaluateAll((nodes: HTMLElement[]) => nodes.map(n => n.dataset.itineraryActivityId)), daysIds);
      await page.close();
    }
  } finally { await browser.close(); }
});

test("Desktop detail planner completes native drag and cancels outside-drop without lost or duplicate activities", { skip: !url, timeout: 60_000 }, async () => {
  const browser = await chromium.launch({ channel: process.env.MORROVIA_BROWSER_CHANNEL ?? "chrome", headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1600 } });
    await page.goto(story('calendar-image-fallbacks'));
    await page.locator(calendarDays).nth(1).locator('button').first().click();
    const panel = page.locator('[class*="dayPanel"]');
    const handle = panel.locator('[data-itinerary-drag-handle="calendar-loaded-image"]');
    await handle.waitFor();
    assert.equal(await page.evaluate(() => matchMedia('(hover: hover) and (pointer: fine)').matches), true);
    assert.equal(await panel.locator('[data-itinerary-activity-id="calendar-loaded-image"]').getAttribute('draggable'), 'true', 'the canonical card owns native drag from its handle');
    // Keep source and destination unobscured in one viewport; other acceptance tests retain 1440x1000.
    await page.evaluate(() => {
      const recording = window as unknown as { calendarNativeDragEvents: string[] };
      recording.calendarNativeDragEvents = [];
      for (const type of ['dragstart', 'drop', 'dragend']) document.addEventListener(type, () => recording.calendarNativeDragEvents.push(type), true);
    });
    const before = await panel.locator('[data-itinerary-activity-id]').evaluateAll((nodes: HTMLElement[]) => nodes.map(n => n.dataset.itineraryActivityId));
    const beforePlacement = await panel.locator('[data-itinerary-activity-id]').evaluateAll((nodes: HTMLElement[]) => nodes.map(n => [n.dataset.itineraryActivityId, n.closest('[data-day-part]')?.getAttribute('data-day-part')]));
    // Actual browser pointer drag from the right-hand planner handle to a non-drop surface.
    await handle.dragTo(page.locator('[class*="workspaceToolbar"]'), { targetPosition: { x: 4, y: 4 } });
    const cancelledEvents = await page.evaluate(() => (window as unknown as { calendarNativeDragEvents: string[] }).calendarNativeDragEvents);
    assert.deepEqual(cancelledEvents, ['dragstart', 'dragend'], 'cancel must initiate and end a real native drag without a drop');
    assert.deepEqual(await panel.locator('[data-itinerary-activity-id]').evaluateAll((nodes: HTMLElement[]) => nodes.map(n => [n.dataset.itineraryActivityId, n.closest('[data-day-part]')?.getAttribute('data-day-part')])), beforePlacement);
    assert.equal(await panel.locator('[data-drop-zone="ready"]').count(), 0, 'cancelled native drag must clear ownership and all ready targets');
    // Actual browser pointer drag into the planner morning lane; no synthetic drop events.
    await handle.dragTo(panel.locator('section[data-day-part="morning"] h3'));
    await panel.locator('section[data-day-part="morning"] [data-itinerary-activity-id="calendar-loaded-image"]').waitFor();
    const completedEvents: string[] = await page.evaluate(() => (window as unknown as { calendarNativeDragEvents: string[] }).calendarNativeDragEvents);
    assert.equal(completedEvents.filter(type => type === 'dragstart').length, 2);
    assert.equal(completedEvents.filter(type => type === 'drop').length, 1);
    assert.equal(await panel.locator('section[data-day-part="afternoon"] [data-itinerary-activity-id="calendar-loaded-image"]').count(), 0);
    const after = await panel.locator('[data-itinerary-activity-id]').evaluateAll((nodes: HTMLElement[]) => nodes.map(n => n.dataset.itineraryActivityId));
    assert.deepEqual([...after].sort(), [...before].sort(), 'complete drag preserves every canonical ID exactly once');
    assert.equal(new Set(after).size, after.length);
    assert.equal(await page.locator('#itinerary-calendar button strong').filter({ hasText: /^Loaded activity image fixture$/ }).count(), 1);
    assert.equal(await panel.locator('[data-drop-zone="ready"]').count(), 0);
    await capture(page, 'calendar-detail-native-drag-1440');
    await page.getByRole('button', { name: 'Day by day', exact: true }).click();
    assert.equal(await page.locator('section[data-day-part="morning"] [data-itinerary-activity-id="calendar-loaded-image"]').count(), 1);
    assert.deepEqual((await page.locator('[data-itinerary-activity-id]').evaluateAll((nodes: HTMLElement[]) => nodes.map(n => n.dataset.itineraryActivityId))).sort(), [...before].sort());
    const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await mobile.goto(story('calendar-image-fallbacks'));
    await mobile.locator(calendarDays).nth(1).locator('button').first().tap();
    assert.equal(await mobile.locator('[data-itinerary-drag-handle]').count(), 0, 'coarse-pointer sheet uses accessible placement controls');
  } finally { await browser.close(); }
});
