import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { createOpenWorldPlaceProvider, searchOpenWorldNearbyBaseSuggestions, type OpenWorldPlaceSource, type OpenWorldTravelCandidate } from "../lib/easyt/open-world-place.server.ts";
import { searchOpenStreetMapNearbySettlements } from "../lib/easyt/openstreetmap-nearby-place.server.ts";
import {
  nearbyBaseAnchorForMention,
  nearbyBaseSearchPreposition,
  placeMentionSupportsMultipleSelections,
  rankNearbyBaseCandidates,
  type NearbyBaseAnchor,
  type PlaceProviderCandidate,
  type ResolvedPlaceMention,
} from "../lib/easyt/place-intelligence.ts";

const anchor = (overrides: Partial<NearbyBaseAnchor> = {}): NearbyBaseAnchor => ({
  canonicalPlaceId: "fixture-anchor",
  canonicalName: "Fixture Anchor",
  placeType: "landmark",
  parentCountries: ["Fixtureland"],
  parentRegionId: "North",
  coordinates: [0, 0],
  ...overrides,
});

function settlement(
  providerId: string,
  canonicalName: string,
  country: string,
  coordinates: [number, number],
  overrides: Partial<PlaceProviderCandidate> = {},
): PlaceProviderCandidate {
  return {
    providerId,
    canonicalName,
    placeType: "town",
    parentCountries: [country],
    parentRegionId: "North",
    coordinates,
    routability: "direct_destination",
    rankScore: 80,
    normalizationReason: "controlled nearby settlement fixture",
    ...overrides,
  };
}

test("archaeological landmark discovery returns real nearby Guatemalan settlements without replacing Tikal", () => {
  const tikal = anchor({ canonicalPlaceId: "tikal", canonicalName: "Tikal", parentCountries: ["Guatemala"], parentRegionId: "peten", coordinates: [-89.6237, 17.222] });
  const suggestions = rankNearbyBaseCandidates(tikal, [
    settlement("node:1", "Flores", "Guatemala", [-89.897, 16.9294], { placeType: "city", parentRegionId: "Petén" }),
    settlement("node:2", "El Remate", "Guatemala", [-89.6874, 16.9917], { settlementKind: "village", settlementPopulation: 1_917, parentRegionId: "Petén" }),
    settlement("node:3", "San Ignacio", "Belize", [-89.079, 17.1561], { parentRegionId: "Cayo" }),
    settlement("node:4", "Zocotzal", "Guatemala", [-89.6825, 17.1046], { settlementKind: "village", settlementPopulation: 497, parentRegionId: "Petén" }),
    settlement("node:5", "El Porvenir", "Guatemala", [-89.6839, 17.0667], { settlementKind: "village", settlementPopulation: 523, parentRegionId: "Petén" }),
    settlement("node:6", "Uaxactún", "Guatemala", [-89.6328, 17.3937], { settlementKind: "village", parentRegionId: "Petén" }),
  ]);
  assert.equal(suggestions.some((item) => item.name === "Flores"), true);
  assert.equal(suggestions.some((item) => item.name === "El Remate"), true);
  assert.equal(suggestions.some((item) => item.name === "Tikal"), false);
  assert.equal(suggestions.every((item) => item.country === "Guatemala"), true);
});

test("lake discovery supports several legitimate Lake Atitlán settlements", () => {
  const lake = anchor({ canonicalPlaceId: "lake-atitlan", canonicalName: "Lake Atitlán", placeType: "natural_area", parentCountries: ["Guatemala"], parentRegionId: "solola", coordinates: [-91.186, 14.69] });
  const suggestions = rankNearbyBaseCandidates(lake, [
    settlement("node:11", "Panajachel", "Guatemala", [-91.1565, 14.7419], { parentRegionId: "Sololá" }),
    settlement("node:12", "San Pedro La Laguna", "Guatemala", [-91.272, 14.6928], { parentRegionId: "Sololá" }),
    settlement("node:13", "San Marcos La Laguna", "Guatemala", [-91.2587, 14.7252], { parentRegionId: "Sololá" }),
  ]);
  assert.deepEqual(new Set(suggestions.map((item) => item.name)), new Set(["Panajachel", "San Pedro La Laguna", "San Marcos La Laguna"]));
  assert.equal(placeMentionSupportsMultipleSelections({ placeType: "natural_area", routability: "needs_base_selection", requiresBaseSelection: true }), true);
});

