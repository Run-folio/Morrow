import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import savedFixtures from "./fixtures/curated-identity-existing-trips.json" with { type: "json" };
import reviewedFixtures from "./fixtures/curated-identity-reviewed-drafts.json" with { type: "json" };
import { publicRouteDetailFor, publicRoutePublishedFamilies, type PublicRoutePlanDraft } from "../lib/easyt/public-route.ts";
import { routePlannerPayload } from "../lib/easyt/public-route-handoff.ts";
import { canonicalPlaceFactsMatch } from "../lib/easyt/place-intelligence.ts";
import { findCatalogPlaceById } from "../lib/easyt/place-catalog.ts";
import { reviewedRouteStopSatisfiesMention } from "../lib/easyt/builder-clarification.ts";
import { originPlaceFromBrief, normalizeJourneyEnd } from "../lib/easyt/journey-endpoints.ts";
import { readTripDocument } from "../lib/easyt/trip-document.ts";
import { canonicalTripForOwner } from "../lib/easyt/trip-promotion.ts";
import { resolveTripTransferJourneys } from "../lib/easyt/multimodal-transfer-resolution.ts";
import { EASYT_ACTIVE_TRIP_KEY, loadActiveTripFromStorage, type EasyTBrowserStorage } from "../lib/easyt/storage.ts";
import type { EasyTTrip } from "../lib/easyt/trip.ts";

const json = <T>(value:T):T => JSON.parse(JSON.stringify(value));
class MemoryStorage implements EasyTBrowserStorage {
  values=new Map<string,string>();writes=0;
  get length(){return this.values.size;}
  key(index:number){return [...this.values.keys()][index]??null;}
  getItem(key:string){return this.values.get(key)??null;}
  setItem(key:string,value:string){this.writes++;this.values.set(key,value);}
  removeItem(key:string){this.writes++;this.values.delete(key);}
}

for(const fixture of savedFixtures) {
  test(`existing ${fixture.brief.sourceRouteKey} reads retain identity, authored content and recovery bytes`,()=>{
    const original=json(fixture) as unknown as EasyTTrip;
    const input=json(original);const decoded=readTripDocument(input);assert.equal(decoded.kind,"readable");
    if(decoded.kind!=="readable")throw Error("Fixture must remain readable");
    assert.deepEqual(json(decoded.trip),original);
    assert.deepEqual(input,original,"read must not mutate incoming recovery data");
    const storage=new MemoryStorage();storage.values.set(EASYT_ACTIVE_TRIP_KEY,JSON.stringify(original));
    const bytes=[...storage.values];
    assert.deepEqual(json(loadActiveTripFromStorage(storage,original.ownerId)),original);
    assert.equal(storage.writes,0);assert.deepEqual([...storage.values],bytes);
  });

  test(`existing ${fixture.brief.sourceRouteKey} save preparation preserves authored plans and bookings without inference`,async()=>{
    const original=json(fixture) as unknown as EasyTTrip;let calls=0;
    const transferred=await resolveTripTransferJourneys(original,{provider:{provider:"openrouteservice",async route(){calls++;throw Error("No provider call permitted for unqualified saved endpoints");}}});
    assert.equal(calls,0);assert.deepEqual(transferred,original);
    const saved=json(canonicalTripForOwner(original.ownerId!,transferred));assert.deepEqual(saved,original);
    const edited={...original,title:"Our deliberately renamed trip",brief:{...original.brief,customTitle:"Our deliberately renamed trip"}};
    assert.deepEqual(json(canonicalTripForOwner(original.ownerId!,edited)),edited,"an unrelated title edit must not repair geography or overwrite retained content");
  });

  test(`existing ${fixture.brief.sourceRouteKey} Builder restoration and reviewed-draft comparison preserve saved identities`,()=>{
    const saved=json(fixture) as unknown as EasyTTrip;const before=json(saved);
    const source=readFileSync(new URL("../app/journey/new/trip-builder.tsx",import.meta.url),"utf8");
    const callback=source.slice(source.indexOf("  const applyAcceptedBuilderDocument ="),source.indexOf("    setStartDate(saved.startDate);"))+"\n};return applyAcceptedBuilderDocument;";
    let restoredStops:unknown;
    const target:Record<PropertyKey,unknown>={originPlaceFromBrief,normalizeJourneyEnd,hydratedCanonicalTripRef:{current:null},builderEditSessionRef:{current:null},setStops:(value:unknown)=>{restoredStops=value;}};
    const scope=new Proxy(target,{has:(_value,key)=>key!=="undefined",get:(value,key)=>key===Symbol.unscopables?undefined:value[key]??(globalThis as unknown as Record<PropertyKey,unknown>)[key]??(()=>{})});
    const ts=createRequire(import.meta.url)("typescript") as typeof import("typescript");
    new Function("scope",`with(scope){${ts.transpileModule(callback,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText}}`)(scope)(saved);
    const expected=saved.stops.map(({id,name,country,canonicalPlaceId,countryCode,region,providerId,longitude,latitude,geographicBinding})=>({id,name,country,canonicalPlaceId,countryCode,region,providerId,coordinates:longitude!==null&&latitude!==null?[longitude,latitude] as [number,number]:undefined,...(geographicBinding===undefined?{}:{geographicBinding})}));
    assert.deepEqual(restoredStops,expected);assert.deepEqual(saved,before);
    const key=fixture.brief.sourceRouteKey as keyof typeof reviewedFixtures;
    const oldDraft=reviewedFixtures[key] as unknown as PublicRoutePlanDraft;const newDraft=publicRouteDetailFor(key)!.planDraft;
    for(const mention of saved.brief.structuredBrief?.placeMentions??[]) {
      const input={mention,brief:saved.brief.structuredBrief!,stops:expected,sourceRouteKey:key,curatedRoute:saved.brief.curatedRoute};
      assert.equal(reviewedRouteStopSatisfiesMention({...input,reviewedDraft:newDraft}),reviewedRouteStopSatisfiesMention({...input,reviewedDraft:oldDraft}),mention.sourceText);
    }
  });
}

