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
const tripMapWorkspaceStylesSource = readFileSync(
  new URL("../components/easyt/trip-map-workspace.module.css", import.meta.url),
  "utf8",
);
const navigationStylesSource = readFileSync(
  new URL("../app/journey/easyt-navigation.module.css", import.meta.url),
  "utf8",
);
const mapDockStylesSource = readFileSync(
  new URL("../app/journey/plan-map-docks.module.css", import.meta.url),
  "utf8",
);
const mapStoriesSource = readFileSync(
  new URL("../components/easyt/trip-map-workspace.stories.tsx", import.meta.url),
  "utf8",
);

test("the normal Map workspace breaks out from the readable trip shell", () => {
  assert.match(tripMapWorkspaceStylesSource, /width: min\(2200px, calc\(100vw - 32px\)\)/);
  assert.match(tripMapWorkspaceStylesSource, /margin-left: 50%/);
  assert.match(tripMapWorkspaceStylesSource, /transform: translateX\(-50%\)/);
  assert.match(tripMapWorkspaceStylesSource, /@media \(max-width: 980px\)[\s\S]*width: 100vw/);
  assert.match(tripMapWorkspaceStylesSource, /:has\(:global\(\.morrovia-map-expanded\)\)[\s\S]*transform: none/);
});

test("the canonical Map workspace keeps one MapLibre camera model", () => {
  assert.match(mapWorkspaceSource, /initialMapCameraMode\(customTrip, searchParams\)/);
  assert.match(mapWorkspaceSource, /overviewMode=\{mapMode === "overview"\}/);
  assert.match(mapWorkspaceSource, /setMapMode\("overview"\)/);
  assert.match(plannerStripSource, /Fit map to whole route/);
  assert.match(plannerStripSource, /data-map-route-reset/);
  assert.match(mapWorkspaceSource, /onWholeRoute=\{resetWholeRoute\}/);
  assert.match(mapSource, /showCompass: false/);
  assert.match(mapSource, /fitMapCamera\(/);
  assert.match(mapWorkspaceSource, /legs=\{canonicalMapLegs\}/);
  assert.match(mapSource, /maplibregl\.setWorkerUrl\("\/maplibre\/maplibre-gl-worker\.mjs"\)/);
  assert.match(mapSource, /geometry: \{ type: "LineString" as const, coordinates: mappedStops\.map\(\(stop\) => stop\.coordinates\) \}/);
  assert.match(mapSource, /coordinates: segment\.routeGeometry\?\.length \? segment\.routeGeometry : \[segment\.fromCoordinates, segment\.toCoordinates\]/);
  assert.match(mapSource, /source: "trip-route"/);
  assert.match(mapSource, /source: "trip-route-legs"/);
  assert.match(mapSource, /trip-route-hit/);
  const presentation = readFileSync(new URL("../components/easyt/morrovia-map-presentation.ts", import.meta.url), "utf8");
  assert.match(presentation, /line-dasharray/);
  assert.match(mapSource, /planner-map__leg/);
  assert.equal((mapSource.match(/new maplibregl\.Map\(/g) ?? []).length, 1);
  assert.match(mapSource, /style: morroviaMapStyle/);
  assert.match(readFileSync(new URL("../components/easyt/morrovia-map-presentation.ts", import.meta.url), "utf8"), /"morrovia-countries"/);
  assert.match(presentation, /id: "morrovia-land"/);
  assert.match(presentation, /id: "morrovia-borders"/);
  assert.match(presentation, /MORROVIA_DETAILED_BASEMAP_STYLE_URL = "https:\/\/tiles\.openfreemap\.org\/styles\/positron"/);
  assert.match(presentation, /export function createMorroviaFallbackMapStyle/);
  assert.match(mapWorkspaceSource, /cameraInteractionKey=\{cameraInteractionKey\}/);
  const cameraInteractionKey = mapWorkspaceSource.match(/const cameraInteractionKey = JSON\.stringify\(\[([\s\S]*?)\]\);/)?.[1];
  assert.ok(cameraInteractionKey);
  for (const state of ["selectedDayId", "shapeDayTab", "mobileShapeDayOpen", "isExpandedMap", "destinationExpanded", "copilotOpen", "pinPlacementMode", "Boolean(pinCoordinates)", "transferDetailsExpanded", "mapCoachVisible", "tripStatusExpanded", "tripHealthDetail", "selectedRouteLegId", "mapMode", "mobileMapSheetSize", "mobileMapSheetCollapsed"]) {
    assert.match(cameraInteractionKey, new RegExp(state.replace(/[()]/g, "\\$&")), state);
  }
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
  assert.match(mapWorkspaceSource, /setSelectedMapResult\(null\);[\s\S]*setSelectedPlannerPin\(null\);[\s\S]*setSelectedRouteLegId\(null\)/);
});

test("transport markers use the canonical mode and never invent an unknown mode", () => {
  const icons = readFileSync(new URL("../components/easyt/morrovia-transport-icons.ts", import.meta.url), "utf8");
  assert.match(icons, /flight: Plane/);
  assert.match(icons, /train: TrainFront/);
  assert.match(icons, /road: CarFront/);
  assert.match(icons, /ferry: Ship/);
  assert.match(icons, /walk: Footprints/);
  assert.match(icons, /unknown: CircleHelp/);
  assert.match(mapSource, /const MarkerIcon = mapTransportIcon\(leg\.mode\)/);
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
  assert.match(mapWorkspaceSource, /aria-controls="map-contextual-sheet"/);
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
  assert.match(mapWorkspaceSource, /accountSavePending/);
  assert.match(mapWorkspaceSource, /plannerMutationQueueRef\.current\.enqueue\(trip, recovery\)/);
  assert.match(tripShellSource, /!tripRecoveryIsAwaitingCanonicalSave\(deviceRecovery\)/);
  assert.match(mapWorkspaceSource, /setHasUnsavedChanges\(false\)/);
});

test("map overlays expose keyboard-equivalent controls and predictable Escape cleanup", () => {
  assert.match(mapSource, /element\.addEventListener\("click", \(event\) => \{ event\.stopPropagation\(\);[\s\S]*onLegSelectRef\.current\?\.\(leg\); \}\)/);
  assert.doesNotMatch(mapSource, /element\.addEventListener\("focus", \(\) => onLegSelectRef\.current\?\.\(leg\)\)/);
  assert.match(mapSource, /element\.addEventListener\("mouseenter",/);
  assert.match(mapSource, /element\.addEventListener\("click", \(event\) => \{ event\.stopPropagation\(\);[\s\S]*onSelectRef\.current\(stop\.id\); \}\)/);
  assert.match(mapSource, /element\.addEventListener\("focus", \(\) => previewStop\(stop\.id\)\)/);
  assert.match(mapSource, /data\.routeLegId|dataset\.routeLegId/);
  assert.match(mapWorkspaceSource, /event\.key !== "Escape"/);
  assert.match(mapWorkspaceSource, /setSelectedRouteLegId\(null\);[\s\S]*setMapMode\("overview"\)/,
    "closing a transfer should return to the whole-route camera state");
  assert.match(mapWorkspaceSource, /aria-label="Close transfer details"/);
  assert.match(mapWorkspaceSource, /restoreMapMarkerFocus/);
  assert.match(mapWorkspaceSource, /querySelector<HTMLButtonElement>\("\[data-map-route-reset\]"\)\?\.focus\(\)/);
  assert.match(copilotSource, /aria-label=\{open \?/);
});

test("mobile transfer context progressively discloses evidence without hiding uncertainty", () => {
  assert.match(mapWorkspaceSource, /className=\{styles\.mapTransferPrimary\}/);
  assert.match(mapWorkspaceSource, /aria-controls="selected-transfer-details"/);
  assert.match(mapWorkspaceSource, /selectedRouteLeg\.confidence/);
  assert.match(mapStylesSource, /\.mapTransferSecondary\[data-expanded="true"\]/);
  assert.match(mapStylesSource, /\.mapTransferDetailToggle\{display:flex;min-height:44px/);
  assert.match(mapStoriesSource, /Mobile390SelectedTransfer/);
});

test("mobile navigation has no persistent dock and Map keeps explicit fullscreen exit coverage", () => {
  assert.doesNotMatch(navigationStylesSource, /\.mobileDock/);
  assert.match(mapWorkspaceSource, /isExpandedMap \? "Exit fullscreen" : "Fullscreen map"/);
  assert.match(mapDockStylesSource, /\[class\*="mapContextualSurface"\]/);
  assert.match(mapDockStylesSource, /\[class\*="fullscreenDestination"\]\) \{ display:none!important; \}/);
  assert.match(mapStoriesSource, /Mobile390FullscreenOverview/);
});

test("mobile Map has one contextual sheet owner with explicit reachable sizes", () => {
  assert.equal((mapWorkspaceSource.match(/id="map-contextual-sheet"/g) ?? []).length, 1);
  assert.match(mapWorkspaceSource, /data-mobile-sheet-view=\{mobileMapSheetView\}/);
  assert.match(mapWorkspaceSource, /data-mobile-sheet-size=\{mobileMapSheetSize\}/);
  assert.match(mapWorkspaceSource, /\["peek", "medium", "expanded"\] as MobileMapSheetSize\[\]/);
  assert.match(mapWorkspaceSource, /aria-label="Map sheet size"/);
  assert.match(mapWorkspaceSource, /setMobileMapSheetCollapsed\(true\)/);
  for (const view of ["planner", "context", "status", "pin"]) {
    assert.match(mapDockStylesSource, new RegExp(`data-mobile-sheet-view="${view}"`));
  }
  assert.doesNotMatch(mapDockStylesSource, /position:fixed/);
  assert.match(mapDockStylesSource, /bottom:calc\(var\(--mobile-map-sheet-height\) \+ 4px\)!important/,
    "provider attribution is lifted above the active contextual sheet");
});

test("mobile result detail replaces the list and has a visible route back", () => {
  assert.match(mapWorkspaceSource, /mobileMapSheetView === "context" && selectedLocalPlace \? "Results" : "Map"/);
  assert.match(mapWorkspaceSource, /clearSelectedLocalPlace\(\);[\s\S]*setMobileShapeDayOpen\(true\);[\s\S]*setMobileMapSheetSize\("medium"\)/);
  assert.match(mapWorkspaceSource, /onMapResultSelect=\{\(place\) => \{ setMobileShapeDayOpen\(false\); selectMapResult\(place\); \}\}/);
  assert.match(mapDockStylesSource, /data-mobile-sheet-view="planner"[\s\S]*\[class\*="finderDock"\]/);
  assert.match(mapDockStylesSource, /data-mobile-sheet-view="context"[\s\S]*\[class\*="canonicalPlannerStatus"\]/);
});

test("short and landscape Map viewports retain recoverable canvas and safe-area controls", () => {
  assert.match(mapDockStylesSource, /@media \(max-width:980px\) and \(max-height:520px\)/);
  assert.match(mapDockStylesSource, /--mobile-map-sheet-peek-height:112px/);
  assert.match(mapDockStylesSource, /--mobile-map-sheet-medium-height:min\(48%,240px\)/);
  assert.match(mapDockStylesSource, /padding:0 12px env\(safe-area-inset-bottom\)/);
  assert.match(mapDockStylesSource, /bottom:max\(10px,env\(safe-area-inset-bottom\)\)!important/);
  for (const story of ["Mobile320MapCanvas", "Mobile390StayResultsMedium", "Mobile430SelectedStayMedium", "Mobile390EatResultsMedium", "Mobile430SelectedEatMedium", "Mobile390SeeExpanded", "Mobile390SavedPinPeek", "MobileShortStayMedium", "MobileLandscapePeek", "Tablet768StayMedium"]) {
    assert.match(mapStoriesSource, new RegExp(`export const ${story}`), story);
  }
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
