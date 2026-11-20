import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const component = (path) => readFileSync(new URL(`../components/easyt/${path}`, import.meta.url), "utf8");
const workspace = component("trip-itinerary-workspace.tsx");

test("itinerary chooser and rail use the same identity and save-state presentation", () => {
  const chooser = workspace.slice(workspace.indexOf("const contextualDialogContent"), workspace.indexOf("const contextualDialog ="));
  const rail = workspace.slice(workspace.indexOf("const titleId = useId();", workspace.indexOf("function ItineraryRankedSuggestionCard")), workspace.indexOf("type DiscoveryIdeaState ="));
  for (const surface of [chooser, rail]) {
    assert.match(surface, /<ItineraryActivityIdentity[^>]+image=\{result.image\}/);
    assert.match(surface, /<ItineraryActivityState[^>]+state="saved"/);
  }
  assert.match(rail, /<ItineraryActivityState[^>]+state="planned"[^>]+dayNumber=/);
  assert.match(workspace, /if \(state.state === "planned"\) return false;/);
});

test("the starter list uses the same photo identity and state presentation", () => {
  const list = component("live-activity-inventory.tsx");
  assert.match(list, /<ItineraryActivityIdentity[^>]+image=\{item.image\}/);
  assert.match(list, /<ItineraryActivityState[^>]+state="saved"/);
  assert.match(list, /<ItineraryActivityState[^>]+state="planned"[^>]+dayNumber=/);
  assert.doesNotMatch(list, /StarterActivityDeck|starter-activity-deck/);
});
