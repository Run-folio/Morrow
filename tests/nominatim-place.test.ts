import assert from "node:assert/strict";
import test from "node:test";
import { createNominatimPlaceProvider, searchNominatimTravelCandidates } from "../lib/easyt/nominatim-place.server.ts";
import { resolveExplicitPlaceMentionsWithProvider } from "../lib/easyt/place-intelligence.ts";

type FixtureResult = Record<string, unknown>;

function raw(
  name: string,
  providerId: number,
  country: string,
  addressType: string,
  options: { importance?: number; state?: string; linkedPlace?: string; lat?: string; lon?: string } = {},
): FixtureResult {
  return {
    name,
    osm_type: addressType === "city" || addressType === "town" ? "node" : "relation",
    osm_id: providerId,
    type: addressType === "country" ? "administrative" : addressType,
    category: addressType === "country" || addressType === "state" ? "boundary" : "place",
    addresstype: addressType,
    importance: options.importance ?? 0.5,
    lat: options.lat ?? "1",
    lon: options.lon ?? "2",
    address: {
      country,
      country_code: country.slice(0, 2).toLocaleLowerCase(),
      ...(options.state ? { state: options.state } : {}),
      ...(addressType === "city" ? { city: name } : {}),
      ...(addressType === "town" ? { town: name } : {}),
    },
    ...(options.linkedPlace ? { extratags: { linked_place: options.linkedPlace } } : {}),
  };
}

