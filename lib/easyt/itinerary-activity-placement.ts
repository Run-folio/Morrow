import { composeItineraryDay, itineraryDayParts, type ComposedItineraryActivity } from "./itinerary-day-composition.ts";
import { assignItineraryIdeaDayPart, itineraryIdeaForPlace, removeItineraryIdea, saveItineraryIdea, scheduleItineraryIdea, type IdeaDiscoveryReason } from "./itinerary-ideas.ts";
import {
  assignItineraryActivityDayPart,
  insertItineraryActivity,
  moveItineraryActivity,
  moveItineraryActivityToDay,
  moveItineraryIdeaActivity,
  removeItineraryActivity,
  type ItineraryMutationResult,
} from "./itinerary-mutations.ts";
import type { EasyTTrip, ItineraryDayPart, ItineraryIdea } from "./trip.ts";
import type { ItineraryDiscoveryPlace } from "./itinerary-day-context.ts";
import { activityAllowsDayPart, activityDayPartFit } from "./itinerary-schedule-awareness.ts";

function unchanged(trip: EasyTTrip, reason: string): ItineraryMutationResult {
  return { trip, changed: false, reason };
}

const normalized = (value: string) => value.trim().replace(/\s+/g, " ").toLocaleLowerCase();

type AuthoredActivityReceipt = {
  kind: "authored-activity";
  title: string;
  expectedDayId: string;
  expectedDayPart: ItineraryDayPart | null;
  restoreDayId: string | null;
  restoreNoteIndex: number | null;
  restoreDayPart: ItineraryDayPart | null;
};

type ItineraryIdeaReceipt = {
  kind: "itinerary-idea";
  ideaId: string;
  expected: string;
  restore: ItineraryIdea | null;
};

export type ItineraryItemUndoReceipt = AuthoredActivityReceipt | ItineraryIdeaReceipt;

export type ItineraryActionResult = ItineraryMutationResult & {
  undo?: ItineraryItemUndoReceipt;
};

function ideaFingerprint(idea: ItineraryIdea) {
  return JSON.stringify(idea);
}

function activityIndex(trip: EasyTTrip, dayId: string, title: string) {
  const day = trip.planItems.find((candidate) => candidate.id === dayId);
  if (!day) return null;
  const matches = day.notes.flatMap((note, index) => normalized(note) === normalized(title) ? [index] : []);
  return matches.length === 1 ? matches[0]! : null;
}

/**
 * Add one plain traveller-authored activity and retain only the identity needed
 * to reverse that item. The receipt never contains a whole-trip snapshot.
 */
export function addItineraryActivityWithUndo(
  trip: EasyTTrip,
  dayNumber: number,
  noteIndex: number,
  title: string,
  dayPart?: ItineraryDayPart | null,
): ItineraryActionResult {
  const result = insertItineraryActivity(trip, dayNumber, noteIndex, title, dayPart);
  if (!result.changed) return result;
  const day = result.trip.planItems.find((candidate) => candidate.dayNumber === dayNumber)!;
  return {
    ...result,
    undo: {
      kind: "authored-activity",
      title: title.trim().replace(/\s+/g, " "),
      expectedDayId: day.id,
      expectedDayPart: dayPart ?? null,
      restoreDayId: null,
      restoreNoteIndex: null,
      restoreDayPart: null,
    },
  };
}

/** Schedule or move a canonical idea while retaining its exact prior item state. */
export function scheduleItineraryIdeaWithUndo(
  trip: EasyTTrip,
  idea: ItineraryIdea,
  dayId: string,
  dayPart?: ItineraryDayPart | null,
): ItineraryActionResult {
  const restore = (trip.brief.itineraryIdeas ?? []).find((candidate) => candidate.id === idea.id) ?? null;
  const next = scheduleItineraryIdea(trip, idea, dayId, dayPart);
  if (next === trip) return unchanged(trip, "This activity is already on that day.");
  const expected = (next.brief.itineraryIdeas ?? []).find((candidate) => candidate.id === idea.id);
  if (!expected) return unchanged(trip, "This activity could not be stored safely.");
  return {
    trip: next,
    changed: true,
    undo: { kind: "itinerary-idea", ideaId: idea.id, expected: ideaFingerprint(expected), restore },
  };
}

/**
 * Cross-day planning command shared by explicit Move and Calendar drag. Only
 * movable activities can enter it, and target eligibility is exact stop
 * occurrence identity rather than a destination label.
 */
