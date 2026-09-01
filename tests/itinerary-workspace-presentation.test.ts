import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workspace = readFileSync(new URL("../components/easyt/trip-itinerary-workspace.tsx", import.meta.url), "utf8");
const persistence = readFileSync(new URL("../components/easyt/use-trip-mutation-persistence.ts", import.meta.url), "utf8");

test("the center timeline exposes direct add, edit, remove, reorder, and local selection controls", () => {
  assert.match(workspace, /function InsertionControl/);
  assert.match(workspace, /insertItineraryActivity/);
  assert.match(workspace, /addItineraryDayNote/);
  assert.match(workspace, /renameItineraryActivity/);
  assert.match(workspace, /removeItineraryActivity/);
  assert.match(workspace, /moveItineraryActivity/);
  assert.match(workspace, /MorroviaConfirmationDialog/);
  assert.match(workspace, /data-selected-item=\{selectedItemId \?\? undefined\}/);
  assert.match(workspace, /draggable onDragStart=\{onDragStart\}/);
});

test("semantic dayparts are primary while the unnumbered detailed editor stays available", () => {
  assert.match(workspace, /<RichItineraryDayPlanner/);
  assert.match(workspace, /<details className=\{styles\.sequenceEditor\}>/);
  assert.match(workspace, /addComposerDayPart=/);
  assert.match(workspace, /onMoveActivity=\{moveComposedActivity\}/);
  assert.doesNotMatch(workspace, /pad\(sequence\)/);
});

test("the add flow advertises only canonical Activity and Day note categories", () => {
  assert.match(workspace, /options=\{\[\{ value: "activity", label: copy\.activity \}, \{ value: "note", label: copy\.note \}\]\}/);
  assert.doesNotMatch(workspace, /value: "(?:food|stay|transport|buffer)"/);
});

test("truthful item status never infers confirmation or per-item time from presence", () => {
  assert.match(workspace, /booking\.confirmation \? copy\.confirmed : booking\.type === "reservation" \? copy\.reservation : copy\.saved/);
  assert.doesNotMatch(workspace, /compactTime/);
  assert.doesNotMatch(workspace, /showTime/);
});

test("Itinerary uses Map's recovery, queue, CAS, and canonical cache pipeline", () => {
  assert.match(persistence, /saveTripRecovery\(next, \{ ownerId, replace: replacement \}\)/);
  assert.match(persistence, /createTripMutationPersistenceQueue\(saveTripRecoveryToEasyT\)/);
  assert.match(persistence, /queueRef\.current\.enqueue\(next, recovery\.handle\)/);
  assert.match(persistence, /markTripRecoveryState/);
  assert.match(persistence, /cacheCanonicalTrip\(saved, recovery\)/);
  assert.match(persistence, /EasyTTripSaveConflictError/);
  assert.doesNotMatch(workspace, /useState\(trip\)/);
});
