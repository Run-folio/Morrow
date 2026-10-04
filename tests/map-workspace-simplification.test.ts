import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workspace = readFileSync(new URL("../components/journey-map-planner-workspace.tsx", import.meta.url), "utf8");
const plan = readFileSync(new URL("../components/journey-plan-workspace.tsx", import.meta.url), "utf8");
const stories = readFileSync(new URL("../components/easyt/trip-map-workspace.stories.tsx", import.meta.url), "utf8");
const journeyStyles = readFileSync(new URL("../app/journey/journey.module.css", import.meta.url), "utf8");
const localFinder = readFileSync(new URL("../components/journey-local-finder.tsx", import.meta.url), "utf8");
const seeRefinement = readFileSync(new URL("../components/journey-itinerary-refinement.tsx", import.meta.url), "utf8");
const liveInventory = readFileSync(new URL("../components/easyt/live-activity-inventory.tsx", import.meta.url), "utf8");
const selectedDetail = readFileSync(new URL("../components/easyt/itinerary-item-detail.tsx", import.meta.url), "utf8");

function finderMarkup() {
  const start = workspace.indexOf("{showFinderDock ? <aside id=\"shape-day-workspace\"");
  const end = workspace.indexOf("</aside> : null}", start);
  assert.ok(start >= 0 && end > start, "the canonical Map finder remains owned by JourneyMapPlannerWorkspace");
  return workspace.slice(start, end);
}

test("Map finder leads with the selected destination and keeps issue inventory out of the workspace header", () => {
  const finder = finderMarkup();
  assert.match(finder, /<h2[^>]*>\{selected\.city\}<\/h2>/);
  assert.doesNotMatch(finder, /Shape the day/);
  assert.doesNotMatch(finder, /Trip status|tripIssueCount/);
  assert.match(finder, /tab === "plan" \? "Plan" : tab === "stay" \? "Stay" : tab === "eat" \? "Eat" : "See"/);
});

test("mobile planning sheet keeps the destination as its heading instead of the retired Shape the day label", () => {
  const sheetHeading = workspace.slice(workspace.indexOf("const mobileMapSheetTitle"), workspace.indexOf("useEffect(() => {", workspace.indexOf("const mobileMapSheetTitle")));
  assert.doesNotMatch(sheetHeading, /\? "Shape the day"/);
  assert.match(sheetHeading, /mobileMapSheetView === "planner"[\s\S]*?selectedTripStop\?\.name \?\? selected\.city/);
});

test("saved Google references are disclosed in the existing Plan workspace instead of as a second finder inventory", () => {
  assert.match(plan, /savedReferences\??:/);
  assert.match(plan, /Saved for later/);
  assert.match(workspace, /<PlanWorkspace[\s\S]*?savedReferences=\{savedGoogleReferences\}/);
  assert.match(workspace, /googlePlacesAvailable=\{googlePlacesAvailable\}/);
  assert.match(plan, /googlePlacesAvailable[\s\S]*?mapsUrl[\s\S]*?Open in Google Maps/);
  assert.match(plan, /className=\{styles\.mapPlanSavedReferenceLink\}/);
  assert.match(plan, /styles\.mapPlanSavedReferences/);
  assert.match(journeyStyles, /\.shapeDayPlan \.mapPlanSavedReferences>li\{[^}]*display:block/);
  assert.match(journeyStyles, /\.shapeDayPlan \.mapPlanSavedReferenceLink\{[^}]*display:flex[^}]*width:100%/);
  assert.match(stories, /MapPlanSavedGoogleReferenceMapLibre/);
  assert.doesNotMatch(workspace, /\{googleCanvasActive && !selectedGooglePlaceId && shapeDayTab !== "plan" \? <GoogleSavedReferenceList/);
});

test("selected Google and Morrovia results share one selected-place card owner", () => {
  assert.match(workspace, /const selectedPlaceDetail = selectedRecommendationDetail \?\? selectedGoogleRecommendationDetail/);
  assert.doesNotMatch(workspace, /googleCanvasActive && shapeDayTab !== "plan" && !selectedGooglePlaceId\)/, "Google canvas must not suppress the shared card for a selected Morrovia result");
  assert.match(workspace, /<ItineraryItemDetail[\s\S]*?detail=\{selectedPlaceDetail\}/);
  assert.doesNotMatch(workspace, /compactMapHeader[\s\S]{0,120}detail=\{selectedPlaceDetail\}/);
  assert.doesNotMatch(workspace, /<MapPlaceEnrichment/);
  assert.match(workspace, /selectedGoogleRecommendationDetail[\s\S]*currentGoogleDetail/);
});

test("Google place media loads from deliberate selection, not a second manual content control", () => {
  assert.doesNotMatch(workspace, /Load photos and reviews/);
  assert.match(workspace, /useEffect\(\(\) => \{ setGoogleMediaRequestedPlaceId\(selectedGooglePlaceId\); \}, \[selectedGooglePlaceId\]\)/);
});

test("native POI and saved-reference selection reveal the one selected-place sheet on mobile", () => {
  const nativeSelection = workspace.slice(workspace.indexOf("const selectGoogleNativePoi ="), workspace.indexOf("const selectGoogleCanvasPlace ="));
  const savedSelection = workspace.slice(workspace.indexOf("const selectGoogleSavedReference ="), workspace.indexOf("const selectMapPlanDay ="));
  assert.match(nativeSelection, /setMobileShapeDayOpen\(false\)/);
  assert.match(savedSelection, /setMobileShapeDayOpen\(false\)/);
});