export function moveItineraryActivityAcrossDays(
  trip: EasyTTrip,
  sourceDayId: string,
  activityId: string,
  targetDayId: string,
  targetDayPart: ItineraryDayPart | null,
): ItineraryActionResult {
  const source = activityForId(trip, sourceDayId, activityId);
  const targetDay = trip.planItems.find((candidate) => candidate.id === targetDayId);
  if (!source.composition || !source.activity || !targetDay) return unchanged(trip, "This activity is no longer available.");
  const activity = source.activity;
  if (source.composition.day.stopId !== targetDay.stopId) {
    return unchanged(trip, "Choose a day in the same route stop for this activity.");
  }
  if (activity.booking || !activity.dayPartEditable || activity.source === "day-note") {
    return unchanged(trip, "This fixed or structural item cannot be moved.");
  }
  if (!activityAllowsDayPart(activity.providerMetadata?.duration, targetDayPart)) {
    return unchanged(trip, "This activity needs most of the day and cannot fit in one part of the day.");
  }

  if (activity.source === "itinerary-idea") {
    return scheduleItineraryIdeaWithUndo(
      trip,
      (trip.brief.itineraryIdeas ?? []).find((candidate) => candidate.id === activity.id)!,
      targetDayId,
      targetDayPart,
    );
  }
  if (activity.noteIndex === null) return unchanged(trip, "This activity cannot be safely moved.");
  if (sourceDayId === targetDayId) {
    const assigned = assignItineraryActivityDayPart(trip, {
      dayNumber: source.composition.day.dayNumber,
      noteIndex: activity.noteIndex,
      title: activity.title,
    }, targetDayPart);
    if (!assigned.changed) return assigned;
    return {
      ...assigned,
      undo: {
        kind: "authored-activity",
        title: activity.title,
        expectedDayId: targetDayId,
        expectedDayPart: targetDayPart,
        restoreDayId: sourceDayId,
        restoreNoteIndex: activity.noteIndex,
        restoreDayPart: activity.dayPart,
      },
    };
  }

  const moved = moveItineraryActivityToDay(trip, {
    dayNumber: source.composition.day.dayNumber,
    noteIndex: activity.noteIndex,
    title: activity.title,
  }, targetDay.dayNumber, targetDay.notes.length);
  if (!moved.changed) return moved;
  const movedIndex = activityIndex(moved.trip, targetDayId, activity.title);
  if (movedIndex === null) return unchanged(trip, "This activity could not be located after the move.");
  const assigned = assignItineraryActivityDayPart(moved.trip, {
    dayNumber: targetDay.dayNumber,
    noteIndex: movedIndex,
    title: activity.title,
  }, targetDayPart);
  const next = assigned.changed ? assigned.trip : moved.trip;
  return {
    trip: next,
    changed: true,
    undo: {
      kind: "authored-activity",
      title: activity.title,
      expectedDayId: targetDayId,
      expectedDayPart: targetDayPart,
      restoreDayId: sourceDayId,
      restoreNoteIndex: activity.noteIndex,
      restoreDayPart: activity.dayPart,
    },
  };
}

/** Apply an item-scoped inverse to the latest canonical document. */
export function undoItineraryItemAction(trip: EasyTTrip, receipt: ItineraryItemUndoReceipt): ItineraryMutationResult {
  if (receipt.kind === "itinerary-idea") {
    const current = (trip.brief.itineraryIdeas ?? []).find((candidate) => candidate.id === receipt.ideaId);
    if (!current || ideaFingerprint(current) !== receipt.expected) {
      return unchanged(trip, "This activity changed after the action, so it was not undone.");
    }
    const removed = removeItineraryIdea(trip, receipt.ideaId);
    if (!receipt.restore) return { trip: removed, changed: removed !== trip };
    const saved = saveItineraryIdea(removed, { ...receipt.restore, dayId: undefined, dayPart: undefined });
    const restored = receipt.restore.dayId
      ? scheduleItineraryIdea(saved, receipt.restore, receipt.restore.dayId, receipt.restore.dayPart ?? null)
      : saved;
    return restored === trip ? unchanged(trip, "This activity could not be undone safely.") : { trip: restored, changed: true };
  }

  const expectedDay = trip.planItems.find((candidate) => candidate.id === receipt.expectedDayId);
  const currentIndex = activityIndex(trip, receipt.expectedDayId, receipt.title);
  if (!expectedDay || currentIndex === null
    || (expectedDay.noteDayParts?.[currentIndex] ?? null) !== receipt.expectedDayPart) {
    return unchanged(trip, "This activity changed after the action, so it was not undone.");
  }
  if (receipt.restoreDayId === null) {
    return removeItineraryActivity(trip, { dayNumber: expectedDay.dayNumber, noteIndex: currentIndex, title: receipt.title });
  }
  const restoreDay = trip.planItems.find((candidate) => candidate.id === receipt.restoreDayId);
  if (!restoreDay || restoreDay.stopId !== expectedDay.stopId || receipt.restoreNoteIndex === null) {
    return unchanged(trip, "The original day is no longer eligible for this activity.");
  }
  const moved = moveItineraryActivityToDay(trip, {
    dayNumber: expectedDay.dayNumber,
    noteIndex: currentIndex,
    title: receipt.title,
  }, restoreDay.dayNumber, receipt.restoreNoteIndex);
  const afterMove = moved.changed ? moved.trip : trip;
  const restoredIndex = activityIndex(afterMove, restoreDay.id, receipt.title);
  if (restoredIndex === null) return unchanged(trip, "This activity could not be located after undo.");
  const assigned = assignItineraryActivityDayPart(afterMove, {
    dayNumber: restoreDay.dayNumber,
    noteIndex: restoredIndex,
    title: receipt.title,
  }, receipt.restoreDayPart);
  return assigned.changed ? assigned : moved;
}

