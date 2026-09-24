import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { discoveryFailureFocusTarget, discoveryMapTarget } from "../lib/easyt/discovery-map-target.ts";
import type { DiscoveryPlace } from "../lib/easyt/discovery-content.ts";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const places = [
  { id: "sydney", coordinates: [151.2093, -33.8688] },
  { id: "melbourne", coordinates: [144.9631, -37.8136] },
] satisfies Pick<DiscoveryPlace, "id" | "coordinates">[];

test("map targeting resolves only the exact canonical place ID", () => {
  assert.deepEqual(discoveryMapTarget("sydney", places), { id: "sydney", coordinates: [151.2093, -33.8688] });
  assert.deepEqual(discoveryMapTarget("melbourne", places), { id: "melbourne", coordinates: [144.9631, -37.8136] });
  assert.equal(discoveryMapTarget("unknown", places), null);
});

test("map targeting refuses invalid geography", () => {
  assert.equal(discoveryMapTarget("sydney", [{ ...places[0], coordinates: [Number.NaN, -33.8688] }]), null);
});

test("map failure restores the exact focused pin card, then highlight, then first card", () => {
  assert.equal(discoveryFailureFocusTarget("melbourne", "sydney", places), "melbourne");
  assert.equal(discoveryFailureFocusTarget("unknown", "sydney", places), "sydney");
  assert.equal(discoveryFailureFocusTarget(null, "unknown", places), "sydney");
  assert.equal(discoveryFailureFocusTarget(null, null, []), null);
});

test("Discovery map and cards share one transient canonical highlight owner", () => {
  const modal = read("components/easyt/discovery-modal.tsx");
  const steps = read("components/easyt/discovery-steps.tsx");
  const map = read("components/easyt/discovery-map.tsx");
  assert.match(modal, /highlightedPlaceId/);
  assert.match(modal, /setHighlightedPlaceId\(null\)/);
  assert.match(steps, /onHighlight\(place\.id\)/);
  assert.match(map, /bindMapMarkerActivation\(.*onHighlight/);
  assert.match(steps, /focus\(\)/);
  assert.match(steps, /mapPanelRef\.current\?\.scrollIntoView/);
  assert.match(steps, /if \(highlightedPlaceId\) handlePinHighlight\(highlightedPlaceId\)/);
  assert.match(steps, /handleMapUnavailable/);
  assert.match(steps, /setCardToFocus\(discoveryFailureFocusTarget\(/);
  assert.doesNotMatch(map, /addStop|onConfirm|add-shortlist|remove-shortlist/);
  assert.doesNotMatch(map, /mapRouteLine|mapRouteCasing|sequence|stop-number/);
  assert.match(map, /MorroviaSectionStatus/);
});

test("Discovery map is rendered only for desktop context or the opened mobile map", () => {
  const steps = read("components/easyt/discovery-steps.tsx");
  assert.match(steps, /import\("\.\/discovery-map"\)\.then/);
  assert.match(steps, /handleMapUnavailable\(\)/);
  assert.match(steps, /desktopMapVisible \|\| mobileMapOpen/);
  assert.match(steps, /MorroviaStatusBanner/);
  assert.match(steps, /aria-controls=\{mapRegionId\}/);
});

test("Builder route map remains available through a lazy workspace import", () => {
  const workspace = read("app/journey/new/trip-builder-route-workspace.tsx");
  assert.match(workspace, /import\("@\/components\/journey-planner-map"\)\.then/);
  assert.match(workspace, /setMapLifecycle\("unavailable"\)/);
  assert.match(workspace, /<JourneyPlannerMap[\s\S]*onLifecycleChange=\{setMapLifecycle\}/);
  assert.doesNotMatch(workspace, /^import \{ JourneyPlannerMap \} from/m);
});

test("generated Builder itinerary is lazy so its Trip Map does not enter initial capture", () => {
  const builder = read("app/journey/new/trip-builder.tsx");
  assert.match(builder, /dynamic\(\(\) => import\("@\/components\/easyt\/trip-itinerary-workspace"\)/);
  assert.match(builder, /<TripItineraryWorkspace/);
  assert.doesNotMatch(builder, /^import TripItineraryWorkspace from/m);
});

test("mobile pin interaction story starts at its mobile viewport", () => {
  const stories = read("components/easyt/discovery-modal.stories.tsx");
  assert.match(stories, /Mobile390PinRevealsExactCard[\s\S]*?globals: \{ viewport: \{ value: "morrovia390" \} \}/);
});
