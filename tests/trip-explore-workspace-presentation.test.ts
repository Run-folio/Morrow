import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workspace = readFileSync(new URL("../components/easyt/trip-explore-workspace.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../components/easyt/trip-explore-workspace.module.css", import.meta.url), "utf8");
const navigation = readFileSync(new URL("../components/easyt/trip-shell-client.tsx", import.meta.url), "utf8");
const itinerary = readFileSync(new URL("../components/easyt/trip-itinerary-workspace.tsx", import.meta.url), "utf8");
const detail = readFileSync(new URL("../components/easyt/itinerary-item-detail.tsx", import.meta.url), "utf8");

test("Explore is a canonical TripShell workspace without a second navigation owner", () => {
  assert.match(navigation, /id: "explore"[\s\S]*suffix: "\/explore"/);
  assert.match(navigation, /remainder\.startsWith\("\/explore"\)/);
  assert.match(navigation, /view === "explore"[\s\S]*trackEvent\("explore_opened"/);
  assert.doesNotMatch(workspace, /bottomNav|fixedNavigation|globalDock/);
  assert.doesNotMatch(workspace, /trackEvent\("explore_opened"/);
});

test("desktop uses a results workspace and contextual right rail, not a centred modal", () => {
  assert.match(workspace, /className=\{styles\.grid\}/);
  assert.match(workspace, /className=\{`\$\{styles\.rail\}/);
  assert.match(workspace, /<ItineraryItemDetail/);
  assert.doesNotMatch(workspace, /role="alertdialog"/);
});

test("mobile detail reuses the canonical itinerary sheet interaction", () => {
  assert.match(workspace, /<ItineraryItemDetail/);
  assert.match(detail, /aria-modal=\{mobileSheet \|\| undefined\}/);
  assert.match(detail, /document\.body\.style\.overflow = "hidden"/);
  assert.match(detail, /window\.requestAnimationFrame\(\(\) => closeRef\.current\?\.focus/);
  assert.match(workspace, /window\.requestAnimationFrame\(\(\) => origin\?\.focus\(\)\)/);
  assert.match(styles, /@media \(max-width: 900px\)[\s\S]*\.rail:not\(\.railSelected\) \{ display: none; \}/);
});

test("whole result-card detail and secondary Add/Save actions are separate semantic controls", () => {
  assert.match(workspace, /<EasyTButton type="button" className=\{styles\.cardOpen\}[\s\S]*aria-label=\{`Open details for/);
  assert.match(workspace, /aria-label=\{`Save \$\{result\.title\} for later`\}/);
  assert.match(styles, /\.cardOpen \{ position: absolute; inset: 0; z-index: 1;/);
  assert.match(styles, /\.cardActions \{[\s\S]*z-index: 2;/);
});

test("loading, partial-provider degradation, empty, and missing-image states stay distinct", () => {
  assert.match(workspace, /providerState === "degraded" && visibleResults\.length/);
  assert.match(workspace, /providerState === "degraded" \? <MorroviaSectionStatus/);
  assert.match(workspace, /className=\{styles\.empty\}/);
  assert.match(workspace, /fallback=\{<span><MapPin/);
  assert.doesNotMatch(workspace, /console\.(?:log|error)/);
});

test("Explore reuses canonical persistence, scheduling, identity and detail owners", () => {
  assert.match(workspace, /useTripMutationPersistence/);
  assert.match(workspace, /saveItineraryIdea\(current, result\.idea\)/);
  assert.match(workspace, /scheduleItineraryIdea\(current, result\.idea, target\.day\.id, target\.dayPart\)/);
  assert.match(workspace, /dedupeExploreResults/);
  assert.match(workspace, /ItineraryItemDetail/);
  assert.doesNotMatch(workspace, /localStorage|sessionStorage/);
  assert.match(workspace, /const mapHref = selectedResult\.coordinates[\s\S]*: null;/);
});

test("Itinerary keeps discovery secondary and links to the canonical Explore workspace", () => {
  assert.match(itinerary, /See more ideas in Explore/);
  assert.match(itinerary, /exploreWorkspaceHref\(workingTrip\.id, active\.stopId, active\.dayNumber\)/);
});

test("responsive cards avoid horizontal overflow and retain 44px touch controls", () => {
  assert.match(styles, /\.categories \{[\s\S]*overflow-x: auto/);
  assert.match(styles, /\.categories button \{ flex: none; min-height: 44px; \}/);
  assert.match(styles, /@media \(max-width: 390px\)/);
  assert.match(styles, /\.cardActions a,[\s\S]*min-height: 44px/);
});