test("bounded settlement suitability keeps practical lake towns ahead of closer hamlets", () => {
  const lake = anchor({ canonicalName: "Lake fixture", placeType: "natural_area", parentCountries: ["Guatemala"], parentRegionId: undefined, coordinates: [-91.186, 14.69] });
  const suggestions = rankNearbyBaseCandidates(lake, [
    settlement("village:1", "Close Hamlet", "Guatemala", [-91.17, 14.69], { settlementKind: "village", rankScore: 78, parentRegionId: undefined }),
    settlement("town:1", "Panajachel", "Guatemala", [-91.1565, 14.7419], { settlementKind: "town", rankScore: 165, parentRegionId: undefined }),
    settlement("town:2", "San Pedro La Laguna", "Guatemala", [-91.272, 14.6928], { settlementKind: "town", rankScore: 150, parentRegionId: undefined }),
    settlement("town:3", "San Marcos La Laguna", "Guatemala", [-91.2587, 14.7252], { settlementKind: "town", rankScore: 145, parentRegionId: undefined }),
  ], { limit: 3 });
  assert.deepEqual(new Set(suggestions.map((item) => item.name)), new Set(["Panajachel", "San Pedro La Laguna", "San Marcos La Laguna"]));
});

test("national park discovery keeps settlements and rejects a nearby attraction", () => {
  const yellowstone = anchor({ canonicalName: "Yellowstone National Park", placeType: "natural_area", parentCountries: ["United States"], parentRegionId: undefined, coordinates: [-110.5885, 44.428] });
  const suggestions = rankNearbyBaseCandidates(yellowstone, [
    settlement("node:21", "West Yellowstone", "United States", [-111.104, 44.662], { parentRegionId: "Montana" }),
    settlement("node:22", "Gardiner", "United States", [-110.704, 45.031], { parentRegionId: "Montana" }),
    settlement("way:23", "Old Faithful", "United States", [-110.829, 44.4605], { placeType: "landmark", routability: "anchor_or_poi" }),
  ]);
  assert.deepEqual(suggestions.map((item) => item.name).sort(), ["Gardiner", "West Yellowstone"]);
});

test("mountain and island anchors discover usable settlements without making the anchor a stop", () => {
  const kinabalu = rankNearbyBaseCandidates(anchor({ canonicalName: "Mount Kinabalu", placeType: "mountain_range", parentCountries: ["Malaysia"], parentRegionId: "Sabah", coordinates: [116.56, 6.075] }), [
    settlement("node:31", "Kundasang", "Malaysia", [116.575, 5.987], { parentRegionId: "Sabah" }),
  ]);
  const rapaNui = rankNearbyBaseCandidates(anchor({ canonicalName: "Rapa Nui", placeType: "island", parentCountries: ["Chile"], parentRegionId: undefined, coordinates: [-109.3497, -27.1127] }), [
    settlement("node:32", "Hanga Roa", "Chile", [-109.432, -27.147], { parentRegionId: "Valparaíso" }),
  ]);
  assert.deepEqual(kinabalu.map((item) => item.name), ["Kundasang"]);
  assert.deepEqual(rapaNui.map((item) => item.name), ["Hanga Roa"]);
  assert.equal(placeMentionSupportsMultipleSelections({ placeType: "island", routability: "needs_base_selection", requiresBaseSelection: true }), true);
});

test("an attraction inside a major city may use that very close city despite different regional labels", () => {
  const colosseum = anchor({ canonicalName: "Colosseum", parentCountries: ["Italy"], parentRegionId: "rome", coordinates: [12.4922, 41.8902] });
  const suggestions = rankNearbyBaseCandidates(colosseum, [
    settlement("relation:41", "Rome", "Italy", [12.4964, 41.9028], { placeType: "city", parentRegionId: "Lazio" }),
  ]);
  assert.deepEqual(suggestions.map((item) => item.name), ["Rome"]);
});

test("remote anchors retain multiple legitimate settlements within the safe radius", () => {
  const remote = anchor({ canonicalName: "Remote Nature Reserve", placeType: "natural_area", parentCountries: ["Namibia"], parentRegionId: undefined, coordinates: [15, -22] });
  const suggestions = rankNearbyBaseCandidates(remote, [
    settlement("node:51", "North Gate", "Namibia", [15.2, -22.1], { parentRegionId: undefined }),
    settlement("node:52", "South Gate", "Namibia", [14.8, -22.2], { parentRegionId: undefined }),
    settlement("node:53", "Distant Capital", "Namibia", [17.2, -22.5], { placeType: "city", parentRegionId: undefined, rankScore: 10_000 }),
  ]);
  assert.deepEqual(new Set(suggestions.map((item) => item.name)), new Set(["North Gate", "South Gate"]));
});

