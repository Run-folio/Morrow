import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { localFinderQueryKey, type LocalFinderQueryContext } from "../lib/easyt/local-finder-query.ts";

const read = (path: string) => readFileSync(path, "utf8");

const cases = [
  {
    name: "Tokyo stay",
    query: { kind: "stay", city: "Tokyo", country: "Japan", dayId: "tokyo-day-1", coordinates: [139.6917, 35.6895], locale: "en", staySearch: { checkIn: "2026-10-03", checkOut: "2026-10-07", adults: 2, rooms: 1, currency: "GBP" } },
    resultIds: ["tokyo-hotel-a", "tokyo-hotel-b", "tokyo-hotel-c"],
  },
  {
    name: "Ho Chi Minh City stay",
    query: { kind: "stay", city: "Ho Chi Minh City", country: "Vietnam", dayId: "hcmc-day-1", coordinates: [106.6297, 10.8231], locale: "en", staySearch: { checkIn: "2026-10-12", checkOut: "2026-10-16", adults: 2, rooms: 1, currency: "GBP" } },
    resultIds: ["hcmc-hotel-a", "hcmc-hotel-b", "hcmc-hotel-c"],
  },
  {
    name: "Shirakawa eat",
    query: { kind: "restaurant", city: "Shirakawa", country: "Japan", dayId: "shirakawa-day-1", coordinates: [136.9062, 36.2606], locale: "en" },
    resultIds: ["shirakawa-restaurant-a", "shirakawa-restaurant-b", "shirakawa-restaurant-c"],
  },
] satisfies Array<{ name: string; query: LocalFinderQueryContext; resultIds: string[] }>;

test("Tokyo, Ho Chi Minh City, and Shirakawa selection stays inside one provider query", () => {
  for (const fixture of cases) {
    const initialQueryKey = localFinderQueryKey(fixture.query);
    let requestCount = 1;
    let selectedId: string | null = null;
    for (const resultId of fixture.resultIds) {
      selectedId = resultId;
      assert.equal(localFinderQueryKey(fixture.query), initialQueryKey, `${fixture.name}: selection is not query context`);
    }
    assert.equal(requestCount, 1, `${fixture.name}: rapid A → B → C does not request again`);
    assert.equal(selectedId, fixture.resultIds[2], `${fixture.name}: the final selection is C`);

    // View on map and repeated selection are navigation within the same result set.
    selectedId = fixture.resultIds[2];
    assert.equal(localFinderQueryKey(fixture.query), initialQueryKey);
    assert.equal(requestCount, 1);

    // Retry is the only same-query action that explicitly starts another request.
    requestCount += 1;
    assert.equal(requestCount, 2);
  }
});

test("destination, category, and provider-affecting stay inputs produce new query keys", () => {
  const tokyo = cases[0].query;
  assert.notEqual(localFinderQueryKey(tokyo), localFinderQueryKey({ ...tokyo, city: "Ho Chi Minh City", country: "Vietnam", dayId: "hcmc-day-1", coordinates: [106.6297, 10.8231] }));
  assert.notEqual(localFinderQueryKey(tokyo), localFinderQueryKey({ ...tokyo, kind: "restaurant", staySearch: undefined }));
  assert.notEqual(localFinderQueryKey(tokyo), localFinderQueryKey({ ...tokyo, staySearch: { ...tokyo.staySearch, checkOut: "2026-10-08" } }));
});

