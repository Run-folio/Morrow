import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import test from "node:test";
import { build } from "esbuild";
import { chromium } from "playwright";
import { buildTripReadiness, defaultTravelReadinessProfile } from "../lib/easyt/travel-readiness.ts";
import { travelReadinessStorageKey } from "../lib/easyt/private-browser-context.ts";

test("fresh and returning browsers request destination guidance without touching saved passport details", {skip:process.env.MORROVIA_OVERVIEW_BROWSER_TESTS !== "1"}, async () => {
  const bundle = await build({
    stdin: { resolveDir: process.cwd(), loader: "tsx", contents: `
      import React from "react";
      import {createRoot} from "react-dom/client";
      import {useTripPrepReadiness} from "./components/easyt/use-trip-prep-readiness";
      import {deriveOverviewPracticalTasks} from "./lib/easyt/trip-prep";
      import {tourTripFixture} from "./components/easyt/storybook/tour-trip.fixture";
      const trip = {...tourTripFixture, brief: {...tourTripFixture.brief, checklist: window.checklist}};
      function Probe() {
        const readiness = useTripPrepReadiness({trip});
        const topics = deriveOverviewPracticalTasks({trip, tasks:readiness.tasks}).map(t=>t.id);
        return <pre>{readiness.providersAvailable ? JSON.stringify({topics, tasks:readiness.tasks, checklist:trip.brief.checklist}) : ""}</pre>;
      }
      createRoot(document.body).render(<Probe/>);
    ` }, bundle: true, write: false, define: { "process.env.NODE_ENV": '"production"', "process.env": "{}" },
  });
  const executablePath = process.env.CHROMIUM_PATH || (existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined);
  const browser = await chromium.launch({executablePath});
  try {
    for (const returning of [false, true]) {
      const page = await browser.newPage();
      const key = travelReadinessStorageKey(null);
      const profile = JSON.stringify({nationalities:["Example nationality"], residenceCountry:"Peru", passportExpiryMonth:"2031-07"});
      const checklist = returning ? [{id:"my-visa",label:"Print visa approval",complete:true},{id:"overview-prep-passport",label:"Review passport",complete:false}] : [];
      const requests = [];
      await page.route("https://overview.test/**", async route => {
        const path = new URL(route.request().url()).pathname;
        if (path === "/") return route.fulfill({contentType:"text/html",body:"<!doctype html><body></body>"});
        const body = route.request().postDataJSON();
        requests.push({path,body});
        if(path === "/api/journey-readiness") return route.fulfill({json:{cards:buildTripReadiness({...body,profile:defaultTravelReadinessProfile})}});
        return route.fulfill({json:{actions:[]}});
      });
      await page.goto("https://overview.test/");
      await page.evaluate(({key,profile,returning,checklist})=>{
        if(returning) localStorage.setItem(key,profile);
        window.checklist = checklist;
        window.profileAccess = [];
        for(const method of ["getItem","setItem","removeItem","clear"]){
          const original=Storage.prototype[method];
          Storage.prototype[method]=function(...args){
            if(args[0]===key || method==="clear")window.profileAccess.push(method);
            return original.apply(this,args);
          };
        }
      },{key,profile,returning,checklist});
      await page.addScriptTag({content:bundle.outputFiles[0].text});
      await page.waitForFunction(()=>document.querySelector("pre")?.textContent);
      const output = JSON.parse(await page.locator("pre").innerText());
      assert.deepEqual(output.topics,["insurance","connectivity","activity"]);
      assert.deepEqual(output.checklist,checklist);
      assert.equal(output.tasks.filter(t=>t.id==="traveller-passport").length,0);
      if(returning) assert.ok(output.tasks.some(t=>t.id==="checklist-my-visa" && t.status==="complete"));
      assert.deepEqual(await page.evaluate(()=>window.profileAccess),[]);
      assert.equal(await page.evaluate(key=>localStorage.getItem(key),key),returning?profile:null);
      const request = requests.find(r=>r.path==="/api/journey-readiness");
      assert.deepEqual(Object.keys(request.body).sort(),["avoidDriving","countries","language","startDate","surface"]);
      assert.doesNotMatch(JSON.stringify(requests),/Example nationality|2031-07|passportExpiryMonth|nationalities|residenceCountry/);
      const cards = buildTripReadiness({...request.body,profile:defaultTravelReadinessProfile});
      assert.ok(["esim","insurance"].every(id=>cards.some(c=>c.id===id)));
      await page.close();
    }
  } finally {await browser.close();}
});