test("wrong-country results, misleading POIs, broad regions and malformed candidates fail closed", () => {
  const baseAnchor = anchor();
  const suggestions = rankNearbyBaseCandidates(baseAnchor, [
    settlement("wrong-country", "Border Town", "Elsewhere", [0.1, 0.1]),
    settlement("poi", "Anchor Hotel", "Fixtureland", [0.1, 0.1], { placeType: "landmark", routability: "anchor_or_poi" }),
    settlement("region", "Northern Region", "Fixtureland", [0.1, 0.1], { placeType: "region", routability: "planning_area" }),
    settlement("missing-coordinates", "Broken Town", "Fixtureland", [Number.NaN, 0]),
  ]);
  assert.deepEqual(suggestions, []);
});

test("duplicate provider identity conflicts are discarded rather than guessed", () => {
  const suggestions = rankNearbyBaseCandidates(anchor(), [
    settlement("node:61", "One Town", "Fixtureland", [0.1, 0.1]),
    settlement("node:61", "Different Town", "Fixtureland", [0.2, 0.2]),
    settlement("node:62", "Safe Town", "Fixtureland", [0.15, 0.15]),
  ]);
  assert.deepEqual(suggestions.map((item) => item.name), ["Safe Town"]);
});

test("cross-provider duplicates collapse while canonical identity, coordinates, provenance and confidence survive", () => {
  const suggestions = rankNearbyBaseCandidates(anchor(), [
    settlement("nominatim:node:71", "Same Town", "Fixtureland", [0.1, 0.1], { providerSourceLabel: "Source A" }),
    settlement("photon:N:71", "Same Town", "Fixtureland", [0.1001, 0.1001], { providerSourceLabel: "Source B" }),
  ]);
  assert.equal(suggestions.length, 1);
  assert.match(suggestions[0]!.canonicalPlaceId, /^open-world:/);
  assert.deepEqual(suggestions[0]!.coordinates, [0.1, 0.1]);
  assert.equal(suggestions[0]!.provenance[0]?.kind, "provider");
  assert.equal(["high", "medium"].includes(suggestions[0]!.confidence.level), true);
});

test("distance remains dominant over an extreme provider score", () => {
  const suggestions = rankNearbyBaseCandidates(anchor({ parentRegionId: undefined }), [
    settlement("near", "Nearby Village", "Fixtureland", [0.05, 0.05], { rankScore: 0, parentRegionId: undefined }),
    settlement("far", "Large Distant City", "Fixtureland", [0.9, 0], { placeType: "city", rankScore: 100_000, parentRegionId: undefined }),
  ]);
  assert.equal(suggestions[0]?.name, "Nearby Village");
});

test("an anchor with no safe nearby settlement remains unresolved", () => {
  const suggestions = rankNearbyBaseCandidates(anchor({ parentRegionId: undefined }), [
    settlement("distant", "Distant City", "Fixtureland", [4, 0], { placeType: "city", parentRegionId: undefined }),
  ]);
  assert.deepEqual(suggestions, []);
});

test("provider failure does not become an empty cached success", async () => {
  const source: OpenWorldPlaceSource = {
    id: "failed-fixture",
    label: "Failed fixture",
    search: async () => [],
    nearby: async () => { throw new Error("provider unavailable"); },
  };
  const provider = createOpenWorldPlaceProvider({ sources: [source], cache: new Map(), sourceTimeoutMs: 50 });
  await assert.rejects(() => searchOpenWorldNearbyBaseSuggestions(anchor(), {}, provider), /unavailable/);
});

test("the open-world boundary prefixes source identity and returns a bounded shortlist", async () => {
  const source: OpenWorldPlaceSource = {
    id: "spatial-fixture",
    label: "Spatial fixture",
    search: async () => [],
    nearby: async () => Array.from({ length: 8 }, (_, index): OpenWorldTravelCandidate => ({
      ...settlement(`node:${80 + index}`, `Town ${index}`, "Fixtureland", [0.05 + index * 0.02, 0.05], { parentRegionId: "North" }),
      country: "Fixtureland",
      providerKind: "town",
    })),
  };
  const provider = createOpenWorldPlaceProvider({ sources: [source], cache: new Map() });
  const suggestions = await searchOpenWorldNearbyBaseSuggestions(anchor(), {}, provider);
  assert.equal(suggestions.length, 5);
  assert.equal(suggestions.every((item) => item.canonicalPlaceId.startsWith("open-world:spatial-fixture:")), true);
  assert.equal(suggestions.every((item) => item.provenance[0]?.label === "Spatial fixture"), true);
});

