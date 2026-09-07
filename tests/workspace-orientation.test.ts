import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  clearWorkspaceOrientationSeenVersion,
  readWorkspaceOrientationSeenVersion,
  resolveWorkspaceOrientationSeenVersion,
  shouldAutoStartWorkspaceOrientation,
  WORKSPACE_ORIENTATION_VERSION,
  workspaceOrientationStorageKey,
  writeWorkspaceOrientationSeenVersion,
} from "../lib/easyt/workspace-orientation.ts";

class MemoryStorage {
  values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

const component = readFileSync(new URL("../components/easyt/workspace-orientation.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../components/easyt/workspace-orientation.module.css", import.meta.url), "utf8");
const overview = readFileSync(new URL("../components/easyt/trip-overview-workspace.tsx", import.meta.url), "utf8");
const map = readFileSync(new URL("../components/journey-map-planner-workspace.tsx", import.meta.url), "utf8");
const itinerary = readFileSync(new URL("../components/easyt/trip-itinerary-workspace.tsx", import.meta.url), "utf8");
const builder = readFileSync(new URL("../app/journey/new/trip-builder.tsx", import.meta.url), "utf8");
const analytics = readFileSync(new URL("../lib/analytics.ts", import.meta.url), "utf8");
const profileRoute = readFileSync(new URL("../app/api/easyt/profile/route.ts", import.meta.url), "utf8");
const repository = readFileSync(new URL("../lib/easyt/repository.ts", import.meta.url), "utf8");
const tripLayout = readFileSync(new URL("../app/journey/[tripId]/layout.tsx", import.meta.url), "utf8");

const autoStart = (overrides: Partial<Parameters<typeof shouldAutoStartWorkspaceOrientation>[0]> = {}) => shouldAutoStartWorkspaceOrientation({
  seenVersion: 0,
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

test("4 first automatic opening marks the one global version as seen", () => {
  const storage = new MemoryStorage();
  writeWorkspaceOrientationSeenVersion(storage, "owner-a");
  assert.equal(readWorkspaceOrientationSeenVersion(storage, "owner-a"), 1);
  assert.equal(autoStart({ seenVersion: 1 }), false);
  assert.match(component, /source === "automatic"\) persistSeenVersion/);
});

test("5 dismissing an automatic guide remains seen across refresh or remount", () => {
  const storage = new MemoryStorage();
  writeWorkspaceOrientationSeenVersion(storage, "owner-a");
  assert.equal(readWorkspaceOrientationSeenVersion(storage, "owner-a"), WORKSPACE_ORIENTATION_VERSION);
  assert.equal(autoStart({ seenVersion: readWorkspaceOrientationSeenVersion(storage, "owner-a") }), false);
});

test("6 manual replay remains available", () => assert.match(component, /Show me around/));
test("7 replay neither clears nor rewrites persisted state", () => {
  assert.match(component, /const replay = useCallback/);
  assert.doesNotMatch(component, /source === "replay"[\s\S]{0,120}(?:clearWorkspaceOrientation|writeWorkspaceOrientation)/);
});

test("8 Overview, Map and Itinerary share one persistence key", () => {
  assert.equal(workspaceOrientationStorageKey("owner-a"), workspaceOrientationStorageKey("owner-a"));
  assert.doesNotMatch(workspaceOrientationStorageKey("owner-a"), /overview|map|itinerary/);
});

test("9 workspace navigation cannot re-enable an already seen guide", () => {
  const storage = new MemoryStorage();
  writeWorkspaceOrientationSeenVersion(storage, "owner-a");
  for (const workspace of ["overview", "map", "itinerary", "overview"]) {
    assert.equal(autoStart({ seenVersion: readWorkspaceOrientationSeenVersion(storage, "owner-a") }), false, workspace);
  }
});

test("10 owner A state does not suppress owner B", () => {
  const storage = new MemoryStorage();
  writeWorkspaceOrientationSeenVersion(storage, "owner-a");
  assert.equal(readWorkspaceOrientationSeenVersion(storage, "owner-b"), 0);
});

test("11 guest seen wins during the immediate account handoff", () => {
  const storage = new MemoryStorage();
  writeWorkspaceOrientationSeenVersion(storage, null);
  const resolved = resolveWorkspaceOrientationSeenVersion({
    accountVersion: 0,
    ownerDeviceVersion: readWorkspaceOrientationSeenVersion(storage, "owner-a"),
    guestDeviceVersion: readWorkspaceOrientationSeenVersion(storage, null),
  });
  assert.equal(resolved, 1);
  assert.equal(autoStart({ seenVersion: resolved }), false);
  assert.match(component, /workspaceGuideVersionSeen: version/);
  assert.match(component, /response\.ok && claimGuest/);
});

test("12 account switch closes stale orientation", () => assert.match(component, /setSession\(null\);[\s\S]*setUserInteracted\(false\);[\s\S]*\[ownerId, workspace\]/));

test("13 seen version 1 suppresses v1 while another hypothetical version remains distinguishable", () => {
  const storage = new MemoryStorage();
  writeWorkspaceOrientationSeenVersion(storage, "owner-a", 1);
  const seenVersion = readWorkspaceOrientationSeenVersion(storage, "owner-a");
  assert.equal(autoStart({ seenVersion, currentVersion: 1 }), false);
  assert.equal(autoStart({ seenVersion, currentVersion: 2 }), true);
  assert.equal(WORKSPACE_ORIENTATION_VERSION, 1);
});

test("13b existing section-scoped v1 completion migrates without repeating", () => {
  const storage = new MemoryStorage();
  storage.setItem("morrovia:workspace-orientation:overview:v1:owner:owner-a", "dismissed");
  assert.equal(readWorkspaceOrientationSeenVersion(storage, "owner-a"), 1);
});

test("13c authenticated preference is loaded server-side and persisted without a schema migration", () => {
  assert.match(repository, /workspaceGuideVersionSeen: number/);
  assert.match(repository, /preferences \|\|/);
  assert.match(profileRoute, /Unsupported workspace guide version/);
  assert.match(tripLayout, /workspaceGuideVersionSeen=\{preferences\.workspaceGuideVersionSeen\}/);
});

test("13d a reconciled guest marker can be consumed without touching another account", () => {
  const storage = new MemoryStorage();
  storage.setItem("morrovia:workspace-orientation:overview:v1:guest", "dismissed");
  writeWorkspaceOrientationSeenVersion(storage, "owner-a");
  clearWorkspaceOrientationSeenVersion(storage, null);
  assert.equal(readWorkspaceOrientationSeenVersion(storage, null), 0);
  assert.equal(readWorkspaceOrientationSeenVersion(storage, "owner-a"), 1);
  assert.equal(readWorkspaceOrientationSeenVersion(storage, "owner-b"), 0);
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
  const broken = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); }, removeItem: () => { throw new Error("blocked"); } };
  assert.equal(readWorkspaceOrientationSeenVersion(broken, "owner-a"), 0);
  assert.equal(writeWorkspaceOrientationSeenVersion(broken, "owner-a"), false);
  assert.equal(clearWorkspaceOrientationSeenVersion(broken, "owner-a"), false);
});

test("28 cross-tab storage update closes an automatic guide", () => { assert.match(component, /addEventListener\("storage"/); assert.match(component, /session\?\.source === "automatic"/); });
test("29 Builder receives no overlay tour", () => { assert.doesNotMatch(builder, /WorkspaceOrientationProvider|useWorkspaceOrientationTarget|Show me around/); });
test("30 Builder guidance uses one resumable broad-area owner", () => { assert.match(builder, /Continue shaping your route/); assert.doesNotMatch(builder, /Start as broadly as you like|geographyReviewPlaceMentions\.map\(/); });

test("workspace integrations expose the required Overview targets", () => { assert.match(overview, /overview-next/); assert.match(overview, /overview-progress/); });
test("workspace integrations expose the required Map targets", () => { assert.match(map, /map-stop/); assert.match(map, /map-explore/); });
test("workspace integrations expose the required Itinerary targets", () => { assert.match(itinerary, /itinerary-days/); assert.match(itinerary, /itinerary-planner/); assert.match(itinerary, /itinerary-suggestions/); });
