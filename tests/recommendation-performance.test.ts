import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  firstUsefulRecommendationResults,
  recommendationDurationMs,
  streamIndependentRecommendationLanes,
} from "../lib/easyt/recommendation-performance.ts";

function deferred<Value>() {
  let resolve!: (value: Value) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<Value>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("a useful core lane publishes while commercial enrichment never resolves", async () => {
  const core = deferred<string[]>();
  const commercial = deferred<string[]>();
  const settlements: Array<{ lane: string; status: string; value?: string[] }> = [];
  void streamIndependentRecommendationLanes([
    { lane: "core", request: () => core.promise },
    { lane: "commercial", request: () => commercial.promise },
  ], (settlement) => settlements.push(settlement.status === "ready"
    ? { lane: settlement.lane, status: settlement.status, value: settlement.value }
    : { lane: settlement.lane, status: settlement.status }));

  core.resolve(["Acropolis Museum"]);
  await Promise.resolve();
  await Promise.resolve();

  assert.deepEqual(settlements, [{ lane: "core", status: "ready", value: ["Acropolis Museum"] }]);
});

test("one failed lane remains local and cannot clear a successful lane", async () => {
  const settlements: Array<{ lane: string; status: string; value?: string[] }> = [];
  await streamIndependentRecommendationLanes([
    { lane: "core", request: async () => ["O Thanasis"] },
    { lane: "commercial", request: async () => { throw new Error("fixture provider failed"); } },
  ], (settlement) => settlements.push(settlement.status === "ready"
    ? { lane: settlement.lane, status: settlement.status, value: settlement.value }
    : { lane: settlement.lane, status: settlement.status }));

  assert.deepEqual(settlements.find((item) => item.lane === "core")?.value, ["O Thanasis"]);
  assert.equal(settlements.find((item) => item.lane === "commercial")?.status, "failed");
});

test("late commercial enrichment appends after core without delaying its settlement", async () => {
  const core = deferred<string[]>();
  const commercial = deferred<string[]>();
  const settlements: Array<{ lane: string; value: string[] }> = [];
  const completed = streamIndependentRecommendationLanes([
    { lane: "core", request: () => core.promise },
    { lane: "commercial", request: () => commercial.promise },
  ], (settlement) => {
    if (settlement.status === "ready") settlements.push({ lane: settlement.lane, value: settlement.value });
  });

  core.resolve(["Mapped stay"]);
  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(settlements, [{ lane: "core", value: ["Mapped stay"] }]);

  commercial.resolve(["Live room"]);
  await completed;
  assert.deepEqual(settlements, [
    { lane: "core", value: ["Mapped stay"] },
    { lane: "commercial", value: ["Live room"] },
  ]);
});

test("the first useful bounded local provider wins without waiting for a slower source", async () => {
  const slow = deferred<string[]>();
  const fast = deferred<string[]>();
  const resultPromise = firstUsefulRecommendationResults([
    () => slow.promise,
    () => fast.promise,
  ]);

  fast.resolve(["Useful mapped restaurant"]);
  assert.deepEqual(await resultPromise, ["Useful mapped restaurant"]);
});

test("empty and failed providers fall through without fabricating a result", async () => {
  assert.deepEqual(await firstUsefulRecommendationResults<string>([
    async () => [],
    async () => { throw new Error("fixture unavailable"); },
  ]), []);
});

test("performance durations are coarse, non-negative and bounded", () => {
  assert.equal(recommendationDurationMs(1_000, 2_237), 1_225);
  assert.equal(recommendationDurationMs(2_000, 1_000), 0);
  assert.equal(recommendationDurationMs(0, 80_000), 60_000);
});

test("stay base and live inventory use independent client lanes with stale-context cleanup", () => {
  const finder = source("components/journey-local-finder.tsx");
  const providerEffect = finder.match(/useEffect\(\(\) => \{\s*let active = true;[\s\S]*?\}, \[[^\]]+\]\);/)?.[0] ?? "";
  assert.match(providerEffect, /streamIndependentRecommendationLanes/);
  assert.doesNotMatch(providerEffect, /Promise\.all\(\[localSearch, inventorySearch\]\)/);
  assert.match(providerEffect, /setCorePlaces\(nextPlaces\)/);
  assert.match(providerEffect, /setCommercialPlaces\(properties\)/);
  assert.match(providerEffect, /setLoading\(false\)/);
  assert.match(providerEffect, /setCommercialPlaces\(\[\]\)/, "unconfirmed no-store inventory is never retained through a retry");
  assert.match(providerEffect, /return \(\) => \{ active = false; controller\.abort\(\); \}/);
  const commercialSettlement = providerEffect.match(/const \{ properties, unavailable, configured \}[\s\S]*?reportPerformance\("commercial"[^\n]+/)?.[0] ?? "";
  assert.ok(commercialSettlement);
  assert.doesNotMatch(commercialSettlement, /setChosen|setSaved/, "late enrichment must not replace the traveller's selection");
  assert.match(finder, /Mapped stays are ready to use\. Current room availability is still loading\./);
  assert.match(finder, /const places = useMemo\(\(\) => \[\.\.\.commercialPlaces, \.\.\.corePlaces\]/);
  assert.match(finder, /chosen\.availability === "available" && \(chosen\.price \|\| chosen\.rating\)/, "price and ratings only render for provider-confirmed availability");
});

test("restaurant fallback sources and stay base sources are bounded parallel work", () => {
  const route = source("app/api/journey-local-search/route.ts");
  assert.match(route, /firstUsefulRecommendationResults\(primaryRequests\)/);
  assert.match(route, /googleOperationalPlaces[\s\S]*openStreetMapPlaces/);
  assert.match(route, /openStreetMapPlaces[\s\S]*photonFallback/);
  assert.match(route, /photon\.komoot\.io[\s\S]*next: \{ revalidate: 60 \* 60 \* 12 \}/);
  assert.match(route, /AbortSignal\.timeout\(4500\)/);
  assert.match(route, /AbortSignal\.timeout\(5000\)/);
  assert.match(route, /AbortSignal\.timeout\(7000\)/);
});

test("activity discovery starts country verification before awaiting Wikipedia", () => {
  const route = source("app/api/journey-discover/route.ts");
  const verificationStart = route.indexOf("const countryVerification = isWithinRequestedCountry");
  const wikipediaAwait = route.indexOf("const response = await fetch(`https://en.wikipedia.org");
  const verificationAwait = route.indexOf("if (!(await countryVerification))");
  assert.ok(verificationStart > 0 && wikipediaAwait > verificationStart && verificationAwait > wikipediaAwait);
  assert.match(route, /next: \{ revalidate: 60 \* 60 \* 24 \* 7 \}/);
  assert.match(route, /next: \{ revalidate: 60 \* 60 \* 24 \* 30 \}/);
});

test("recommendation timing telemetry excludes trip content, coordinates, prices and URLs", () => {
  const analytics = source("lib/analytics.ts");
  const contract = analytics.slice(analytics.indexOf("recommendation_performance:"), analytics.indexOf("affiliate_click:"));
  assert.match(contract, /surface:/);
  assert.match(contract, /recommendation_kind:/);
  assert.match(contract, /duration_ms:/);
  assert.doesNotMatch(contract, /trip_id|stop_id|destination|coordinates|price|url/i);
});
