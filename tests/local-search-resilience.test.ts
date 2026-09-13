import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  firstUsefulLocalSearchWithFallback,
  localSearchFallbackHedgeMs,
  localSearchProviderOutcome,
  localSearchScope,
  type LocalSearchProviderOutcome,
} from "../lib/easyt/local-search-strategy.ts";

const outcome = <Result>(state: LocalSearchProviderOutcome<Result>["state"], places: Result[] = []): LocalSearchProviderOutcome<Result> => ({ state, places });
const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("Antigua-style empty and failed primary lanes accept one useful named fallback", async () => {
  let fallbackCalls = 0;
  const result = await firstUsefulLocalSearchWithFallback(
    [async () => outcome("failed"), async () => outcome("empty")],
    async () => { fallbackCalls += 1; return outcome("ready", ["Antigua restaurant"]); },
    async () => {},
  );
  assert.deepEqual(result, { state: "ready", places: ["Antigua restaurant"] });
  assert.equal(fallbackCalls, 1);
});

test("a useful primary result wins and a provider failure stays local", async () => {
  let fallbackCalls = 0;
  const result = await firstUsefulLocalSearchWithFallback(
    [async () => outcome("failed"), async () => outcome("ready", ["Mapped cafe"])],
    async () => { fallbackCalls += 1; return outcome("ready", ["Fallback cafe"]); },
    () => new Promise(() => {}),
  );
  assert.deepEqual(result, { state: "ready", places: ["Mapped cafe"] });
  assert.equal(fallbackCalls, 0);
});

test("all-provider failure and valid empty are distinct terminal states", async () => {
  const failed = await firstUsefulLocalSearchWithFallback(
    [async () => outcome("failed"), async () => outcome("failed")],
    async () => outcome("failed"),
    async () => {},
  );
  const empty = await firstUsefulLocalSearchWithFallback(
    [async () => outcome("failed"), async () => outcome("empty")],
    async () => outcome("failed"),
    async () => {},
  );
  assert.equal(failed.state, "failed");
  assert.equal(empty.state, "empty");
});

test("fallback expansion is bounded and starts at most once", async () => {
  let fallbackCalls = 0;
  const result = await firstUsefulLocalSearchWithFallback(
    [async () => outcome("empty"), async () => outcome("empty")],
    async () => { fallbackCalls += 1; return outcome("empty"); },
    async () => {},
  );
  assert.equal(result.state, "empty");
  assert.equal(fallbackCalls, 1);
});

test("provider normalization never labels a thrown lookup as a valid empty", async () => {
  assert.deepEqual(await localSearchProviderOutcome(async () => []), { state: "empty", places: [] });
  assert.deepEqual(await localSearchProviderOutcome(async () => { throw new Error("offline"); }), { state: "failed", places: [] });
});

test("restaurant and Stay scopes retain conservative compact-destination bounds", () => {
  assert.equal(localSearchFallbackHedgeMs, 1_000);
  assert.deepEqual(localSearchScope("restaurant", "town"), { primaryRadiusKm: 5, fallbackRadiusKm: 6 });
  assert.deepEqual(localSearchScope("restaurant", "city"), { primaryRadiusKm: 5, fallbackRadiusKm: 8 });
  assert.deepEqual(localSearchScope("stay", "island"), { primaryRadiusKm: 7.5, fallbackRadiusKm: 8.5 });
  assert.deepEqual(localSearchScope("stay", "city"), { primaryRadiusKm: 7.5, fallbackRadiusKm: 10 });
});

test("the API uses one destination-aware fallback without exposing a general place search", () => {
  const route = source("app/api/journey-local-search/route.ts");
  const finder = source("components/journey-local-finder.tsx");
  assert.match(route, /destinationQuery = \[term, city === "your location" \? "" : city, country\]/);
  assert.match(route, /firstUsefulLocalSearchWithFallback/);
  assert.match(route, /validPhotonCategory/);
  assert.match(route, /localPlaceWithinCanonicalScope/);
  assert.match(route, /catalogMatchesRequest/);
  assert.match(route, /searchStatus: outcome\.state/);
  assert.match(finder, /canonicalPlaceId/);
  assert.match(finder, /Search unavailable/);
  assert.match(finder, /No places found/);
  assert.doesNotMatch(finder, /0 places nearby/);
});
