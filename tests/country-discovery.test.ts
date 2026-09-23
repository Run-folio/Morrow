import assert from "node:assert/strict";
import test from "node:test";
import { canonicalPlaceSuggestionSuitableAsNearbyBase, nearbyBaseAnchorForMention, regionalBaseSuggestions, resolvePlaceMentions } from "../lib/easyt/place-intelligence.ts";
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
  const natureShort = buildCountryDiscovery(mention("Tajikistan"), { totalNights: 6, interests: ["nature"] });
  assert.ok(!(natureShort.selectedIds.includes("panjakent") && natureShort.selectedIds.includes("khorog")),
    "distant places without route evidence must not both be preselected for a short trip");
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
  assert.ok(philippines.candidates.every((candidate) => !candidate.placeId.startsWith("route-base:")));
  assert.ok(!philippines.candidates.some((candidate) => candidate.name === "Palawan"));
  assert.ok(philippines.candidates.every((candidate) => ["city", "town", "transport_gateway"].includes(candidate.placeType)));
  const shortPhilippines = buildCountryDiscovery(mention("Philippines"), { totalNights: 6 });
  const chosen = shortPhilippines.selectedIds.map((id) => shortPhilippines.candidates.find((candidate) => candidate.placeId === id)!);
  const minimums = { Manila: 2, Cebu: 3 } as Record<string, number>;
  assert.ok(chosen.reduce((sum, candidate) => sum + (minimums[candidate.name] ?? 2), 0) + Math.max(0, chosen.length - 1) <= 6);
  const existingCebu = buildCountryDiscovery(mention("Philippines"), { totalNights: 5, existingPlaceIds: ["cebu-city"] });
  assert.deepEqual(existingCebu.selectedIds, [], "a committed three-night base and another two-night base need a transfer allowance");
});

test("interest ranking uses supported evidence and explicit deselection remains authoritative", () => {
  const tajikistan = mention("Tajikistan");
  const food = buildCountryDiscovery(tajikistan, { totalNights: 14, interests: ["food"] });
  const nature = buildCountryDiscovery(tajikistan, { totalNights: 14, interests: ["nature"] });
  assert.notDeepEqual(food.candidates.map((candidate) => candidate.placeId), nature.candidates.map((candidate) => candidate.placeId));
  const first = food.selectedIds[0];
  assert.ok(first);
  const explicit = updateCountryDiscoveryChoice(food.selectedIds, first, false);
  const restored = buildCountryDiscovery(tajikistan, { totalNights: 14, interests: ["food"], explicitChoiceIds: explicit });
  assert.ok(!restored.selectedIds.includes(first));
});

test("sparse country knowledge remains a search fallback and does not invent recommendations", () => {
  const result = buildCountryDiscovery(mention("Eritrea"), { totalNights: 10 });
  assert.deepEqual(result.candidates, []);
  assert.deepEqual(result.selectedIds, []);
});

test("a broad region never recommends a place merely because it shares a country", () => {
  const patagonia = buildCountryDiscovery(mention("Patagonia"), { totalNights: 14, interests: ["nature"] });
  assert.ok(!patagonia.candidates.some((candidate) => candidate.name === "Buenos Aires"));
  assert.ok(patagonia.candidates.every((candidate) => ["el-calafate", "el-chalten", "puerto-natales"].includes(candidate.placeId)));
  const africa = buildCountryDiscovery(mention("Africa"), { totalNights: 14 });
  const selectedCountries = new Set(africa.selectedIds.map((id) => africa.candidates.find((candidate) => candidate.placeId === id)?.country));
  assert.ok(selectedCountries.size <= 1, "continent-scale defaults need a coherent single-country starting focus");
});

test("multi-country time is shared conservatively and Serengeti narrows Africa without turning it into a base", () => {
  const journey = resolvePlaceMentions("Japan and China").mentions;
  const japan = journey.find((item) => item.canonicalName === "Japan")!;
  const single = buildCountryDiscovery(japan, { totalNights: 10 });
  const multi = buildCountryDiscovery(japan, { totalNights: 10, mentions: journey });
  assert.equal(single.availableNights, 10);
  assert.equal(multi.availableNights, 5);
  assert.ok(multi.selectedIds.length <= single.selectedIds.length);
  const foreignStops = buildCountryDiscovery(japan, { totalNights: 14, existingPlaceIds: ["beijing", "shanghai", "xian"] });
  const withoutForeignStops = buildCountryDiscovery(japan, { totalNights: 14 });
  assert.deepEqual(foreignStops.selectedIds, withoutForeignStops.selectedIds,
    "other countries' committed places must not consume Japan's starting-set cap");

  const africaJourney = resolvePlaceMentions("Africa and Serengeti").mentions;
  const africa = africaJourney.find((item) => item.canonicalName === "Africa")!;
  const serengeti = africaJourney.find((item) => item.canonicalName === "Serengeti National Park")!;
  assert.ok(serengeti);
  assert.equal(serengeti.placeType, "natural_area");
  assert.deepEqual(serengeti.parentCountries, ["Tanzania"]);
  const serengetiAnchor = nearbyBaseAnchorForMention(serengeti)!;
  assert.ok(serengetiAnchor);
  const supportedBase = regionalBaseSuggestions(serengeti).find((candidate) => candidate.canonicalPlaceId === "seronera");
  assert.ok(supportedBase, "a reviewed Seronera overnight locality should be offered without provider dependency");
  assert.ok(canonicalPlaceSuggestionSuitableAsNearbyBase(serengetiAnchor, {
    canonicalPlaceId: supportedBase.canonicalPlaceId, name: supportedBase.name,
    label: `${supportedBase.name}, ${supportedBase.country}`, country: supportedBase.country,
    region: supportedBase.region, placeType: supportedBase.placeType,
    coordinates: supportedBase.coordinates, routability: "direct_destination", provenance: supportedBase.provenance,
  }));
  const discovery = buildCountryDiscovery(africa, { mentions: africaJourney, interests: ["nature"], totalNights: 14 });
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
