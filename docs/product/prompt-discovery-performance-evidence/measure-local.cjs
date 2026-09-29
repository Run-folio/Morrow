/* Local optimized-app acceptance. Uses the bundled test browser, no provider credentials. */
const { createRequire } = require("node:module");
const { writeFileSync } = require("node:fs");
const { join } = require("node:path");
const { homedir } = require("node:os");

const browserModule = process.env.MORROVIA_PLAYWRIGHT_MODULE
  ?? join(homedir(), ".cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
const { chromium } = createRequire(__filename)(browserModule);
const baseUrl = process.env.MORROVIA_LOCAL_BASE_URL ?? "http://localhost:4317";
const output = __dirname;
const phase = process.env.MORROVIA_MEASURE_PHASE ?? "current";
const matchedRuns = Number(process.env.MORROVIA_MEASURE_RUNS ?? "3");
const matchedOnly = process.env.MORROVIA_MEASURE_MATCHED_ONLY === "1";
const prompts = {
  describe: "Visit Tokyo and Kyoto in Japan for one week.",
  broad: "Explore Japan for one week.",
  mixed: "Visit Tokyo and somewhere in Kansai for one week.",
  repeated: "Tokyo, Kyoto, then Tokyo again in Japan for one week.",
  slow: "Visit Tokyo and Kyoto in Japan for one week.",
  failure: "Visit Tokyo and Kyoto in Japan for one week.",
};

function milestoneMarks(marks, clickedAtEpoch) {
  const prefix = "morrovia-planning:";
  const submitted = marks.filter((mark) => mark.name.startsWith(prefix) && mark.name.endsWith(":submit") && mark.epoch >= clickedAtEpoch)
    .sort((left, right) => right.epoch - left.epoch)[0];
  if (!submitted) return {};
  const attemptPrefix = submitted.name.slice(0, -"submit".length);
  const stages = { submit: 0 };
  for (const mark of marks.filter((item) => item.name.startsWith(attemptPrefix) && item.epoch >= submitted.epoch)) {
    const stage = mark.name.split(":").at(-1);
    if (stages[stage] === undefined) stages[stage] = Math.round(mark.epoch - clickedAtEpoch);
  }
  return stages;
}

async function chooseStop(page, name) {
  await page.getByRole("button", { name: /Where do you want to go/ }).click();
  await page.getByPlaceholder("City, country or region").fill(name);
  await page.locator("button[role=option]").first().waitFor();
  await page.locator("button[role=option]").first().click();
}

async function addStop(page, name) {
  await page.getByRole("button", { name: "Add another stop" }).click();
  await page.getByPlaceholder("City, country or region").last().fill(name);
  await page.locator("button[role=option]").first().waitFor();
  await page.locator("button[role=option]").first().click();
}

async function run(browser, name, runNumber, width = 390) {
  const context = await browser.newContext({ viewport: { width, height: 844 } });
  const page = await context.newPage();
  await page.addInitScript(() => {
    window.__morroviaMeasureStorage = { reads: 0, writes: 0, durationMs: 0 };
    const readStorage = Storage.prototype.getItem;
    const writeStorage = Storage.prototype.setItem;
    Storage.prototype.getItem = function (...args) {
      const started = performance.now();
      try { return readStorage.apply(this, args); }
      finally { if (this === localStorage) { window.__morroviaMeasureStorage.reads++; window.__morroviaMeasureStorage.durationMs += performance.now() - started; } }
    };
    Storage.prototype.setItem = function (...args) {
      const started = performance.now();
      try { return writeStorage.apply(this, args); }
      finally { if (this === localStorage) { window.__morroviaMeasureStorage.writes++; window.__morroviaMeasureStorage.durationMs += performance.now() - started; } }
    };
    window.__morroviaLongTasks = [];
    try { new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) window.__morroviaLongTasks.push({
        epoch: performance.timeOrigin + entry.startTime, durationMs: entry.duration,
      });
    }).observe({ type: "longtask", buffered: true }); } catch { /* optional browser diagnostic */ }
    const storeEvent = (name, detail) => {
      const prior = JSON.parse(sessionStorage.getItem("__morrovia_measure_events__") || "[]");
      prior.push({ name, epoch: performance.timeOrigin + performance.now(), ...(detail ? { detail } : {}) });
      sessionStorage.setItem("__morrovia_measure_events__", JSON.stringify(prior.slice(-120)));
    };
    const originalPush = history.pushState.bind(history);
    history.pushState = function (...args) {
      const value = originalPush(...args);
      if (location.pathname === "/journey/new") storeEvent("route-committed");
      return value;
    };
    const originalFetch = window.fetch.bind(window);
    window.fetch = function (...args) {
      const url = String(args[0]?.url ?? args[0]);
      if (url.includes("/journey/new") && !url.includes("/api/")) storeEvent("route-requested");
      if (url.includes("/api/journey-capture")) storeEvent("interpretation-requested");
      return originalFetch(...args).then((response) => {
        if (url.includes("/api/journey-capture")) storeEvent("interpretation-response", { status: response.status });
        return response;
      });
    };
    const seen = new Set();
    const inspect = () => {
      const root = document.querySelector('[data-builder-root="true"]');
      if (!root) return;
      if (!seen.has("builder-mounted")) { seen.add("builder-mounted"); storeEvent("builder-mounted", { busy: root.getAttribute("aria-busy") }); }
      if (root.getAttribute("aria-busy") === "true") return;
      if (!seen.has("entry-render-committed")) {
        seen.add("entry-render-committed");
        storeEvent("entry-render-committed");
        requestAnimationFrame(() => requestAnimationFrame(() => {
          const current = document.querySelector('[data-builder-root="true"]');
          const heading = current?.querySelector("h1");
          if (heading && heading.getBoundingClientRect().height > 0 && getComputedStyle(heading).visibility === "visible")
            storeEvent("orientation-visible");
        }));
      }
      const actionable = () => {
        const dialog = document.querySelector('[data-builder-clarification-ui="true"][aria-modal="true"]');
        if (dialog) return [...dialog.querySelectorAll('button[aria-pressed]:not([disabled]), [aria-label="Place choices"] button:not([disabled]), input:not([disabled])')]
          .find((button) => button.getBoundingClientRect().height > 0) ?? null;
        const row = root.querySelector('[data-builder-route-workspace] [data-builder-stop-index]');
        const add = [...root.querySelectorAll("button")].find((button) => button.textContent?.trim() === "Add stop" && !button.disabled);
        return row?.getBoundingClientRect().height && add ? add : null;
      };
      if (!seen.has("actionable-render-committed") && actionable()) {
        seen.add("actionable-render-committed");
        storeEvent("actionable-render-committed");
        requestAnimationFrame(() => requestAnimationFrame(() => {
          if (actionable())
            storeEvent("actionable-visible");
        }));
      }
    };
    new MutationObserver(inspect).observe(document, { childList: true, subtree: true, attributes: true, attributeFilter: ["aria-busy"] });
    document.addEventListener("DOMContentLoaded", () => { storeEvent("dom-content-loaded"); inspect(); }, { once: true });
    window.addEventListener("pageshow", () => storeEvent("page-shown"), { once: true });
    const originalMark = performance.mark.bind(performance);
    performance.mark = function (...args) {
      const entry = originalMark(...args);
      if (String(args[0]).startsWith("morrovia-planning:")) {
        const prior = JSON.parse(sessionStorage.getItem("__morrovia_measure_marks__") || "[]");
        prior.push({ name: String(args[0]), epoch: performance.timeOrigin + entry.startTime });
        sessionStorage.setItem("__morrovia_measure_marks__", JSON.stringify(prior.slice(-100)));
      }
      return entry;
    };
  });
  const errors = [];
  const requests = [];
  page.on("pageerror", (error) => errors.push(error.message.slice(0, 160)));
  page.on("request", (request) => {
    if (/\/api\/(journey-capture|journey-geocode|journey-discover)/.test(request.url()))
      requests.push(new URL(request.url()).pathname.split("/").at(-1));
  });
  if (name === "slow" || name === "failure") {
    await page.route("**/api/journey-geocode?**", async (route) => {
      const place = new URL(route.request().url()).searchParams.get("place") ?? "";
      if (name === "slow" && place.includes("Kyoto")) await new Promise((resolve) => setTimeout(resolve, 2500));
      if (name === "failure" && place.includes("Kyoto")) return route.fulfill({ status: 503, body: "Provider unavailable" });
      return route.continue();
    });
  }
  const record = { phase, source: "optimized-local-fallback", name, run: runNumber,
    thermal: runNumber === 1 ? "cold-context" : "warm-server", width, height: 844, errors, requests };
  try {
    await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Reject optional" }).click({ timeout: 1500 }).catch(() => {});
    if (name === "stops" || name === "repeated") {
      await chooseStop(page, "Tokyo");
      if (name === "repeated") {
        await addStop(page, "Kyoto");
        await addStop(page, "Tokyo");
      }
    }
    else {
      await page.getByRole("tab", { name: "Describe my trip" }).click();
      await page.getByPlaceholder("Where would you like to go, for how long?").fill(prompts[name]);
    }
    const activatedAtEpoch = await page.evaluate(() => performance.timeOrigin + performance.now());
    await page.evaluate(() => { window.__morroviaMeasureStorage = { reads: 0, writes: 0, durationMs: 0 }; });
    await page.getByRole("button", { name: "Plan my trip" }).first().click();
    await page.waitForFunction(() => location.pathname === "/journey/new", undefined, { timeout: 15000 });
    record.urlObservedUpperBoundMs = await page.evaluate((at) => Math.round(performance.timeOrigin + performance.now() - at), activatedAtEpoch);
    await page.waitForFunction(() => JSON.parse(sessionStorage.getItem("__morrovia_measure_marks__") || "[]").some((entry) =>
      entry.name.startsWith("morrovia-planning:") && entry.name.endsWith(":first-actionable")), undefined, { timeout: 12000 }).catch(() => {});
    await page.waitForTimeout(name === "slow" || name === "failure" ? 2800 : 400);
    const marks = await page.evaluate(() => JSON.parse(sessionStorage.getItem("__morrovia_measure_marks__") || "[]"));
    record.milestonesMs = milestoneMarks(marks, activatedAtEpoch);
    record.trace = (await page.evaluate(() => JSON.parse(sessionStorage.getItem("__morrovia_measure_events__") || "[]")))
      .filter((entry) => entry.epoch >= activatedAtEpoch)
      .map((entry) => ({ name: entry.name, ms: Math.round((entry.epoch - activatedAtEpoch) * 10) / 10, detail: entry.detail }));
    record.storage = await page.evaluate(() => window.__morroviaMeasureStorage);
    record.longTasks = (await page.evaluate(() => window.__morroviaLongTasks))
      .filter((entry) => entry.epoch >= activatedAtEpoch)
      .map((entry) => ({ ms: Math.round((entry.epoch - activatedAtEpoch) * 10) / 10, durationMs: Math.round(entry.durationMs * 10) / 10 }));
    record.routeResources = await page.evaluate((at) => performance.getEntriesByType("resource")
      .filter((entry) => performance.timeOrigin + entry.startTime >= at && /\/journey\/new|\/_next\/static\//.test(entry.name))
      .map((entry) => ({ path: new URL(entry.name).pathname, ms: Math.round((performance.timeOrigin + entry.startTime - at) * 10) / 10,
        durationMs: Math.round(entry.duration * 10) / 10 })).slice(0, 30), activatedAtEpoch);
    const body = await page.locator("body").innerText();
    record.hasRoute = body.includes("Your route — Nights per stop:");
    record.hasDiscovery = body.includes("Explore places");
    record.hasCanonicalTokyo = body.includes("Tokyo\nJapan") || body.includes("Tokyo checked");
    if (name === "repeated") record.repeatedOccurrencesVisible = body.includes("Stops (3)")
      && body.includes("1\nTokyo") && body.includes("2\nKyoto") && body.includes("3\nTokyo");
    record.firstActionableVerified = record.milestonesMs["first-actionable"] !== undefined
      && ((record.hasRoute && record.hasCanonicalTokyo) || record.hasDiscovery);
    record.overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
    record.urlKind = new URL(page.url()).searchParams.has("trip") ? "canonical-trip" : "handoff";
    if (runNumber === 1 || runNumber === matchedRuns)
      await page.screenshot({ path: join(output, `${phase}-${name}-${width}-${runNumber}.png`), fullPage: false });
  } catch (error) { record.errors.push(String(error).slice(0, 200)); }
  finally { await context.close(); }
  return record;
}

