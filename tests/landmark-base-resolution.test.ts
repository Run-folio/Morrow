import assert from "node:assert/strict";
import test from "node:test";
import { appendSelectedPlanningAreaMention, nearbyBaseAnchorForMention, canonicalPlaceSuggestionSuitableAsNearbyBase,
  PLACE_INTELLIGENCE_VERSION, PLACE_INTELLIGENCE_PARSER_VERSION, type CanonicalPlaceSuggestion, type PlaceProviderCandidate } from "../lib/easyt/place-intelligence.ts";
import { createOpenWorldPlaceProvider, searchOpenWorldNearbyBaseSuggestions } from "../lib/easyt/open-world-place.server.ts";
import { projectHomepageInput } from "../lib/easyt/home-trip-handoff.ts";
import { emptyHomepageInput } from "./fixtures/homepage-dual-entry.ts";

// Actual provider identities observed on staging; never used by production code.
const cases = [
  { name: "Taj Mahal", id: "nominatim:way:375257537", country: "India", region: "Uttar Pradesh", coordinates: [78.0421013, 27.1750075], base: "Agra", baseCoordinates: [78.0098161, 27.1752554] },
  { name: "Taj Mahal Palace", id: "photon:W:28846517", country: "India", region: "Maharashtra", coordinates: [72.8332848, 18.921778], base: "Mumbai", baseCoordinates: [72.8692035, 19.054999] },
  { name: "Angkor Wat", id: "nominatim:way:1113380295", country: "Cambodia", region: "Siem Reap", coordinates: [103.8665896, 13.412521], base: "Siem Reap", baseCoordinates: [103.8590321, 13.3617562] },
] as const;

for (const place of cases) {
  test(`${place.name} retains identity and resolves its provider locality during spatial-provider failure`, async () => {
    const suggestion: CanonicalPlaceSuggestion = {
      canonicalPlaceId: `open-world:${place.id}`, name: place.name, label: place.name,
      country: place.country, region: place.region, coordinates: [...place.coordinates],
      accessPlaceName: place.base, placeType: "landmark", routability: "anchor_or_poi",
      provenance: [{ id: place.id, label: "Provider identity", kind: "provider", supports: "Provider geographic identity" }],
    };
    const { mention } = appendSelectedPlanningAreaMention({ version: PLACE_INTELLIGENCE_VERSION,
      parserVersion: PLACE_INTELLIGENCE_PARSER_VERSION, sequenceKind: "unordered", mentions: [], issues: [] }, suggestion);
    const recovered = JSON.parse(JSON.stringify(mention));
    assert.equal(recovered.canonicalPlaceId, suggestion.canonicalPlaceId);
    assert.deepEqual(recovered.coordinates, place.coordinates);
    assert.equal(recovered.accessPlaceName, place.base);
    const snapshot = emptyHomepageInput();
    snapshot.entries = [{ id: "landmark-occurrence", text: suggestion.name, selection: suggestion }];
    const projection = projectHomepageInput({ snapshot, profile: null, handoffId: "landmark-handoff" });
    assert.ok(projection.ok);
    const homeMention = projection.draft.structuredBrief?.placeMentions?.[0];
    assert.equal(homeMention?.accessPlaceName, place.base);
    assert.equal(homeMention?.canonicalPlaceId, suggestion.canonicalPlaceId);
    assert.deepEqual(homeMention?.coordinates, place.coordinates);
    const anchor = nearbyBaseAnchorForMention(recovered)!;
    const candidate: PlaceProviderCandidate = { providerId: "node:base", canonicalName: place.base,
      placeType: "city", parentCountries: [place.country], parentRegionId: place.region,
      coordinates: [...place.baseCoordinates], routability: "direct_destination" };
    const provider = createOpenWorldPlaceProvider({ cache: new Map(), sources: [{
      id: "fixture", label: "Existing place provider",
      nearby: async () => { throw Error("spatial provider unavailable"); },
      search: async (query, context) => {
        assert.equal(query, place.base);
        assert.deepEqual(context.explicitCountryNames, [place.country]);
        return [candidate];
      },
    }] });
    const bases = await searchOpenWorldNearbyBaseSuggestions(anchor, {}, provider);
    assert.equal(bases[0]?.name, place.base);
    assert.ok(canonicalPlaceSuggestionSuitableAsNearbyBase(anchor, bases[0]));
    assert.equal(recovered.canonicalName, place.name);
    assert.equal(recovered.routability, "anchor_or_poi");
    assert.equal(recovered.directlyRoutable, false);
  });
}

test("a locality hint cannot bypass the geographic base verifier", async () => {
  const palace = { canonicalName: "Taj Mahal Palace", placeType: "landmark" as const,
    parentCountries: ["India"], parentRegionId: "Maharashtra", coordinates: [72.8332848, 18.921778] as [number, number], accessPlaceName: "Agra" };
  const provider = createOpenWorldPlaceProvider({ cache: new Map(), sources: [{ id: "fixture", label: "Fixture",
    nearby: async () => [], search: async () => [{ providerId: "node:567267943", canonicalName: "Agra", placeType: "city",
      parentCountries: ["India"], parentRegionId: "Uttar Pradesh", coordinates: [78.0098161, 27.1752554], routability: "direct_destination" }],
  }] });
  assert.deepEqual(await searchOpenWorldNearbyBaseSuggestions(palace, {}, provider), []);
});
