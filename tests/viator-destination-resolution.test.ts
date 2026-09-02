import assert from "node:assert/strict";
import test from "node:test";

import {
  evaluateViatorDestinationResolution,
  normalizeViatorDestinationTaxonomy,
  resolveViatorDestinationFromTaxonomy,
  ViatorDestinationTaxonomyError,
} from "../lib/easyt/viator-destination-resolver.server.ts";

type RawDestination = { destinationId: number; name: string; type: string; parentDestinationId: number; lookupId: string; center?: { latitude: number; longitude: number } };
const destination = (destinationId: number, name: string, type: string, parentDestinationId: number, lookupId: string, latitude?: number, longitude?: number): RawDestination => ({
  destinationId, name, type, parentDestinationId, lookupId,
  ...(latitude !== undefined && longitude !== undefined ? { center: { latitude, longitude } } : {}),
});

const taxonomy = normalizeViatorDestinationTaxonomy({ destinations: [
  destination(6, "Europe", "REGION", 0, "6"),
  destination(2, "Asia", "REGION", 0, "2"),
  destination(3, "Pacific", "REGION", 0, "3"),
  destination(8, "Americas", "REGION", 0, "8"),
  destination(51, "France", "COUNTRY", 6, "6.51"),
  destination(5636, "Île-de-France", "REGION", 51, "6.51.5636"),
  destination(479, "Paris", "CITY", 5636, "6.51.5636.479", 48.8567, 2.351),
  destination(16, "Japan", "COUNTRY", 2, "2.16"),
  destination(23404, "Kanto", "REGION", 16, "2.16.23404"),
  destination(334, "Tokyo", "CITY", 23404, "2.16.23404.334", 35.6895, 139.6917),
  destination(50170, "Kansai", "REGION", 16, "2.16.50170"),
  destination(332, "Kyoto", "CITY", 50170, "2.16.50170.332", 35.0116, 135.768),
  destination(20, "Thailand", "COUNTRY", 2, "2.20"),
  destination(343, "Bangkok", "CITY", 20, "2.20.343", 13.7234, 100.4762),
  destination(57, "Italy", "COUNTRY", 6, "6.57"),
  destination(511, "Rome", "CITY", 57, "6.57.511", 41.8955, 12.4823),
  destination(67, "Spain", "COUNTRY", 6, "6.67"),
  destination(25883, "Catalonia", "REGION", 67, "6.67.25883"),
  destination(562, "Barcelona", "CITY", 25883, "6.67.25883.562", 41.3879, 2.1699),
  destination(60457, "United Kingdom", "COUNTRY", 6, "6.60457"),
  destination(731, "England", "COUNTRY", 60457, "6.60457.731"),
  destination(22327, "Cambridge", "CITY", 731, "6.60457.731.22327", 52.2053, 0.1218),
  destination(215, "Andalusia", "REGION", 67, "6.67.215"),
  destination(700, "Granada", "CITY", 215, "6.67.215.700", 37.1773, -3.5986),
  destination(77, "United States", "COUNTRY", 8, "8.77"),
  destination(5560, "New York State", "STATE", 77, "8.77.5560"),
  destination(687, "New York City", "CITY", 5560, "8.77.5560.687", 40.7164, -74.0132),
  destination(90, "California", "STATE", 77, "8.77.90"),
  destination(901, "San Jose", "CITY", 90, "8.77.90.901", 37.3382, -121.8863),
  destination(22, "Australia", "COUNTRY", 3, "3.22"),
  destination(120, "New South Wales", "STATE", 22, "3.22.120"),
  destination(357, "Sydney", "CITY", 120, "3.22.120.357", -33.8671, 151.2071),
  destination(38, "Canada", "COUNTRY", 8, "8.38"),
  destination(130, "Nova Scotia", "STATE", 38, "8.38.130"),
  destination(4413, "Sydney", "CITY", 130, "8.38.130.4413", 46.0661, -60.18),
  destination(42, "Costa Rica", "COUNTRY", 8, "8.42"),
  destination(800, "San Jose", "CITY", 42, "8.42.800", 9.9281, -84.0907),
  destination(76, "Mexico", "COUNTRY", 8, "8.76"),
  destination(628, "Mexico City", "CITY", 76, "8.76.628", 19.427, -99.1276),
  destination(131, "Belize", "COUNTRY", 8, "8.131"),
  destination(910, "Belize City", "CITY", 131, "8.131.910", 17.5046, -88.1962),
  destination(911, "Caye Caulker", "VILLAGE", 910, "8.131.910.911", 17.7425, -88.0246),
  destination(140, "Nicaragua", "COUNTRY", 8, "8.140"),
  destination(920, "Granada", "CITY", 140, "8.140.920", 11.9344, -85.956),
  destination(141, "Exampleland", "COUNTRY", 8, "8.141"),
  destination(930, "Springfield", "CITY", 141, "8.141.930"),
  destination(931, "Springfield", "CITY", 141, "8.141.931"),
] });

