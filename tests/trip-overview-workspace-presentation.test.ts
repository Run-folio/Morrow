import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("components/easyt/trip-overview-workspace.tsx", "utf8");
const styles = readFileSync("components/easyt/trip-overview-workspace.module.css", "utf8");
const mapSource = readFileSync("components/journey-planner-map.tsx", "utf8");
const shellSource = readFileSync("components/easyt/trip-shell.tsx", "utf8");
const resolverSource = readFileSync("components/easyt/trip-shell-resolver.tsx", "utf8");
const shellClientSource = readFileSync("components/easyt/trip-shell-client.tsx", "utf8");

test("Overview prioritises the route, one planning action and three next-to-arrange decisions", () => {
  const tripHeader = shellSource.indexOf('<header className={styles.tripHeader}>');
  const shellContent = shellSource.indexOf('<div className={styles.content}>{children}</div>');
  const route = source.indexOf('<section ref={nextOrientationTarget} className={styles.routeCard}');
  const arrange = source.indexOf('<section ref={progressOrientationTarget} className={styles.arrangeCard}');
  const plans = source.indexOf('<TripExplicitPlans trip={trip} variant="overview" />');
  const beforeGo = source.indexOf('<section className={styles.beforeGo}');

  assert.ok(tripHeader >= 0 && tripHeader < shellContent);
  assert.ok(route >= 0 && route < arrange);
  assert.ok(arrange < plans);
  assert.ok(plans < beforeGo);
  assert.match(source, /Your route is ready to shape/);
  assert.match(source, /label: firstArrival[\s\S]*\? "Plan my days"/);
  assert.match(source, />Explore on map</);
  assert.match(source, />Adjust route</);
  assert.match(source, /Next to arrange/);
  assert.match(source, /Keep building your trip/);
  assert.doesNotMatch(source, /Your next step|Trip health|Readiness at a glance|Planning progress/);
  assert.match(styles, /grid-template-areas:\s*"route"\s*"arrange"\s*"plans"\s*"before"/);
  assert.match(shellClientSource, /overnightAccommodationStops\(trip\)\.length/);
  assert.match(shellClientSource, /"overnight place" : "overnight places"/);
});

test("critical trip and persistence states remain truthful without a duplicate health dashboard", () => {
  const resolverBanner = resolverSource.indexOf("syncIssue ? <MorroviaStatusBanner");
  const resolverShell = resolverSource.indexOf("<TripShell trip=");
  const sessionBanner = shellClientSource.indexOf('{ownerBoundary === "expired" || ownerBoundary === "signed-out" ? (');
  const recoveryBanner = shellClientSource.indexOf("{visibleDeviceRecovery ? (");
  const tripProvider = shellClientSource.indexOf("<TripShellTripContext.Provider");

  assert.match(source, /materialRouteIssues/);
  assert.match(source, /issue\.severity === "critical" \? styles\.issueCritical/);
  assert.doesNotMatch(source, /className=\{styles\.healthCard\}/);
  assert.ok(resolverBanner >= 0 && resolverBanner < resolverShell);
  assert.ok(sessionBanner >= 0 && sessionBanner < tripProvider);
  assert.ok(recoveryBanner >= 0 && recoveryBanner < tripProvider);
});

test("Overview removes the decorative stay hero and leaves stay discovery to its canonical workspace", () => {
  assert.doesNotMatch(source, /journey-accommodation-search|representativeStay|Available for your selected dates/);
  assert.match(source, /mapWorkspaceHref\(trip\.id, accommodation\.stops\.find/);
});

test("material route uncertainty is contextual and keeps canonical severity", () => {
  assert.match(source, /const visibleIssues = materialRouteIssues\.slice\(0, 2\)/);
  assert.match(source, /issue\.severity === "critical" \|\| materialRouteRules\.has\(issue\.rule\)/);
  assert.match(source, /issue\.severity === "critical" \? styles\.issueCritical/);
  assert.match(source, /severity: issue\.severity/);
  assert.match(source, /Review timing|Review transport/);
  assert.doesNotMatch(source, /Showing the \{visibleIssues\.length\} highest-priority/);
});

test("Next to arrange stays derived and exposes only Days, Stays and Transport", () => {
  assert.match(source, /deriveOverviewReadinessCategories\(\{/);
  assert.match(source, /planningCategories\.map/);
  assert.match(source, /progressIconByCategory/);
  assert.match(source, /progressStatusLabel\[status\]/);
  assert.match(source, /\["itinerary", "accommodation", "transport"\]/);
  assert.match(styles, /\.arrangeGrid[\s\S]*grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
  assert.doesNotMatch(source, /role="progressbar"/);
  assert.match(source, /category\.id === "accommodation" && !accommodation\.stops\.length\) return null/);
});

test("Before You Go reuses canonical preparation tasks and actions without a second route", () => {
  assert.match(source, /useTripPrepReadiness\(\{/);
  assert.match(source, /<TripPreparationTaskSection id="overview-must" title="Must do"/);
  assert.match(source, /<TripPreparationTaskSection id="overview-good" title="Good to do"/);
  assert.match(source, /<TripTravellerDetailsEditor/);
  assert.doesNotMatch(source, /TripPrepDetails|Detailed preparation guidance/);
  assert.match(source, /id="before-you-go"/);
  assert.doesNotMatch(source, /\/journey\/\$\{encodeURIComponent\(trip\.id\)\}\/prep/);
  assert.match(styles, /\.beforeGoGrid/);
  assert.match(source, /<details className=\{styles\.beforeGoDisclosure\}/);
});

test("route storytelling resolves imagery, stays image-led and links to the canonical Map", () => {
  assert.match(source, /overviewStopImage\(trip, stop\)/);
  assert.match(source, /resolveRoutePhotoCandidates\(imageResolutionCandidates/);
  assert.match(source, /const imageCacheKeysByOccurrence = useMemo/);
  assert.match(source, /canonicalPlacePhotoCacheKey\(\{/);
  assert.doesNotMatch(source, /\/api\/journey-place\?/);
  assert.doesNotMatch(source, /Promise\.all\(imageResolutionCandidates/);
  assert.match(source, /resolvedPlaceImages\[imageCacheKeysByOccurrence\[stop\.id\]\]/);
  assert.match(source, /<MorroviaPhotoCredit className=\{styles\.stopCredit\}/);
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
  assert.match(source, /routeRationaleCopy/);
  assert.match(source, /View detailed itinerary/);
  assert.doesNotMatch(source, /entered order ranks first under current criteria/i);
  assert.doesNotMatch(source, /Main trade-off:/);
  assert.match(styles, /\.routeRationale \{[\s\S]*grid-template-columns: 22px minmax\(0,1fr\) auto/);
});

test("Overview responsive rules keep mobile controls usable without page overflow", () => {
  assert.match(styles, /@media \(max-width: 520px\)/);
  assert.match(styles, /\.routeActions > a \{ --control-height: 44px;/);
  assert.match(styles, /\.arrangeGrid \{ grid-template-columns: minmax\(0, 1fr\);/);
  assert.match(styles, /\.routeList \{ overflow-x: auto;/);
  assert.match(styles, /\.routeMapPreview \{ min-height: 220px;/);
  assert.match(styles, /overflow-x: auto;/);
});
