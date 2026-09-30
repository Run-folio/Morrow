import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const require = createRequire(import.meta.url);
const bundled = `${homedir()}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright`;
const { chromium } = require(process.env.MORROVIA_PLAYWRIGHT_MODULE ?? (existsSync(bundled) ? bundled : "playwright"));
const rawBase = process.env.MORROVIA_FEEDBACK_STORYBOOK_URL;
const base = rawBase ? new URL(rawBase) : null;
const safeBase = base && ["localhost", "127.0.0.1", "[::1]"].includes(base.hostname) && ["http:", "https:"].includes(base.protocol) ? base.origin : null;
const evidence = join(process.cwd(), "docs/product/contextual-feedback-verification");
const story = (id: string) => `${safeBase}/iframe.html?id=${id}&viewMode=story`;
const itineraryAuth = "morrovia-05-product-patterns-trip-workspace-itinerary--contextual-feedback-authenticated-entry";
const itineraryOther = "morrovia-05-product-patterns-trip-workspace-itinerary--contextual-feedback-other-account-entry";
const itineraryUnauth = "morrovia-05-product-patterns-trip-workspace-itinerary--rich-day-planner-integrated";
const itineraryVisual = "morrovia-05-product-patterns-trip-workspace-itinerary--contextual-feedback-populated-day";
const overviewVisual = "morrovia-05-product-patterns-trip-workspace-overview--contextual-feedback-populated-overview";
const overviewRouteOnly = "morrovia-05-product-patterns-trip-workspace-overview--contextual-feedback-route-only-overview";
const feedbackInvitation = "morrovia-05-product-patterns-contextual-feedback--invitation";
const activeKey = (owner: string) => `morrovia:feedback-active:${owner}:contextual-beta-v1`;
const qualified = { elapsedMs: 600_000, acknowledgedAction: true };

async function seed(page: any, owner: string) {
  await page.addInitScript(([key, value]: [string, string]) => localStorage.setItem(key, value), [activeKey(owner), JSON.stringify(qualified)]);
}
async function noOverflow(page: any) {
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), page.viewportSize()!.width);
}
async function shot(page: any, name: string, target?: any) {
  mkdirSync(evidence, { recursive: true });
  if (target) await target.scrollIntoViewIfNeeded();
  await page.screenshot({ path: join(evidence, `${name}.png`) });
  await noOverflow(page);
}
async function surveyRoute(page: any, state: { dismissed: boolean; submitted: boolean }, post?: (body: any) => Promise<{ status: number; body: unknown }> | { status: number; body: unknown }) {
  await page.route("**/api/easyt/feedback/survey", async (route: any) => {
    const method = route.request().method();
    if (method === "GET") return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(state) });
    if (method === "PATCH") { state.dismissed = true; return route.fulfill({ status: 200, contentType: "application/json", body: '{"dismissed":true}' }); }
    const result = post ? await post(route.request().postDataJSON()) : { status: 201, body: { result: "created" } };
    if (result.status === 201) state.submitted = true;
    return route.fulfill({ status: result.status, contentType: "application/json", body: JSON.stringify(result.body) });
  });
}