const place = (canonicalPlaceId: string, name: string, country: string, latitude?: number, longitude?: number, extras: Record<string, unknown> = {}) => ({
  canonicalPlaceId, name, country, placeType: "city",
  ...(latitude !== undefined && longitude !== undefined ? { coordinates: { latitude, longitude } } : {}),
  ...extras,
});

for (const [name, country, id, latitude, longitude] of [
  ["Paris", "France", "479", 48.8566, 2.3522],
  ["Tokyo", "Japan", "334", 35.6762, 139.6503],
  ["Kyoto", "Japan", "332", 35.0116, 135.7681],
  ["Bangkok", "Thailand", "343", 13.7563, 100.5018],
  ["Rome", "Italy", "511", 41.9028, 12.4964],
  ["Barcelona", "Spain", "562", 41.3874, 2.1686],
] as const) {
  test(`${name} resolves generically through provider taxonomy`, () => {
    assert.equal(resolveViatorDestinationFromTaxonomy(place(name.toLowerCase(), name, country, latitude, longitude), taxonomy)?.destinationId, id);
  });
}

test("country and coordinates disambiguate duplicate provider names", () => {
  assert.equal(resolveViatorDestinationFromTaxonomy(place("sydney-au", "Sydney", "Australia", -33.8688, 151.2093), taxonomy)?.destinationId, "357");
  assert.equal(resolveViatorDestinationFromTaxonomy(place("san-jose-cr", "San José", "Costa Rica", 9.9281, -84.0907, { aliases: ["San Jose"] }), taxonomy)?.destinationId, "800");
  assert.equal(resolveViatorDestinationFromTaxonomy(place("granada-es", "Granada", "Spain", 37.1773, -3.5986), taxonomy)?.destinationId, "700");
});

test("ISO country context wins over a nested provider constituent country", () => {
  assert.equal(resolveViatorDestinationFromTaxonomy(place("cambridge-uk", "Cambridge", "United Kingdom", 52.2053, 0.1218), taxonomy)?.destinationId, "22327");
});

test("aliases, accents and safe locality suffix normalization are deterministic", () => {
  assert.equal(resolveViatorDestinationFromTaxonomy(place("new-york", "New York", "United States", 40.7128, -74.006), taxonomy)?.destinationId, "687");
  assert.equal(resolveViatorDestinationFromTaxonomy(place("san-jose", "San José", "Costa Rica", undefined, undefined, { aliases: ["San Jose"] }), taxonomy)?.destinationId, "800");
  assert.equal(resolveViatorDestinationFromTaxonomy(place("edo", "Edo", "Japan", 35.6762, 139.6503, { aliases: ["Tokyo"] }), taxonomy)?.resolvedFrom, "exact_alias_country_type");
});

test("exact name plus country and compatible type is sufficient when coordinates are absent", () => {
  assert.equal(resolveViatorDestinationFromTaxonomy(place("rome", "Rome", "Italy"), taxonomy)?.destinationId, "511");
});

test("wrong-country and conflicting-coordinate candidates fail closed", () => {
  assert.equal(resolveViatorDestinationFromTaxonomy(place("barcelona-wrong", "Barcelona", "France", 41.3874, 2.1686), taxonomy), undefined);
  assert.equal(resolveViatorDestinationFromTaxonomy(place("tokyo-wrong", "Tokyo", "Japan", -33.8688, 151.2093), taxonomy), undefined);
});

test("provider ambiguity remains unresolved instead of choosing an arbitrary ID", () => {
  const result = evaluateViatorDestinationResolution(place("springfield", "Springfield", "Exampleland"), taxonomy);
  assert.equal(result.status, "ambiguous");
  assert.equal(result.resolution, undefined);
});

test("a provider parent is used only through explicit taxonomy containment", () => {
  const result = evaluateViatorDestinationResolution(place("caye-caulker", "Caye Caulker", "Belize", 17.7425, -88.0246, { placeType: "town" }), taxonomy);
  assert.equal(result.status, "resolved_via_provider_parent");
  assert.deepEqual(result.resolution, {
    provider: "viator",
    destinationId: "910",
    destinationName: "Belize City",
    parentDestination: { destinationId: "910", destinationName: "Belize City" },
    confidence: "medium",
    resolvedFrom: "parent_destination",
  });
});

test("unsupported places and landmarks remain unsupported", () => {
  assert.equal(evaluateViatorDestinationResolution(place("atlantis", "Atlantis", "United States"), taxonomy).status, "unsupported");
  assert.equal(evaluateViatorDestinationResolution(place("tikal", "Tikal", "Guatemala", 17.222, -89.6237, { placeType: "landmark" }), taxonomy).status, "unsupported");
});

test("malformed taxonomy is rejected as a provider failure", () => {
  for (const malformed of [{}, { destinations: [] }, { destinations: [{ destinationId: 1, name: "Broken" }] }]) {
    assert.throws(() => normalizeViatorDestinationTaxonomy(malformed), (error: unknown) => error instanceof ViatorDestinationTaxonomyError);
  }
});
