import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { mapLibreCompatibleResults } from "../lib/easyt/map-result-selection.ts";

import {
  firstUsefulLocalSearchWithFallback,
  localSearchFallbackHedgeMs,
  localSearchProviderOutcome,
  localSearchScope,
  localSearchPrimaryLanes,
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

test("MapLibre local search excludes Google before invocation while permitted providers and honest states remain", async () => {
  let googleCalls = 0;
  let osmCalls = 0;
  const google = async () => { googleCalls++; return outcome("ready", ["Google fact"]); };
  const osm = async () => { osmCalls++; return outcome("ready", ["OSM place"]); };
  const maplibre = await firstUsefulLocalSearchWithFallback(localSearchPrimaryLanes("maplibre", google, osm), async () => outcome("empty"), () => new Promise(() => {}));
  assert.deepEqual(maplibre, { state: "ready", places: ["OSM place"] });
  assert.equal(googleCalls, 0);
  assert.equal(osmCalls, 1);
  const noMap = await firstUsefulLocalSearchWithFallback(localSearchPrimaryLanes("none", google, async () => outcome("empty")), async () => outcome("empty"), () => new Promise(() => {}));
  assert.deepEqual(noMap, { state: "ready", places: ["Google fact"] });
  assert.equal(googleCalls, 1);
  const empty = await firstUsefulLocalSearchWithFallback(localSearchPrimaryLanes("maplibre", google, async () => outcome("empty")), async () => outcome("failed"), async () => {});
  const failed = await firstUsefulLocalSearchWithFallback(localSearchPrimaryLanes("maplibre", google, async () => outcome("failed")), async () => outcome("failed"), async () => {});
  assert.equal(empty.state, "empty");
  assert.equal(failed.state, "failed");
  assert.equal(googleCalls, 1);
});

test("Map and Stay opt into the server-owned MapLibre boundary before local search", () => {
  const route = source("app/api/journey-local-search/route.ts");
  const finder = source("components/journey-local-finder.tsx");
  const map = source("components/journey-map-planner-workspace.tsx");
  const stay = source("components/easyt/trip-stay-workspace.tsx");
  assert.match(route, /localSearchPrimaryLanes\(mapPresentation/);
  assert.match(finder, /query\.set\("mapPresentation", mapPresentation\)/);
  assert.match(map, /<JourneyLocalFinder[^>]*mapPresentation="maplibre"/);
  assert.match(stay, /<JourneyLocalFinder[\s\S]*?mapPresentation="maplibre"/);
  assert.match(map, /googleCanvasActive \? <GoogleTripMapCanvas/);
  assert.match(map, /fetch\(`\/api\/journey-place-enrichment\?\$\{query\}`/);
  assert.match(map, /if \(!googleCanvasActive\)[\s\S]*?setGoogleNearbyByScope\(\{\}\)/);
  assert.match(map, /mapLibreCompatibleResults\(/);
  assert.match(finder, /payload\.places\.filter\(\(place\) => place\.provider !== "google-places"\)/);
});

test("MapLibre drops late Google facts while retaining canonical neutral reference and permitted results", () => {
  const results = [
    { sourceId: "osm", provider: "openstreetmap" },
    { sourceId: "old-google", provider: "google-places" },
    { sourceId: "user-pin" },
  ];
  assert.deepEqual(mapLibreCompatibleResults(results), [results[0], results[2]]);
  const map = source("components/journey-map-planner-workspace.tsx");
  assert.match(map, /const selectedGooglePlaceId = googleCanvasActive && workspacePlaceSelection\.kind === "google"/);
  assert.match(map, /googlePlaceReferenceIdeas\(customTrip\?\.brief\.itineraryIdeas\)/);
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
