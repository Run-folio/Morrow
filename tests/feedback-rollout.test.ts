import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("builder distinguishes device recovery from canonical account persistence", () => {
  const source = read("app/journey/new/trip-builder.tsx");

  assert.match(source, /Changes saved on this device/);
  assert.match(source, /Saving to your account…/);
  assert.match(source, /Saved to your account/);
  assert.match(source, /Changes not synced to your account/);
  assert.match(source, /MorroviaConfirmationDialog/);
});

test("map never presents local recovery as a canonical save", () => {
  const source = read("components/journey-map-planner-workspace.tsx");

  assert.doesNotMatch(source, /Edit saved/);
  assert.match(source, /Changes saved on this device/);
  assert.match(source, /Saving to your account…/);
  assert.match(source, /Saved to your account/);
});

test("destructive production actions use the shared confirmation dialog", () => {
  const dashboard = read("app/journey/dashboard/dashboard-client.tsx");
  const tripShell = read("components/easyt/trip-shell-client.tsx");

  assert.doesNotMatch(dashboard, /window\.confirm/);
  assert.doesNotMatch(tripShell, /window\.confirm/);
  assert.match(dashboard, /MorroviaConfirmationDialog/);
  assert.match(tripShell, /MorroviaConfirmationDialog/);
});

test("dashboard duplicate uses one brief confirmation and Overview avoids an extra completion banner", () => {
  const dashboard = read("app/journey/dashboard/dashboard-client.tsx");
  const overview = read("components/easyt/trip-overview-workspace.tsx");

  assert.match(dashboard, /Trip duplicated/);
  assert.match(dashboard, /MorroviaBriefNotice/);
  assert.match(overview, /No outstanding practical tasks/);
  assert.doesNotMatch(overview, /Prep tasks complete\./);
});

test("dashboard confirms archive, restore, and delete only after the account mutation succeeds", () => {
  const dashboard = read("app/journey/dashboard/dashboard-client.tsx");

  assert.match(dashboard, /if \(actionInFlightRef\.current\) return;/);
  assert.match(dashboard, /aria-busy=\{working \|\| undefined\}/);
  assert.match(dashboard, /disabled=\{working\} onClick=\{\(\) => onAction\(trip\.id, "archive"\)\}/);
  assert.match(dashboard, /if \(\(action === "archive" \|\| action === "restore"\) && payload\.trip\) \{[\s\S]*reconcileTripCloudMutation[\s\S]*setActionNotice/);
  assert.match(dashboard, /Trip archived/);
  assert.match(dashboard, /Trip restored/);
  assert.match(dashboard, /if \(response\.ok\) \{[\s\S]*reconcileTripCloudMutation\(ownerId, trip\.id, "delete"\);[\s\S]*setActionNotice/);
  assert.match(dashboard, /Trip deleted/);
});
