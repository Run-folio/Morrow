import assert from "node:assert/strict";
import test from "node:test";
import { resolvePlaceMentions } from "../lib/easyt/place-intelligence.ts";
import { buildCountryDiscovery, updateCountryDiscoveryChoice } from "../lib/easyt/country-discovery.ts";
import { extractStructuredTripBrief, mergeStructuredTripBrief } from "../lib/easyt/structured-trip-brief.ts";
import { generateRouteCandidates } from "../lib/easyt/route-candidates.ts";
import { analyzeRouteCountryContinuity } from "../lib/easyt/route-country-continuity.ts";

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
  assert.ok(buildCountryDiscovery(mention("Madagascar"), { totalNights: 12 }).selectedIds.length <= 2,
    "without stay guidance, a longer country should start conservatively");
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
  assert.ok(philippines.candidates.length >= 3);
  assert.ok(philippines.candidates.some((candidate) => candidate.name === "Puerto Princesa"));
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

test("multi-country time is shared conservatively and Serengeti narrows Africa without turning it into a base", () => {
  const journey = resolvePlaceMentions("Japan and China").mentions;
  const japan = journey.find((item) => item.canonicalName === "Japan")!;
  const single = buildCountryDiscovery(japan, { totalNights: 10 });
  const multi = buildCountryDiscovery(japan, { totalNights: 10, mentions: journey });
  assert.equal(single.availableNights, 10);
  assert.equal(multi.availableNights, 5);
  assert.ok(multi.selectedIds.length <= single.selectedIds.length);

  const africa = mention("Africa");
  const serengeti = { ...africa, mentionId: "serengeti", canonicalName: "Serengeti National Park",
    placeType: "natural_area" as const, parentCountries: ["Tanzania"], routability: "anchor_or_poi" as const,
    role: "anchor" as const, isAnchor: true };
  const discovery = buildCountryDiscovery(africa, { mentions: [africa, serengeti], interests: ["nature"], totalNights: 14 });
  assert.ok(discovery.candidates.length > 0);
  assert.ok(discovery.candidates.every((candidate) => candidate.country === "Tanzania"));
  assert.ok(discovery.candidates.every((candidate) => candidate.placeId !== "serengeti"));
});

test("an explicit empty draft survives structured-brief save, reload, and merge", () => {
  const tajikistan = mention("Tajikistan");
  const base = extractStructuredTripBrief("Tajikistan");
  const saved = JSON.parse(JSON.stringify({
    ...base,
    countryDiscoveryChoices: { [tajikistan.mentionId]: [] },
  }));
  const merged = mergeStructuredTripBrief(saved, {});
  const result = buildCountryDiscovery(tajikistan, {
    totalNights: 10,
    explicitChoiceIds: merged.countryDiscoveryChoices?.[tajikistan.mentionId],
  });
  assert.deepEqual(result.selectedIds, []);
});

test("selected canonical places hand to the existing #335 country-block route engine", () => {
  const tajikistan = buildCountryDiscovery(mention("Tajikistan"), { totalNights: 12 });
  const japan = buildCountryDiscovery(mention("Japan"), { totalNights: 12 });
  const selected = (result: typeof tajikistan) => result.selectedIds.map((id) => result.candidates.find((item) => item.placeId === id)!);
  const [tj1, tj2] = selected(tajikistan);
  const [jp1, jp2] = selected(japan);
  assert.ok(tj1 && tj2 && jp1 && jp2);
  const stops = [tj1, jp1, tj2, jp2].map((candidate, index) => ({
    id: candidate.placeId + index, name: candidate.name, country: candidate.country,
    countryCode: candidate.countryCode, canonicalPlaceId: candidate.placeId,
    coordinates: candidate.coordinates!,
  }));
  const generated = generateRouteCandidates({ origin: { name: "Madrid", coordinates: [-3.7038, 40.4168] }, stops,
    estimateLeg: () => ({ mode: "flight", distanceKm: 1000, durationMinutes: 180, label: "Fixture", note: "Fixture", confidence: "medium" }) });
  assert.ok(generated.candidates.some((candidate) => analyzeRouteCountryContinuity(candidate.stops).reentryCount === 0));
});
