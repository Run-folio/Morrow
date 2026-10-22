import {emptyServerMarkerPlugin} from './helpers/server-marker.mjs';
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import test from "node:test";

import { createOpenWorldPlaceProvider } from "../lib/easyt/open-world-place.server.ts";
import { placeSuggestionRequiresBaseSelection } from "../lib/easyt/place-intelligence.ts";
import { lookupReviewedPlaceSearchAlias } from "../lib/easyt/place-search-aliases.ts";
import { autocompleteRender } from "./helpers/autocomplete-component.mjs";

const require = createRequire(import.meta.url);
const { build } = require("esbuild");

const fixtures = JSON.parse(readFileSync(new URL("./fixtures/photon-place-search/responses.json", import.meta.url), "utf8")) as Record<string, unknown>;

function photonProvider(calls: string[]) {
  const fetchFixture: typeof fetch = async (input) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    const query = url.searchParams.get("q") ?? "";
    calls.push(query);
    const key = query === "Hirayu Onsen" ? "Hirayu_Onsen" : query === "Fanjing Mountain" ? "Fanjing_Mountain"
      : query === "Fangjin mountain" ? "Fangjin_mountain" : query;
    return new Response(JSON.stringify(fixtures[key] ?? { type: "FeatureCollection", features: [] }), {
      status: 200, headers: { "Content-Type": "application/json" },
    });
  };
  return createOpenWorldPlaceProvider({ fetchImpl: fetchFixture, cache: new Map(), sourceTimeoutMs: 500 });
}

test("Hirayu completed lookup uses the reviewed native-name variant and selects the locality, not POIs", async () => {
  const calls: string[] = [];
  const candidates = await photonProvider(calls).lookup("Hirayu", { travelIntent: "route-stop" });
  assert.deepEqual(calls, ["Hirayu", "平湯温泉"]);
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0]?.providerId, "photon:N:2481035449");
  assert.equal(candidates[0]?.canonicalName, "Hirayu Onsen");
  assert.equal(candidates[0]?.placeType, "town");
  assert.equal(candidates[0]?.routability, "direct_destination");
  assert.deepEqual(candidates[0]?.parentCountries, ["Japan"]);
  assert.deepEqual(candidates[0]?.coordinates, [137.5536701, 36.1914892]);
  assert.ok(candidates[0]?.aliases?.includes("平湯温泉"));
});

test("Fangjin Mountain retrieves the scenic area identity and leaves the summit as a separate feature", async () => {
  const calls: string[] = [];
  const candidates = await photonProvider(calls).lookup("Fangjin mountain", { travelIntent: "route-stop" });
  assert.deepEqual(calls, ["Fangjin mountain", "Fanjingshan"]);
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0]?.providerId, "photon:W:626892766");
  assert.equal(candidates[0]?.canonicalName, "Fanjingshan");
  assert.equal(candidates[0]?.placeType, "natural_area");
  assert.equal(candidates[0]?.routability, "needs_base_selection");
  assert.deepEqual(candidates[0]?.parentCountries, ["China"]);
  assert.deepEqual(candidates[0]?.coordinates, [108.7254986, 27.8904161]);
  assert.equal(candidates.some(candidate => candidate.providerId.includes("699700351")), false);
  assert.equal(candidates.some(candidate => candidate.providerId.includes("1346205350")), false);
});

test("Fanjingshan duplicate feature tags converge on one OSM identity without coordinate merging", async () => {
  const calls: string[] = [];
  const candidates = await photonProvider(calls).lookup("Fanjingshan", { travelIntent: "route-stop" });
  assert.deepEqual(calls, ["Fanjingshan"]);
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0]?.providerId, "photon:W:626892766");
  assert.equal(candidates[0]?.canonicalName, "Fanjingshan");
  assert.equal(candidates[0]?.placeType, "natural_area");
  assert.equal(candidates[0]?.routability, "needs_base_selection");
});

