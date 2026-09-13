import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workspace = readFileSync(new URL("../components/easyt/trip-explore-workspace.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../components/easyt/trip-explore-workspace.module.css", import.meta.url), "utf8");
const navigation = readFileSync(new URL("../components/easyt/trip-shell-client.tsx", import.meta.url), "utf8");
const itinerary = readFileSync(new URL("../components/easyt/trip-itinerary-workspace.tsx", import.meta.url), "utf8");
const detail = readFileSync(new URL("../components/easyt/itinerary-item-detail.tsx", import.meta.url), "utf8");
const routeStrip = readFileSync(new URL("../components/journey-planner-strip.tsx", import.meta.url), "utf8");
const routeStripStyles = readFileSync(new URL("../components/journey-planner-strip.module.css", import.meta.url), "utf8");
const stories = readFileSync(new URL("../components/easyt/trip-explore-workspace.stories.tsx", import.meta.url), "utf8");

test("Explore is a canonical TripShell workspace without a second navigation owner", () => {
  assert.match(navigation, /id: "explore"[\s\S]*suffix: "\/explore"/);
  assert.match(navigation, /remainder\.startsWith\("\/explore"\)/);
  assert.match(navigation, /view === "explore"[\s\S]*trackEvent\("explore_opened"/);
  assert.doesNotMatch(workspace, /bottomNav|fixedNavigation|globalDock/);
  assert.doesNotMatch(workspace, /trackEvent\("explore_opened"/);
});

test("destination filtering reuses the controlled route-stop presentation instead of a dropdown", () => {
  assert.match(routeStrip, /export function JourneyStopNavigation/);
  assert.match(workspace, /<JourneyStopNavigation/);
  assert.match(workspace, /id: "all", name: "All trip"/);
  assert.match(workspace, /id: destination\.id,[\s\S]*dayLabel: destination\.dayLabel/);
  assert.doesNotMatch(workspace, /label="Explore destination"/);
  assert.doesNotMatch(workspace, /map camera|selectedMap|persisted route-selection/);
  assert.match(routeStrip, /active\.scrollIntoView\?\./);
  assert.match(routeStripStyles, /\.stopTrack\{[\s\S]*overflow-x:auto/);
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

test("hover and keyboard focus cannot paint the full-card control over its content or change geometry", () => {
  assert.match(styles, /\.card \.cardOpen:hover:not\(:disabled\),[\s\S]*background: transparent;[\s\S]*transform: none;/);
  assert.match(styles, /\.card \.cardOpen:focus-visible:not\(:disabled\)/);
  assert.match(styles, /\.card:focus-within \{ box-shadow:/);
  assert.doesNotMatch(styles, /\.card:hover[^\{]*\{[^}]*display:\s*none/);
  assert.doesNotMatch(styles, /\.card:hover[^\{]*\{[^}]*opacity:\s*0/);
  assert.doesNotMatch(styles, /\.card:hover[^\{]*\{[^}]*transform:/);
});

test("loading, partial-provider degradation, empty, and missing-image states stay distinct", () => {
  assert.match(workspace, /organicStatus === "loading" && !visibleResults\.length/);
  assert.match(workspace, /commercialStatus === "loading"/);
  assert.match(workspace, /Local ideas are ready\. Bookable experiences are still loading\./);
  assert.match(workspace, /commercialStatus === "degraded"/);
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

test("traveller copy avoids implementation language and the rail keeps free-time actions without a duplicate map card", () => {
  for (const phrase of ["route geometry", "exact saved pins", "No canonical activity", "add it to a real day", "trip destinations"]) {
    assert.doesNotMatch(workspace, new RegExp(phrase, "i"));
  }
  assert.doesNotMatch(workspace, /styles\.mapContext|>Your trip</);
  assert.match(workspace, />Free time</);
  assert.match(workspace, />Find ideas for this time</);
  assert.match(workspace, /Add it to a day or save it for later/);
});

test("commercial cards disclose only sourced facts and retain separate planning and affiliate actions", () => {
  assert.match(workspace, /result\.rating !== undefined/);
  assert.match(workspace, /result\.reviewCount !== undefined/);
  assert.match(workspace, /result\.price \?/);
  assert.match(workspace, /cta: "View tickets"/);
  assert.match(workspace, /MorroviaAffiliateLink/);
  assert.match(workspace, /scheduleResult\(result\)/);
  assert.doesNotMatch(workspace, /Free cancellation|Instant confirmation/);
});

test("Itinerary keeps discovery secondary and links to the canonical Explore workspace", () => {
  assert.match(itinerary, /See more ideas in Explore/);
  assert.match(itinerary, /exploreWorkspaceHref\(workingTrip\.id, active\.stopId, active\.dayNumber\)/);
});

test("responsive cards avoid horizontal overflow and retain 44px touch controls", () => {
  assert.match(styles, /\.stopNavigation \{ min-width: 0;[\s\S]*overflow: hidden;/);
  assert.match(styles, /\.categories \{[\s\S]*overflow-x: auto/);
  assert.match(styles, /\.categories button \{ flex: none; min-height: 44px; \}/);
  assert.match(styles, /@media \(max-width: 390px\)/);
  assert.match(styles, /\.cardActions a,[\s\S]*min-height: 44px/);
});

test("Storybook covers destination, interaction, inventory and responsive Explore acceptance states", () => {
  for (const story of [
    "AllTripForYou", "SelectedRomeStop", "SelectedAthensStop", "MixedOrganicAndViator", "OrganicReadyCommercialLoading", "OrganicAttraction", "EntryTicket", "Tours", "Restaurant", "ScheduledResult", "SavedResult", "HoverContentStable", "KeyboardFocusStable", "MissingImage", "RejectedImageFallback", "EmptyCategory", "ProviderDegraded", "SelectedDetail", "Mobile390HorizontalStops", "Mobile430HorizontalStops", "Mobile390HorizontalCategories", "Mobile390OrganicCard", "Mobile430CommercialCard", "Mobile430SelectedDetail", "Mobile390ScheduledState", "Mobile430SavedState", "TokyoForYou", "TokyoMustSee", "TokyoFoodRichCandidates", "TokyoToursAvailable", "TokyoToursProviderUnavailable", "TokyoDayTripsOrganicAndCommercial", "TokyoOutdoorsSemantic", "SparseDestination", "TokyoNoImageRestaurants", "OrganicDayTripsWithoutViator",
  ]) assert.match(stories, new RegExp(`export const ${story}`), story);
});
