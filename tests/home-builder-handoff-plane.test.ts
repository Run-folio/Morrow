import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import test from "node:test";
import { build } from "esbuild";
import { chromium } from "playwright";

const assetUrl = "/journey/motion/plane-travel.webp";
const asset = readFileSync("public" + assetUrl);

test("local plane is a compact, animated WebP and is scoped to Home → Builder", () => {
  assert.equal(asset.subarray(0, 4).toString(), "RIFF");
  assert.equal(asset.subarray(8, 12).toString(), "WEBP");
  assert.ok(asset.includes(Buffer.from("ANIM")));
  assert.ok(asset.length < 250_000);
  const home = readFileSync("app/journey/home/home-trip-starter.tsx", "utf8");
  const builder = readFileSync("app/journey/new/trip-builder.tsx", "utf8");
  assert.match(home, /loading && !captureError \? <HomeBuilderHandoffStatus floating/);
  assert.match(builder, /!hydrated && builderSearchParams\.get\("homeDraft"\) === "1" && builderSearchParams\.has\("handoff"\)/);
  assert.match(builder, /pendingInterpretation\?\.fromHomepage && !tripBriefCaptureError \? <HomeBuilderHandoffStatus/);
});

test("slow, fast, reduced-motion, error, live preference, and cancellation paths", {
  skip: process.env.MORROVIA_PLANE_BROWSER_TESTS !== "1",
}, async () => {
  const result = await build({stdin: {resolveDir: process.cwd(), loader: "tsx", contents: `
    import React from "react"; import { createRoot } from "react-dom/client";
    import { flushSync } from "react-dom";
    import { HomeBuilderHandoffStatus } from "./components/easyt/home-builder-handoff-status";
    const root = createRoot(document.getElementById("root"));
    window.show = (mode) => flushSync(() => root.render(mode ? <HomeBuilderHandoffStatus title="Preparing your route…" floating={mode === "floating"} /> : <div>Builder ready</div>));
    window.show(null);
  `}, bundle: true, write:false, outdir:"fixture", jsx:"automatic", loader:{".css":"local-css"},
  define:{"process.env.NODE_ENV":'"production"'}});
  const bundle = result.outputFiles.find(f=>f.path.endsWith(".js"))!.text;
  const css = result.outputFiles.find(f=>f.path.endsWith(".css"))!.text;
  let requests = 0, fail = false;
  const server = createServer((req,res) => {
    if(req.url === assetUrl) { requests++; res.writeHead(fail ? 404 : 200, {"content-type":"image/webp","cache-control":"no-store"});res.end(fail ? undefined : asset);return; }
    res.setHeader("content-type","text/html");res.end('<meta name="viewport" content="width=device-width,initial-scale=1"><style>'+css+'</style><div id="root"></div><script>'+bundle+'</script>');
  });
  await new Promise<void>(r=>server.listen(0,"127.0.0.1",r));
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  try {
    browser = await chromium.launch({executablePath:process.env.CHROMIUM_PATH || undefined});
    let page = await browser.newPage({viewport:{width:390,height:844}, reducedMotion:"no-preference"});
    const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));
    const address=server.address();assert.ok(address && typeof address === "object");
    await page.goto("http://127.0.0.1:"+address.port);
    await page.clock.install();
    const show=(mode: string | null)=>page.evaluate(mode=>(window as unknown as {show:(mode:string|null)=>void}).show(mode),mode);
    const panel=page.locator("[data-home-builder-handoff]"), pic=panel.locator("img");
    await show("floating");await page.clock.runFor(100);await show(null);
    await page.clock.runFor(400);assert.equal(requests,0);assert.equal(await panel.count(),0);
    await show("floating");await page.clock.runFor(301);await pic.waitFor();
    await page.waitForFunction(()=>!!document.querySelector("img")?.naturalWidth);
    assert.equal(requests,1);assert.equal(await panel.getAttribute("role"),"status");assert.equal(await pic.getAttribute("alt"),"");
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await show(null);assert.equal(await panel.count(),0);assert.equal(await page.getByText("Builder ready").count(),1);
    await page.emulateMedia({reducedMotion:"reduce"});
    await show("inline");assert.equal(await panel.textContent(),"Preparing your route…");
    await page.clock.runFor(400);assert.equal(await pic.count(),0);assert.equal(requests,1);
    await page.emulateMedia({reducedMotion:"no-preference"});await pic.waitFor();
    await page.emulateMedia({reducedMotion:"reduce"});await pic.waitFor({state:"detached"});
    await show(null);
    // Chrome may keep a decoded image alive in the same document even with
    // no-store. Use a fresh context to actually exercise a failed first request.
    await page.close();
    page = await browser.newPage({viewport:{width:390,height:844},reducedMotion:"no-preference"});
    page.on("pageerror",e=>errors.push(e.message));
    await page.goto("http://127.0.0.1:"+address.port);
    await page.clock.install();fail=true;
    const failure=page.waitForResponse(r=>r.url().endsWith(assetUrl)&&r.status()===404);
    await show("inline");await page.clock.runFor(350);await failure;
    await page.locator("[data-home-builder-handoff] img").waitFor({state:"detached"});assert.equal(await page.getByRole("status").textContent(),"Preparing your route…");
    await show(null);assert.equal(await page.getByRole("status").count(),0);assert.deepEqual(errors,[]);
  } finally { await browser?.close(); await new Promise<void>(r=>server.close(()=>r())); }
});