function activityForId(trip: EasyTTrip, dayId: string, activityId: string) {
  const composition = composeItineraryDay(trip, dayId);
  if (!composition) return { composition: null, activity: null };
  const activity = [...itineraryDayParts.flatMap((part) => composition.planned[part]), ...composition.unslotted]
    .find((candidate) => candidate.id === activityId) ?? null;
  return { composition, activity };
}

/**
 * Choose a broad period without inventing a clock time. Attractions favour a
 * free daytime period; food ideas favour a free meal/evening period. When the
 * day is already populated, the lightest suitable period wins deterministically.
 */
export function preferredItineraryDayPart(
  trip: EasyTTrip,
  dayId: string,
  category: ItineraryIdea["category"],
): ItineraryDayPart {
  const composition = composeItineraryDay(trip, dayId);
  const preference: ItineraryDayPart[] = category === "restaurant"
    ? ["midday", "evening", "morning", "afternoon"]
    : ["morning", "afternoon", "midday", "evening"];
  if (!composition) return preference[0]!;
  return [...preference].sort((left, right) => (
    composition.planned[left].length - composition.planned[right].length
    || preference.indexOf(left) - preference.indexOf(right)
  ))[0]!;
}

/**
 * Canonical adapter for map/discovery surfaces. It keeps the legacy
 * selected-place label for old trips, while the real scheduled state is the
 * stable ItineraryIdea used by sidebar Add, saved ideas and drag/drop.
 */
export function setDiscoveryPlaceScheduled(trip: EasyTTrip, input: {
  stopId: string;
  place: ItineraryDiscoveryPlace;
  dayId: string;
  selected: boolean;
  reasons?: IdeaDiscoveryReason[];
}): EasyTTrip {
  const idea = itineraryIdeaForPlace({ stopId: input.stopId, place: input.place, reasons: input.reasons ?? [] });
  const currentIdea = (trip.brief.itineraryIdeas ?? []).find((item) => item.id === idea.id);
  let next = input.selected
    ? scheduleItineraryIdea(
      trip,
      currentIdea ?? idea,
      input.dayId,
      currentIdea?.dayId === input.dayId ? currentIdea.dayPart ?? null : preferredItineraryDayPart(trip, input.dayId, idea.category),
    )
    : currentIdea
      ? removeItineraryIdea(trip, currentIdea.id)
      : trip;
  const currentSelections = next.brief.selectedPlaces[input.stopId] ?? [];
  const normalize = (value: string) => value.trim().replace(/\s+/g, " ").toLocaleLowerCase();
  const alreadySelected = currentSelections.some((title) => normalize(title) === normalize(input.place.title));
  if ((input.selected && alreadySelected) || (!input.selected && !alreadySelected)) return next;
  const selectedPlaces = input.selected
    ? [...currentSelections, input.place.title]
    : currentSelections.filter((title) => normalize(title) !== normalize(input.place.title));
  return {
    ...next,
    brief: {
      ...next.brief,
      selectedPlaces: { ...next.brief.selectedPlaces, [input.stopId]: selectedPlaces },
    },
  };
}

