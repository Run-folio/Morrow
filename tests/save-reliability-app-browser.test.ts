import assert from "node:assert/strict";
import test from "node:test";
import {createRequire} from "node:module";
import {captureJourneyBrief} from "../lib/easyt/journey-capture.ts";

const require = createRequire(import.meta.url);
const {chromium} = require("playwright");
const enabled = process.env.MORROVIA_SAVE_RELIABILITY_BROWSER_TESTS === "1";
const base = process.env.MORROVIA_BASE_URL ?? "http://127.0.0.1:3116";
async function isolate(context: any) {
  await context.route("**/*", async (route: any) => {
    const url = new URL(route.request().url());
    if (url.origin !== new URL(base).origin) return route.abort();
    if (!url.pathname.startsWith("/api/")) return route.continue();
    let body: unknown = {}, status = 503;
    if (url.pathname === "/api/auth/get-session") { body = null; status = 200; }
    if (url.pathname === "/api/journey-geocode") { body = {candidates:[],result:null}; status = 200; }
    if (url.pathname === "/api/journey-capture") { body = captureJourneyBrief(route.request().postDataJSON().brief); status = 200; }
    if (url.pathname.startsWith("/api/easyt/trips/")) status = 401;
    return route.fulfill({status,contentType:"application/json",body:JSON.stringify(body)});
  });
}
const recoveries = (page: any) => page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith("easyt:trip-recovery:v2:guest:")).map(key => JSON.parse(localStorage.getItem(key)!)));

for (const template of ["balkans-overland","japan-south-korea","iceland-ring-road"]) {
  test(`fresh premade ${template} is one owned editable clone and survives reload`, {skip:!enabled,timeout:60000}, async () => {
    const browser = await chromium.launch({channel:"chrome",headless:true});
    const context = await browser.newContext();
    try {
      await isolate(context);
      const page = await context.newPage();
      await page.goto(`${base}/journey/routes/${template}`);
      await page.getByRole("link",{name:/Use this route/}).first().click();
      await page.waitForURL(/trip=.*recover=1/);
      await page.getByText("Saved on this device",{exact:true}).first().waitFor();
      const before = await recoveries(page);
      assert.equal(before.length,1); assert.equal(before[0].ownerId,null);
      assert.equal(before[0].trip.brief.sourceRouteKey,template);
      assert.notEqual(before[0].trip.id,template);
      assert.equal(new Set(before[0].trip.stops.map((stop:any)=>stop.id)).size,before[0].trip.stops.length);
      await page.reload();
      await page.getByText("Saved on this device",{exact:true}).first().waitFor();
      const after = await recoveries(page);
      assert.equal(after.length,1); assert.equal(after[0].tripId,before[0].tripId);
      assert.deepEqual(after[0].trip.stops,before[0].trip.stops);
      assert.deepEqual(after[0].trip.planItems,before[0].trip.planItems);
      assert.deepEqual(after[0].trip.brief.intent,before[0].trip.brief.intent);
      assert.doesNotMatch(await page.locator("body").innerText(),/Browser storage is blocked|not available to the current browser account/);
    } finally { await context.close(); await browser.close(); }
  });
}

test("confirmed native premade write rejection blocks saving and exact retry preserves clone identity", {skip:!enabled,timeout:60000}, async () => {
  const browser = await chromium.launch({channel:"chrome",headless:true});
  const context = await browser.newContext();
  try {
    await isolate(context);
    await context.addInitScript(() => {
      const globals = window as any;
      globals.outcomes = [];
      window.addEventListener("morrovia-persistence-outcome", (event:any) => globals.outcomes.push(event.detail));
      const set = Storage.prototype.setItem;
      globals.restoreTestWrite = () => { Storage.prototype.setItem = set; };
      Storage.prototype.setItem = function(key, value) {
        if (key.startsWith("easyt:trip-recovery:v2:")) throw new DOMException("synthetic", "SecurityError");
        return set.call(this,key,value);
      };
    });
    const page = await context.newPage();
    await page.goto(`${base}/journey/new?inspire=balkans-overland`);
    await page.getByText("This device could not save the changes. Keep this tab open before leaving.",{exact:true}).waitFor();
    assert.equal((await recoveries(page)).length,0);
    assert.equal(await page.getByText("Saved on this device",{exact:true}).count(),0);
    const native = await page.evaluate(() => (window as any).outcomes.filter((e:any)=>e.outcome==="native-write-failed"));
    assert.ok(native.some((e:any)=>e.nativeFailure==="security"&&e.deviceCopyVerified===false));
    await page.evaluate(() => (window as any).restoreTestWrite());
    await page.getByRole("button",{name:"Try device save again",exact:true}).click();
    await page.waitForURL(/trip=.*recover=1/);
    await page.getByText("Saved on this device",{exact:true}).first().waitFor();
    const after = await recoveries(page);
    assert.equal(after.length,1);
    assert.equal(after[0].trip.brief.sourceRouteKey,"balkans-overland");
    await page.reload();
    await page.getByText("Saved on this device",{exact:true}).first().waitFor();
    assert.equal((await recoveries(page))[0].tripId,after[0].tripId);
    assert.deepEqual((await recoveries(page))[0].trip.stops,after[0].trip.stops);
  } finally { await context.close(); await browser.close(); }
});

test("a durable premade copy with an unacknowledged pointer reports incomplete entry until exact retry", {skip:!enabled,timeout:60000}, async () => {
  const browser = await chromium.launch({channel:"chrome",headless:true});
  const context = await browser.newContext();
  try {
    await isolate(context);
    await context.addInitScript(() => {
      const set = Storage.prototype.setItem;
      (window as any).restorePointer = () => { Storage.prototype.setItem = set; };
      Storage.prototype.setItem = function(key, value) {
        if (key.startsWith("easyt:current-trip:v2:")) throw new DOMException("synthetic", "SecurityError");
        return set.call(this,key,value);
      };
    });
    const page = await context.newPage();
    await page.goto(`${base}/journey/new?inspire=balkans-overland`);
    await page.getByText("Trip opening not confirmed",{exact:true}).waitFor({timeout:10000});
    assert.equal(await page.getByText("Device copy saved; opening needs checking",{exact:true}).count(),1);
    const before = await recoveries(page);
    assert.equal(before.length,1,"the exact recovery remains durable while pointer confirmation fails");
    assert.equal(await page.getByText("Saved on this device",{exact:true}).count(),0);
    assert.equal(new URL(page.url()).searchParams.get("inspire"),"balkans-overland");
    assert.doesNotMatch(await page.locator("body").innerText(),/Browser storage is blocked/);
    await page.evaluate(() => (window as any).restorePointer());
    await page.getByRole("button",{name:"Try device save again",exact:true}).click();
    await page.waitForURL(/trip=.*recover=1/);
    await page.getByText("Saved on this device",{exact:true}).first().waitFor();
    const after = await recoveries(page);
    assert.equal(after.length,1);assert.equal(after[0].tripId,before[0].tripId);
    assert.deepEqual(after[0].trip.stops,before[0].trip.stops);
  } finally { await context.close(); await browser.close(); }
});
