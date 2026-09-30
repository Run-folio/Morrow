import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workspace = readFileSync(new URL("../components/easyt/trip-itinerary-workspace.tsx", import.meta.url), "utf8");
const persistence = readFileSync(new URL("../components/easyt/use-trip-mutation-persistence.ts", import.meta.url), "utf8");

test("the center timeline exposes direct add, edit, remove, reorder, and local selection controls", () => {
  assert.match(workspace, /function InsertionControl/);
  assert.match(workspace, /addItineraryActivityWithUndo/);
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
  assert.match(workspace, /workspaceView === "days" && reorderableEditorNotes > 1 \? <details key=\{active\.id\} className=\{styles\.sequenceEditor\}>/);
  assert.match(workspace, /addComposerDayPart=/);
  assert.match(workspace, /onMoveActivity=\{moveComposedActivity\}/);
  assert.doesNotMatch(workspace, /pad\(sequence\)/);
});

test("activity entry has one planner owner while authored notes remain in the Notes rail", () => {
  const start = workspace.indexOf("function InsertionControl");
  const end = workspace.indexOf("function TransferRow", start);
  const insertionControl = workspace.slice(start, end);
  assert.doesNotMatch(insertionControl, /<EasyTButton|<form/);
  assert.match(workspace, /<RichItineraryDayPlanner/);
  assert.match(workspace, /onAddSubmit=\{submitAddFlow\}/);
  assert.match(workspace, /dayNotes\.map\(\(note, noteIndex\) => <article className=\{styles\.noteCard\}/);
  assert.match(workspace, /const result = addItineraryDayNote\(current, addFlow\.dayNumber, addDraft\)/);
});

test("truthful item status never infers confirmation or per-item time from presence", () => {
  assert.match(workspace, /booking\.confirmation \? copy\.confirmed : booking\.type === "reservation" \? copy\.reservation : copy\.saved/);
  assert.doesNotMatch(workspace, /compactTime/);
  assert.doesNotMatch(workspace, /showTime/);
});

test("Itinerary uses Map's recovery, queue, CAS, and canonical cache pipeline", () => {
  assert.match(persistence, /saveTripRecovery\(next, \{[\s\S]*ownerId,[\s\S]*replace: replacement,[\s\S]*accountSavePending: Boolean\(sessionOwnerId\)/);
  assert.match(persistence, /createTripMutationPersistenceQueue\(saveTripRecoveryToEasyT\)/);
  assert.match(persistence, /queueRef\.current!?\.enqueue\(next, recovery\.handle\)/);
  assert.match(persistence, /markTripRecoveryState/);
  assert.match(persistence, /cacheCanonicalTrip\(saved, recovery\)/);
  assert.match(persistence, /EasyTTripSaveConflictError/);
  assert.doesNotMatch(workspace, /useState\(trip\)/);
});

test("Itinerary map pins keep canonical item selection without capture workarounds", () => {
  assert.match(workspace, /surface=\{\{ variant: "embedded", interaction: "selection-only" \}\}/);
  assert.match(workspace, /itineraryDayMiniMapContext\(mapContext, active\)/);
  assert.match(workspace, /compactDayMap \? miniMapContext : mapContext/);
  assert.match(workspace, /selectedPlannerPinId=\{embeddedMapContext\.selectedPlannerPinId\}/);
  assert.match(workspace, /interactivePlannerPinIds=\{interactiveMapPinIds\}/);
  assert.match(workspace, /if \(activity\) setSelectedItemId\(activity\.id\)/);
  assert.doesNotMatch(workspace, /selectPreviewPin|onPointerDownCapture|onMouseDownCapture|onClickCapture/);
});
