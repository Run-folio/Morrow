import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { runInThisContext } from "node:vm";
import { build } from "esbuild";
import { chromium } from "playwright";

const root = new URL("../", import.meta.url).pathname;
const appOrigin = "https://staging.morrovia.com";
const capture = process.env.MORROVIA_STAY22_TEST_CAPTURE_DIR;

test("server rendering keeps normal stays visible outside the canonical staging build", async () => {
  const require = createRequire(import.meta.url);
  for (const [origin, expected] of [
    ["https://morrovia.com", "Normal stays"],
    ["https://staging.morrovia.com", "Checking eligibility"],
  ]) {
    const {outputFiles} = await build({
      absWorkingDir: root, bundle: true, write: false, platform: "node", packages: "external",
      format: "cjs", jsx: "automatic", loader: {".module.css": "empty"},
      define: {"process.env.NEXT_PUBLIC_APP_URL": JSON.stringify(origin)},
      stdin: {loader: "tsx", resolveDir: root, contents: `
        import {renderToString} from "react-dom/server";
        import {useStay22TesterAffiliateId} from "./components/easyt/stay22-tester-preview";
        function Eligibility() {
          return <p>{useStay22TesterAffiliateId() === undefined ? "Checking eligibility" : "Normal stays"}</p>;
        }
        export const markup=renderToString(<Eligibility/>);
      `},
    });
    const module = {exports: {}};
    runInThisContext(`(function(require, module, exports) {${outputFiles[0].text}\n})`)(require, module, module.exports);
    assert.equal(module.exports.markup, `<p>${expected}</p>`);
  }
});

