import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { addMappedPlaceToTrip, mappedPlacePinId } from "../lib/easyt/map-place-itinerary.ts";
import { resolveOsmPlaceDisplayName, resolvePlaceDisplayName } from "../lib/easyt/place-display-name.ts";
import { operationalPlaceStatus } from "../lib/easyt/place-status.ts";
import type { EasyTTrip, PlanItem } from "../lib/easyt/trip.ts";

const fixtures = [
  {
    label: "Korean native and English",
    tags: { name: "김세리 식당", "name:en": "Kim Seri Restaurant" },
    expected: { name: "Kim Seri Restaurant", nativeName: "김세리 식당" },
  },
  {
    label: "Japanese supplied transliteration",
    tags: { name: "すし大", "name:ja-Latn": "Sushi Dai" },
    expected: { name: "Sushi Dai", nativeName: "すし大" },
  },
  {
    label: "Chinese native only",
    tags: { name: "全聚德" },
    expected: { name: "全聚德" },
  },
  {
    label: "Arabic international name",
    tags: { name: "مطعم زرياب", int_name: "Ziryab Restaurant" },
    expected: { name: "Ziryab Restaurant", nativeName: "مطعم زرياب" },
  },
  {
    label: "Greek provider-combined name",
    tags: { name: "Ταβέρνα (Taverna)" },
    expected: { name: "Taverna", nativeName: "Ταβέρνα" },
  },
  {
    label: "Cyrillic provider English name",
    tags: { name: "Ресторан Прага", "name:en": "Prague Restaurant" },
    expected: { name: "Prague Restaurant", nativeName: "Ресторан Прага" },
  },
  {
    label: "already English Latin name",
    tags: { name: "Corner Bistro" },
    expected: { name: "Corner Bistro" },
  },
  {
    label: "mixed Korean provider-combined name",
    tags: { name: "김세리 식당(Kim Seri Restaurant)" },
    expected: { name: "Kim Seri Restaurant", nativeName: "김세리 식당" },
  },
] as const;

for (const fixture of fixtures) {
  test(`canonical English place name: ${fixture.label}`, () => {
    assert.deepEqual(resolveOsmPlaceDisplayName({ ...fixture.tags }, "en"), fixture.expected);
  });
}

test("missing optional name metadata keeps the authentic provider name", () => {
  assert.deepEqual(resolvePlaceDisplayName({ defaultName: "남해횟집" }, "en"), { name: "남해횟집" });
  assert.equal(resolvePlaceDisplayName({}, "en"), null);
});

test("a malformed non-Latin English tag does not outrank a supplied Latin transliteration", () => {
  assert.deepEqual(resolveOsmPlaceDisplayName({
    name: "東京食堂",
    "name:en": "東京食堂",
    "name:ja-Latn": "Tokyo Shokudo",
  }, "en"), { name: "Tokyo Shokudo", nativeName: "東京食堂" });
});

test("a requested non-English provider name wins without changing provider identity", () => {
  assert.deepEqual(resolvePlaceDisplayName({
    defaultName: "Athens Cafe",
    localizedNames: { el: "Καφέ Αθήνα", en: "Athens Cafe" },
  }, "el"), { name: "Καφέ Αθήνα" });
});

test("static map existence and opening-hours text never become a live operational claim", () => {
  assert.equal(operationalPlaceStatus({ provider: "openstreetmap" }), undefined);
  assert.equal(operationalPlaceStatus({ provider: "openstreetmap", openingHours: "Mo-Su 09:00-22:00" }), undefined);
  assert.equal(operationalPlaceStatus({ provider: "google-places" }), undefined);
  assert.equal(operationalPlaceStatus({ provider: "google-places", businessStatus: "CLOSED_TEMPORARILY" }), undefined);
  assert.equal(operationalPlaceStatus({ provider: "google-places", businessStatus: "OPERATIONAL" }), true);
});

function itineraryTrip(): EasyTTrip {
  const planItem: PlanItem = {
    id: "day-1",
    stopId: "seoul",
    dayNumber: 1,
    date: "2026-08-27",
    type: "activity",
    title: "Explore Seoul",
    reason: "Keep the day coherent.",
    notes: ["Previous trip edit"],
    startsAt: null,
    endsAt: null,
    bookingUrl: null,
    latitude: null,
    longitude: null,
  };
  return {
    schemaVersion: 1,
    id: "trip-place-display",
    ownerId: "owner-a",
    title: "Seoul trip",
    status: "planned",
    startDate: "2026-08-27",
    endDate: "2026-08-28",
    travellers: 2,
    currency: "GBP",
    brief: { origin: "Tokyo", mustDo: "Eat locally", pace: "slow", hotelChanges: "few", budgetBand: "mid", selectedPlaces: {}, customActivities: { 1: ["Previous trip edit"] }, mapPins: [] },
    stops: [{ id: "seoul", order: 0, name: "Seoul", country: "South Korea", latitude: 37.5665, longitude: 126.978, arrivalDate: "2026-08-27", departureDate: "2026-08-28", nights: 1 }],
    legs: [],
    planItems: [planItem],
    recommendations: [],
    createdAt: "2026-08-27T08:00:00.000Z",
    updatedAt: "revision-1",
  };
}

test("nearby/selected primary name persists unchanged into itinerary and reload state", () => {
  const display = resolveOsmPlaceDisplayName({ name: "김세리 식당", "name:en": "Kim Seri Restaurant" }, "en");
  assert.ok(display);
  const place = { id: "987654", provider: "openstreetmap" as const, name: display.name, coordinates: [126.98, 37.57] as [number, number] };
  const saved = addMappedPlaceToTrip(itineraryTrip(), place, "restaurant", 1, "seoul");
  const reloaded = structuredClone(saved);

  assert.deepEqual(reloaded.brief.customActivities?.[1], ["Previous trip edit", "Kim Seri Restaurant"]);
  assert.deepEqual(reloaded.planItems[0]?.notes, ["Previous trip edit", "Kim Seri Restaurant"]);
  assert.equal(reloaded.brief.mapPins?.[0]?.title, "Kim Seri Restaurant");
  assert.equal(reloaded.brief.mapPins?.[0]?.id, "venue-1-restaurant-openstreetmap-987654");
  assert.equal(mappedPlacePinId(1, "restaurant", { ...place, name: "A later presentation label" }), reloaded.brief.mapPins?.[0]?.id);
});

test("all Map place surfaces consume the normalized primary name and unknown status is omitted", () => {
  const finder = readFileSync("components/journey-local-finder.tsx", "utf8");
  const workspace = readFileSync("components/journey-map-planner-workspace.tsx", "utf8");
  const map = readFileSync("components/journey-planner-map.tsx", "utf8");
  const provider = readFileSync("app/api/journey-local-search/route.ts", "utf8");
  assert.match(finder, /<h3>\{chosen\.name\}<\/h3>/);
  assert.match(finder, /\{place\.name\}<\/strong>/);
  assert.match(workspace, /selectedLocalPlace\?\.name/);
  assert.match(map, /`Show \$\{place\.name\}`/);
  assert.match(workspace, /selectedLocalPlace\.operational === true \? <div><dt>Status<\/dt><dd>Operational<\/dd><\/div> : null/);
  assert.doesNotMatch(provider, /operational: true as boolean/);
});
