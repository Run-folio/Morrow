import assert from "node:assert/strict";
import test from "node:test";
import { searchPhotonTravelCandidates } from "../lib/easyt/photon-place.server.ts";

function response(features: unknown[]) {
  return { ok: true, json: async () => ({ type: "FeatureCollection", features }) } as Response;
}

test("Photon supplies generic typo retrieval with provider-owned identity and coordinates", async () => {
  const fetchFixture: typeof fetch = async () => response([{
    type: "Feature",
    properties: {
      osm_type: "N",
      osm_id: 795493613,
      osm_key: "place",
      osm_value: "city",
      type: "district",
      name: "Uyuni",
      city: "Uyuni",
      state: "Potosí",
      country: "Bolivia",
      countrycode: "BO",
    },
    geometry: { type: "Point", coordinates: [-66.8239072, -20.4628406] },
  }]);

  const candidates = await searchPhotonTravelCandidates("uyunui", { travelIntent: "route-stop" }, fetchFixture);
  assert.deepEqual(candidates.map(({ canonicalName, placeType, routability, matchQuality }) => ({ canonicalName, placeType, routability, matchQuality })), [{
    canonicalName: "Uyuni",
    placeType: "city",
    routability: "direct_destination",
    matchQuality: "alias",
  }]);
  assert.equal(candidates[0]?.providerId, "N:795493613");
  assert.deepEqual(candidates[0]?.coordinates, [-66.8239072, -20.4628406]);
});

test("Photon discards unsupported fuzzy guesses and features without coordinates", async () => {
  const fetchFixture: typeof fetch = async () => response([
    { properties: { osm_type: "N", osm_id: 1, osm_key: "place", osm_value: "city", name: "Unrelated", country: "Nowhere" }, geometry: { coordinates: [1, 2] } },
    { properties: { osm_type: "N", osm_id: 2, osm_key: "place", osm_value: "city", name: "Uyuni", country: "Bolivia" } },
  ]);
  assert.deepEqual(await searchPhotonTravelCandidates("uyunui", { travelIntent: "route-stop" }, fetchFixture), []);
});

test("generic edit-distance typo tolerance is not specific to Uyuni", async () => {
  const fetchFixture: typeof fetch = async () => response([{
    properties: {
      osm_type: "N",
      osm_id: 194330205,
      osm_key: "place",
      osm_value: "city",
      name: "Salta",
      state: "Salta",
      country: "Argentina",
      countrycode: "AR",
    },
    geometry: { coordinates: [-65.4232, -24.7821] },
  }]);
  const candidates = await searchPhotonTravelCandidates("sallta", { travelIntent: "route-stop" }, fetchFixture);
  assert.equal(candidates[0]?.canonicalName, "Salta");
  assert.equal(candidates[0]?.matchQuality, "alias");
});

test("Photon natural rock features remain anchors rather than unsupported guesses", async () => {
  const fetchFixture: typeof fetch = async () => response([{
    properties: {
      osm_type: "R",
      osm_id: 21227993,
      osm_key: "natural",
      osm_value: "bare_rock",
      name: "Uluru",
      state: "Northern Territory",
      country: "Australia",
      countrycode: "AU",
    },
    geometry: { coordinates: [131.0369615, -25.3455545] },
  }]);
  const candidates = await searchPhotonTravelCandidates("Uluru", { travelIntent: "anchor" }, fetchFixture);
  assert.equal(candidates[0]?.placeType, "natural_area");
  assert.equal(candidates[0]?.routability, "needs_base_selection");
});

test("Photon preserves first-order admin evidence for exact major geographies", async () => {
  const fetchFixture: typeof fetch = async () => response([{
    properties: {
      osm_type: "R",
      osm_id: 58446,
      osm_key: "place",
      osm_value: "state",
      type: "state",
      name: "Scotland",
      country: "United Kingdom",
      countrycode: "GB",
      extra: { admin_level: "4" },
    },
    geometry: { coordinates: [-4.1140518, 56.7861112] },
  }, {
    properties: {
      osm_type: "R",
      osm_id: 114604,
      osm_key: "place",
      osm_value: "village",
      type: "city",
      name: "Scotland",
      state: "Texas",
      country: "United States",
      countrycode: "US",
      extra: { admin_level: "8" },
    },
    geometry: { coordinates: [-98.4699521, 33.6598102] },
  }]);

  const candidates = await searchPhotonTravelCandidates("Scotland", { travelIntent: "route-stop" }, fetchFixture);
  const canonical = candidates.find((candidate) => candidate.country === "United Kingdom");
  const locality = candidates.find((candidate) => candidate.country === "United States");
  assert.equal(canonical?.placeType, "region");
  assert.equal(canonical?.administrativeLevel, 4);
  assert.ok((canonical?.geographicSignificance ?? 0) >= 0.9);
  assert.equal(locality?.geographicSignificance, undefined);
});