test("the finder remains mounted while selection drives the existing marker and focus contracts", () => {
  const workspace = read("components/journey-map-planner-workspace.tsx");
  const finder = read("components/journey-local-finder.tsx");
  const map = read("components/journey-planner-map.tsx");
  const providerEffect = finder.match(/useEffect\(\(\) => \{\s*let active = true;[\s\S]*?\}, \[[^\]]+\]\);/)?.[0] ?? "";

  assert.ok(providerEffect);
  assert.match(providerEffect, /searchVersion/);
  assert.doesNotMatch(providerEffect, /selectedPlaceId|chosen|onPlaceSelect|onViewOnMap/);
  assert.match(workspace, /const showDayPlanner = Boolean\(hasCanonicalPlanner && selected\.coordinates && mapMode === "detail" && !selectedPlannerPin && !selectedRouteLeg\)/);
  assert.doesNotMatch(workspace, /const showDayPlanner = Boolean\([^\n]*!selectedLocalPlace/);
  assert.match(workspace, /onPlaceSelect=\{selectLocalPlace\} onViewOnMap=\{focusLocalPlace\}/);
  assert.match(workspace, /focusCoordinates=\{mapMode === "detail" && selectedPlannerPin[^\n]*selectedLocalPlace \? localPlaceFocusCoordinates : null\}/);
  assert.match(finder, /const choosePlace = \(place: JourneyLocalPlace\) => \{\s*setChosen\(place\);\s*onPlaceSelect\?\.\(place\);\s*\}/);
  assert.match(finder, /onClick=\{\(\) => \(onViewOnMap \?\? onPlaceSelect\)\(chosen\)\}/);
  assert.match(map, /classList\.toggle\("is-active", marker\.getElement\(\)\.dataset\.localPlaceId === selectedLocalPlaceId\)/);
  assert.match(map, /const selectedLocalPlace = localPlaces\.find\(\(place\) => place\.id === selectedLocalPlaceId\)/);
  assert.match(map, /selectedLocalPlace[\s\S]*?focusMapCamera\(map as unknown as MapCamera, \{ center: target, zoom, offset \}\)/);
  assert.match(map, /planner-map__local-place[\s\S]*?interruptMapCamera\(map as unknown as MapCamera\)[\s\S]*?onLocalPlaceSelectRef\.current\?\.\(place\)/);
  assert.match(workspace, /localPlaceKind=\{localFinderKind\}/);
  assert.match(map, /const PlaceIcon = localPlaceKind === "stay" \? BedDouble : Utensils/);
});

test("selection is accessible, ephemeral, and leaves explicit Add semantics intact", () => {
  const workspace = read("components/journey-map-planner-workspace.tsx");
  const finder = read("components/journey-local-finder.tsx");
  const selectHandler = workspace.match(/const selectLocalPlace = useCallback[\s\S]*?\}, \[\]\);/)?.[0] ?? "";
  const focusHandler = workspace.match(/const focusLocalPlace = useCallback[\s\S]*?\}, \[\]\);/)?.[0] ?? "";

  assert.match(finder, /aria-current="true"/);
  assert.match(finder, /aria-pressed=\{selected\}/);
  assert.match(finder, /aria-label=\{`View \$\{chosen\.name\} on the map`\}/);
  assert.doesNotMatch(`${selectHandler}\n${focusHandler}`, /setCustomTrip|updatePlannerTrip|mutate|saveLocalVenue|localStorage/);
  assert.match(workspace, /onSavePlace=\{saveLocalVenue\}/);
  assert.match(finder, /onClick=\{save\}/);
});

test("Stay presents one concise disclosure and a truthful generic handoff", () => {
  const finder = read("components/journey-local-finder.tsx");
  const affiliate = read("components/easyt/affiliate-link.tsx");

  assert.match(affiliate, /compactAffiliateDisclosure = "Partner links · Morrovia may earn a commission at no extra cost to you\."/);
  assert.equal((finder.match(/\{compactAffiliateDisclosure\}/g) ?? []).length, 1);
  assert.match(finder, />Check availability <ArrowUpRight/);
  assert.doesNotMatch(finder, />Book now</);
  assert.doesNotMatch(finder, /Live room availability is not configured here|Mapped property; operating status unverified|Check options on Trip\.com/);
  assert.equal((finder.match(/trackEvent\("affiliate_click"/g) ?? []).length, 1);
});

test("existing Map responsive owners cover the beta viewport matrix", () => {
  const stories = read("components/easyt/trip-map-workspace.stories.tsx");
  const css = read("app/journey/journey.module.css");

  for (const viewport of ["morrovia390", "morrovia430", "morrovia768", "morrovia1440"]) {
    assert.match(stories, new RegExp(`viewport: \\{ value: "${viewport}"`));
  }
  assert.match(css, /@media\(max-width:980px\)[\s\S]*?\.shellPlanner \.finderDock\.mobileShapeDayClosed\{display:none!important\}/);
  assert.match(css, /@media\(min-width:1180px\)[\s\S]*?\.shellPlanner:not\(\.shellPlannerExpanded\) \.finderDock/);
  assert.match(css, /\.restaurantActions a,\.restaurantActions button\{justify-content:center;min-height:44px/);
});
