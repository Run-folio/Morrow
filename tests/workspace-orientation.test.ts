import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  readWorkspaceOrientationState,
  shouldAutoStartWorkspaceOrientation,
  WORKSPACE_ORIENTATION_VERSIONS,
  workspaceOrientationStorageKey,
  writeWorkspaceOrientationState,
} from "../lib/easyt/workspace-orientation.ts";

class MemoryStorage {
  values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

const component = readFileSync(new URL("../components/easyt/workspace-orientation.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../components/easyt/workspace-orientation.module.css", import.meta.url), "utf8");
const overview = readFileSync(new URL("../components/easyt/trip-overview-workspace.tsx", import.meta.url), "utf8");
const map = readFileSync(new URL("../components/journey-map-planner-workspace.tsx", import.meta.url), "utf8");
const itinerary = readFileSync(new URL("../components/easyt/trip-itinerary-workspace.tsx", import.meta.url), "utf8");
const builder = readFileSync(new URL("../app/journey/new/trip-builder.tsx", import.meta.url), "utf8");
const analytics = readFileSync(new URL("../lib/analytics.ts", import.meta.url), "utf8");

const autoStart = (overrides: Partial<Parameters<typeof shouldAutoStartWorkspaceOrientation>[0]> = {}) => shouldAutoStartWorkspaceOrientation({
  state: "unseen",
  ready: true,
  hasMeaningfulTargets: true,
  attentionRequired: false,
  productTourOpen: false,
  userInteracted: false,
  ...overrides,
});

test("1 Overview first meaningful visit auto-starts", () => assert.equal(autoStart(), true));
test("2 Overview does not auto-start during loading", () => assert.equal(autoStart({ ready: false }), false));
test("3 Overview does not auto-start during recovery conflict", () => assert.equal(autoStart({ attentionRequired: true }), false));

test("4 completion prevents repeat auto-start", () => {
  const storage = new MemoryStorage();
  writeWorkspaceOrientationState(storage, "owner-a", "overview", "completed");
  assert.equal(readWorkspaceOrientationState(storage, "owner-a", "overview"), "completed");
  assert.equal(autoStart({ state: "completed" }), false);
});

test("5 dismissal prevents repeat auto-start", () => {
  const storage = new MemoryStorage();
  writeWorkspaceOrientationState(storage, "owner-a", "overview", "dismissed");
  assert.equal(readWorkspaceOrientationState(storage, "owner-a", "overview"), "dismissed");
  assert.equal(autoStart({ state: "dismissed" }), false);
});

test("6 manual replay remains available", () => assert.match(component, /Show me around/));
test("7 replay does not reset stored completion", () => assert.match(component, /if \(session\.source === "automatic"\) writeWorkspaceOrientationState/));

test("8 Map state is independent from Overview", () => {
  assert.notEqual(workspaceOrientationStorageKey("owner-a", "map"), workspaceOrientationStorageKey("owner-a", "overview"));
});

test("9 Itinerary state is independent from Map", () => {
  assert.notEqual(workspaceOrientationStorageKey("owner-a", "itinerary"), workspaceOrientationStorageKey("owner-a", "map"));
});

test("10 owner A state does not suppress owner B", () => {
  const storage = new MemoryStorage();
  writeWorkspaceOrientationState(storage, "owner-a", "overview", "completed");
  assert.equal(readWorkspaceOrientationState(storage, "owner-b", "overview"), "unseen");
});

test("11 guest state does not suppress authenticated state", () => {
  const storage = new MemoryStorage();
  writeWorkspaceOrientationState(storage, null, "overview", "completed");
  assert.equal(readWorkspaceOrientationState(storage, "owner-a", "overview"), "unseen");
});

test("12 account switch closes stale orientation", () => assert.match(component, /setSession\(null\);[\s\S]*setUserInteracted\(false\);[\s\S]*\[ownerId, workspace\]/));

test("13 version increase re-enables only the relevant workspace guide", () => {
  const storage = new MemoryStorage();
  writeWorkspaceOrientationState(storage, "owner-a", "overview", "completed", 1);
  assert.equal(readWorkspaceOrientationState(storage, "owner-a", "overview", 2), "unseen");
  assert.equal(WORKSPACE_ORIENTATION_VERSIONS.map, 1);
});

test("14 Product Tour and workspace orientation never overlap", () => {
  assert.equal(autoStart({ productTourOpen: true }), false);
  assert.match(component, /PRODUCT_TOUR_OPEN_EVENT/);
  assert.match(component, /PRODUCT_TOUR_STATE_EVENT/);
});

test("15 missing targets are filtered safely", () => assert.match(component, /steps\[targetWorkspace\]\.filter/));
test("16 no meaningful targets means no broken coachmark", () => assert.equal(autoStart({ hasMeaningfulTargets: false }), false));
test("17 rapid day switch removes stale Itinerary highlight", () => assert.match(component, /delete target\.dataset\.workspaceOrientationActive/));
test("18 rapid stop switch recalculates available Map targets", () => assert.match(component, /setRegistryRevision/));
test("19 Escape dismisses", () => assert.match(component, /event\.key !== "Escape"/));
test("20 keyboard Back, Next, Done and Skip controls exist", () => ["Back", "Next", "Done", "Skip"].forEach((label) => assert.match(component, new RegExp(`>${label}<|\"${label}\"`))));
test("21 manual close restores focus to its launcher", () => assert.match(component, /launcherRef\.current/));
test("22 390px uses the mobile sheet", () => { assert.match(css, /max-width: 700px/); assert.match(css, /\.sheet \{ position: fixed/); });
test("23 desktop uses an anchored coachmark", () => { assert.match(component, /data-presentation=\{mobile \? "sheet" : "anchored"\}/); assert.match(css, /\.popover \{ position: fixed/); });
test("24 reduced motion disables guide motion", () => assert.match(css, /prefers-reduced-motion: reduce/));
test("25 analytics started, completed and dismissed use one finalisation guard", () => { assert.match(component, /sessionFinalizedRef/); assert.match(component, /workspace_orientation_started/); assert.match(component, /workspace_orientation_completed/); assert.match(component, /workspace_orientation_dismissed/); });
test("26 orientation analytics is consent-gated by the shared owner", () => { assert.match(analytics, /if \(!hasAnalyticsConsent\(\)\) return/); assert.doesNotMatch(component, /trip_id|stop_id|notes|booking/); });

test("27 storage failure does not break the workspace", () => {
  const broken = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
  assert.equal(readWorkspaceOrientationState(broken, "owner-a", "overview"), "unseen");
  assert.equal(writeWorkspaceOrientationState(broken, "owner-a", "overview", "completed"), false);
});

test("28 cross-tab storage update closes an automatic guide", () => { assert.match(component, /addEventListener\("storage"/); assert.match(component, /session\?\.source === "automatic"/); });
test("29 Builder receives no overlay tour", () => { assert.doesNotMatch(builder, /WorkspaceOrientationProvider|useWorkspaceOrientationTarget|Show me around/); });
test("30 Builder guidance uses one resumable broad-area owner", () => { assert.match(builder, /Continue shaping your route/); assert.doesNotMatch(builder, /Start as broadly as you like|geographyReviewPlaceMentions\.map\(/); });

test("workspace integrations expose the required Overview targets", () => { assert.match(overview, /overview-next/); assert.match(overview, /overview-progress/); });
test("workspace integrations expose the required Map targets", () => { assert.match(map, /map-stop/); assert.match(map, /map-explore/); });
test("workspace integrations expose the required Itinerary targets", () => { assert.match(itinerary, /itinerary-days/); assert.match(itinerary, /itinerary-planner/); assert.match(itinerary, /itinerary-suggestions/); });