test("the frozen legacy fixture retains the old Lagos mismatch and explicit saved protections",()=>{
  const saved=savedFixtures.find(t=>t.brief.sourceRouteKey==="portugal-atlantic")!;
  assert.equal(saved.stops.find(s=>s.name==="Lagos")!.canonicalPlaceId,"reference:geonames:2332459");
  for(const trip of savedFixtures) {
    assert.ok(Object.keys(trip.brief.decisionSelections.transportByLeg).length);
    assert.ok(trip.brief.scheduleLocks.stopIds.length);
    assert.ok(Object.keys(trip.brief.scheduleLocks.arrivalDates).length);
  }
});

test("Nigeria's legitimate catalogue identity remains intact",()=>{
  const lagos=findCatalogPlaceById("reference:geonames:2332459")!;
  assert.deepEqual(lagos.parentCountries,["Nigeria"]);assert.deepEqual(lagos.coordinates,[3.39467,6.45407]);
});

test("new Portugal handoffs never assign the Nigerian Lagos identity to Portuguese coordinates",()=>{
  const detail=publicRouteDetailFor("portugal-atlantic")!;
  const stop=detail.planDraft.destinations.find(s=>s.name==="Lagos")!;
  assert.equal(stop.country,"Portugal");assert.deepEqual(stop.coordinates,[-8.6742,37.1028]);
  assert.ok(!stop.canonicalPlaceId||canonicalPlaceFactsMatch(stop.canonicalPlaceId,{country:stop.country,coordinates:stop.coordinates}));
  const destination=detail.planDraft.structuredBrief.destinations.find(d=>d.id===stop.id)!;
  assert.deepEqual(destination.parentCountries,["Portugal"]);
  assert.notEqual(destination.canonicalPlaceId,"reference:geonames:2332459");
  if(!stop.canonicalPlaceId)assert.equal(destination.resolutionStatus,"unresolved");
  const payload=routePlannerPayload(detail.planDraft,new Date(2026,4,10,12));
  assert.equal(payload.destinations.find(s=>s.id===stop.id)?.canonicalPlaceId,stop.canonicalPlaceId);
  assert.ok(!JSON.stringify(payload.structuredBrief).includes("reference:geonames:2332459"));
});

test("new public draft canonical identities stay compatible with the route's known country and coordinates",()=>{
  for(const route of publicRoutePublishedFamilies()) {
    const draft=publicRouteDetailFor(route.key)!.planDraft;
    for(const stop of draft.destinations)if(stop.canonicalPlaceId)assert.ok(canonicalPlaceFactsMatch(stop.canonicalPlaceId,{country:stop.country,coordinates:stop.coordinates}),`${route.key}: ${stop.name}`);
  }
});

test("Comporta and Sacred Valley retain their exact route facts without fabricated settlement approval",()=>{
  const portugal=publicRouteDetailFor("portugal-atlantic")!;
  const comporta=portugal.planDraft.destinations.find(s=>s.name==="Comporta")!;
  assert.deepEqual(comporta.coordinates,[-8.79,38.38]);assert.equal(comporta.country,"Portugal");assert.equal(comporta.canonicalPlaceId,undefined);
  const andes=publicRouteDetailFor("andean-highlands")!;
  const valley=andes.planDraft.destinations.find(s=>s.name==="Sacred Valley")!;
  assert.deepEqual(valley.coordinates,[-72.115,-13.308]);assert.equal(valley.canonicalPlaceId,"sacred-valley");
  assert.equal(findCatalogPlaceById(valley.canonicalPlaceId!)?.routability,"needs_base_selection");
  assert.deepEqual(andes.stops.map(s=>s.name),["Cusco","Sacred Valley","Arequipa"]);
  assert.deepEqual(andes.stops.map(s=>s.nights),[3,3,2]);
});
