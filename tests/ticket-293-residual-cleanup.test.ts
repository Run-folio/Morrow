import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("guest persistence has one visible owner and a secondary promotion action", () => {
  const resolver = read("components/easyt/trip-shell-resolver.tsx");
  const shell = read("components/easyt/trip-shell-client.tsx");

  assert.match(resolver, /title="Saved on this device"[\s\S]*variant="secondary"[\s\S]*>Save this trip<\/EasyTLinkButton>/);
  assert.match(shell, /trip\.ownerId && mutation\.saveState !== "idle" \? <MorroviaSaveStatus state=\{mutation\.saveState\} \/> : null/);
  assert.doesNotMatch(shell, /<div className=\{styles\.headerActions\}>\s*<MorroviaSaveStatus state=\{mutation\.saveState\} \/>/);
});

test("Stay settled states are neutral and the mapped-location blocker hands off to Adjust route", () => {
  const stay = read("components/easyt/trip-stay-workspace.tsx");

  assert.match(stay, /finder\.status === "empty" \? <MorroviaStatusBanner title="No stay options found"/);
  assert.match(stay, /title=\{overnightStops\.length \? "This stop needs a mapped location" : "No overnight stays to plan"\}/);
  assert.match(stay, /actions=\{overnightStops\.length \? <EasyTLinkButton[\s\S]*tripBuilderHref\(workingTrip\.id, workingTrip\.ownerId\)[\s\S]*>Adjust route<\/EasyTLinkButton> : undefined\}/);
  assert.doesNotMatch(stay, /<MorroviaSectionStatus title="No stay options found"/);
  assert.doesNotMatch(stay, /<MorroviaSectionStatus title=\{overnightStops\.length/);
});

test("Builder keeps one blocker summary without repeating itinerary invariant copy at the CTA", () => {
  const builder = read("app/journey/new/trip-builder.tsx");

  assert.match(builder, /const showRouteStatus = Boolean\(showTimingWarning \|\| routeRecommendationVisible \|\| routeCoverageNotice \|\| transportReviewNotice\)/);
  assert.match(builder, /const timingWarningTitle = gateConflict/);
  assert.match(builder, /\{gate && gateConflict\?\.code !== "itinerary-stop-uncovered" && <small className=\{styles\.gate\}>\{gate\}<\/small>\}/);
  assert.doesNotMatch(builder, /\{gateConflict && <li>\{gateConflict\.message\}<\/li>\}/);
});

test("Overview exposes one Map action in the route area", () => {
  const overview = read("components/easyt/trip-overview-workspace.tsx");

  assert.match(overview, />Explore on map<\/EasyTLinkButton>/);
  assert.doesNotMatch(overview, /View full map/);
  assert.doesNotMatch(overview, /className=\{styles\.routeMapAction\}/);
});

test("partial preparation-provider failure stays neutral and subordinate to retained tasks", () => {
  const overview = read("components/easyt/trip-overview-workspace.tsx");
  const status = overview.indexOf('title="Some guidance is unavailable"');
  const retainedTasks = overview.indexOf("mustTasks.length || goodTasks.length");

  assert.ok(status >= 0 && retainedTasks >= 0 && status < retainedTasks);
  assert.match(overview, /<MorroviaStatusBanner[\s\S]*title="Some guidance is unavailable"[\s\S]*<EasyTButton size="small" variant="secondary" onClick=\{prepReadiness\.retryProviders\}>Try again<\/EasyTButton>/);
  assert.doesNotMatch(overview, /<MorroviaSectionStatus state="error" title="Some guidance is unavailable"/);
});
