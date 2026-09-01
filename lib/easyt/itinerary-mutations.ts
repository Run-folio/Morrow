import type { EasyTTrip, ItineraryDayPart, PlanItem, TripBooking } from "./trip.ts";

export type ItineraryActivityLocation = {
  dayNumber: number;
  noteIndex: number;
  /** Optional string identity makes stale UI locations fail closed. */
  title?: string;
};

export type ItineraryMutationResult = {
  trip: EasyTTrip;
  changed: boolean;
  reason?: string;
};

export type ItineraryActivityProtection = {
  editable: boolean;
  note: string | null;
  reason?: "generated" | "ambiguous" | "booking" | "mapped-place" | "missing";
};

function normalized(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

function planItemForDay(trip: EasyTTrip, dayNumber: number) {
  return trip.planItems.find((item) => item.dayNumber === dayNumber) ?? null;
}

function bookingMatchesText(booking: TripBooking, text: string) {
  const candidate = normalized(text);
  const title = normalized(booking.title);
  return title === candidate
    || (Math.min(title.length, candidate.length) > 6 && (title.includes(candidate) || candidate.includes(title)));
}

function countMatches(values: readonly string[], value: string) {
  const candidate = normalized(value);
  return values.filter((item) => normalized(item) === candidate).length;
}

function alignedDayParts(day: PlanItem) {
  return day.notes.map((_, index) => day.noteDayParts?.[index] ?? null);
}

function withAlignedSchedule(day: PlanItem, notes: string[], noteDayParts: Array<ItineraryDayPart | null>) {
  return {
    ...day,
    notes,
    ...(day.noteDayParts || noteDayParts.some(Boolean) ? { noteDayParts } : {}),
  };
}

/**
 * Only rows authored as plain custom activities, with one unambiguous string
 * identity and no booking/map dependency, can use the lightweight day editor.
 * Everything else fails closed and keeps its existing canonical owner.
 */
export function itineraryActivityProtection(
  trip: EasyTTrip,
  location: ItineraryActivityLocation,
): ItineraryActivityProtection {
  const day = planItemForDay(trip, location.dayNumber);
  const note = day?.notes[location.noteIndex] ?? null;
  if (!day || note === null) return { editable: false, note: null, reason: "missing" };
  if (location.title && normalized(location.title) !== normalized(note)) {
    return { editable: false, note, reason: "missing" };
  }

  const customActivities = trip.brief.customActivities?.[location.dayNumber] ?? [];
  if (!customActivities.some((activity) => normalized(activity) === normalized(note))) {
    return { editable: false, note, reason: "generated" };
  }
  if (countMatches(day.notes, note) !== 1 || countMatches(customActivities, note) !== 1) {
    return { editable: false, note, reason: "ambiguous" };
  }
  if ((trip.brief.bookings ?? []).some((booking) => bookingMatchesText(booking, note))) {
    return { editable: false, note, reason: "booking" };
  }

  const selectedPlaces = trip.brief.selectedPlaces[day.stopId] ?? [];
  const hasMappedDependency = selectedPlaces.some((place) => normalized(place) === normalized(note))
    || (trip.brief.mapPins ?? []).some((pin) => pin.dayNumber === location.dayNumber && normalized(pin.title) === normalized(note));
  if (hasMappedDependency) return { editable: false, note, reason: "mapped-place" };

  return { editable: true, note };
}

function unchanged(trip: EasyTTrip, reason: string): ItineraryMutationResult {
  return { trip, changed: false, reason };
}

export function insertItineraryActivity(
  trip: EasyTTrip,
  dayNumber: number,
  noteIndex: number,
  rawTitle: string,
  dayPart?: ItineraryDayPart | null,
): ItineraryMutationResult {
  const title = rawTitle.trim().replace(/\s+/g, " ");
  const day = planItemForDay(trip, dayNumber);
  if (!day) return unchanged(trip, "This day is no longer available.");
  if (!title) return unchanged(trip, "Enter an activity name.");
  if (!Number.isInteger(noteIndex) || noteIndex < 0 || noteIndex > day.notes.length) {
    return unchanged(trip, "That insertion point is no longer available.");
  }
  if (day.notes.some((note) => normalized(note) === normalized(title))) {
    return unchanged(trip, "This activity is already on the day.");
  }

  const notes = [...day.notes];
  const noteDayParts = alignedDayParts(day);
  notes.splice(noteIndex, 0, title);
  noteDayParts.splice(noteIndex, 0, dayPart ?? null);
  return {
    changed: true,
    trip: {
      ...trip,
      brief: {
        ...trip.brief,
        customActivities: {
          ...(trip.brief.customActivities ?? {}),
          [dayNumber]: [...(trip.brief.customActivities?.[dayNumber] ?? []), title],
        },
      },
      planItems: trip.planItems.map((item) => item.dayNumber === dayNumber ? withAlignedSchedule(item, notes, noteDayParts) : item),
    },
  };
}

export function addItineraryDayNote(
  trip: EasyTTrip,
  dayNumber: number,
  rawNote: string,
): ItineraryMutationResult {
  const note = rawNote.trim().replace(/\s+/g, " ");
  if (!planItemForDay(trip, dayNumber)) return unchanged(trip, "This day is no longer available.");
  if (!note) return unchanged(trip, "Enter a note.");
  return {
    changed: true,
    trip: {
      ...trip,
      brief: {
        ...trip.brief,
        dayNotes: {
          ...(trip.brief.dayNotes ?? {}),
          [dayNumber]: [...(trip.brief.dayNotes?.[dayNumber] ?? []), note],
        },
      },
    },
  };
}

export function renameItineraryActivity(
  trip: EasyTTrip,
  location: ItineraryActivityLocation,
  rawTitle: string,
): ItineraryMutationResult {
  const protection = itineraryActivityProtection(trip, location);
  if (!protection.editable || protection.note === null) {
    return unchanged(trip, "This item is protected and cannot be edited here.");
  }
  const title = rawTitle.trim().replace(/\s+/g, " ");
  if (!title) return unchanged(trip, "Enter an activity name.");
  const day = planItemForDay(trip, location.dayNumber)!;
  if (day.notes.some((note, index) => index !== location.noteIndex && normalized(note) === normalized(title))) {
    return unchanged(trip, "This activity is already on the day.");
  }
  if (title === protection.note) return unchanged(trip, "No changes to save.");

  const original = protection.note;
  return {
    changed: true,
    trip: {
      ...trip,
      brief: {
        ...trip.brief,
        customActivities: {
          ...(trip.brief.customActivities ?? {}),
          [location.dayNumber]: (trip.brief.customActivities?.[location.dayNumber] ?? [])
            .map((activity) => normalized(activity) === normalized(original) ? title : activity),
        },
      },
      planItems: trip.planItems.map((item) => item.dayNumber === location.dayNumber
        ? { ...item, notes: item.notes.map((note, index) => index === location.noteIndex ? title : note) }
        : item),
    },
  };
}

export function removeItineraryActivity(
  trip: EasyTTrip,
  location: ItineraryActivityLocation,
): ItineraryMutationResult {
  const protection = itineraryActivityProtection(trip, location);
  if (!protection.editable || protection.note === null) {
    return unchanged(trip, "This item is protected and cannot be removed here.");
  }
  const original = protection.note;
  return {
    changed: true,
    trip: {
      ...trip,
      brief: {
        ...trip.brief,
        customActivities: {
          ...(trip.brief.customActivities ?? {}),
          [location.dayNumber]: (trip.brief.customActivities?.[location.dayNumber] ?? [])
            .filter((activity) => normalized(activity) !== normalized(original)),
        },
      },
      planItems: trip.planItems.map((item) => item.dayNumber === location.dayNumber
        ? withAlignedSchedule(
          item,
          item.notes.filter((_, index) => index !== location.noteIndex),
          alignedDayParts(item).filter((_, index) => index !== location.noteIndex),
        )
        : item),
    },
  };
}

export function moveItineraryActivity(
  trip: EasyTTrip,
  location: ItineraryActivityLocation,
  targetNoteIndex: number,
): ItineraryMutationResult {
  const protection = itineraryActivityProtection(trip, location);
  const day = planItemForDay(trip, location.dayNumber);
  if (!protection.editable || protection.note === null || !day) {
    return unchanged(trip, "This item cannot be safely reordered.");
  }
  if (!Number.isInteger(targetNoteIndex) || targetNoteIndex < 0 || targetNoteIndex > day.notes.length) {
    return unchanged(trip, "That drop position is no longer available.");
  }

  const notes = [...day.notes];
  const noteDayParts = alignedDayParts(day);
  const [activity] = notes.splice(location.noteIndex, 1);
  const [dayPart] = noteDayParts.splice(location.noteIndex, 1);
  const adjustedTarget = targetNoteIndex > location.noteIndex ? targetNoteIndex - 1 : targetNoteIndex;
  if (adjustedTarget === location.noteIndex) return unchanged(trip, "The activity is already in that position.");
  notes.splice(adjustedTarget, 0, activity);
  noteDayParts.splice(adjustedTarget, 0, dayPart ?? null);
  return {
    changed: true,
    trip: {
      ...trip,
      planItems: trip.planItems.map((item) => item.dayNumber === location.dayNumber ? withAlignedSchedule(item, notes, noteDayParts) : item),
    },
  };
}

export function assignItineraryActivityDayPart(
  trip: EasyTTrip,
  location: ItineraryActivityLocation,
  dayPart: ItineraryDayPart | null,
): ItineraryMutationResult {
  const protection = itineraryActivityProtection(trip, location);
  const day = planItemForDay(trip, location.dayNumber);
  if (!protection.editable || protection.note === null || !day) {
    return unchanged(trip, "This item is protected and cannot be rescheduled here.");
  }
  const noteDayParts = alignedDayParts(day);
  if (noteDayParts[location.noteIndex] === dayPart) return unchanged(trip, "The activity is already in that part of the day.");
  noteDayParts[location.noteIndex] = dayPart;
  return {
    changed: true,
    trip: {
      ...trip,
      planItems: trip.planItems.map((item) => item.dayNumber === location.dayNumber
        ? withAlignedSchedule(item, [...item.notes], noteDayParts)
        : item),
    },
  };
}

/** Reorder a scheduled idea through its stable idea identity without detaching its map pin. */
export function moveItineraryIdeaActivity(
  trip: EasyTTrip,
  ideaId: string,
  targetNoteIndex: number,
): ItineraryMutationResult {
  const idea = (trip.brief.itineraryIdeas ?? []).find((candidate) => candidate.id === ideaId);
  const day = idea?.dayId ? trip.planItems.find((candidate) => candidate.id === idea.dayId) : null;
  if (!idea || !day) return unchanged(trip, "This saved idea is no longer on the day.");
  const matches = day.notes.flatMap((note, index) => normalized(note) === normalized(idea.title) ? [index] : []);
  if (matches.length !== 1) return unchanged(trip, "This saved idea cannot be safely reordered.");
  if (!Number.isInteger(targetNoteIndex) || targetNoteIndex < 0 || targetNoteIndex > day.notes.length) {
    return unchanged(trip, "That drop position is no longer available.");
  }
  const sourceIndex = matches[0]!;
  const notes = [...day.notes];
  const noteDayParts = alignedDayParts(day);
  const [title] = notes.splice(sourceIndex, 1);
  const [part] = noteDayParts.splice(sourceIndex, 1);
  const adjustedTarget = targetNoteIndex > sourceIndex ? targetNoteIndex - 1 : targetNoteIndex;
  if (adjustedTarget === sourceIndex) return unchanged(trip, "The activity is already in that position.");
  notes.splice(adjustedTarget, 0, title!);
  noteDayParts.splice(adjustedTarget, 0, part ?? null);
  return {
    changed: true,
    trip: {
      ...trip,
      planItems: trip.planItems.map((item) => item.id === day.id
        ? withAlignedSchedule(item, notes, noteDayParts)
        : item),
    },
  };
}

export function selectedItineraryDayNumber(trip: EasyTTrip, selectedDayNumber: number | null) {
  if (selectedDayNumber !== null && trip.planItems.some((item) => item.dayNumber === selectedDayNumber)) {
    return selectedDayNumber;
  }
  return trip.planItems.slice().sort((left, right) => left.dayNumber - right.dayNumber)[0]?.dayNumber ?? null;
}

export function cloneItineraryMutationDocument(trip: EasyTTrip): EasyTTrip {
  return {
    ...trip,
    brief: {
      ...trip.brief,
      dayNotes: { ...(trip.brief.dayNotes ?? {}) },
      customActivities: { ...(trip.brief.customActivities ?? {}) },
      mapPins: [...(trip.brief.mapPins ?? [])],
      bookings: [...(trip.brief.bookings ?? [])],
    },
    planItems: trip.planItems.map((item: PlanItem) => ({
      ...item,
      notes: [...item.notes],
      ...(item.noteDayParts ? { noteDayParts: [...item.noteDayParts] } : {}),
    })),
  };
}
