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

test("dashboard duplicate uses one brief confirmation and Prep avoids an extra completion banner", () => {
  const dashboard = read("app/journey/dashboard/dashboard-client.tsx");
  const prep = read("components/easyt/trip-prep-workspace.tsx");

  assert.match(dashboard, /Trip duplicated/);
  assert.match(dashboard, /MorroviaBriefNotice/);
  assert.doesNotMatch(prep, /Prep tasks complete\./);
});
