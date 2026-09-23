import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("Route Check keeps canonical rows and markers while presenting a comparison overlay", () => {
  const builder = readFileSync(new URL("../app/journey/new/trip-builder.tsx", import.meta.url), "utf8");
  const workspace = readFileSync(new URL("../app/journey/new/trip-builder-route-workspace.tsx", import.meta.url), "utf8");

  assert.match(workspace, /const recommendedTrip = preview\?\.ok \? preview\.trip : canonicalTrip/,
    "only a live drag preview may change presented row and marker order");
  assert.match(workspace, /routeCheckProposalStopIds[\s\S]*comparisonLegs=/,
    "Route Check must use a separate map comparison instead of preview order");
  assert.doesNotMatch(workspace, /builderRouteCheck|Check route|routeCheckSummary|onOpenRouteCheck/,
    "the workspace must not render a second Route Check owner");
  assert.match(builder, /currentBuilderRouteProposal\([\s\S]*routeCheckProposalStopIds[\s\S]*routeRecommendationVisible/,
    "a comparison proposal must be derived from the current visible recommendation");
  assert.match(builder, /commitStopOrder\(currentRouteCheckProposalStopIds, "route-check"\)/,
    "Apply must use the same canonical commit boundary as drag and menu movement");
  assert.match(builder, /routeCheckProposalStopIds && !currentRouteCheckProposalStopIds[\s\S]*setRouteCheckProposalStopIds\(null\)/,
    "a stale proposal must be cleared when route intelligence changes or disappears");
  assert.match(builder, /routeRecommendationVisible \? <section[\s\S]*Compare order/,
    "a recommendation result should expose one specific comparison action in the canonical disclosure");
  assert.match(builder, /!routeRecommendationVisible && longJourneyIssue && scoredAlternativeRoutes\.length > 0/,
    "warning alternatives must not compete with the canonical route recommendation decision");
  assert.match(builder, /commitStopOrder\(nextStops\.map\(\(stop\) => stop\.id\), "route-check"\)/);
  assert.doesNotMatch(builder, /apply a materially cleaner route[\s\S]*applyRecommendedOrder\(\)/,
    "Build must never silently apply a Route Check recommendation");
});

test("one concise disclosure owns warnings and Route Check results", () => {
  const builder = readFileSync(new URL("../app/journey/new/trip-builder.tsx", import.meta.url), "utf8");

  assert.match(builder, /const showRouteStatus = Boolean\(showTimingWarning \|\| routeRecommendationVisible \|\| routeCoverageNotice \|\| transportReviewNotice\)/);
  assert.match(builder, /Very fast pace|Ritmo muy intenso/,
    "compressed routes should have a glanceable status headline");
  assert.match(builder, /: tripTimingNotice[\s\S]*: routeRecommendationVisible/,
    "timing warnings must retain priority over a simultaneous route recommendation");
  assert.doesNotMatch(builder, /<small>\{timingWarningSummary\}<\/small>/,
    "the collapsed status must not repeat a long subtitle");
  assert.match(builder, /What this means|Qué significa/,
    "factual detail should remain available on expansion");
  assert.doesNotMatch(builder, /Review route|Revisar ruta/,
    "a generic route action must not redirect to Add stop");
  assert.doesNotMatch(builder, /primaryRouteCheckSummary/,
    "neutral route-check copy should not survive as a competing result owner");
});

test("the map comparison layer is dashed, noninteractive and does not create markers", () => {
  const map = readFileSync(new URL("../components/journey-planner-map.tsx", import.meta.url), "utf8");
  assert.match(map, /comparisonLegs\?: readonly MapRouteLeg\[\]/);
  assert.match(map, /id: "trip-route-comparison"/);
  assert.match(map, /"line-dasharray": \[2, 2\]/);
  assert.doesNotMatch(map, /comparisonMarkers/);
  assert.match(map, /comparisonLabel/);
});

test("Route Check projects country continuity through the existing reason and protected apply boundary", () => {
  const builder = readFileSync(new URL("../app/journey/new/trip-builder.tsx", import.meta.url), "utf8");

  assert.match(builder, /currentAvoidableCountryReentryCount/);
  assert.match(builder, /recommendedAvoidableCountryReentryCount/);
  assert.match(builder, /recommendedAvoidableCountryReentryCount < currentAvoidableCountryReentryCount/);
  assert.match(builder, /keeps stops in the same country together, reducing avoidable re-entry/i);
  assert.match(builder, /applyRouteCheckProposal[\s\S]*scheduleLocks\.stopIds\.length[\s\S]*scheduleLocks\.arrivalDates[\s\S]*structuredRouteConstraints\.fixedCommitments/);
  assert.match(builder, /applyScoredRouteCandidate[\s\S]*scheduleLocks\.stopIds\.length[\s\S]*scheduleLocks\.arrivalDates[\s\S]*structuredRouteConstraints\.fixedCommitments/);
  assert.match(builder, /validateBuilderStopOrder\(stops, proposedIds,[\s\S]*lockedStopIds: scheduleLocks\.stopIds,[\s\S]*fixedOrder: Boolean\(structuredRouteConstraints\.fixedCommitments\?\.length\)/);
});