test("qualified Storybook-auth itinerary entry, account isolation, dismissal and suppression", { skip: !safeBase && "Set a loopback MORROVIA_FEEDBACK_STORYBOOK_URL" }, async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
    const state = { dismissed: false, submitted: false };
    await seed(page, "storybook-traveller");
    await surveyRoute(page, state);
    await page.goto(story(itineraryAuth), { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Next day" }).click();
    await shot(page, "itinerary-shell-390");
    await page.locator('summary[aria-label="Open navigation"]').click();
    assert.equal(await page.getByRole("link", { name: "Help" }).isVisible(), true, "ordinary Help remains available independently of the survey");
    await page.locator('summary[aria-label="Open navigation"]').click();
    const slot = page.locator('[data-contextual-feedback-slot="itinerary"]');
    await slot.waitFor();
    assert.equal(await slot.evaluate((element: HTMLElement) => {
      const planner = element.parentElement?.querySelector(":scope > [class*='details']");
      return Boolean(planner && element.getBoundingClientRect().top >= planner.getBoundingClientRect().bottom);
    }), true, "the invitation must follow the saved day plan on mobile");
    assert.equal(await page.getByRole("button", { name: "Share feedback" }).count(), 1);
    assert.equal(await page.getByRole("heading", { name: "Day by day" }).count(), 1);
    assert.notEqual(await slot.evaluate((element: HTMLElement) => getComputedStyle(element).position), "fixed");
    await shot(page, "itinerary-invitation-390", slot);
    await page.getByRole("button", { name: "Share feedback" }).click();
    assert.equal(await page.getByRole("button", { name: "Share feedback" }).count(), 0);
    assert.equal(await page.locator('aside[aria-label="Share feedback"]').count(), 0, "the open form should use its question as the region label");
    assert.equal(await page.getByRole("heading", { name: "How’s Morrovia feeling?" }).count(), 1);
    assert.match(await page.evaluate(() => document.activeElement?.textContent ?? ""), /How’s Morrovia feeling/);
    await shot(page, "itinerary-open-390", slot);
    await page.getByRole("button", { name: "Dismiss feedback" }).click();
    assert.equal(await slot.count(), 0);
    await shot(page, "itinerary-dismissed-390");
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Next day" }).click();
    assert.equal(await slot.count(), 0);

    state.dismissed = false; // The fixture API now represents the other account.
    await page.goto(story(itineraryOther), { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Next day" }).click();
    assert.equal(await page.locator('[data-contextual-feedback-slot="itinerary"]').count(), 0, "the other account must not inherit the first account's active use");
    await page.evaluate(([key, value]: [string, string]) => localStorage.setItem(key, value), [activeKey("storybook-other-traveller"), JSON.stringify(qualified)]);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Next day" }).click();
    await page.locator('[data-contextual-feedback-slot="itinerary"]').waitFor();
    await page.close();
  } finally { await browser.close(); }
});

test("ineligible, unauthenticated and submitted accounts receive no invitation", { skip: !safeBase && "Set a loopback MORROVIA_FEEDBACK_STORYBOOK_URL" }, async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    for (const state of ["ineligible", "unauthenticated", "submitted"] as const) {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
      if (state === "submitted") await seed(page, "storybook-traveller");
      await surveyRoute(page, { dismissed: false, submitted: state === "submitted" });
      await page.goto(story(state === "unauthenticated" ? itineraryUnauth : itineraryAuth), { waitUntil: "domcontentloaded" });
      await page.getByRole("button", { name: "Next day" }).click();
      assert.equal(await page.locator("[data-contextual-feedback-slot]").count(), 0, state);
      await noOverflow(page);
      await page.close();
    }
  } finally { await browser.close(); }
});

test("a qualifying stay on a trip without planned activities can surface feedback on Overview", { skip: !safeBase && "Set a loopback MORROVIA_FEEDBACK_STORYBOOK_URL" }, async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.goto(story(overviewRouteOnly), { waitUntil: "domcontentloaded" });
    const slot = page.locator('[data-contextual-feedback-slot="overview"]');
    await slot.waitFor();
    assert.equal(await page.getByRole("button", { name: "Share feedback" }).count(), 1);
    assert.equal(await page.getByRole("heading", { name: "Keep building your trip" }).count(), 1, "the invitation remains in the real Overview workspace");
    await noOverflow(page);
    await page.close();
  } finally { await browser.close(); }
});

test("eligibility gained during an entry waits, and success suppresses later entries", { skip: !safeBase && "Set a loopback MORROVIA_FEEDBACK_STORYBOOK_URL" }, async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const state = { dismissed: false, submitted: false };
    let posts = 0;
    await page.addInitScript(([key, value]: [string, string]) => localStorage.setItem(key, value), [activeKey("storybook-traveller"), JSON.stringify({ elapsedMs: 599_000, acknowledgedAction: true })]);
    await surveyRoute(page, state, () => { posts += 1; return { status: 201, body: { result: "created" } }; });
    await page.goto(story(itineraryAuth), { waitUntil: "domcontentloaded" });
    assert.equal(await page.locator("[data-contextual-feedback-slot]").count(), 0);
    await page.evaluate(([key, value]: [string, string]) => localStorage.setItem(key, value), [activeKey("storybook-traveller"), JSON.stringify(qualified)]);
    await page.getByRole("button", { name: "Next day" }).focus();
    await page.waitForTimeout(1200);
    assert.equal(await page.locator("[data-contextual-feedback-slot]").count(), 0, "a newly eligible slot must not move controls on the current entry");
    await page.getByRole("button", { name: "Next day" }).click();
    const slot = page.locator('[data-contextual-feedback-slot="itinerary"]');
    await slot.waitFor();
    await page.getByRole("button", { name: "Share feedback" }).click();
    await page.getByRole("radio", { name: "3 out of 5" }).click();
    await page.locator("textarea").fill("A concise local test answer.");
    await page.getByRole("button", { name: "Send feedback" }).click();
    await page.getByRole("status").filter({ hasText: "Thank you" }).waitFor();
    assert.equal(posts, 1);
    await page.getByRole("button", { name: "Next day" }).click();
    await slot.waitFor({ state: "detached", timeout: 3000 });
    assert.equal(await slot.count(), 0);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Next day" }).click();
    assert.equal(await slot.count(), 0);
    assert.equal(posts, 1);
    await page.close();
  } finally { await browser.close(); }
});