(async () => {
  const browser = await chromium.launch({ channel: process.env.MORROVIA_BROWSER_CHANNEL ?? "chrome", headless: true });
  const rows = [];
  const only = process.env.MORROVIA_MEASURE_ONLY;
  try {
    for (const name of ["stops", "describe"]) for (let runNumber = 1; runNumber <= matchedRuns; runNumber++)
      if (!only || only === name) rows.push(await run(browser, name, runNumber));
    for (const name of matchedOnly ? [] : ["broad", "mixed", "repeated", "slow", "failure"])
      if (!only || only === name) rows.push(await run(browser, name, 1));
    if (!only && !matchedOnly) for (const width of [430, 768, 1024, 1440]) rows.push(await run(browser, "describe", 1, width));
  } finally { await browser.close(); }
  const file = join(output, `${phase}-optimized-runs.json`);
  const prior = only && require("node:fs").existsSync(file) ? require(file).filter((entry) => entry.name !== only) : [];
  writeFileSync(file, `${JSON.stringify([...prior, ...rows], null, 2)}\n`);
  console.log(JSON.stringify(rows.map(({ name, run, width, milestonesMs, firstActionableVerified, errors }) =>
    ({ name, run, width, milestonesMs, firstActionableVerified, errors })), null, 2));
})().catch((error) => { console.error(error); process.exitCode = 1; });