// Real component + controls, both the same-origin gate and provider are intercepted.
// No live trips, network requests, credentials or affiliate visits are used.
test("inline Stay22 shares only the selected search, automatically after both consent choices", {timeout: 90_000}, async () => {
  const {outputFiles} = await build({
    absWorkingDir: root, bundle: true, write: false, outdir: "/tmp/stay22-test-build",
    entryNames: "app", jsx: "automatic", banner: {js: "const process = { env: {} };"}, define: {"process.env.NODE_ENV": '"production"'},
    stdin: {loader: "tsx", resolveDir: root, contents: `
      import {createRoot} from "react-dom/client";
      import Search, {useStay22TesterAffiliateId} from "./components/easyt/stay22-tester-preview";
      import {createPrivacyConsentRecord,PRIVACY_CONSENT_STORAGE_KEY as key,PRIVACY_CONSENT_CHANGE_EVENT as event} from "./lib/privacy-consent";
      import "./app/journey/journey-design.css";
      const root=createRoot(document.getElementById("root"));
      const cape={stopName:"Cape Town", latitude:-33.9249, longitude:18.4241, checkIn:"2090-12-02", checkOut:"2090-12-07", travellers:3, currency:"EUR"};
      window.consent=(analytics,affiliateTracking)=>{localStorage.setItem(key,JSON.stringify(createPrivacyConsentRecord({analytics,affiliateTracking})));window.dispatchEvent(new Event(event));};
      function Fixture({props}) {
        const affiliateId=useStay22TesterAffiliateId();
        return <main style={{display:"grid",gridTemplateColumns:"minmax(0,1fr) minmax(0,1fr)",gap:12,margin:"16px auto",maxWidth:1200}}>
        <header style={{gridColumn:"1/-1"}}><h2>{props.stopName}</h2></header>
        {affiliateId ? <Search key={JSON.stringify(props)} {...props} testerAffiliateId={affiliateId}/> : null}
        <article>Other stay options</article></main>;
      }
      window.renderStop=(props=cape)=>root.render(<Fixture props={props}/>);
      window.renderStop();
    `},
  });
  const css = outputFiles.find(f=>f.path.endsWith(".css")).text;
  const js = outputFiles.find(f=>f.path.endsWith(".js")).text;
  const browser = await chromium.launch({executablePath:process.env.MORROVIA_CHROMIUM_EXECUTABLE || undefined});
  try {
    for (const width of [1440,390,430]) {
      const mobile=width<720;
      const page = await browser.newPage({viewport:{width,height:900},hasTouch:mobile,isMobile:mobile,serviceWorkers:"block"});
      const requests=[]; const errors=[];
      page.on("pageerror", error => errors.push(error.message));
      let eligible=true;
      let gateRequests=0;
      await page.route("**/*", async route => {
        const url=new URL(route.request().url());
        if(url.origin==="https://www.stay22.com" && url.pathname==="/embed/gm") {
          requests.push(url);
          return route.fulfill({contentType:"text/html",body:"<p>Test fixture only. Live provider results are not displayed.</p>"});
        }
        if(url.origin!==appOrigin) return route.abort();
        if(url.pathname==="/api/easyt/stay22-tester") {
          gateRequests++;
          return route.fulfill({status:eligible?200:404,json:eligible?{affiliateId:"fixture"}:null});
        }
        if(url.pathname==="/app.css") return route.fulfill({contentType:"text/css",body:css});
        if(url.pathname==="/app.js") return route.fulfill({contentType:"application/javascript",body:js});
        if(url.pathname==="/") return route.fulfill({contentType:"text/html",body:'<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/app.css"><div id="root"></div><script src="/app.js"></script>'});
        return route.abort();
      });
      await page.goto(appOrigin);
      const show=page.getByRole("button",{name:"Show stays"});
      const frame=page.locator("iframe");
      await page.getByRole("heading",{name:"Find accommodation"}).waitFor();
      assert.equal(await show.count(),0);
      for(const partial of [[false,false],[true,false],[false,true]]) {
        await page.evaluate(([a,b])=>window.consent(a,b),partial);
        await page.getByRole("link",{name:/Cookie preferences/}).waitFor();
        assert.equal(await frame.count(),0);
        assert.equal(requests.length,0);
      }
      assert.equal(await page.getByRole("group",{name:"Accommodation view"}).count(),0);
      if(capture) await page.screenshot({path:`${capture}/stay22-inline-${width}-before.png`});
      await page.evaluate(()=>window.consent(true,true));
      await frame.waitFor();
      await page.waitForFunction(()=>document.querySelector("iframe")?.contentWindow!=null);
      const first=new URL(await frame.getAttribute("src"));
      assert.equal(first.searchParams.get("viewmode"),mobile?"map":"all");
      assert.equal(first.searchParams.get("adults"),"3");
      assert.equal(first.searchParams.get("currency"),"EUR");
      assert.equal(first.searchParams.get("maincolor"),"3025ce");
      assert.equal(first.searchParams.get("hideallezbutton"),"true");
      assert.equal(first.searchParams.get("lat"),"-33.9249");
      assert.equal(first.searchParams.get("checkin"),"2090-12-02");
      assert.equal(await frame.getAttribute("referrerpolicy"),"no-referrer");
      const rect=await frame.boundingBox();
      assert.ok(rect.width>=(mobile?320:1100));
      assert.ok(rect.height>=(mobile?440:650));
      assert.equal(await page.getByRole("dialog").count(),0);
      const view=page.getByRole("group",{name:"Accommodation view"});
      if(!mobile) {
        assert.equal(await view.count(),0);
      } else {
        const map=view.getByRole("button",{name:"Map",exact:true});
        const list=view.getByRole("button",{name:"List",exact:true});
        await map.waitFor({timeout:3000});
        assert.equal(await map.getAttribute("aria-pressed"),"true");
        assert.equal(await list.getAttribute("aria-pressed"),"false");
        assert.ok((await list.boundingBox()).height>=44);
        await list.focus();
        await list.press("Enter");
        assert.equal(await list.getAttribute("aria-pressed"),"true");
        assert.equal(await list.evaluate(el=>el===document.activeElement),true);
        const listSearch=new URL(await frame.getAttribute("src"));
        assert.equal(listSearch.searchParams.get("viewmode"),"listview");
        listSearch.searchParams.set("viewmode","map");
        assert.equal(listSearch.href,first.href);
        await map.tap();
        assert.equal(await map.getAttribute("aria-pressed"),"true");
        assert.equal(await frame.getAttribute("src"),first.href);
      }
      if(capture) await page.screenshot({path:`${capture}/stay22-inline-${width}-test-frame.png`});
      await page.getByRole("combobox",{name:"Adults"}).selectOption("4");
      await page.waitForFunction(()=>new URL(document.querySelector("iframe")?.src || location.href).searchParams.get("adults")==="4");
      await page.evaluate(()=>window.consent(false,true));
      await frame.waitFor({state:"detached"});
      await page.evaluate(()=>window.consent(true,true));
      await frame.waitFor();
      assert.equal(await page.getByRole("button",{name:"Hide results"}).count(),0);
      await page.evaluate(()=>window.renderStop({stopName:"Tokyo",latitude:35,longitude:139,checkIn:"2090-12-08",checkOut:"2090-12-10",travellers:2,currency:"GBP"}));
      await page.waitForFunction(()=>new URL(document.querySelector("iframe")?.src || location.href).searchParams.get("lat")==="35");
      assert.equal(await page.getByRole("combobox",{name:"Adults"}).inputValue(),"2");
      const tokyo=new URL(await frame.getAttribute("src"));
      assert.equal(tokyo.searchParams.get("checkin"),"2090-12-08");
      assert.equal(tokyo.searchParams.get("adults"),"2");
      assert.equal(tokyo.searchParams.get("currency"),"GBP");
      assert.ok(requests.length>=1);
      assert.ok(requests.every(url=>["-33.9249","35"].includes(url.searchParams.get("lat"))));
      await page.evaluate(()=>window.renderStop({stopName:"Undated stop",latitude:null,longitude:null,checkIn:null,checkOut:null,travellers:2,currency:"GBP"}));
      await page.getByText(/needs a mapped stop/).waitFor();
      assert.equal(await show.count(),0);
      assert.equal(await frame.count(),0);
      assert.equal(gateRequests,1);
      eligible=false;
      const denied=page.waitForResponse(response=>new URL(response.url()).pathname==="/api/easyt/stay22-tester" && response.status()===404);
      const beforeDenied=requests.length;
      await page.reload();
      await denied;
      await page.getByText("Other stay options").waitFor();
      assert.equal(await show.count(),0);
      assert.equal(await frame.count(),0);
      assert.equal(requests.length,beforeDenied);
      assert.deepEqual(errors,[]);
      console.log(`${width}px fixture: iframe ${rect.width} × ${rect.height}, ${first.searchParams.get("viewmode")}; automatic load, consent, traveller, context change and unavailable/denied states passed`);
      await page.close();
    }
  } finally { await browser.close(); }
});