test("response uses deliberate open, accessible rating, immutable retry and one POST per click burst", { skip: !safeBase && "Set a loopback MORROVIA_FEEDBACK_STORYBOOK_URL" }, async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
    const posts: any[] = [];
    let outcome: "definite" | "success" = "definite";
    await surveyRoute(page, { dismissed: false, submitted: false }, (body) => {
      posts.push(body);
      return outcome === "definite" ? { status: 409, body: { result: "payload-conflict" } } : { status: 201, body: { result: "created" } };
    });
    await page.goto(story(feedbackInvitation), { waitUntil: "domcontentloaded" });
    assert.equal(posts.length, 0);
    await page.getByRole("button", { name: "Share feedback" }).click();
    assert.equal(await page.getByRole("button", { name: "Share feedback" }).count(), 0);
    await page.getByRole("radio", { name: "1 out of 5" }).focus();
    await page.keyboard.press("ArrowRight");
    assert.equal(await page.getByRole("radio", { name: "2 out of 5" }).getAttribute("aria-checked"), "true");
    await page.getByRole("radio", { name: "4 out of 5" }).click();
    await page.locator("textarea").fill("A saved plan should stay clear.");
    assert.equal(posts.length, 0, "rating and note must never submit automatically");
    await shot(page, "opened-form-390");
    await page.evaluate(() => { const button = [...document.querySelectorAll("button")].find(item => item.textContent?.trim() === "Send feedback"); button?.click(); button?.click(); });
    await page.getByRole("button", { name: "Try again" }).waitFor();
    assert.equal(posts.length, 1, "a double click sends one request");
    assert.equal(await page.getByRole("radio", { name: "4 out of 5" }).getAttribute("aria-checked"), "true");
    assert.equal(await page.locator("textarea").inputValue(), "A saved plan should stay clear.");
    await shot(page, "definite-failure-390");
    outcome = "success";
    await page.getByRole("button", { name: "Try again" }).click();
    await page.getByRole("status").filter({ hasText: "Thank you" }).waitFor();
    assert.equal(posts.length, 2);
    assert.notEqual(posts[0].attemptId, posts[1].attemptId, "a definite rejection permits a new attempt");
    await shot(page, "success-390");
    await page.close();

    const uncertain = await browser.newPage({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 1 });
    const uncertainPosts: any[] = [];
    let first = true;
    await surveyRoute(uncertain, { dismissed: false, submitted: false }, (body) => {
      uncertainPosts.push(body);
      if (first) { first = false; return { status: 503, body: { error: "unconfirmed" } }; }
      return { status: 201, body: { result: "created" } };
    });
    await uncertain.goto(story(feedbackInvitation), { waitUntil: "domcontentloaded" });
    await uncertain.getByRole("button", { name: "Share feedback" }).click();
    await uncertain.getByRole("radio", { name: "5 out of 5" }).click();
    await uncertain.locator("textarea").fill("Keep this answer on retry.");
    await uncertain.getByRole("button", { name: "Send feedback" }).click();
    await uncertain.getByRole("button", { name: "Try again" }).waitFor();
    assert.equal(await uncertain.locator("textarea").inputValue(), "Keep this answer on retry.");
    assert.equal(await uncertain.getByRole("radio", { name: "5 out of 5" }).getAttribute("aria-checked"), "true");
    await shot(uncertain, "uncertain-failure-430");
    await uncertain.getByRole("button", { name: "Try again" }).click();
    await uncertain.getByRole("status").filter({ hasText: "Thank you" }).waitFor();
    assert.equal(uncertainPosts.length, 2);
    assert.equal(uncertainPosts[0].attemptId, uncertainPosts[1].attemptId, "uncertain delivery reuses its immutable attempt");
    await uncertain.close();
  } finally { await browser.close(); }
});

test("second workspace and desktop retain their production layout", { skip: !safeBase && "Set a loopback MORROVIA_FEEDBACK_STORYBOOK_URL" }, async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    for (const [name, id, width, height] of [["overview-invitation-430", overviewVisual, 430, 932], ["itinerary-invitation-desktop", itineraryVisual, 1440, 1000]] as const) {
      const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
      await page.goto(story(id), { waitUntil: "domcontentloaded" });
      const slot = page.locator("[data-contextual-feedback-slot]");
      await slot.waitFor();
      assert.equal(await page.getByRole("button", { name: "Share feedback" }).count(), 1);
      await shot(page, name, slot);
      await page.close();
    }
  } finally { await browser.close(); }
});