test("an unavailable alias variant does not discard useful original-query candidates", async () => {
  const calls: string[] = [];
  let failures=0;
  const provider = createOpenWorldPlaceProvider({
    cache: new Map(), sourceTimeoutMs: 500, onSourceFailure:()=>{failures++;},
    sources: [{ id: "photon", label: "Photon fixture", search: async (phrase) => {
      calls.push(phrase);
      if (phrase === "Hirayu") return [{
        providerId: "N:4459168397", canonicalName: "Hirayu", parentCountries: ["Japan"],
        coordinates: [137.55, 36.18], placeType: "town", routability: "direct_destination", matchQuality: "exact",
      }];
      throw new Error("alternate query unavailable");
    } }],
  });
  const candidates = await provider.lookup("Hirayu", { travelIntent: "route-stop" });
  assert.deepEqual(calls, ["Hirayu", "平湯温泉"]);
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0]?.canonicalName, "Hirayu");
  assert.equal(failures,1,"alias failure must suppress AI even when original candidates survive");
});

for (const [reason, overrides] of [
  ["wrong feature type", { osm_key: "natural", osm_value: "peak" }],
  ["different provider identity", { osm_id: 999999 }],
] as const) {
  test(`reviewed Hirayu alias rejects a same-name feature with ${reason}`, async () => {
    const native = (fixtures["平湯温泉"] as { features: Array<{ properties: Record<string, unknown> }> }).features[0]!;
    const provider = createOpenWorldPlaceProvider({
      cache: new Map(), sourceTimeoutMs: 500,
      fetchImpl: async input => {
        const query = new URL(String(input)).searchParams.get("q");
        return new Response(JSON.stringify({ type: "FeatureCollection", features: query === "平湯温泉"
          ? [{ ...native, properties: { ...native.properties, ...overrides } }] : [] }));
      },
    });
    assert.deepEqual(await provider.lookup("Hirayu", { travelIntent: "route-stop" }), []);
  });
}

test("a hanging alias variant preserves original candidates and reports the source timeout", async () => {
  const calls: string[] = [];
  let fallbackSignal: AbortSignal | undefined;
  let failures = 0;
  const provider = createOpenWorldPlaceProvider({
    cache: new Map(), sourceTimeoutMs: 20, onSourceFailure: () => { failures += 1; },
    sources: [{ id: "photon", label: "Photon fixture", search: async (phrase, _context, options) => {
      calls.push(phrase);
      if (phrase === "Hirayu") return [{
        providerId: "N:123", canonicalName: "Hirayu other locality", parentCountries: ["Japan"],
        countryCode: "JP", coordinates: [137.5, 36.1], placeType: "town",
        routability: "direct_destination", matchQuality: "exact",
      }];
      fallbackSignal = options?.signal;
      return new Promise(() => {});
    } }],
  });
  const candidates = await provider.lookup("Hirayu", { travelIntent: "route-stop" });
  assert.deepEqual(calls, ["Hirayu", "平湯温泉"]);
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0]?.providerId, "photon:N:123");
  assert.equal(candidates[0]?.canonicalName, "Hirayu other locality");
  assert.equal(fallbackSignal?.aborted, true);
  assert.equal(failures, 1);
});

test("reviewed spelling aliases are explicit, country-scoped and source-attributed", () => {
  const hirayu = lookupReviewedPlaceSearchAlias("Hirayu");
  assert.equal(hirayu?.countryCode, "JP");
  assert.ok(hirayu?.evidence.some(source => source.url === "https://www.japan.travel/en/spot/1263/"));
  const fanjing = lookupReviewedPlaceSearchAlias("Fangjin mountain");
  assert.equal(fanjing?.countryCode, "CN");
  assert.ok(fanjing?.evidence.some(source => source.url === "https://whc.unesco.org/en/list/1559/"));
  assert.equal(lookupReviewedPlaceSearchAlias("Fangjin mountain", "JP"), undefined);
  assert.equal(lookupReviewedPlaceSearchAlias("Fanjing mountain", "JP"), undefined);
  assert.equal(lookupReviewedPlaceSearchAlias("Fanjinshan"), undefined);
});

