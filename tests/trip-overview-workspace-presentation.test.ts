import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("components/easyt/trip-overview-workspace.tsx", "utf8");
const styles = readFileSync("components/easyt/trip-overview-workspace.module.css", "utf8");
const mapSource = readFileSync("components/journey-planner-map.tsx", "utf8");

test("Overview only surfaces a provider-confirmed representative stay", () => {
  assert.match(source, /stableStopDateRange\(actionImageStop, trip\)/);
  assert.match(source, /\/api\/journey-accommodation-search\?/);
  assert.match(source, /property\.id\.startsWith\("booking-"\)/);
  assert.match(source, /Available for your selected dates/);
  assert.match(source, /Explore stays around \{actionImageStop\.name\}/);
  assert.doesNotMatch(source, /Shota|Rustaveli|\$89|Breakfast included|Free cancellation|Recommended/);
});

test("Trip Health keeps canonical issue severity and explains truncation", () => {
  assert.match(source, /const visibleIssues = issues\.slice\(0, 2\)/);
  assert.match(source, /issue\.severity === "critical" \? styles\.issueCritical/);
  assert.match(source, /Showing the \{visibleIssues\.length\} highest-priority of \{issues\.length\} checks/);
  assert.match(source, /href=\{issues\[0\]\?\.href \?\? routeIssueHref\(trip\.id\)\}/);
});

test("Planning progress stays derived and exposes seven truthful readiness categories", () => {
  assert.match(source, /deriveOverviewReadinessCategories\(\{/);
  assert.match(source, /readinessCategories\.map/);
  assert.match(source, /progressIconByCategory/);
  assert.match(source, /role="progressbar"/);
  assert.match(source, /percent !== null/);
  assert.match(source, /progressStatusLabel\[status\]/);
  assert.match(source, /status !== "complete"/);
  assert.match(source, /className=\{styles\.progressSummary\}/);
  assert.match(source, /className=\{styles\.progressFooter\}/);
  assert.match(styles, /grid-template-columns: repeat\(7, minmax\(0, 1fr\)\)/);
  assert.match(styles, /\.progressItem\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/);
  assert.match(styles, /\.progressSummary,[\s\S]*\.progressTrackPlaceholder\s*\{[^}]*grid-column:\s*auto;[^}]*width:\s*100%;[^}]*min-width:\s*0;[^}]*max-width:\s*100%/);
  assert.match(styles, /\.progressFooter\s*\{[^}]*flex-wrap:\s*wrap/);
  assert.doesNotMatch(styles, /\.progressTrack\s*\{[^}]*grid-column:\s*1\s*\/\s*-1/);
  assert.doesNotMatch(styles, /\.progressAction\s*\{[^}]*position:\s*absolute/);
});

test("Before You Go reuses canonical preparation tasks and actions without a second route", () => {
  assert.match(source, /useTripPrepReadiness\(\{/);
  assert.match(source, /<TripPreparationTaskSection id="overview-must" title="Must do"/);
  assert.match(source, /<TripPreparationTaskSection id="overview-good" title="Good to do"/);
  assert.match(source, /<TripTravellerDetailsEditor/);
  assert.doesNotMatch(source, /TripPrepDetails|Detailed preparation guidance/);
  assert.match(source, /href: "#before-you-go"/);
  assert.doesNotMatch(source, /\/journey\/\$\{encodeURIComponent\(trip\.id\)\}\/prep/);
  assert.match(styles, /\.beforeGoGrid/);
});

test("route storytelling resolves imagery, stays image-led and links to the canonical Map", () => {
  assert.match(source, /const imagedDay = days\.find\(\(item\) => Boolean\(item\.image\)\)/);
  assert.match(source, /itineraryImageFor\(/);
  assert.match(source, /\/api\/journey-place\?title=/);
  assert.match(source, /resolvedPlaceImages\[stop\.id\]/);
  assert.match(source, /formatTripNights\(stop\.nights\)/);
  assert.match(source, /className=\{styles\.stopNumber\}>\{index \+ 1\}/);
  assert.doesNotMatch(source, /className=\{styles\.stopNumber\}>From/);
  assert.match(source, /conciseTransferLabel\(leg\)/);
  assert.match(source, /className=\{styles\.transfer\}><ArrowRight/);
  assert.match(source, /className=\{styles\.stopOverlay\}/);
  assert.match(source, /href=\{`\/journey\/\$\{encodeURIComponent\(trip\.id\)\}\/map`\}/);
  assert.match(source, /<JourneyPlannerMap[\s\S]*overviewMode previewMode/);
  assert.match(source, /View full map/);
  assert.doesNotMatch(source, /GEORGIA|Tbilisi|Stepantsminda|Ushguli|Mestia/);
});

test("the Overview map is the shared MapLibre surface in non-interactive preview mode", () => {
  assert.match(mapSource, /previewMode\?: boolean/);
  assert.match(mapSource, /interactive: !previewMode/);
  assert.match(mapSource, /if \(!previewMode\) map\.addControl/);
  assert.match(mapSource, /number\.textContent = previewMode[\s\S]*String\(index \+ 1\)/);
  assert.match(mapSource, /previewMode \? previewLabel \?\? "Whole-trip route map preview" : "Interactive trip map"/);
  assert.equal((mapSource.match(/new maplibregl\.Map\(/g) ?? []).length, 1);
});

test("Why this order is one shallow explanation with the existing itinerary action", () => {
  assert.match(source, /routeRationale\.reasons\[0\] \?\? routeRationale\.summary/);
  assert.match(source, /View detailed itinerary/);
  assert.doesNotMatch(source, /Main trade-off:/);
  assert.match(styles, /\.routeRationale\{display:grid;grid-template-columns:22px minmax\(0,1fr\) auto/);
});

test("Overview responsive rules keep mobile controls usable without page overflow", () => {
  assert.match(styles, /@media \(max-width: 520px\)/);
  assert.match(styles, /\.nextActions > a \{ --control-height: 44px;/);
  assert.match(styles, /\.overview \.healthAction,[\s\S]*\.overview \.progressAction \{ --control-height: 44px;/);
  assert.match(styles, /\.routeList \{ overflow-x: auto;/);
  assert.match(styles, /\.routeMapPreview \{ min-height: 220px;/);
  assert.match(styles, /overflow-x: auto;/);
});