function fixtureFetch(fixtures: Record<string, { freeform: FixtureResult[]; city?: FixtureResult[] }>) {
  return (async (input: string | URL | Request) => {
    const url = new URL(String(input));
    const phrase = url.searchParams.get("q") ?? url.searchParams.get("city") ?? "";
    const mode = url.searchParams.has("city") ? "city" : "freeform";
    const fixture = fixtures[phrase];
    return new Response(JSON.stringify(mode === "city" ? fixture?.city ?? [] : fixture?.freeform ?? []), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
}

const singaporeCountry = raw("Singapore", 1, "Singapore", "country", { importance: 0.8 });
const singaporeCity = raw("Singapore", 2, "Singapore", "city", { importance: 0.8 });
const kualaLumpurBoundary = raw("Kuala Lumpur", 3, "Malaysia", "state", { importance: 0.71, state: "Kuala Lumpur", linkedPlace: "city" });
const oaxacaState = raw("Oaxaca", 4, "Mexico", "state", { importance: 0.68, state: "Oaxaca" });
const oaxacaCity = raw("Oaxaca City", 5, "Mexico", "city", { importance: 0.19, state: "Oaxaca" });

const fetchFixture = fixtureFetch({
  Auckland: { freeform: [raw("Auckland", 12, "New Zealand", "city", { importance: 0.7 })], city: [] },
  Borneo: { freeform: [raw("Borneo", 13, "Malaysia", "island", { importance: 0.53 })], city: [] },
  Singapore: { freeform: [singaporeCountry, singaporeCity], city: [singaporeCity] },
  "Kuala Lumpur": { freeform: [kualaLumpurBoundary], city: [kualaLumpurBoundary] },
  Oaxaca: { freeform: [oaxacaState], city: [oaxacaCity] },
  Cairo: {
    freeform: [
      raw("Cairo", 6, "Egypt", "city", { importance: 0.75, lat: "30.04", lon: "31.23" }),
      raw("Cairo", 7, "United States", "town", { importance: 0.32, lat: "37", lon: "-89" }),
      raw("Cairo", 8, "Egypt", "state", { importance: 0.53, state: "Cairo" }),
    ],
    city: [],
  },
  Monaco: {
    freeform: [
      raw("Monaco", 9, "Monaco", "country", { importance: 0.72, lat: "43.738", lon: "7.424" }),
      raw("Monaco", 10, "Monaco", "suburb", { importance: 0.47, lat: "43.731", lon: "7.425" }),
      raw("Monaco", 11, "Monaco", "town", { importance: 0.44, lat: "43.731", lon: "7.421" }),
    ],
    city: [],
  },
  Panama: {
    freeform: [raw("Panama", 14, "Panama", "country", { importance: 0.73 })],
    city: [raw("Panama City", 15, "Panama", "city", { importance: 0.68 })],
  },
  Guatemala: {
    freeform: [raw("Guatemala", 16, "Guatemala", "country", { importance: 0.72 })],
    city: [raw("Guatemala City", 17, "Guatemala", "city", { importance: 0.66 })],
  },
  Mexico: {
    freeform: [raw("Mexico", 18, "Mexico", "country", { importance: 0.84 })],
    city: [raw("Mexico City", 19, "Mexico", "city", { importance: 0.79 })],
  },
});

test("city and country candidates with the same label retain distinct provider identities", async () => {
  const candidates = await searchNominatimTravelCandidates("Singapore", { travelIntent: "route-stop" }, fetchFixture);
  assert.deepEqual(candidates.map((candidate) => candidate.providerId), ["node:2", "relation:1"]);
  assert.equal(candidates[0]?.placeType, "city");
  assert.equal(candidates[0]?.routability, "direct_destination");
});

test("coextensive administrative boundary becomes a locality only for route-stop intent", async () => {
  const direct = await searchNominatimTravelCandidates("Kuala Lumpur", { travelIntent: "route-stop" }, fetchFixture);
  const broad = await searchNominatimTravelCandidates("Kuala Lumpur", { travelIntent: "planning-area" }, fetchFixture);
  assert.equal(direct[0]?.placeType, "city");
  assert.equal(direct[0]?.routability, "direct_destination");
  assert.equal(broad[0]?.placeType, "region");
  assert.equal(broad[0]?.routability, "planning_area");
});

test("structured locality candidate outranks an exact administrative lookalike in a city list", async () => {
  const direct = await searchNominatimTravelCandidates("Oaxaca", { travelIntent: "route-stop" }, fetchFixture);
  const broad = await searchNominatimTravelCandidates("Oaxaca", { travelIntent: "planning-area" }, fetchFixture);
  assert.equal(direct[0]?.canonicalName, "Oaxaca City");
  assert.equal(direct[0]?.matchQuality, "alias");
  assert.equal(broad[0]?.canonicalName, "Oaxaca");
  assert.equal(broad[0]?.placeType, "region");
});

test("importance and locality class settle Cairo without creating a base", async () => {
  const result = await resolveExplicitPlaceMentionsWithProvider(
    [{ sourceText: "Cairo", role: "preferred", travelIntent: "route-stop" }],
    createNominatimPlaceProvider(fetchFixture),
  );
  assert.equal(result.mentions[0]?.canonicalName, "Cairo");
  assert.equal(result.mentions[0]?.parentCountries[0], "Egypt");
  assert.equal(result.mentions[0]?.placeType, "city");
  assert.equal(result.mentions[0]?.directlyRoutable, true);
  assert.equal(result.issues.some((issue) => issue.code === "region_requires_base"), false);
});

test("the full Singapore/Kuala Lumpur capture keeps broad Borneo but removes city base cards", async () => {
  const inputs = ["Sydney", "Auckland", "Bali", "Borneo", "Singapore", "Kuala Lumpur"]
    .map((sourceText) => ({ sourceText, role: "preferred" as const, travelIntent: "route-stop" as const }));
  const result = await resolveExplicitPlaceMentionsWithProvider(inputs, createNominatimPlaceProvider(fetchFixture));
  assert.equal(result.mentions.length, 6);
  assert.equal(result.mentions.find((mention) => mention.sourceText === "Singapore")?.placeType, "city");
  assert.equal(result.mentions.find((mention) => mention.sourceText === "Singapore")?.directlyRoutable, true);
  assert.equal(result.mentions.find((mention) => mention.sourceText === "Kuala Lumpur")?.placeType, "city");
  assert.equal(result.mentions.find((mention) => mention.sourceText === "Kuala Lumpur")?.directlyRoutable, true);
  assert.equal(result.mentions.find((mention) => mention.sourceText === "Borneo")?.requiresBaseSelection, true);
  assert.deepEqual(result.issues.filter((issue) => issue.code === "region_requires_base").map((issue) => issue.sourceText), ["Borneo"]);
});

test("co-located locality node and boundary collapse without collapsing the city-state country", async () => {
  const candidates = await searchNominatimTravelCandidates("Monaco", { travelIntent: "route-stop" }, fetchFixture);
  assert.equal(candidates.filter((candidate) => candidate.routability === "direct_destination").length, 1);
  assert.equal(candidates.some((candidate) => candidate.placeType === "country"), true);
  const result = await resolveExplicitPlaceMentionsWithProvider(
    [{ sourceText: "Monaco", role: "preferred", travelIntent: "route-stop" }],
    createNominatimPlaceProvider(fetchFixture),
  );
  assert.equal(result.mentions[0]?.directlyRoutable, true);
  assert.equal(result.issues.some((issue) => issue.code === "region_requires_base"), false);
});

test("city-list context and explicit planning-area context preserve city/country ambiguity generically", async () => {
  for (const phrase of ["Panama", "Guatemala", "Mexico"]) {
    const direct = await searchNominatimTravelCandidates(phrase, { travelIntent: "route-stop" }, fetchFixture);
    const broad = await searchNominatimTravelCandidates(phrase, { travelIntent: "planning-area" }, fetchFixture);
    assert.equal(direct[0]?.routability, "direct_destination", `${phrase} should prefer its city in a route-stop list`);
    assert.equal(broad[0]?.placeType, "country", `${phrase} should remain a country when broad intent is explicit`);
  }

  const singaporeCountryIntent = await resolveExplicitPlaceMentionsWithProvider(
    [{ sourceText: "Singapore", role: "preferred", travelIntent: "planning-area" }],
    createNominatimPlaceProvider(fetchFixture),
  );
  assert.equal(singaporeCountryIntent.mentions[0]?.placeType, "country");
  assert.equal(singaporeCountryIntent.mentions[0]?.requiresBaseSelection, true);
});