test("autocomplete stays reference-only and Add Stop submits completed searches for selectable candidates", () => {
  const autocomplete = readFileSync(new URL("../components/easyt/canonical-place-autocomplete.tsx", import.meta.url), "utf8");
  const builder = readFileSync(new URL("../app/journey/new/trip-builder.tsx", import.meta.url), "utf8");
  const geocode = readFileSync(new URL("../app/api/journey-geocode/route.ts", import.meta.url), "utf8");
  const addStopField = builder.slice(builder.indexOf("<label className={styles.stopEditorLabel}"), builder.indexOf("{countryAddReviewControl}", builder.indexOf("<label className={styles.stopEditorLabel}")));
  const firstPlaceField = builder.slice(builder.indexOf("<section className={styles.firstPlaceEntry}"), builder.indexOf("{countryAddReviewControl}", builder.indexOf("<section className={styles.firstPlaceEntry}")));
  assert.match(autocomplete, /onFreeTextSearch\?: \(query: string, signal: AbortSignal\) => Promise<CanonicalPlaceSuggestion\[\] \| CompletedPlaceSearchResult>/);
  assert.match(autocomplete, /mode:'autocomplete'/);
  assert.match(addStopField, /onFreeTextSearch=\{searchCompletedPlaceCandidates\}/);
  assert.match(firstPlaceField, /onFreeTextSearch=\{searchCompletedPlaceCandidates\}/);
  const helper=readFileSync(new URL("../lib/easyt/completed-place-search.ts",import.meta.url),"utf8");
  assert.match(helper, /fetch\('\/api\/journey-geocode', \{method:'POST'/);
  assert.match(helper, /noticeVersion:PUBLIC_PLACE_NOTICE_VERSION/);
  assert.match(helper, /coordinates: candidate\.coordinates,[\s\S]*?routability: candidate\.routability/);
  assert.match(geocode, /if \(request\.nextUrl\.searchParams\.get\("candidates"\) === "1"\)[\s\S]*?candidates\.slice\(0, 8\)\.map\(responseCandidate\)/);
  assert.match(geocode, /if \(!selected \|\| selected\.routability !== "direct_destination"\) return NextResponse\.json\(\{ result: null \}\)/);
  assert.match(builder, /if \(!targetMentionId && canonicalSuggestion && placeSuggestionRequiresBaseSelection\(canonicalSuggestion\)\)[\s\S]*?beginPlanningAreaClarification\(canonicalSuggestion\)/);
  assert.match(autocomplete, /completedSearchRef\.current\.controller\?\.abort\(\)/);
  assert.match(autocomplete, /completedSearchRef\.current\.sequence !== sequence/);
  assert.match(autocomplete, /inputRef\.current\?\.value\.trim\(\) !== query/);
});

test("completed-search API candidate reaches picker and preserves scenic-base selection intent", async () => {
  const result = await build({
    entryPoints: ["app/api/journey-geocode/route.ts"], bundle: true, write: false,
    format: "esm", platform: "node",
    plugins: [emptyServerMarkerPlugin,{ name: "controlled-provider", setup(builder: any) {
      builder.onResolve({filter:/public-place-research-openai\.server$/},()=>({path:'research',namespace:'research-offline'}));
      builder.onLoad({filter:/.*/,namespace:'research-offline'},()=>({contents:'export const researchPublicPlaceNames=async()=>{throw new Error("unexpected research")};'}));
      builder.onResolve({ filter: /^next\/server$/ }, () => ({ path: "next-response", namespace: "fixture" }));
      builder.onResolve({ filter: /open-world-place\.server$/ }, () => ({ path: "provider", namespace: "fixture" }));
      builder.onLoad({ filter: /.*/, namespace: "fixture" }, ({ path }: { path: string }) => ({ contents:
        path === "next-response"
          ? `export const NextResponse={json:(body,options)=>({body,status:options?.status??200})};`
          : `export const createOpenWorldPlaceProvider=()=>({});
             export const searchOpenWorldNearbyBaseSuggestions=async()=>[];
             export const searchOpenWorldTravelCandidates=async()=>[{
               providerId:'photon:W:626892766', canonicalName:'Fanjingshan',
               parentCountries:['China'], coordinates:[108.7254986,27.8904161],
               placeType:'natural_area', routability:'needs_base_selection', matchQuality:'exact', rankScore:90
             }];`
      }));
    } }],
  });
  const api = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0]!.text).toString("base64")}`);
  const response = await api.GET({ nextUrl: new URL("http://localhost/api/journey-geocode?place=Fangjin%20mountain&candidates=1&mode=resolve&intent=route-stop") });
  assert.equal(response.status, 200);
  assert.equal(response.body.candidates[0]?.providerId, "photon:W:626892766");
  assert.equal(response.body.candidates[0]?.country, "China");
  assert.equal(response.body.candidates[0]?.placeType, "natural_area");
  assert.equal(response.body.candidates[0]?.routability, "needs_base_selection");
  assert.deepEqual(response.body.candidates[0]?.coordinates, [108.7254986, 27.8904161]);

  let returned: unknown[] = [];
  const picker = autocompleteRender("Fangjin mountain", {
    onFreeTextSearch: async () => response.body.candidates.map((candidate: Record<string, unknown>) => ({
      id: candidate.canonicalPlaceId,
      name: candidate.name,
      country: candidate.country,
      coordinates: candidate.coordinates,
      placeType: candidate.placeType,
      routability: candidate.routability,
      canonicalPlaceId: candidate.canonicalPlaceId,
      providerId: candidate.providerId,
      provenance: [{ id: candidate.providerId, label: "Photon fixture", kind: "provider", supports: "Fixture-backed canonical candidate" }],
    })),
  });
  picker.enter();
  await picker.settle();
  assert.equal(picker.rows().length, 1);
  assert.match(picker.rows()[0]!.label, /Fanjingshan.*China.*Natural area/);
  picker.rows()[0]?.choose();
  returned = picker.selected;
  assert.equal(returned.length, 1);
  assert.equal(placeSuggestionRequiresBaseSelection(returned[0] as Parameters<typeof placeSuggestionRequiresBaseSelection>[0]), true);
  assert.equal((returned[0] as { providerId: string }).providerId, "photon:W:626892766");
  picker.close();
});

test("a newer completed search aborts the old request and late old results stay invisible", async () => {
  let firstSignal: AbortSignal | undefined;
  let resolveFirst!: (items: Array<{ id: string; name: string; country: string; coordinates: [number, number]; placeType: "town"; routability: "direct_destination" }>) => void;
  const picker = autocompleteRender("Hirayu", {
    onFreeTextSearch: (query, signal) => {
      if (query === "Hirayu") {
        firstSignal = signal;
        return new Promise(resolve => { resolveFirst = resolve; });
      }
      return Promise.resolve([{ id: "new", name: "Fanjingshan", country: "China", coordinates: [108.7, 27.9], placeType: "town", routability: "direct_destination", provenance: [] }]);
    },
  });
  picker.enter();
  await picker.settle();
  picker.change("Fanjing Mountain");
  assert.equal(firstSignal?.aborted, true);
  picker.enter();
  await picker.settle();
  resolveFirst([{ id: "old", name: "Hirayu Onsen", country: "Japan", coordinates: [137.55, 36.19], placeType: "town", routability: "direct_destination" }]);
  await picker.settle();
  assert.equal(picker.rows().length, 1);
  assert.match(picker.rows()[0]!.label, /Fanjingshan.*China/);
  picker.close();
});
