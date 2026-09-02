import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const mapWorkspaceSource = readFileSync(
  new URL("../components/journey-map-planner-workspace.tsx", import.meta.url),
  "utf8",
);
const mapSource = readFileSync(
  new URL("../components/journey-planner-map.tsx", import.meta.url),
  "utf8",
);
const plannerStripSource = readFileSync(
  new URL("../components/journey-planner-strip.tsx", import.meta.url),
  "utf8",
);
const tripShellSource = readFileSync(
  new URL("../components/easyt/trip-shell-client.tsx", import.meta.url),
  "utf8",
);
const copilotSource = readFileSync(
  new URL("../components/easyt/easyt-trip-copilot.tsx", import.meta.url),
  "utf8",
);
const mapStylesSource = readFileSync(
  new URL("../app/journey/journey.module.css", import.meta.url),
  "utf8",
);
const plannerStripStylesSource = readFileSync(
  new URL("../components/journey-planner-strip.module.css", import.meta.url),
  "utf8",
);

test("the canonical Map workspace keeps one MapLibre camera model", () => {
  assert.match(mapWorkspaceSource, /initialMapCameraMode\(customTrip, searchParams\)/);
  assert.match(mapWorkspaceSource, /overviewMode=\{mapMode === "overview"\}/);
  assert.match(mapWorkspaceSource, /setMapMode\("overview"\)/);
  assert.match(plannerStripSource, /Fit map to whole route/);
  assert.match(plannerStripSource, /data-map-route-reset/);
  assert.match(mapWorkspaceSource, /onWholeRoute=\{resetWholeRoute\}/);
  assert.match(mapSource, /showCompass: false/);
  assert.match(mapSource, /map\.fitBounds\(/);
  assert.match(mapWorkspaceSource, /legs=\{canonicalMapLegs\}/);
  assert.match(mapSource, /maplibregl\.setWorkerUrl\("\/maplibre\/maplibre-gl-worker\.mjs"\)/);
  assert.match(mapSource, /geometry: \{ type: "LineString" as const, coordinates: mappedStops\.map\(\(stop\) => stop\.coordinates\) \}/);
  assert.match(mapSource, /coordinates: segment\.routeGeometry\?\.length \? segment\.routeGeometry : \[segment\.fromCoordinates, segment\.toCoordinates\]/);
  assert.match(mapSource, /source: "trip-route"/);
  assert.match(mapSource, /source: "trip-route-legs"/);
  assert.match(mapSource, /trip-route-hit/);
  assert.match(mapSource, /line-dasharray/);
  assert.match(mapSource, /planner-map__leg/);
  assert.equal((mapSource.match(/new maplibregl\.Map\(/g) ?? []).length, 1);
  assert.match(mapSource, /"morrovia-countries"/);
  assert.match(mapSource, /id: "morrovia-land"/);
  assert.match(mapSource, /id: "morrovia-borders"/);
  assert.match(mapSource, /"raster-opacity": \["interpolate", \["linear"\], \["zoom"\]/);
});

test("the route-first map restores progressive spatial intelligence", () => {
  assert.match(mapWorkspaceSource, /destinationCards=\{canonicalDestinationCards\}/);
  assert.match(mapSource, /const cards = new Map\(destinationCards\.map\(\(card\) => \[card\.stopId, card\]\)\)/);
  assert.match(mapSource, /const card = cards\.get\(stop\.id\)/);
  assert.match(mapSource, /element\.dataset\.mapStopId = stop\.id/);
  assert.match(mapWorkspaceSource, /Selected transfer/);
  assert.match(mapWorkspaceSource, /Door to door/);
  assert.match(mapWorkspaceSource, /Exact schedules and current operating details still need checking/);
  assert.match(mapWorkspaceSource, /Open in Google Maps/);
  assert.match(mapWorkspaceSource, /selectedDestinationMedia\?\.learnMoreUrl/);
  assert.match(mapWorkspaceSource, /scope=\{copilotScope\}/);
  assert.match(mapWorkspaceSource, /setSelectedRouteLegId\(null\);[\s\S]*setMapMode\("overview"\)/);
  assert.match(mapWorkspaceSource, /showShellContext = Boolean\(!copilotOpen/);
  assert.match(mapWorkspaceSource, /setSelectedLocalPlaceId\(null\);[\s\S]*setSelectedPlannerPin\(null\);[\s\S]*setSelectedRouteLegId\(null\)/);
});

test("transport markers use the canonical mode and never invent an unknown mode", () => {
  assert.match(mapSource, /flight: Plane/);
  assert.match(mapSource, /train: TrainFront/);
  assert.match(mapSource, /road: CarFront/);
  assert.match(mapSource, /ferry: Ship/);
  assert.match(mapSource, /walk: Footprints/);
  assert.match(mapSource, /unknown: CircleHelp/);
  assert.match(mapSource, /const MarkerIcon = transportIcons\[leg\.mode\]/);
  assert.match(mapSource, /element\.dataset\.routeLegId = leg\.id/);
  assert.match(mapSource, /leg\.distanceKm !== null/);
  assert.match(mapSource, /formatMapDuration\(leg\.doorToDoorMinutes\)/);
  assert.match(mapSource, /leg\.provenanceLabel/);
});

test("destination detail and Shape the day remain tied to canonical selection", () => {
  assert.match(mapWorkspaceSource, /selectedMapStopFirstItem = customTrip\?\.planItems\.filter\(\(item\) => item\.stopId === selectedTripStop\?\.id\)/);
  assert.match(mapWorkspaceSource, /selectedDestinationDescription = conciseMapDescription\(selectedDestinationMedia\?\.description\)/);
  assert.match(mapWorkspaceSource, /selectedDestinationImage = selectedDestinationMedia\?\.image \?\? selectedMapStopFirstItem\?\.image/);
  assert.match(mapWorkspaceSource, /const showDayPlanner = Boolean\(hasCanonicalPlanner && selected\.coordinates && mapMode === "detail"/);
  assert.match(mapWorkspaceSource, /showDayPlanner \? <aside id="shape-day-workspace"/);
  assert.match(mapWorkspaceSource, /context=\{\{ selectedDay, selectedStop: selected, selectedDayIndex, totalDays: journey\.calendar\.length, planItem: selectedPlanItem/);
  assert.match(mapWorkspaceSource, /aria-controls="shape-day-workspace"/);
  assert.match(mapStylesSource, /\.finderDock\.mobileShapeDayOpen\{display:flex!important\}/);
  assert.match(mapStylesSource, /\.mobileShapeDayClosed/);
  assert.match(mapWorkspaceSource, /showFullscreenDestination/);
  assert.match(mapWorkspaceSource, /styles\.fullscreenDestination/);
  assert.match(mapStylesSource, /\.shellPlannerExpanded \.fullscreenDestination/);
  assert.match(mapStylesSource, /:has\(\.fullscreenDestination\) \.finderDock/);
  assert.match(mapStylesSource, /\.shellPlanner:not\(\.shellPlannerExpanded\) \.finderDock/);
  assert.match(mapStylesSource, /right:18px!important;[\s\S]*width:clamp\(350px,24vw,400px\)!important/);
  assert.match(mapStylesSource, /\.shellPlanner:not\(\.shellPlannerExpanded\) \.mapDestinationContext/);
  assert.match(mapStylesSource, /left:18px!important;[\s\S]*width:clamp\(330px,23vw,380px\)!important/);
});

test("whole-route mode prioritises route context and keeps mobile Map actions reachable", () => {
  assert.match(mapWorkspaceSource, /const wholeRouteMapContext = mapMode === "overview"/);
  assert.match(mapWorkspaceSource, /setMobileShapeDayOpen\(false\);[\s\S]*setMapMode\("overview"\)/);
  assert.match(mapWorkspaceSource, /showDayPlanner \? <button type="button" className=\{styles\.mapDayControl\}/);
  assert.match(plannerStripStylesSource, /\.integrated\{grid-template-columns:minmax\(0,1fr\);grid-template-rows:auto auto/);
  assert.match(plannerStripStylesSource, /\.integrated \.actions\{grid-row:2;width:100%;justify-content:flex-end/);
  assert.match(plannerStripStylesSource, /\.integrated \.wholeRoute\{width:auto;min-width:0;padding:0 10px;font-size:9px\}/);
  assert.match(mapStylesSource, /\.shellPlanner \.mapDestinationContext \.mapDestinationDescription\{display:none\}/);
});

test("Add pin restores the original progressive workflow on the canonical trip document", () => {
  assert.match(mapWorkspaceSource, /shapeDayTab === "plan" \? <aside className=\{`\$\{styles\.pinDock\}/);
  assert.doesNotMatch(mapWorkspaceSource, /selectedPlanItem && mapMode === "detail" && shapeDayTab === "plan" && \(pinPlacementMode/);
  assert.match(mapWorkspaceSource, /setPinCoordinates\(coordinates\); setPinPlacementMode\(false\)/);
  assert.match(mapWorkspaceSource, /locationSelected: "Location selected"/);
  assert.match(mapWorkspaceSource, /chooseCategory: "2\. Choose a category and name it"/);
  assert.match(mapWorkspaceSource, /mapPins: \[\.\.\.\(trip\.brief\.mapPins \?\? \[\]\), pin\]/);
  assert.match(mapWorkspaceSource, /Map pin added/);
  assert.match(mapWorkspaceSource, /Map pin updated/);
  assert.match(mapWorkspaceSource, /Map pin removed/);
  assert.match(mapWorkspaceSource, /savePlannerRecovery\(next/);
  assert.match(mapWorkspaceSource, /persistPlannerMutation\(next, recovery\.handle\)/);
});

test("authenticated Map mutations use the account persistence queue", () => {
  assert.match(mapWorkspaceSource, /createTripMutationPersistenceQueue\(saveTripRecoveryToEasyT\)/);
  assert.match(mapWorkspaceSource, /plannerMutationQueueRef\.current\.enqueue\(trip, recovery\)/);
  assert.match(mapWorkspaceSource, /setHasUnsavedChanges\(false\)/);
});

test("map overlays expose keyboard-equivalent controls and predictable Escape cleanup", () => {
  assert.match(mapSource, /element\.addEventListener\("focus", \(\) => onLegSelect/);
  assert.match(mapSource, /element\.addEventListener\("click", \(event\) => \{ event\.stopPropagation\(\); onLegSelectRef\.current\?\.\(leg\); \}\)/);
  assert.match(mapSource, /element\.addEventListener\("mouseenter",/);
  assert.match(mapSource, /element\.addEventListener\("click", \(event\) => \{ event\.stopPropagation\(\); onSelectRef\.current\(stop\.id\); \}\)/);
  assert.match(mapSource, /element\.addEventListener\("focus", \(\) => previewStop\(stop\.id\)\)/);
  assert.match(mapSource, /data\.routeLegId|dataset\.routeLegId/);
  assert.match(mapWorkspaceSource, /event\.key !== "Escape"/);
  assert.match(mapWorkspaceSource, /restoreMapMarkerFocus/);
  assert.match(copilotSource, /aria-label=\{open \?/);
});

test("a server-resolved TripShell map remains readable after session expiry", () => {
  assert.match(mapWorkspaceSource, /Boolean\(!providedTrip && customTrip/);
});

test("Map workspace navigation contains no legacy planner destinations", () => {
  assert.doesNotMatch(mapWorkspaceSource, /href=\{?["'`]\/journey\/plan/);
  assert.doesNotMatch(mapWorkspaceSource, /router\.(?:push|replace)\(["'`]\/journey\/plan/);
  assert.doesNotMatch(mapWorkspaceSource, /href=\{?["'`]\/journey\/prep\?trip=/);
  assert.match(mapWorkspaceSource, /mapWorkspaceHref\(/);
});

test("TripShell keeps Overview canonical with the approved three-workspace order", () => {
  const overview = tripShellSource.indexOf('{ id: "overview", label: "Overview", icon: House, suffix: "" }');
  const map = tripShellSource.indexOf('{ id: "map", label: "Map"');
  const itinerary = tripShellSource.indexOf('{ id: "itinerary", label: "Itinerary"');

  assert.ok(overview >= 0);
  assert.ok(overview < map && map < itinerary);
  assert.doesNotMatch(tripShellSource, /id: "prep"|label: "Prep"|suffix: "\/prep"/);
  assert.match(tripShellSource, /: "overview";/);
});
