/* Actual local app recovery and interaction checks for the Task 7 evidence. */
const { createRequire } = require("node:module");
const { writeFileSync } = require("node:fs");
const { join } = require("node:path");
const { homedir } = require("node:os");
const { chromium } = createRequire(__filename)(process.env.MORROVIA_PLAYWRIGHT_MODULE
  ?? join(homedir(), ".cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright"));
const baseUrl = process.env.MORROVIA_LOCAL_BASE_URL ?? "http://localhost:4317";
const prompt = "Visit Tokyo and Kyoto for one week.";

async function prepare(page) {
  await page.goto(baseUrl);
  await page.getByRole("button", { name: "Reject optional" }).click({ timeout: 1500 }).catch(() => {});
  await page.getByRole("tab", { name: "Describe my trip" }).click();
  await page.getByPlaceholder("Where would you like to go, for how long?").fill(prompt);
}

(async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const result = { reload: {}, cancellation: {}, importReturn: {}, ownerSwitch: "authenticated browser credentials unavailable" };
  try {
    const reloadContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const reloadPage = await reloadContext.newPage();
    await prepare(reloadPage);
    await reloadPage.getByRole("button", { name: "Plan my trip" }).first().click();
    await reloadPage.waitForURL(/\/journey\/new/);
    await reloadPage.getByText("Your route — Nights per stop:").waitFor({ timeout: 12000 });
    const before = new URL(reloadPage.url());
    const receiptTripId = () => reloadPage.evaluate(() => {
      const key = Object.keys(localStorage).find((item) => item.includes("homepage-input"));
      return key ? JSON.parse(localStorage.getItem(key)).receipt?.tripId ?? null : null;
    });
    const beforeReceiptTrip = await receiptTripId();
    await reloadPage.reload();
    await reloadPage.getByText("Your route — Nights per stop:").waitFor({ timeout: 12000 });
    const after = new URL(reloadPage.url());
    const afterReceiptTrip = await receiptTripId();
    result.reload = { sameReservedTrip: Boolean(beforeReceiptTrip) && beforeReceiptTrip === afterReceiptTrip,
      sameOrientation: (Boolean(before.searchParams.get("handoff"))
        && before.searchParams.get("handoff") === after.searchParams.get("handoff"))
        || (Boolean(before.searchParams.get("trip")) && before.searchParams.get("trip") === after.searchParams.get("trip")),
      routeRestored: (await reloadPage.locator("body").innerText()).includes("Tokyo\nJapan"),
      noFreshStarter: await reloadPage.getByRole("tab", { name: "Describe my trip" }).count() === 0 };
    await reloadContext.close();

    const cancelContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const cancelPage = await cancelContext.newPage();
    await cancelPage.route("**/api/journey-capture", async (route) => {
      const response = await route.fetch();
      await new Promise((resolve) => setTimeout(resolve, 2500));
      await route.fulfill({ response });
    });
    await prepare(cancelPage);
    await cancelPage.getByRole("button", { name: "Plan my trip" }).first().click();
    await cancelPage.waitForURL(/\/journey\/new/);
    await cancelPage.getByRole("button", { name: "Edit trip idea" }).click({ timeout: 12000 });
    await cancelPage.waitForTimeout(2800);
    const cancelBody = await cancelPage.locator("body").innerText();
    result.cancellation = { promptRestored: (await cancelPage.locator("textarea").first().inputValue()) === prompt,
      staleRouteAbsent: !cancelBody.includes("Your route — Nights per stop:") };
    await cancelContext.close();

    const importContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const importPage = await importContext.newPage();
    await importPage.goto(`${baseUrl}/journey/new`);
    await importPage.getByRole("tab", { name: "Describe my trip" }).click();
    await importPage.getByPlaceholder("Where would you like to go, for how long?").fill(prompt);
    await importPage.getByRole("link", { name: "Import existing trip" }).click();
    await importPage.waitForURL(/\/journey\/new\/import/);
    result.importReturn.openedExistingRoute = new URL(importPage.url()).pathname === "/journey/new/import";
    await importPage.goBack();
    await importPage.getByPlaceholder("Where would you like to go, for how long?").waitFor({ timeout: 12000 });
    result.importReturn.promptRestored = (await importPage.locator("textarea").first().inputValue()) === prompt;
    await importContext.close();
  } finally { await browser.close(); }
  writeFileSync(join(__dirname, "current-context.json"), `${JSON.stringify(result, null, 2)}\n`);
  console.log(result);
})().catch((error) => { console.error(error); process.exitCode = 1; });
