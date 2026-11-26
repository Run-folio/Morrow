import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { chromium } from "playwright";

const root = new URL("../", import.meta.url).pathname;
const appOrigin = "https://staging.morrovia.com";
const capture = process.env.MORROVIA_STAY22_TEST_CAPTURE_DIR;

// Real component + controls, both the same-origin gate and provider are intercepted.
// No live trips, network requests, credentials or affiliate visits are used.
test("inline Stay22 shares only the selected search, after consent and an explicit click", {timeout: 90_000}, async () => {
  const {outputFiles} = await build({
    absWorkingDir: root, bundle: true, write: false, outdir: "/tmp/stay22-test-build",
    entryNames: "app", jsx: "automatic", banner: {js: "const process = { env: {} };"}, define: {"process.env.NODE_ENV": '"production"'},
    stdin: {loader: "tsx", resolveDir: root, contents: `
      import {createRoot} from "react-dom/client";
      import Search from "./components/easyt/stay22-tester-preview";
      import {createPrivacyConsentRecord,PRIVACY_CONSENT_STORAGE_KEY as key,PRIVACY_CONSENT_CHANGE_EVENT as event} from "./lib/privacy-consent";
      import "./app/journey/journey-design.css";
      const root=createRoot(document.getElementById("root"));
      const cape={stopName:"Cape Town", latitude:-33.9249, longitude:18.4241, checkIn:"2090-12-02", checkOut:"2090-12-07", travellers:3, currency:"EUR"};
      window.consent=(analytics,affiliateTracking)=>{localStorage.setItem(key,JSON.stringify(createPrivacyConsentRecord({analytics,affiliateTracking})));window.dispatchEvent(new Event(event));};
      window.renderStop=(props=cape)=>root.render(<main style={{display:"grid",gridTemplateColumns:"minmax(0,1fr) minmax(0,1fr)",gap:12,margin:"16px auto",maxWidth:1200}}>
        <header style={{gridColumn:"1/-1"}}><h2>{props.stopName}</h2></header>
        <Search key={JSON.stringify(props)} {...props}/><article>Other stay options</article></main>);
      window.renderStop();
    `},
  });
  const css = outputFiles.find(f=>f.path.endsWith(".css")).text;
  const js = outputFiles.find(f=>f.path.endsWith(".js")).text;
  const browser = await chromium.launch({executablePath:process.env.MORROVIA_CHROMIUM_EXECUTABLE || undefined});
  try {
    for (const width of [1440,390]) {
      const page = await browser.newPage({viewport:{width,height:900},serviceWorkers:"block"});
      const requests=[]; const errors=[];
      page.on("pageerror", error => errors.push(error.message));
      let eligible=true;
      await page.route("**/*", async route => {
        const url=new URL(route.request().url());
        if(url.origin==="https://www.stay22.com" && url.pathname==="/embed/gm") {
          requests.push(url);
          return route.fulfill({contentType:"text/html",body:"<p>Test fixture only. Live provider results are not displayed.</p>"});
        }
        if(url.origin!==appOrigin) return route.abort();
        if(url.pathname==="/api/easyt/stay22-tester") return route.fulfill({status:eligible?200:404,json:eligible?{affiliateId:"fixture"}:null});
        if(url.pathname==="/app.css") return route.fulfill({contentType:"text/css",body:css});
        if(url.pathname==="/app.js") return route.fulfill({contentType:"application/javascript",body:js});
        if(url.pathname==="/") return route.fulfill({contentType:"text/html",body:'<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/app.css"><div id="root"></div><script src="/app.js"></script>'});
        return route.abort();
      });
      await page.goto(appOrigin);
      const show=page.getByRole("button",{name:"Show stays"});
      const frame=page.locator("iframe");
      await show.waitFor({timeout: 5000}).catch(error => { throw new Error(`${error.message}\nBrowser errors: ${JSON.stringify(errors)}`, {cause:error}); });
      assert.equal(await show.isDisabled(),true);
      for(const partial of [[true,false],[false,true]]) {
        await page.evaluate(([a,b])=>window.consent(a,b),partial);
        assert.equal(await show.isDisabled(),true);
      }
      await page.evaluate(()=>window.consent(true,true));
      await page.waitForFunction(()=>document.querySelector("button:not([disabled])"));
      assert.equal(requests.length,0);
      if(capture) await page.screenshot({path:`${capture}/stay22-inline-${width}-before.png`});
      await show.click();
      await frame.waitFor();
      await page.waitForFunction(()=>document.querySelector("iframe")?.contentWindow!=null);
      const first=new URL(await frame.getAttribute("src"));
      assert.equal(first.searchParams.get("viewmode"),width===1440?"all":"listview");
      assert.equal(first.searchParams.get("adults"),"3");
      assert.equal(first.searchParams.get("currency"),"EUR");
      assert.equal(first.searchParams.get("maincolor"),"3025ce");
      assert.equal(first.searchParams.get("lat"),"-33.9249");
      assert.equal(first.searchParams.get("checkin"),"2090-12-02");
      assert.equal(await frame.getAttribute("referrerpolicy"),"no-referrer");
      const rect=await frame.boundingBox();
      assert.ok(rect.width>=(width===1440?1100:320));
      assert.ok(rect.height>=(width===1440?650:440));
      assert.equal(await page.getByRole("dialog").count(),0);
      if(capture) await page.screenshot({path:`${capture}/stay22-inline-${width}-test-frame.png`});
      await page.getByRole("combobox",{name:"Adults"}).selectOption("4");
      await frame.waitFor({state:"detached"});
      await show.click();await frame.waitFor();
      assert.equal(new URL(await frame.getAttribute("src")).searchParams.get("adults"),"4");
      await page.evaluate(()=>window.consent(false,true));
      await frame.waitFor({state:"detached"});
      await page.evaluate(()=>window.consent(true,true));
      assert.equal(await frame.count(),0);
      await show.click();await frame.waitFor();
      await page.getByRole("button",{name:"Hide results"}).click();await frame.waitFor({state:"detached"});
      await show.click();await frame.waitFor();
      await page.evaluate(()=>window.renderStop({stopName:"Tokyo",latitude:35,longitude:139,checkIn:"2090-12-08",checkOut:"2090-12-10",travellers:2,currency:"GBP"}));
      await frame.waitFor({state:"detached"});await show.waitFor();
      assert.equal(await page.getByRole("combobox",{name:"Adults"}).inputValue(),"2");
      assert.ok(requests.length>=1);
      assert.ok(requests.every(url=>url.searchParams.get("lat")==="-33.9249"));
      await page.evaluate(()=>window.renderStop({stopName:"Undated stop",latitude:null,longitude:null,checkIn:null,checkOut:null,travellers:2,currency:"GBP"}));
      await page.getByText(/needs a mapped stop/).waitFor();
      assert.equal(await show.count(),0);
      eligible=false;
      await page.reload();
      await page.getByText("Other stay options").waitFor();
      assert.equal(await show.count(),0);
      assert.deepEqual(errors,[]);
      console.log(`${width}px fixture: iframe ${rect.width} × ${rect.height}, ${first.searchParams.get("viewmode")}; consent, hide, traveller, context change and unavailable/denied states passed`);
      await page.close();
    }
  } finally { await browser.close(); }
});
