import { composeItineraryDay, itineraryDayParts, type ComposedItineraryActivity } from "./itinerary-day-composition.ts";
import { assignItineraryIdeaDayPart, itineraryIdeaForPlace, removeItineraryIdea, scheduleItineraryIdea, type IdeaDiscoveryReason } from "./itinerary-ideas.ts";
import {
  assignItineraryActivityDayPart,
  moveItineraryActivity,
  moveItineraryIdeaActivity,
  type ItineraryMutationResult,
} from "./itinerary-mutations.ts";
import type { EasyTTrip, ItineraryDayPart, ItineraryIdea } from "./trip.ts";
import type { ItineraryDiscoveryPlace } from "./itinerary-day-context.ts";

function unchanged(trip: EasyTTrip, reason: string): ItineraryMutationResult {
  return { trip, changed: false, reason };
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