test("only an explicit manual submission records the booked property; an external handoff does not", async()=>{
  const {outputFiles}=await build({
    absWorkingDir:root,bundle:true,write:false,format:"iife",jsx:"automatic",outdir:"/tmp/stay22-booking-fixture-build",entryNames:"app",
    banner:{js:"const process={env:{}};"},define:{"process.env.NODE_ENV":'"production"'},
    plugins:[{name:"mock-canonical-mutation",setup(builder){
      builder.onResolve({filter:/^\.\/trip-shell-client$/},()=>({path:"mutation",namespace:"receipt-fixture"}));
      builder.onLoad({filter:/.*/,namespace:"receipt-fixture"},()=>({contents:"export const useTripShellMutation=()=>window.mutation;"}));
    }}],
    stdin:{loader:"tsx",resolveDir:root,contents:`
      import {createRoot} from "react-dom/client";
      import {useState} from "react";
      import BookedStay from "./components/easyt/stay22-booked-stay";
      import {canonicalRouteFixture} from "./tests/fixtures/batch14-route-documents";
      import {prepareTripDocumentForWrite,requireReadableTripDocument} from "./lib/easyt/trip-document";
      function App(){
        const [trip,setTrip]=useState(()=>{const cached=localStorage.getItem("trip");if(cached)return requireReadableTripDocument(JSON.parse(cached)); const t=canonicalRouteFixture();t.brief.bookings=[];return t;});
        const stop=trip.stops.find(s=>s.nights);
        window.mutation={trip,mutationReady:true,hasPendingSaves:()=>false,saveState:"saved",error:"",mutateTrip:async apply=>{
          const next=apply(trip);if(next===trip)return false;
          const saved=prepareTripDocumentForWrite(next);localStorage.setItem("trip",JSON.stringify(saved));setTrip(saved);return true;
        }};
        return <><a href="/supplier-fixture" target="_blank">External property (fixture)</a><BookedStay trip={trip} stop={stop}/></>;
      }
      createRoot(document.getElementById("root")).render(<App/>);`},
  });
  const browser=await chromium.launch({executablePath:process.env.MORROVIA_CHROMIUM_EXECUTABLE||undefined});
  try{
    const ctx=await browser.newContext({serviceWorkers:"block"});
    await ctx.route("**/*",route=>{
      const u=new URL(route.request().url());
      if(u.origin!==appOrigin)return route.abort();
      if(u.pathname==="/app.js")return route.fulfill({contentType:"application/javascript",body:outputFiles.find(f=>f.path.endsWith(".js")).text});
      return route.fulfill({contentType:"text/html",body:u.pathname==="/supplier-fixture"?"<p>Fixture only</p>":'<div id="root"></div><script src="/app.js"></script>'});
    });
    const p=await ctx.newPage();
    await p.goto(appOrigin);
    const popup=ctx.waitForEvent("page");await p.getByRole("link",{name:"External property (fixture)"}).click();await (await popup).close();
    assert.equal(await p.evaluate(()=>localStorage.getItem("trip")),null);
    await p.getByText(/^Add a booked stay to /).click();
    const save=p.getByRole("button",{name:"Save booked stay"});
    assert.equal(await save.isDisabled(),true);
    await p.getByLabel("Property name").fill("Blue Inn");
    assert.equal(await p.evaluate(()=>localStorage.getItem("trip")),null);
    await save.click();
    await p.getByText("Saved stay: Blue Inn").waitFor();
    await p.reload();
    await p.getByText("Saved stay: Blue Inn").waitFor();
    assert.equal(await p.getByLabel("Property name").count(),0);
    const bookings=await p.evaluate(()=>JSON.parse(localStorage.getItem("trip")).brief.bookings);
    assert.equal(bookings.length,1);
    assert.equal(bookings[0].title,"Blue Inn");assert.equal(bookings[0].confirmation,null);
  }finally{await browser.close();}
});
