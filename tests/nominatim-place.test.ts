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
  options: { importance?: number; state?: string; linkedPlace?: string; adminLevel?: number; placeRank?: number; lat?: string; lon?: string } = {},
): FixtureResult {
  return {
    name,
    osm_type: addressType === "city" || addressType === "town" ? "node" : "relation",
    osm_id: providerId,
    type: addressType === "country" ? "administrative" : addressType,
    category: addressType === "country" || addressType === "state" ? "boundary" : "place",
    addresstype: addressType,
    importance: options.importance ?? 0.5,
    place_rank: options.placeRank,
    lat: options.lat ?? "1",
    lon: options.lon ?? "2",
    address: {
      country,
      country_code: country.slice(0, 2).toLocaleLowerCase(),
      ...(options.state ? { state: options.state } : {}),
      ...(addressType === "city" ? { city: name } : {}),
      ...(addressType === "town" ? { town: name } : {}),
    },
    ...(options.linkedPlace || options.adminLevel !== undefined ? { extratags: {
      ...(options.linkedPlace ? { linked_place: options.linkedPlace } : {}),
      ...(options.adminLevel !== undefined ? { admin_level: String(options.adminLevel) } : {}),
    } } : {}),
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
  uyunui: {
    freeform: [raw("Uyuni", 20, "Bolivia", "town", { importance: 0.57, lat: "-20.46", lon: "-66.825" })],
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
  "the fjords": {
    // Representative of the live failure shape: the gazetteer can return a
    // concrete municipality for a traveller's collective landscape phrase.
    freeform: [raw("Fjords", 21, "Norway", "municipality", { importance: 0.42, state: "Møre og Romsdal", lat: "62.10", lon: "7.21" })],
    city: [],
  },
  Uluru: {
    // Captured from Nominatim on 2026-08-29. Natural rock and peak taxonomy
    // must survive the adapter so the unrelated Indian village cannot win.
    freeform: [{
      name: "Uluṟu",
      osm_type: "relation",
      osm_id: 21227993,
      type: "bare_rock",
      category: "natural",
      addresstype: "natural",
      importance: 0.4736755564168844,
      lat: "-25.3455545",
      lon: "131.0369615",
      address: { country: "Australia", country_code: "au", state: "Northern Territory" },
      namedetails: { "name:en": "Uluṟu", alt_name: "Ayers Rock" },
    }, raw("Uluru", 2904717090, "India", "village", { importance: 0.14670416800183103, state: "Karnataka", lat: "15.4214695", lon: "77.0288900" })],
    city: [],
  },
  "San Pedro": {
    freeform: [
      raw("San Pedro", 30, "Philippines", "city", { importance: 0.74, state: "Laguna", lat: "14.3639", lon: "121.0568" }),
      raw("San Pedro", 33, "Mexico", "state", { importance: 0.2, state: "Coahuila", lat: "26.1249", lon: "-102.7746" }),
    ],
    city: [],
  },
  "San Pedro, Belize": {
    freeform: [{
      ...raw("San Pedro Town", 31, "Belize", "town", { importance: 0.38, state: "Belize District", linkedPlace: "town", lat: "17.9204", lon: "-87.9622" }),
      namedetails: { alt_name: "San Pedro", "name:en": "San Pedro Town" },
    }, raw("San Pedro", 32, "Belize", "village", { importance: 0.16, state: "Corozal", linkedPlace: "village", lat: "18.3386", lon: "-88.4953" })],
    city: [],
  },
  Scotland: {
    freeform: [
      raw("Scotland", 40, "United Kingdom", "state", { importance: 0.83, adminLevel: 4, lat: "56.78", lon: "-4.11" }),
      raw("Scotland", 41, "United States", "town", { importance: 0.31, state: "Texas", lat: "33.66", lon: "-98.47" }),
      raw("Scotland", 42, "United States", "village", { importance: 0.18, state: "Connecticut", lat: "41.70", lon: "-72.08" }),
    ],
    city: [],
  },
  Wales: {
    freeform: [
      raw("Wales", 43, "United Kingdom", "state", { importance: 0.81, adminLevel: 4, lat: "52.29", lon: "-3.74" }),
      raw("Wales", 44, "United States", "town", { importance: 0.28, state: "Maine", lat: "44.18", lon: "-70.07" }),
    ],
    city: [],
  },
  Ireland: {
    freeform: [
      raw("Ireland", 45, "Ireland", "country", { importance: 0.87, adminLevel: 2, lat: "52.87", lon: "-7.98" }),
      raw("Ireland", 46, "United Kingdom", "village", { importance: 0.24, state: "England", lat: "52.06", lon: "-0.35" }),
    ],
    city: [],
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

test("generic edit-distance tolerance accepts a provider-returned locality typo", async () => {
  const candidates = await searchNominatimTravelCandidates("uyunui", { travelIntent: "route-stop" }, fetchFixture);
  assert.equal(candidates[0]?.canonicalName, "Uyuni");
  assert.equal(candidates[0]?.placeType, "town");
  assert.equal(candidates[0]?.routability, "direct_destination");
  assert.equal(candidates[0]?.matchQuality, "alias");
  assert.deepEqual(candidates[0]?.aliases, ["uyunui"]);
});

test("captured bare-rock taxonomy keeps Uluru as an Australian anchor instead of an unrelated locality", async () => {
  const candidates = await searchNominatimTravelCandidates("Uluru", { travelIntent: "anchor" }, fetchFixture);
  assert.equal(candidates[0]?.canonicalName, "Uluṟu");
  assert.equal(candidates[0]?.country, "Australia");
  assert.equal(candidates[0]?.placeType, "natural_area");
  assert.equal(candidates[0]?.routability, "needs_base_selection");

  const result = await resolveExplicitPlaceMentionsWithProvider(
    [{ sourceText: "Uluru", role: "anchor", travelIntent: "anchor" }],
    createNominatimPlaceProvider(fetchFixture),
  );
  assert.equal(result.mentions[0]?.canonicalName, "Uluṟu");
  assert.deepEqual(result.mentions[0]?.parentCountries, ["Australia"]);
  assert.equal(result.mentions[0]?.requiresBaseSelection, true);
  assert.equal(result.mentions[0]?.directlyRoutable, false);
});

test("a single explicit country triggers bounded contextual retrieval and honors an exact provider alias", async () => {
  const candidates = await searchNominatimTravelCandidates("San Pedro", { travelIntent: "route-stop", countryNames: ["Belize"] }, fetchFixture);
  assert.equal(candidates[0]?.canonicalName, "San Pedro Town");
  assert.equal(candidates[0]?.country, "Belize");
  assert.equal(candidates[0]?.matchQuality, "exact");

  const result = await resolveExplicitPlaceMentionsWithProvider(
    [{ sourceText: "San Pedro", role: "preferred", travelIntent: "route-stop" }],
    createNominatimPlaceProvider(fetchFixture),
    { countryNames: ["Belize"] },
  );
  assert.equal(result.mentions[0]?.canonicalName, "San Pedro Town");
  assert.deepEqual(result.mentions[0]?.parentCountries, ["Belize"]);
  assert.equal(result.mentions[0]?.status, "resolved");
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

test("captured fjords provider shape cannot replace collective regional intent with a municipality", async () => {
  const result = await resolveExplicitPlaceMentionsWithProvider(
    [{ sourceText: "the fjords", role: "preferred", travelIntent: "route-stop" }],
    createNominatimPlaceProvider(fetchFixture),
    { countryNames: ["Norway"] },
  );
  const mention = result.mentions[0];
  assert.equal(mention?.sourceText, "the fjords");
  assert.equal(mention?.canonicalName, "the fjords");
  assert.equal(mention?.canonicalPlaceId, undefined);
  assert.equal(mention?.placeType, "natural_area");
  assert.equal(mention?.status, "ambiguous");
  assert.equal(mention?.directlyRoutable, false);
  assert.deepEqual(mention?.parentCountries, ["Norway"]);
  assert.equal(mention?.candidates[0]?.canonicalName, "Fjords");
  assert.equal(result.issues.some((issue) => issue.sourceText === "the fjords" && issue.blocksRoute), true);
});

test("provider hierarchy and importance mark exact countries and first-order regions as recognised geographies", async () => {
  for (const phrase of ["Scotland", "Wales", "Ireland"]) {
    const candidates = await searchNominatimTravelCandidates(phrase, { travelIntent: "route-stop" }, fetchFixture);
    const geography = candidates.find((candidate) => candidate.parentCountries?.[0] !== "United States"
      && candidate.routability !== "direct_destination");
    assert.ok((geography?.geographicSignificance ?? 0) >= 0.72, `${phrase} should carry provider-backed hierarchy evidence`);
    assert.equal(geography?.matchQuality, "exact");

    const resolved = await resolveExplicitPlaceMentionsWithProvider(
      [{ sourceText: phrase, role: "preferred", travelIntent: "route-stop" }],
      createNominatimPlaceProvider(fetchFixture),
    );
    assert.equal(resolved.mentions[0]?.canonicalName, phrase);
    assert.notEqual(resolved.mentions[0]?.routability, "direct_destination");
    assert.equal(resolved.mentions[0]?.requiresBaseSelection, true, `${phrase} should request a base rather than becoming a stop`);
  }
});
