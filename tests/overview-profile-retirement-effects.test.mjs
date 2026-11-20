import assert from "node:assert/strict";
import { runInNewContext } from "node:vm";
import test from "node:test";
import { build } from "esbuild";
import { buildTripReadiness, defaultTravelReadinessProfile } from "../lib/easyt/travel-readiness.ts";

test("Overview mount effects preserve legacy storage and issue destination-only requests for fresh and returning sessions",async()=>{
  // Run production effects with injected storage and fetch; no external services are contacted.
  const {outputFiles}=await build({stdin:{resolveDir:process.cwd(),contents:`
    import {useTripPrepReadiness} from "./components/easyt/use-trip-prep-readiness";
    import {tourTripFixture} from "./components/easyt/storybook/tour-trip.fixture";
    import {deriveOverviewReadinessCategories} from "./lib/easyt/trip-overview-readiness";
    import {deriveOverviewPracticalTasks} from "./lib/easyt/trip-prep";
    const trip={...tourTripFixture,brief:{...tourTripFixture.brief,checklist}};
    const {tasks}=useTripPrepReadiness({trip});
    globalThis.result={tasks,checklist:trip.brief.checklist,topics:deriveOverviewPracticalTasks({trip,tasks}),categories:deriveOverviewReadinessCategories({trip,prepTasks:tasks,providerStatus:"available"})};
  `},bundle:true,write:false,define:{"process.env":"{}"},plugins:[{
    name:"mount-effects",setup(build){
      build.onResolve({filter:/^react$/},()=>({path:"react",namespace:"test"}));
      build.onLoad({filter:/.*/,namespace:"test"},()=>({contents:`
        export const useState=value=>[typeof value==="function"?value():value,()=>{}];
        export const useEffect=effect=>effect();
        export const useMemo=fn=>fn();
        export const useCallback=fn=>fn;
      `}));
    },
  }]});
  for(const returning of [false,true]){
    const requests=[],access=[];
    const profile=returning?JSON.stringify({residenceCountry:"Peru",nationalities:["Legacy nationality"],passportExpiryMonth:"2031-07"}):null;
    const checklist=returning?[{id:"my-visa",label:"Print visa approval",complete:true},{id:"overview-prep-passport",label:"Review passport",complete:false}]:[];
    const ctx={checklist,AbortController,Date,URL,URLSearchParams,console,window:{localStorage:{getItem(){access.push("get");return profile},setItem(){access.push("set")},removeItem(){access.push("remove")}}},fetch:async(path,init)=>{
      requests.push([path,JSON.parse(init.body)]);
      return {ok:true,json:async()=>({actions:[],cards:[]})};
    }};
    runInNewContext(outputFiles[0].text,ctx);
    assert.deepEqual(access,[]);
    const body=requests.find(([path])=>path==="/api/journey-readiness")[1];
    assert.deepEqual(Object.keys(body).sort(),["avoidDriving","countries","language","startDate","surface"]);
    assert.doesNotMatch(JSON.stringify(requests),/passportExpiryMonth|nationalities|residenceCountry|Legacy nationality|2031-07/);
    assert.deepEqual(ctx.result.checklist,checklist);
    const {topics,tasks,categories}=JSON.parse(JSON.stringify(ctx.result));
    assert.deepEqual(topics.map(t=>t.id),["insurance","connectivity","activity"]);
    assert.ok(!tasks.some(t=>["traveller-passport","checklist-overview-prep-passport"].includes(t.id)));
    assert.equal(tasks.some(t=>t.id==="checklist-my-visa" && t.status==="complete"),returning);
    assert.equal(categories.find(c=>c.id==="checklist").percent,returning?100:null);
    const cards=buildTripReadiness({...body,profile:defaultTravelReadinessProfile});
    assert.ok(["esim","insurance"].every(id=>cards.some(c=>c.id===id)));
  }
});
