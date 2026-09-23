import assert from "node:assert/strict";
import test from "node:test";
import { resolvePlaceMentions } from "../lib/easyt/place-intelligence.ts";
import { buildCountryDiscovery, updateCountryDiscoveryChoice } from "../lib/easyt/country-discovery.ts";

const mention = (name: string) => {
  const resolved = resolvePlaceMentions(name).mentions[0];
  assert.ok(resolved, name + " resolves");
  return resolved;
};

test("Tajikistan and Madagascar have canonical recommendation-first starting sets", () => {
  for (const name of ["Tajikistan", "Madagascar"]) {
    const result = buildCountryDiscovery(mention(name), { totalNights: 12 });
    assert.ok(result.candidates.length >= 3, name + ": useful supported shortlist");
    assert.ok(result.selectedIds.length >= 1 && result.selectedIds.length <= 3);
    assert.ok(result.candidates.every((candidate) => candidate.countryCode && candidate.coordinates && candidate.provenance.length));
    assert.ok(result.candidates.every((candidate) => candidate.country === name));
  }
});

test("short trips select fewer places and existing explicit Tokyo is never selected twice", () => {
  const japan = mention("Japan");
  const short = buildCountryDiscovery(japan, { totalNights: 6 });
  const long = buildCountryDiscovery(japan, { totalNights: 24 });
  assert.ok(short.selectedIds.length <= 2);
  assert.ok(long.selectedIds.length >= short.selectedIds.length);
  const withTokyo = buildCountryDiscovery(japan, { totalNights: 14, existingPlaceIds: ["tokyo"] });
  assert.ok(!withTokyo.selectedIds.includes("tokyo"));
  assert.ok(withTokyo.candidates.some((candidate) => candidate.placeId === "tokyo" && candidate.alreadyInTrip));
});

test("Thailand recommendations deduplicate names and Philippines only recommends overnight-capable places", () => {
  const thailand = buildCountryDiscovery(mention("Thailand"), { totalNights: 12 });
  const keys = thailand.candidates.map((candidate) => candidate.name.toLowerCase() + "|" + candidate.countryCode);
  assert.equal(new Set(keys).size, keys.length);
  const philippines = buildCountryDiscovery(mention("Philippines"), { totalNights: 12 });
  assert.ok(philippines.candidates.length >= 2);
  assert.ok(philippines.candidates.every((candidate) => ["city", "town", "transport_gateway"].includes(candidate.placeType)));
});

test("interest ranking uses supported evidence and explicit deselection remains authoritative", () => {
  const panama = mention("Panama");
  const food = buildCountryDiscovery(panama, { totalNights: 14, interests: ["food"] });
  const nature = buildCountryDiscovery(panama, { totalNights: 14, interests: ["nature"] });
  assert.notDeepEqual(food.candidates.map((candidate) => candidate.placeId), nature.candidates.map((candidate) => candidate.placeId));
  const first = food.selectedIds[0];
  assert.ok(first);
  const explicit = updateCountryDiscoveryChoice(food.selectedIds, first, false);
  const restored = buildCountryDiscovery(panama, { totalNights: 14, interests: ["food"], explicitChoiceIds: explicit });
  assert.ok(!restored.selectedIds.includes(first));
});

test("sparse country knowledge remains a search fallback and does not invent recommendations", () => {
  const result = buildCountryDiscovery(mention("Eritrea"), { totalNights: 10 });
  assert.deepEqual(result.candidates, []);
  assert.deepEqual(result.selectedIds, []);
});