test("sidebar recommendation hover and keyboard focus preview the exact result without selecting it", () => {
  const candidateRows = localFinder.slice(localFinder.indexOf("{isReady && candidates.length"), localFinder.indexOf("</div>}", localFinder.indexOf("{isReady && candidates.length")));
  assert.match(candidateRows, /onMouseEnter=\{\(\) => onPreviewPlace\?\.\(place\)\}/);
  assert.match(candidateRows, /onFocus=\{\(\) => onPreviewPlace\?\.\(place\)\}/);
  assert.match(candidateRows, /onMouseLeave=\{\(\) => onPreviewPlace\?\.\(null\)\}/);
  assert.doesNotMatch(candidateRows, /onMouseEnter=\{\(\) => choosePlace/);
  assert.match(workspace, /previewLocalPlace[\s\S]*?mapResultForSourceAtStop\(mapResults, kind, place\.id, stopId, dayNumber\)/);
  assert.match(workspace, /previewedMapResult\?\.selectionId/);
});

test("Map See leads with six ranked places, removes category and map-navigation chrome, and keeps result selection", () => {
  assert.match(seeRefinement, /compact \? 6 : 8/);
  assert.match(seeRefinement, /Show more places/);
  assert.doesNotMatch(seeRefinement, /SEE IN \$\{stop\.name\}|Best fits|Explore more on map|className=\{styles\.filters\}/);
  assert.match(seeRefinement, /onClick=\{\(\) => onPlaceSelect\?\.\(place\)\}/);
  assert.match(seeRefinement, /onSelectionChange\(stop\.id, place, !isSelected\)/);
  assert.match(finderMarkup(), /progressiveDisplay candidateLimit=\{24\}/);
});

test("Map Stay and Eat progressively reveal six ranked candidates while map sync follows visible rows", () => {
  assert.match(localFinder, /progressiveDisplay\?: boolean/);
  assert.match(localFinder, /Show more stays|Show more places/);
  assert.match(localFinder, /onPlacesChange\?\.\(visibleCandidates\.map/);
  assert.match(localFinder, /onClick=\{\(\) => choosePlace\(place\)\}/);
});

test("Map Viator requests and reveals real inventory in six-item batches with the minimal fallback", () => {
  assert.match(liveInventory, /body: JSON\.stringify\(\{ workspace/);
  assert.match(liveInventory, /workspace === "map" \? 6 : 4/);
  assert.match(liveInventory, /Show more experiences/);
  assert.match(seeRefinement, /Browse tours and activities/);
  assert.doesNotMatch(seeRefinement, /More ways to explore|Booking options from/);
  const inventoryRoute = readFileSync(new URL("../app/api/journey-activity-inventory/route.ts", import.meta.url), "utf8");
  assert.match(inventoryRoute, /workspace === "map" \? 12 : 4/);
  assert.match(liveInventory, /MorroviaAffiliateLink/);
  assert.match(liveInventory, /affiliateDisclosure/);
});

test("shared selected-place detail has a compact Map-only treatment and keeps its real actions", () => {
  assert.match(workspace, /mapSelectionPresentation/);
  assert.match(selectedDetail, /detail\.category && !mapSelectionPresentation/);
  assert.match(selectedDetail, /rating\|distance\|saved location/);
  assert.match(selectedDetail, /Close details for \$\{detail\.title\}/);
  assert.match(selectedDetail, /detail\.dateSummary/);
  assert.match(selectedDetail, /detail\.commercialFacts/);
  assert.match(workspace, /saveSelectedRecommendation/);
  assert.match(workspace, /Check availability/);
  assert.match(workspace, /onSelectionChange=\{handleAttractionSelection\}/);
  const mapDetailMarkup = workspace.slice(workspace.indexOf("{selectedPlaceDetail ? <div className={styles.mapPlaceDetail}"), workspace.indexOf("</div> : selectedLocalPlace ? <div", workspace.indexOf("{selectedPlaceDetail ? <div className={styles.mapPlaceDetail}")));
  assert.doesNotMatch(mapDetailMarkup, /<dt>Source<\/dt>|<dt>Type<\/dt>/);
});

test("Plan transfer uses one left-edge mode icon, left-aligned route text and secondary duration", () => {
  const transferRow = plan.slice(plan.indexOf("function AgendaRow"), plan.indexOf("export function PlanWorkspace"));
  assert.match(transferRow, /item\.kind === "transfer"[\s\S]*?<TransferIcon item=\{item\} \/>[\s\S]*?<strong className=\{styles\.mapPlanTitle\}>\{item\.title\}<\/strong>/);
  assert.doesNotMatch(transferRow.slice(transferRow.indexOf("item.kind === \"transfer\" ? <button")), /ArrowUpRight className=\{styles\.mapPlanOpenIcon\}/);
  assert.match(journeyStyles, /\.mapPlanTransfer \.mapPlanAgendaRow\{[^}]*grid-template-columns:22px minmax\(0,1fr\) auto/);
  assert.match(journeyStyles, /\.mapPlanTransfer \.mapPlanAgendaRow>svg\{[^}]*grid-column:1[^}]*justify-self:start/);
});
