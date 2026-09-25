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
const mapRuntimeSource = readFileSync(
  new URL("../components/easyt/morrovia-map-runtime.ts", import.meta.url),
  "utf8",
);
const mapMarkerSource = readFileSync(
  new URL("../components/easyt/morrovia-map-markers.ts", import.meta.url),
  "utf8",
);
const mapPresentationStylesSource = readFileSync(
  new URL("../components/easyt/morrovia-map-presentation.module.css", import.meta.url),
  "utf8",
);
const transportWorkspaceSource = readFileSync(
  new URL("../components/easyt/trip-transport-workspace.tsx", import.meta.url),
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

test("the same Map workspace can expand above page chrome without a second map", () => {
  assert.match(tripMapWorkspaceStylesSource, /width:\s*100vw/);
  assert.match(tripMapWorkspaceStylesSource, /margin-left: 50%/);
  assert.match(tripMapWorkspaceStylesSource, /transform: translateX\(-50%\)/);
  assert.match(mapStylesSource, /--map-workspace-strip-height:\s*64px/);
  assert.match(mapStylesSource, /--map-workspace-rail-width:\s*clamp\(360px,[^,]+,420px\)/);
  assert.match(mapStylesSource, /height:\s*calc\(100svh - var\(--morrovia-navigation-height\)\)/);
  assert.match(mapWorkspaceSource, /onFullTrip=\{isShellPresentation \? toggleExpandedMap : undefined\}/);
  assert.match(mapWorkspaceSource, /fullTripExpanded=\{isExpandedMap\}/);
  assert.match(mapWorkspaceSource, /styles\.shellPlannerExpanded/);
  assert.match(tripMapWorkspaceStylesSource, /\.wideMap:has\(\[data-map-expanded="true"\]\)/);
  assert.match(tripMapWorkspaceStylesSource, /\.wideMap:has\(\[data-map-expanded="true"\]\)\s*\{[^}]*height:\s*calc\(100svh - var\(--morrovia-navigation-height\)\)/);
  assert.doesNotMatch(tripMapWorkspaceStylesSource, /\.wideMap:has\(\[data-map-expanded="true"\]\)\s*\{[^}]*position:\s*fixed/);
  assert.match(mapStylesSource, /\.shellPlannerExpanded/);
  assert.match(mapStylesSource, /\.canonicalPlanner\.shellPlannerExpanded\{[^}]*position:fixed/);
  assert.match(plannerStripStylesSource, /@media\(max-width:980px\)[\s\S]*?\.integrated \.fullTrip\[data-map-expand-control\]:not\(\[aria-pressed="true"\]\)\{display:none/);
  assert.equal((mapWorkspaceSource.match(/<JourneyPlannerMap/g) ?? []).length, 1);
});

test("expanded Map restores scroll and focus before Escape can dismiss map state", () => {
  assert.match(mapWorkspaceSource, /document\.body\.style\.overflow = "hidden"/);
  assert.match(mapWorkspaceSource, /document\.body\.style\.overflow = previousOverflow/);
  assert.match(mapWorkspaceSource, /window\.scrollTo\(\{ top: scrollY, behavior: "instant" \}\)/);
  assert.match(mapWorkspaceSource, /if \(restoreScrollOnExitRef\.current\) window\.scrollTo/);
  assert.match(mapWorkspaceSource, /\[data-map-expand-control\]/);
  assert.match(mapWorkspaceSource, /if \(isExpandedMap\) \{[\s\S]*?toggleExpandedMap\(\);[\s\S]*?return;[\s\S]*?if \(selectedMapResult\)/);
  assert.match(mapWorkspaceSource, /if \(event\.key !== "Escape"\) return;[\s\S]*?if \(isExpandedMap\)[\s\S]*?if \(copilotOpen\) return;/);
});

test("TripShell keeps the ResizeObserver and reframes only while scripted camera ownership remains", () => {
  assert.match(mapWorkspaceSource, /preserveCameraOnResize=\{isShellPresentation\}/);
  assert.match(mapSource, /map\.resize\(\);[\s\S]*?currentCameraRequestRef\.current !== null[\s\S]*?setCameraViewportKey/);
  assert.match(mapSource, /currentCameraRequestRef\.current !== cameraRequestKey/);
});

test("desktop Map has one persistent left rail and only contextual secondary detail", () => {
  assert.match(mapWorkspaceSource, /const showFinderDock = Boolean\(hasCanonicalPlanner && selected\.coordinates\)/);
  assert.match(mapWorkspaceSource, /\{showFinderDock \? <aside id="shape-day-workspace"/);
  assert.match(mapWorkspaceSource, /styles\.mapDefaultContext/);
  assert.match(mapWorkspaceSource, /!tripStatusExpanded\s*&&\s*!copilotOpen/);
  assert.match(mapWorkspaceSource, /tripIssueCount > 0/);
  assert.match(mapStylesSource, /\.shellPlanner \.finderDock\{[^}]*left:0!important[^}]*width:var\(--map-workspace-rail-width\)!important/);
  assert.match(mapStylesSource, /\.shellPlanner \.mapDefaultContext\{display:none!important\}/);
  assert.match(mapStylesSource, /\.shellPlanner \.mapPlaceContext[^}]*position:absolute!important/);
  assert.match(mapStylesSource, /\.shellPlanner \.mapPlaceContext,[\s\S]*right:92px!important;[\s\S]*bottom:48px!important/);
  assert.match(mapStylesSource, /\.shellPlanner \.mapPlaceContext,[\s\S]*max-height:min\(440px,calc\(100% - var\(--map-workspace-strip-height\) - 168px\)\)!important/,
    "selected detail stays compact instead of becoming a second rail");
  assert.match(mapStylesSource, /\.shellPlanner \.finderDock :global\(\[class\*="sectionStatus"\]\)\{grid-template-columns:auto minmax\(0,1fr\)!important\}/,
    "shared status cards reflow to the desktop rail's container width");
  assert.match(mapStylesSource, /\.shellPlanner \.finderDock :global\(\[class\*="sectionStatus"\]\)>button\{grid-column:1\/-1!important;width:100%\}/);
  assert.doesNotMatch(mapStylesSource, /\.shellPlanner:not\(\.shellPlannerExpanded\)[\s\S]*right:18px!important;[\s\S]*width:clamp\(350px,24vw,400px\)!important/);
  assert.match(mapWorkspaceSource, /const mapFocusOffset: \[number, number\] \| undefined = isShellPresentation[\s\S]*hasExplicitMapContext[\s\S]*\? \[0, -80\][\s\S]*: \[180, -80\]/,
    "selected-result focus should stay in the usable canvas between the rail and contextual card on narrow desktop");
  assert.match(mapWorkspaceSource, /focusOffset=\{mapFocusOffset\}/);
});

test("Storybook covers the risk-based simplified Map workspace matrix", () => {
  for (const story of [
    "MapWorkspaceDesktop1440WholeRoute",
    "MapWorkspaceDesktop1440Destination",
    "MapWorkspaceDesktop1440StayResults",
    "MapWorkspaceDesktop1440SelectedStay",
    "MapWorkspaceMobile390WholeRoute",
    "MapWorkspaceMobile390SelectedStay",
  ]) {
    assert.match(mapStoriesSource, new RegExp(`export const ${story}`), story);
  }
  assert.doesNotMatch(mapStoriesSource, /Fullscreen|expandedMap/);
});

test("the canonical Map workspace keeps one MapLibre camera model", () => {
  assert.match(mapWorkspaceSource, /initialMapCameraMode\(customTrip, searchParams\)/);
  assert.match(mapWorkspaceSource, /overviewMode=\{mapMode === "overview"\}/);
  assert.match(mapWorkspaceSource, /setMapMode\("overview"\)/);
  assert.match(plannerStripSource, /Fit map to whole route/);
  assert.match(plannerStripSource, /data-map-route-reset/);
  assert.match(mapWorkspaceSource, /onWholeRoute=\{resetWholeRoute\}/);
  assert.match(mapSource, /installMorroviaMapControls\(map, maplibregl, surface\)/);
  assert.match(mapRuntimeSource, /showCompass: false/);
  assert.match(mapSource, /fitMapCamera\(/);
  assert.match(mapWorkspaceSource, /legs=\{canonicalMapLegs\}/);
  assert.match(mapSource, /maplibregl\.setWorkerUrl\(MORROVIA_MAP_WORKER_URL\)/);
  assert.match(mapRuntimeSource, /MORROVIA_MAP_WORKER_URL = "\/maplibre\/maplibre-gl-worker\.mjs"/);
  assert.match(mapSource, /geometry: \{ type: "LineString" as const, coordinates: mappedStops\.map\(\(stop\) => stop\.coordinates\) \}/);
  assert.match(mapSource, /coordinates: segment\.routeGeometry\?\.length \? segment\.routeGeometry : \[segment\.fromCoordinates, segment\.toCoordinates\]/);
  assert.match(mapSource, /source: "trip-route"/);
  assert.match(mapSource, /source: "trip-route-legs"/);
  assert.match(mapSource, /trip-route-hit/);
  const presentation = readFileSync(new URL("../components/easyt/morrovia-map-presentation.ts", import.meta.url), "utf8");
  assert.match(presentation, /line-dasharray/);
  assert.match(mapSource, /planner-map__leg/);
  assert.equal((mapSource.match(/new maplibregl\.Map\(/g) ?? []).length, 1);
  assert.match(mapSource, /\.\.\.morroviaMapOptions\(surface, "compact"\)/);
  assert.match(mapRuntimeSource, /style: morroviaMapStyle/);
  assert.match(readFileSync(new URL("../components/easyt/morrovia-map-presentation.ts", import.meta.url), "utf8"), /"morrovia-countries"/);
  assert.match(presentation, /id: "morrovia-land"/);
  assert.match(presentation, /id: "morrovia-borders"/);
  assert.match(presentation, /MORROVIA_DETAILED_BASEMAP_STYLE_URL = "https:\/\/tiles\.openfreemap\.org\/styles\/positron"/);
  assert.match(presentation, /export function createMorroviaFallbackMapStyle/);
  assert.match(mapWorkspaceSource, /cameraInteractionKey=\{cameraInteractionKey\}/);
  assert.match(mapWorkspaceSource, /new ResizeObserver/);
  assert.match(mapWorkspaceSource, /cameraOcclusions=\{mapCameraOcclusions\}/);
  assert.doesNotMatch(transportWorkspaceSource, /transportCameraOcclusions|detailRailRef|mapPanelRef/);
  const cameraInteractionKey = mapWorkspaceSource.match(/const cameraInteractionKey = JSON\.stringify\(\[([\s\S]*?)\]\);/)?.[1];
  assert.ok(cameraInteractionKey);
  for (const state of ["selectedDayId", "shapeDayTab", "mobileShapeDayOpen", "destinationExpanded", "copilotOpen", "pinPlacementMode", "Boolean(pinCoordinates)", "transferDetailsExpanded", "mapCoachVisible", "tripStatusExpanded", "tripHealthDetail", "selectedRouteLegId", "mapMode", "mobileMapDrawerOpen"]) {
    assert.match(cameraInteractionKey, new RegExp(state.replace(/[()]/g, "\\$&")), state);
  }
});

test("Builder route comparison remains a noninteractive layer over the canonical route", () => {
  assert.match(mapSource, /comparisonLegs\?: readonly MapRouteLeg\[\]/);
  assert.match(mapSource, /id: "trip-route-comparison"/);
  assert.match(mapSource, /source: "trip-route-comparison"/);
  assert.match(mapSource, /"line-dasharray": \[2, 2\]/);
  assert.doesNotMatch(mapSource, /comparisonMarkers/);
  assert.match(mapSource, /comparisonRoute\.features\.length && overviewMode/,
    "a visible proposal should fit alongside the canonical route without taking camera ownership otherwise");
});

test("the shared map reports only fatal initial ownership failure", () => {
  assert.match(mapSource, /onLifecycleChange\?: \(state: "ready" \| "unavailable"\) => void/);
  assert.match(mapSource, /onLifecycleChangeRef\.current\?\.\("ready"\)/);
  assert.match(mapSource, /if \(lifecycleState === "ready"\) return/);
  assert.match(mapSource, /removing && value instanceof Error && \(value\.name === "AbortError"/,
    "intentional teardown cancellation should remain contained MapLibre noise");
  assert.doesNotMatch(mapSource, /window\.addEventListener\("unhandledrejection"/,
    "the map must not globally swallow unrelated application failures");
});

test("the route-first map restores progressive spatial intelligence", () => {
  assert.match(mapWorkspaceSource, /destinationCards=\{canonicalDestinationCards\}/);
  assert.match(mapSource, /const cards = new Map\(destinationCards\.map\(\(card\) => \[card\.stopId, card\]\)\)/);
  assert.match(mapSource, /const card = cards\.get\(stop\.id\)/);
  assert.match(mapSource, /createMorroviaStopMarker\(document,/);
  assert.match(mapMarkerSource, /element\.dataset\.mapStopId = model\.dataset\.mapStopId/);
  assert.match(mapWorkspaceSource, /Selected transfer/);
  assert.match(mapWorkspaceSource, /Door to door/);
  assert.match(mapWorkspaceSource, /Exact schedules and current operating details still need checking/);
  assert.match(mapWorkspaceSource, /Open in Google Maps/);
  assert.match(mapWorkspaceSource, /selectedDestinationMedia\?\.learnMoreUrl/);
  assert.match(mapWorkspaceSource, /scope=\{copilotScope\}/);
  assert.match(mapWorkspaceSource, /setSelectedRouteLegId\(null\);[\s\S]*setMapMode\("overview"\)/);
  assert.match(mapWorkspaceSource, /showShellContext = Boolean\([\s\S]*!tripStatusExpanded[\s\S]*!copilotOpen/);
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

test("shared presentation owns transport marker backgrounds and interaction states", () => {
  for (const selector of [".planner-map__leg", ".planner-map__leg-icon", ".planner-map__leg:hover", ".planner-map__leg:focus-visible", ".planner-map__leg.is-active", ".planner-map__leg.is-unknown"]) {
    assert.match(mapPresentationStylesSource, new RegExp(selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.doesNotMatch(mapStylesSource, /:global\(\.planner-map__leg\)\{/);
  assert.doesNotMatch(mapStylesSource, /:global\(\.planner-map__leg-icon(?: svg)?\)\{/);
});

test("destination detail and Shape the day remain tied to canonical selection", () => {
  assert.match(mapWorkspaceSource, /selectedMapStopFirstItem = customTrip\?\.planItems\.filter\(\(item\) => item\.stopId === selectedTripStop\?\.id\)/);
  assert.match(mapWorkspaceSource, /selectedDestinationDescription = conciseMapDescription\(selectedDestinationMedia\?\.description\)/);
  assert.match(mapWorkspaceSource, /selectedDestinationImage = selectedDestinationMedia\?\.image \?\? selectedMapStopFirstItem\?\.image/);
  assert.match(mapWorkspaceSource, /const showDayPlanner = Boolean\(hasCanonicalPlanner && selected\.coordinates && mapMode === "detail"/);
  assert.match(mapWorkspaceSource, /showFinderDock \? <aside id="shape-day-workspace"/);
  assert.match(mapWorkspaceSource, /context=\{\{[\s\S]*selectedDay,[\s\S]*selectedStop: selected,[\s\S]*planItem: selectedPlanItem,[\s\S]*days: selectedStopPlanDays,[\s\S]*items: selectedPlanAgenda\?\.items/);
  assert.match(mapWorkspaceSource, /onSelectDay: selectMapPlanDay/);
  assert.match(mapWorkspaceSource, /onSelectItem: selectMapPlanItem/);
  assert.match(mapWorkspaceSource, /onSelectTransfer: selectMapPlanTransfer/);
  assert.match(mapWorkspaceSource, /editHref=\{customTrip && selectedPlanItem \? itineraryWorkspaceHref/);
  assert.match(mapWorkspaceSource, /aria-controls="map-contextual-sheet"/);
  assert.match(mapStylesSource, /\.finderDock\.mobileShapeDayOpen\{display:flex!important\}/);
  assert.match(mapStylesSource, /\.mobileShapeDayClosed/);
  assert.match(mapStylesSource, /\.shellPlanner \.finderDock/);
  assert.match(mapWorkspaceSource, /defaultMapContext/);
  assert.match(mapStylesSource, /\.shellPlanner \.mapDefaultContext\{display:none!important\}/);
});

test("Map Plan is a compact canonical projection with truthful spatial actions", () => {
  const plan = readFileSync(new URL("../components/journey-plan-workspace.tsx", import.meta.url), "utf8");
  const agenda = readFileSync(new URL("../lib/easyt/map-plan-agenda.ts", import.meta.url), "utf8");
  assert.match(plan, /days\.length > 1/);
  assert.match(plan, /aria-current=\{active \? "date"/);
  assert.match(plan, /item\.mapSelectionId \? <button/);
  assert.match(plan, /<div className=\{styles\.mapPlanAgendaRow\}>\{content\}<\/div>/);
  assert.match(plan, /<summary>Transfer details<\/summary>/);
  assert.match(plan, /navigation\.onFindNearby\(freeTime\)/);
  assert.match(plan, /activity\.onAdd\(\)/);
  assert.match(agenda, /composeItineraryDayWithExplicitPeriods/);
  assert.match(agenda, /mapResultSelectionIdForIdea/);
  assert.doesNotMatch(plan, /onMoveDay|onRename|onRemove|onDrop|notesToSelf/);
  assert.match(mapStylesSource, /\.mapPlanTitle\{[^}]*min-width:0[^}]*overflow-wrap:anywhere[^}]*-webkit-line-clamp:2/);
  assert.match(mapStylesSource, /@media\(max-width:680px\)\{[\s\S]*\.mapPlanAgendaRow\{min-height:52px/);
  assert.match(mapWorkspaceSource, /setMapPlanFreeTimePart\(null\);\s*\}, \[selectedDay\.id, selectedPlanItem\?\.stopId\]\)/);
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
  const mapShellSource = readFileSync("components/easyt/trip-map-workspace.tsx", "utf8");
  assert.match(mapShellSource, /useTripShellMutation\(\)/);
  assert.match(mapWorkspaceSource, /canonicalMutation\.mutateTrip/);
  assert.match(mapWorkspaceSource, /if \(!canonicalMutation && !plannerMutationQueueRef\.current\)/);
  assert.match(mapWorkspaceSource, /accountSavePending/);
  assert.match(mapWorkspaceSource, /plannerMutationQueueRef\.current!\.enqueue\(trip, recovery\)/);
  assert.match(tripShellSource, /!tripRecoveryIsAwaitingCanonicalSave\(deviceRecovery\)/);
  assert.match(mapWorkspaceSource, /setHasUnsavedChanges\(false\)/);
});

test("map overlays expose keyboard-equivalent controls and predictable Escape cleanup", () => {
  assert.match(mapSource, /mapRouteLegActivationEvent\(event\)/);
  assert.match(mapSource, /element\.addEventListener\("pointerup", activateLeg\)/);
  assert.match(mapSource, /element\.addEventListener\("click", activateLeg\)/);
  assert.doesNotMatch(mapSource, /element\.addEventListener\("focus", \(\) => onLegSelectRef\.current\?\.\(leg\)\)/);
  assert.match(mapSource, /element\.addEventListener\("mouseenter",/);
  assert.match(mapSource, /bindMapMarkerActivation\(element, \(\) => \{[\s\S]*onSelectRef\.current\(stop\.id\); \}\)/);
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

test("mobile navigation has no persistent dock and Map keeps one contextual sheet owner", () => {
  assert.doesNotMatch(navigationStylesSource, /\.mobileDock/);
  assert.match(mapDockStylesSource, /\[class\*="mapContextualSurface"\]/);
  assert.equal((mapWorkspaceSource.match(/id="map-contextual-sheet"/g) ?? []).length, 1);
});

test("mobile Map has one contextual two-state drawer owner", () => {
  assert.equal((mapWorkspaceSource.match(/id="map-contextual-sheet"/g) ?? []).length, 1);
  assert.match(mapWorkspaceSource, /data-mobile-sheet-view=\{mobileMapSheetView\}/);
  assert.match(mapWorkspaceSource, /data-mobile-drawer-state=\{mobileMapDrawerOpen \? "open" : "collapsed"\}/);
  assert.match(mapWorkspaceSource, /aria-label=\{mobileMapDrawerOpen \? "Collapse map results" : "Open map results"\}/);
  assert.doesNotMatch(mapWorkspaceSource, /MobileMapSheetSize|mobileMapSheetSize|mobileMapSheetCollapsed/);
  for (const view of ["planner", "context", "status", "pin"]) {
    assert.match(mapDockStylesSource, new RegExp(`data-mobile-sheet-view="${view}"`));
  }
  assert.doesNotMatch(mapDockStylesSource, /position:fixed/);
  assert.match(mapDockStylesSource, /bottom:calc\(var\(--mobile-map-sheet-height\) \+ 4px\)!important/,
    "provider attribution is lifted above the active contextual sheet");
});

test("mobile result detail replaces the list and has a visible route back", () => {
  assert.match(mapWorkspaceSource, /const dismissSelectedMapResult = useCallback\(\(\) => \{[\s\S]*clearSelectedLocalPlace\(\);[\s\S]*setMobileShapeDayOpen\(true\);[\s\S]*setMobileMapDrawerOpen\(true\);/);
  assert.match(mapWorkspaceSource, /if \(selectedMapResult\) \{[\s\S]*dismissSelectedMapResult\(\);/);
  assert.match(mapWorkspaceSource, /aria-label="Close selected place details"[\s\S]*onClose=\{dismissSelectedMapResult\}/);
  assert.match(mapDockStylesSource, /data-mobile-sheet-view="planner"[\s\S]*\[class\*="finderDock"\]/);
  assert.match(mapDockStylesSource, /data-mobile-sheet-view="context"[\s\S]*\[class\*="canonicalPlannerStatus"\]/);
});

test("short and landscape Map viewports retain recoverable canvas and safe-area controls", () => {
  assert.match(mapDockStylesSource, /@media \(max-width:980px\) and \(max-height:520px\)/);
  assert.match(mapDockStylesSource, /--mobile-map-visible-space:112px/);
  assert.match(mapDockStylesSource, /--mobile-map-drawer-collapsed-height:72px/);
  assert.match(mapDockStylesSource, /padding:10px 2px calc\(24px \+ env\(safe-area-inset-bottom\)\)/);
  assert.match(mapDockStylesSource, /bottom:max\(10px,env\(safe-area-inset-bottom\)\)!important/);
  for (const story of ["Mobile320MapCanvas", "Mobile390StayResultsOpen", "Mobile430SelectedStayOpen", "Mobile390EatResultsOpen", "Mobile430SelectedEatOpen", "Mobile390SeeOpen", "Mobile390SavedPinOpen", "MobileShortStayOpen", "MobileLandscapeCollapsed", "Tablet768StayOpen", "Mobile390ShortResultsOpen", "Mobile390MediumResultsOpen", "Mobile390LongResultsOpen", "Mobile390EmptyResultsOpen", "Mobile390SelectedDetailOpen"]) {
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

test("TripShell keeps five planning tabs and moves Route into header actions", () => {
  const overview = tripShellSource.indexOf('{ id: "overview", label: "Overview", icon: House, suffix: "" }');
  const itinerary = tripShellSource.indexOf('{ id: "itinerary", label: "Itinerary"');
  const explore = tripShellSource.indexOf('{ id: "explore", label: "Explore"');
  const stay = tripShellSource.indexOf('{ id: "stay", label: "Stay"');
  const transport = tripShellSource.indexOf('{ id: "transport", label: "Transport"');

  assert.ok(overview >= 0);
  assert.ok(overview < itinerary && itinerary < explore && explore < stay && stay < transport);
  assert.doesNotMatch(tripShellSource, /id: "journey"|id: "map"/);
  assert.match(tripShellSource, /href=\{personalRouteHref\(trip\.id\)\}[\s\S]*>Route<\/EasyTLinkButton>[\s\S]*aria-label="Edit trip brief"[\s\S]*>Edit<\/EasyTLinkButton>/);
  assert.match(tripShellSource, /trip\.ownerId && mutation\.saveState !== "idle" \? <MorroviaSaveStatus state=\{mutation\.saveState\} \/> : null/);
  assert.doesNotMatch(tripShellSource, /id: "prep"|label: "Prep"|suffix: "\/prep"/);
  assert.match(tripShellSource, /: "overview";/);
});

test("Map is a focused route with shared planner ownership and an explicit return action", () => {
  const shell = readFileSync(new URL("../components/easyt/trip-shell.tsx", import.meta.url), "utf8");
  const map = readFileSync(new URL("../components/easyt/trip-map-workspace.tsx", import.meta.url), "utf8");
  assert.match(shell, /TripShellChrome/);
  assert.match(map, /returnTo.*searchParams\.get\("returnTo"\)/);
  assert.match(map, /JourneyMapPlannerWorkspace trip=\{trip\} presentation="shell"/);
  assert.match(map, /expandedReturnHref=\{returnTo\}/);
  assert.doesNotMatch(map, /returnBar|Back to trip/);
  assert.match(mapWorkspaceSource, /useState\(Boolean\(expandedReturnHref\)\)/);
  assert.match(mapWorkspaceSource, /router\.replace\(expandedReturnHref\)/);
  assert.doesNotMatch(mapWorkspaceSource, /router\.push\(expandedReturnHref\)/);
});

test("expanded Map exposes its existing return control at touch widths", () => {
  const strip = readFileSync(new URL("../components/journey-planner-strip.module.css", import.meta.url), "utf8");
  assert.match(strip, /@media\(max-width:980px\)\{[\s\S]*?\.integrated \.fullTrip\[data-map-expand-control\]:not\(\[aria-pressed="true"\]\)\{display:none\}/);
  assert.match(mapWorkspaceSource, /fullTripLabel=\{expandedReturnHref \? "Back to trip"/);
});