test("the spatial provider asks for real settlement types inside the anchor country and retains OSM identity", async () => {
  let requestBody = "";
  const candidates = await searchOpenStreetMapNearbySettlements(
    anchor({ canonicalName: "Tikal", parentCountries: ["Guatemala"], coordinates: [-89.6237, 17.222] }),
    140,
    async (_input, init) => {
      requestBody = String(init?.body);
      return new Response(JSON.stringify({
        elements: [
          { type: "node", id: 101, lat: 16.9294, lon: -89.897, tags: { place: "city", name: "Flores", "addr:state": "Petén" } },
          { type: "node", id: 102, lat: 16.9917, lon: -89.6874, tags: { place: "village", name: "El Remate" } },
          { type: "node", id: 103, lat: 17.222, lon: -89.6237, tags: { tourism: "attraction", name: "Tikal Museum" } },
          { type: "node", id: 104, tags: { place: "town", name: "Malformed Town" } },
          { type: "node", id: 105, lat: 17.1, lon: -89.7, tags: { place: "locality", name: "Unpopulated Locality" } },
          { type: "node", id: 106, lat: 17.05, lon: -89.72, tags: { place: "locality", name: "Populated Locality", population: "120" } },
        ],
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    },
  );
  const query = new URLSearchParams(requestBody).get("data") ?? "";
  assert.match(query, /admin_level"="2"\]\["name"="Guatemala"/);
  assert.match(query, /place"~"\^\(city\|town\)\$"/);
  assert.match(query, /around:60000,17\.222,-89\.6237\)\["place"="village"\]/);
  assert.match(query, /around:40000,17\.222,-89\.6237\)\["place"="locality"\]\["population"\]/);
  assert.match(query, /around:140000,17\.222,-89\.6237/);
  assert.deepEqual(candidates.map((item) => [item.providerId, item.canonicalName, item.placeType]), [
    ["node:101", "Flores", "city"],
    ["node:102", "El Remate", "town"],
    ["node:106", "Populated Locality", "town"],
  ]);
  assert.equal(candidates.every((item) => item.parentCountries?.[0] === "Guatemala"), true);
});

test("the spatial provider fails safely before discovery when containment is ambiguous or the provider is unavailable", async () => {
  let fetchCount = 0;
  const ambiguous = await searchOpenStreetMapNearbySettlements(
    anchor({ parentCountries: ["Fixtureland", "Elsewhere"] }),
    140,
    async () => { fetchCount += 1; return new Response("{}", { status: 200 }); },
  );
  assert.deepEqual(ambiguous, []);
  assert.equal(fetchCount, 0);
  await assert.rejects(
    () => searchOpenStreetMapNearbySettlements(anchor(), 140, async () => new Response("unavailable", { status: 503 })),
    /unavailable/,
  );
});

test("nearby wording follows semantic type and missing coordinates cannot start discovery", () => {
  assert.equal(nearbyBaseSearchPreposition({ placeType: "landmark" }), "near");
  assert.equal(nearbyBaseSearchPreposition({ placeType: "natural_area" }), "around");
  const mention = {
    canonicalPlaceId: "missing",
    canonicalName: "Missing Anchor",
    placeType: "landmark",
    parentCountries: ["Fixtureland"],
    routability: "anchor_or_poi",
  } as ResolvedPlaceMention;
  assert.equal(nearbyBaseAnchorForMention(mention), undefined);
});

test("acceptance names are fixture evidence, not production anchor-to-base lookup branches", async () => {
  const intelligence = await readFile(new URL("../lib/easyt/place-intelligence.ts", import.meta.url), "utf8");
  const catalog = await readFile(new URL("../lib/easyt/place-catalog.ts", import.meta.url), "utf8");
  const builder = await readFile(new URL("../app/journey/new/trip-builder.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(intelligence, /REVIEWED_BASE_IDS|Tikal\s*:\s*\[|Lake Atitl[aá]n\s*:\s*\[/i);
  for (const fixtureOnlyName of ["Panajachel", "San Pedro La Laguna", "San Marcos La Laguna", "Flores, Guatemala", "El Remate"]) {
    assert.equal(catalog.includes(fixtureOnlyName), false, `${fixtureOnlyName} must not be a production lookup entry`);
  }
  assert.match(builder, /targetUsesNearbyBase && !targetNearbyAnchor/);
  assert.match(builder, /nearbySuggestions = clarificationUsesNearbyBases[\s\S]*?isDuplicatePlaceIdentity\(stops/);
  assert.match(builder, /selection\.kind === "base" \|\| selection\.kind === "visit"/);
  assert.match(builder, /multiPlace \|\| selection\.kind === "visit"/);
});
