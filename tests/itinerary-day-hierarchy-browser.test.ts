import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const bundled = `${homedir()}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright`;
const { chromium } = require(process.env.MORROVIA_PLAYWRIGHT_MODULE ?? (existsSync(bundled) ? bundled : "playwright"));
const base = process.env.MORROVIA_ITINERARY_STORYBOOK_URL;
const storyPrefix = "morrovia-05-product-patterns-trip-workspace-itinerary--hierarchy-";

async function openStory(browser: any, story: string, width = 1440) {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  await page.goto(`${base}/iframe.html?id=${storyPrefix}${story}&viewMode=story`);
  await page.getByText(story.startsWith("seoul-empty") ? "Explore Seoul" : "Explore Tokyo", { exact: true }).click();
  await page.locator('section[aria-label="Day 2 planner"]').waitFor();
  return page;
}

test("populated day has one post-plan Add flow, keeps saved content, suggestions and notes", { skip: !base }, async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const page = await openStory(browser, "tokyo-populated");
    const planner = page.locator('section[aria-label="Day 2 planner"]');
    const text = await planner.innerText();
    assert.match(text, /Morning[\s\S]*Shinjuku Gyo-en[\s\S]*Planned[\s\S]*Mount Fuji day trip[\s\S]*Add activity/);
    assert.equal(await planner.getByRole("button", { name: "Add activity", exact: true }).count(), 1);
    assert.equal(await page.getByText("Add to a part of day", { exact: true }).count(), 0);
    assert.equal(await page.getByText(/Day context and notes/).count(), 0);
    assert.equal(await page.getByText("Edit activities and order", { exact: true }).count(), 0);
    assert.equal(await planner.locator('summary[aria-label^="Organise "]').count(), 2, "scheduled ideas retain their card-level daypart controls without opening an editor that cannot reorder them");
    assert.equal(await page.getByText("Confirm the garden opening time before setting out.").count(), 1);
    assert.ok(await page.getByRole("button", { name: /Add to Day 2/ }).count() > 0);
    await planner.getByRole("button", { name: "Add activity", exact: true }).click();
    assert.equal(await planner.getByRole("combobox", { name: "Part of day" }).count(), 1);
    await planner.getByRole("textbox", { name: "Activity for" }).fill("Meiji Shrine");
    await planner.getByRole("combobox", { name: "Part of day", exact: true }).selectOption("afternoon");
    await planner.getByRole("button", { name: "Save", exact: true }).click();
    assert.match(await planner.innerText(), /Afternoon[\s\S]*Meiji Shrine/);
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    assert.equal(await planner.getByText("Meiji Shrine", { exact: true }).count(), 0);
    await page.close();
  } finally { await browser.close(); }
});

test("multiple movable activities reveal one closed editor with existing controls", { skip: !base }, async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const page = await openStory(browser, "tokyo-multiple");
    const editor = page.locator("details").filter({ has: page.locator("summary", { hasText: "Edit activities and order" }) }).first();
    assert.equal(await editor.count(), 1);
    assert.equal(await editor.evaluate((element: HTMLDetailsElement) => element.open), false);
    await editor.locator("summary").click();
    assert.equal(await editor.evaluate((element: HTMLDetailsElement) => element.open), true);
    assert.equal(await editor.getByRole("button", { name: "Add here", exact: true }).count(), 0);
    assert.equal(await page.locator('section[aria-label="Day 2 planner"]').getByRole("button", { name: "Add activity", exact: true }).count(), 1);
    assert.ok(await editor.getByRole("button", { name: /Move|Remove|Edit/i }).count() > 0);
    await editor.locator("summary").click();
    assert.equal(await editor.evaluate((element: HTMLDetailsElement) => element.open), false);
    await page.close();
  } finally { await browser.close(); }
});

test("empty day shows one invitation and no competing add or edit surface", { skip: !base }, async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const page = await openStory(browser, "seoul-empty", 390);
    const planner = page.locator('section[aria-label="Day 2 planner"]');
    assert.equal(await planner.getByText("Plan your day in Seoul", { exact: true }).count(), 1);
    assert.equal(await planner.getByRole("button", { name: "Add activity", exact: true }).count(), 1);
    assert.equal(await planner.getByRole("button", { name: "See suggestions", exact: true }).count(), 1);
    assert.equal(await page.getByText("Plan by part of day", { exact: true }).count(), 0);
    assert.equal(await page.getByText("Edit activities and order", { exact: true }).count(), 0);
    assert.equal(await page.getByText(/This day does not have detailed activities yet/).count(), 0);
    await page.close();
  } finally { await browser.close(); }
});

test("primary Add icon inherits the button white foreground in all interactive states", { skip: !base }, async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const page = await openStory(browser, "seoul-empty", 390);
    const button = page.locator('section[aria-label="Day 2 planner"]').getByRole("button", { name: "Add activity", exact: true });
    const colors = async () => button.evaluate((element: HTMLButtonElement) => {
      const icon = element.querySelector("svg")!;
      return { text: getComputedStyle(element).color, icon: getComputedStyle(icon).color, stroke: getComputedStyle(icon).stroke, height: element.getBoundingClientRect().height };
    });
    for (const state of ["default", "hover", "focus"]) {
      if (state === "hover") await button.hover();
      if (state === "focus") await button.focus();
      const value = await colors();
      assert.equal(value.text, "rgb(255, 255, 255)", state);
      assert.equal(value.icon, value.text, state);
      assert.ok(value.stroke === "currentcolor" || value.stroke === value.text, state);
      assert.ok(value.height >= 44, state);
    }
    await page.close();
  } finally { await browser.close(); }
});

test("populated and empty day stay contained with usable controls at production breakpoints", { skip: !base }, async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    for (const width of [390, 430, 768, 1024, 1440]) {
      for (const story of ["tokyo-populated", "seoul-empty"]) {
        const page = await openStory(browser, story, width);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        assert.ok(overflow <= 0, `${story} has ${overflow}px horizontal overflow at ${width}px`);
        const planner = page.locator('section[aria-label="Day 2 planner"]');
        const add = planner.getByRole("button", { name: "Add activity", exact: true });
        assert.equal(await add.count(), 1);
        if (width <= 430) assert.ok((await add.boundingBox())!.height >= 44);
        await page.close();
      }
    }
    const mobileEditor = await openStory(browser, "tokyo-multiple", 390);
    const summary = mobileEditor.locator("summary").filter({ hasText: "Edit activities and order" });
    assert.ok((await summary.boundingBox())!.height >= 44);
    await summary.click();
    await mobileEditor.getByRole("button", { name: /^Edit: / }).first().click();
    assert.ok(await mobileEditor.getByRole("menuitem", { name: "Move later" }).count() > 0);
    assert.ok(await mobileEditor.getByRole("menuitem", { name: "Remove" }).count() > 0);
    await mobileEditor.close();
  } finally { await browser.close(); }
});

test("existing Spanish wiring keeps the single Add and empty invitation", { skip: !base }, async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const populated = await openStory(browser, "tokyo-populated-spanish", 430);
    assert.equal(await populated.locator('section[aria-label="Day 2 planner"]').getByRole("button", { name: "Añadir actividad", exact: true }).count(), 1);
    await populated.close();
    const empty = await openStory(browser, "seoul-empty-spanish", 390);
    assert.equal(await empty.getByText("Planifica tu día en Seoul", { exact: true }).count(), 1);
    assert.equal(await empty.locator('section[aria-label="Day 2 planner"]').getByRole("button", { name: "Añadir actividad", exact: true }).count(), 1);
    await empty.close();
  } finally { await browser.close(); }
});
