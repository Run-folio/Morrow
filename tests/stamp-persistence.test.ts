import assert from "node:assert/strict";
import test from "node:test";

import { clearSyncedStampDirty, emptyStampDirtyRecords, markStampDirty, mergeGuestStamps, mergeRemoteStamps } from "../lib/easyt/stamp-persistence.ts";

test("guest promotion retains a status, note, and photo without replacing existing account memories", () => {
  const remote = { statuses: {}, memories: { japan: "Account memory" }, photos: {} };
  const guest = { statuses: { japan: "visited" as const }, memories: { japan: "Guest memory" }, photos: { japan: "data:image/jpeg;base64,guest" } };
  assert.deepEqual(mergeGuestStamps(remote, guest), {
    statuses: { japan: "visited" }, memories: { japan: "Account memory" }, photos: { japan: "data:image/jpeg;base64,guest" },
  });
});

test("offline changes survive a reload and retry over stale remote cache", () => {
  let dirty = emptyStampDirtyRecords();
  dirty = markStampDirty(dirty, "statuses", "japan");
  dirty = markStampDirty(dirty, "memories", "japan");
  dirty = markStampDirty(dirty, "photos", "japan");
  const local = { statuses: { japan: "visited" as const }, memories: { japan: "Offline note" }, photos: { japan: "data:image/jpeg;base64,offline" } };
  const remote = { statuses: { japan: "want" as const }, memories: { japan: "Old remote note" }, photos: {} };
  assert.deepEqual(mergeRemoteStamps(remote, local, dirty), local);
  assert.deepEqual(clearSyncedStampDirty(dirty, dirty), emptyStampDirtyRecords());
});