function assignPart(
  trip: EasyTTrip,
  dayNumber: number,
  activity: ComposedItineraryActivity,
  dayPart: ItineraryDayPart,
): ItineraryMutationResult {
  if (activity.source === "itinerary-idea") {
    const next = assignItineraryIdeaDayPart(trip, activity.id, dayPart);
    return { trip: next, changed: next !== trip, reason: next === trip ? "The activity is already in that part of the day." : undefined };
  }
  if (activity.source !== "authored-activity" || activity.noteIndex === null) {
    return unchanged(trip, "This item cannot be safely rescheduled.");
  }
  return assignItineraryActivityDayPart(trip, {
    dayNumber,
    noteIndex: activity.noteIndex,
    title: activity.title,
  }, dayPart);
}

/**
 * Move one canonical activity to an insertion point in a broad period. The
 * activity keeps its stable idea identity or authored note identity and uses
 * the existing mutation helpers for both period assignment and row order.
 */
export function placeItineraryActivity(
  trip: EasyTTrip,
  dayId: string,
  activityId: string,
  dayPart: ItineraryDayPart,
  insertionIndex: number,
): ItineraryMutationResult {
  const initial = activityForId(trip, dayId, activityId);
  if (!initial.composition || !initial.activity) return unchanged(trip, "This activity is no longer available.");
  if (!initial.activity.dayPartEditable || (initial.activity.source === "authored-activity" && initial.activity.noteIndex === null)) {
    return unchanged(trip, "This activity cannot be safely moved.");
  }
  const durationFit = activityDayPartFit(initial.activity.providerMetadata?.duration);
  if (durationFit === "full-day" || durationFit === "extended") {
    return unchanged(trip, "This activity needs most of the day and cannot fit in one part of the day.");
  }

  const assigned = assignPart(trip, initial.composition.day.dayNumber, initial.activity, dayPart);
  const afterAssignment = activityForId(assigned.trip, dayId, activityId);
  if (!afterAssignment.composition || !afterAssignment.activity) {
    return assigned.changed ? assigned : unchanged(trip, "This activity cannot be safely reordered.");
  }
  if (afterAssignment.activity.noteIndex === null) {
    return assigned.changed ? assigned : unchanged(trip, "This activity cannot be safely reordered.");
  }

  const peers = afterAssignment.composition.planned[dayPart].filter((candidate) => candidate.id !== activityId);
  const boundedIndex = Math.max(0, Math.min(insertionIndex, peers.length));
  const nextPeer = peers[boundedIndex];
  const previousPeer = peers[boundedIndex - 1];
  const targetNoteIndex = nextPeer?.noteIndex ?? (previousPeer?.noteIndex !== null && previousPeer?.noteIndex !== undefined
    ? previousPeer.noteIndex + 1
    : afterAssignment.composition.day.notes.length);
  const moved = afterAssignment.activity.source === "itinerary-idea"
    ? moveItineraryIdeaActivity(assigned.trip, activityId, targetNoteIndex)
    : moveItineraryActivity(assigned.trip, {
      dayNumber: afterAssignment.composition.day.dayNumber,
      noteIndex: afterAssignment.activity.noteIndex,
      title: afterAssignment.activity.title,
    }, targetNoteIndex);

  if (moved.changed) return moved;
  return assigned.changed ? assigned : moved;
}

/**
 * Schedule a saved or recommended idea, then place it at the same canonical
 * insertion point used by activity drag/reorder. This keeps provider evidence
 * on the ItineraryIdea while preventing an occupied period from behaving like
 * a replacement slot.
 */
export function scheduleItineraryIdeaAtPosition(
  trip: EasyTTrip,
  idea: ItineraryIdea,
  dayId: string,
  dayPart: ItineraryDayPart,
  insertionIndex: number,
): ItineraryMutationResult {
  const scheduled = scheduleItineraryIdea(trip, idea, dayId, dayPart);
  const placed = placeItineraryActivity(scheduled, dayId, idea.id, dayPart, insertionIndex);
  if (placed.changed) return placed;
  if (scheduled !== trip) return { trip: scheduled, changed: true, reason: placed.reason };
  return placed;
}

export function scheduleItineraryIdeaAtPositionWithUndo(
  trip: EasyTTrip,
  idea: ItineraryIdea,
  dayId: string,
  dayPart: ItineraryDayPart,
  insertionIndex: number,
): ItineraryActionResult {
  const scheduled = scheduleItineraryIdeaWithUndo(trip, idea, dayId, dayPart);
  if (!scheduled.changed || !scheduled.undo) return scheduled;
  const placed = placeItineraryActivity(scheduled.trip, dayId, idea.id, dayPart, insertionIndex);
  return {
    trip: placed.changed ? placed.trip : scheduled.trip,
    changed: true,
    reason: placed.reason,
    undo: scheduled.undo,
  };
}
