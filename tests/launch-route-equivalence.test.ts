import assert from "node:assert/strict";
import test from "node:test";
import { generateRouteCandidates } from "../lib/easyt/route-candidates.ts";
import { scoreRouteCandidates } from "../lib/easyt/route-scoring.ts";
import { publicRouteDetailFor } from "../lib/easyt/public-route.ts";
import { routePlannerPayload } from "../lib/easyt/public-route-handoff.ts";
import { assessRouteIntelligence, ROUTE_BACKTRACKING_REASON_PREFIX } from "../lib/easyt/planner.ts";
import { routeConstraintsFromStructuredTripBrief, routeScoringPreferencesFromStructuredBrief } from "../lib/easyt/structured-trip-brief.ts";
const origin={name:"Origin",coordinates:[0,0] as [number,number]};
const stops=[{id:"c",name:"C",country:"Testland",coordinates:[3,0] as [number,number]},{id:"a",name:"A",country:"Testland",coordinates:[1,0] as [number,number]},{id:"b",name:"B",country:"Testland",coordinates:[2,0] as [number,number]}];
const estimate=(from:any,to:any)=>({mode:"train" as const,durationMinutes:Math.abs(to.coordinates[0]-from.coordinates[0])*100,distanceKm:Math.abs(to.coordinates[0]-from.coordinates[0])*100,confidence:"high" as const,label:"Synthetic",note:"Estimate"});
test("a shorter journey ending elsewhere cannot create a backtracking penalty",()=>{
 const all=generateRouteCandidates({origin,stops,estimateLeg:estimate}).candidates;
 const original=all.find(c=>c.metadata.matchesOriginalOrder)!;
 const elsewhere=all.find(c=>c.stops.map(s=>s.id).join() === "a,b,c")!;
 const r=scoreRouteCandidates({origin,candidates:[original,elsewhere],estimateLeg:estimate});
 assert.equal(r.rankedCandidates.find(c=>c.matchesOriginalOrder)?.penalties.some(p=>p.code === "unnecessary-backtracking"),false);
});
test("genuine same-finish geographic backtracking remains penalized",()=>{
 const candidates=generateRouteCandidates({origin,stops,estimateLeg:estimate,constraints:{fixedEndStopId:"b"}}).candidates;
 const r=scoreRouteCandidates({origin,candidates,estimateLeg:estimate});
 assert.equal(r.rankedCandidates.find(c=>c.matchesOriginalOrder)?.penalties.some(p=>p.code === "unnecessary-backtracking"),true);
});
test("an explicit terminal endpoint keeps different last overnight stops comparable",()=>{
 const end={id:"terminal",name:"Terminal",country:"Testland",coordinates:[4,0] as [number,number]};
 const all=generateRouteCandidates({origin,stops,estimateLeg:estimate}).candidates;
 const r=scoreRouteCandidates({origin,end,candidates:all,estimateLeg:estimate});
 assert.equal(r.rankedCandidates.find(c=>c.matchesOriginalOrder)?.penalties.some(p=>p.code === "unnecessary-backtracking"),true);
});
test("Japan Korea remains an optional estimated alternative without a false geographic warning or changed intent",()=>{
 const detail=publicRouteDetailFor("japan-south-korea")!;
 const p=routePlannerPayload(detail.planDraft,new Date("2026-11-03T12:00:00Z"));
 const before=JSON.stringify(p);
 const constraints=routeConstraintsFromStructuredTripBrief(p.structuredBrief,p.destinations.map(s=>s.id));
 const r=assessRouteIntelligence({origin:{name:p.origin,coordinates:p.originCoordinates},stops:p.destinations,picks:{},availableDays:detail.planDraft.durationDays,constraints,scoringPreferences:routeScoringPreferencesFromStructuredBrief(p.structuredBrief)}).route;
 assert.equal(r.reasons.some(x=>x.startsWith(ROUTE_BACKTRACKING_REASON_PREFIX)),false);
 assert.equal(r.scoring?.rankedCandidates.find(c=>c.matchesOriginalOrder)?.penalties.some(p=>p.code === "unnecessary-backtracking"),false);
 assert.match([...r.reasons,...r.tradeoffs].join(" "),/finish.*Seoul.*Busan/i);
 assert.match(r.summary,/estimated alternative/i);
 assert.match(r.tradeoffs.join(" "),/schedules.*not.*verified/i);
 assert.equal(constraints.fixedEndStopId,undefined);assert.equal(JSON.stringify(p),before);
});

test("without a fixed origin, changing the start is also a different journey",()=>{
 const extra={id:"d",name:"D",country:"Testland",coordinates:[4,0] as [number,number]};
 const route=[stops[0],stops[1],extra,stops[2]];
 const all=generateRouteCandidates({origin:{name:""},stops:route,estimateLeg:estimate}).candidates;
 const selected=all.filter(c=>["c,a,d,b","a,c,d,b"].includes(c.stops.map(s=>s.id).join()));
 const r=scoreRouteCandidates({origin:{name:""},candidates:selected,estimateLeg:estimate});
 assert.equal(r.rankedCandidates.find(c=>c.matchesOriginalOrder)?.penalties.some(p=>p.code==="unnecessary-backtracking"),false);
});

test("an optional new starting city is not a corrective backtracking claim",()=>{
 const cities=[{id:"osaka",name:"Osaka",country:"Japan",coordinates:[135.5023,34.6937] as [number,number]},{id:"kanazawa",name:"Kanazawa",country:"Japan",coordinates:[136.6562,36.5613] as [number,number]},{id:"kyoto",name:"Kyoto",country:"Japan",coordinates:[135.7681,35.0116] as [number,number]},{id:"takayama",name:"Takayama",country:"Japan",coordinates:[137.2531,36.146] as [number,number]},{id:"tokyo",name:"Tokyo",country:"Japan",coordinates:[139.6917,35.6895] as [number,number]}];
 const r=assessRouteIntelligence({origin:{name:""},stops:cities,picks:{},availableDays:20}).route;
 assert.equal(r.state,"recommendation");
 assert.notEqual(r.recommendedStopIds[0],r.currentStopIds[0]);
 assert.equal(r.reasons.some(x=>x.startsWith(ROUTE_BACKTRACKING_REASON_PREFIX)),false);
 assert.match(r.tradeoffs.join(" "),/starts in/);
});
