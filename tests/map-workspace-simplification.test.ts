import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workspace = readFileSync(new URL("../components/journey-map-planner-workspace.tsx", import.meta.url), "utf8");
const plan = readFileSync(new URL("../components/journey-plan-workspace.tsx", import.meta.url), "utf8");
const stories = readFileSync(new URL("../components/easyt/trip-map-workspace.stories.tsx", import.meta.url), "utf8");
const journeyStyles = readFileSync(new URL("../app/journey/journey.module.css", import.meta.url), "utf8");
const localFinder = readFileSync(new URL("../components/journey-local-finder.tsx", import.meta.url), "utf8");

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
  assert.match(workspace, /googleCanvasActive=\{googleCanvasActive\}/);
  assert.match(plan, /googleCanvasActive[\s\S]*?mapsUrl[\s\S]*?Open in Google Maps/);
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

test("Plan transfer uses one left-edge mode icon, left-aligned route text and secondary duration", () => {
  const transferRow = plan.slice(plan.indexOf("function AgendaRow"), plan.indexOf("export function PlanWorkspace"));
  assert.match(transferRow, /item\.kind === "transfer"[\s\S]*?<TransferIcon item=\{item\} \/>[\s\S]*?<strong className=\{styles\.mapPlanTitle\}>\{item\.title\}<\/strong>/);
  assert.doesNotMatch(transferRow.slice(transferRow.indexOf("item.kind === \"transfer\" ? <button")), /ArrowUpRight className=\{styles\.mapPlanOpenIcon\}/);
  assert.match(journeyStyles, /\.mapPlanTransfer \.mapPlanAgendaRow\{[^}]*grid-template-columns:22px minmax\(0,1fr\) auto/);
  assert.match(journeyStyles, /\.mapPlanTransfer \.mapPlanAgendaRow>svg\{[^}]*grid-column:1[^}]*justify-self:start/);
});
