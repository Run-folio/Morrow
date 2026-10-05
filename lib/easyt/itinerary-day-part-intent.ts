import {
  composeItineraryDay,
  itineraryDayParts,
  type ComposedItineraryActivity,
  type ItineraryDayComposition,
} from "./itinerary-day-composition.ts";
import type { EasyTTrip, ItineraryDayPart } from "./trip.ts";

function explicitDayPartForActivity(
  trip: EasyTTrip,
  composition: ItineraryDayComposition,
  activity: ComposedItineraryActivity,
): ItineraryDayPart | null {
  if (activity.source === "itinerary-idea") {
    return (trip.brief.itineraryIdeas ?? []).find((idea) => idea.id === activity.id)?.dayPart ?? null;
  }
  if (activity.noteIndex === null) return null;
  return composition.day.noteDayParts?.[activity.noteIndex] ?? null;
}

/**
 * Keep presentation-only ordering fallbacks out of canonical period intent.
 * The returned shape stays the shared day-composition type; only its grouping
 * is normalised from persisted idea/day-note metadata.
 */
export function composeItineraryDayWithExplicitPeriods(
  trip: EasyTTrip,
  dayId: string,
): ItineraryDayComposition | null {
  const composition = composeItineraryDay(trip, dayId);
  if (!composition) return null;
  const activities = [...new Map([
    ...itineraryDayParts.flatMap((part) => composition.planned[part]),
    ...composition.unslotted,
  ].map((activity) => [activity.id, activity])).values()].map((activity) => ({
    ...activity,
    dayPart: explicitDayPartForActivity(trip, composition, activity),
  }));
  const planned = Object.fromEntries(itineraryDayParts.map((part) => [
    part,
    activities.filter((activity) => activity.dayPart === part),
  ])) as Record<ItineraryDayPart, ComposedItineraryActivity[]>;
  const unslotted = activities.filter((activity) => activity.dayPart === null);

  return {
    ...composition,
    planned,
    unslotted,
    freeDayParts: itineraryDayParts.filter((part) => planned[part].length === 0),
  };
}

/** The Day View uses three broad planning slots while legacy Midday remains a
 * valid persisted value for Map, Explore and older trips. */
export const itineraryPlanningParts = ["morning", "afternoon", "evening"] as const;
export type ItineraryPlanningPart = typeof itineraryPlanningParts[number];

function partForLocalStart(startsAt: string | undefined): ItineraryPlanningPart | null {
  const match = startsAt?.match(/^([01]\d|2[0-3]):[0-5]\d$/);
  if (!match) return null;
  const hour = Number(match[1]);
  return hour < 6 || hour >= 17 ? "evening" : hour < 12 ? "morning" : "afternoon";
}

/** Presentation-only projection: never invents a clock time or rewrites trip data. */
export function composeItineraryDayForPlanning(trip: EasyTTrip, dayId: string): ItineraryDayComposition | null {
  const composition = composeItineraryDayWithExplicitPeriods(trip, dayId);
  if (!composition) return null;
  const activities = [...itineraryDayParts.flatMap((part) => composition.planned[part]), ...composition.unslotted]
    .map((activity) => {
      const timedPart = partForLocalStart(activity.startsAt);
      const dayPart = timedPart ?? (activity.dayPart === "midday" ? "afternoon" : activity.dayPart);
      return { ...activity, dayPart, dayPartEditable: activity.dayPartEditable && timedPart === null };
    });
  const planned = Object.fromEntries(itineraryDayParts.map((part) => [
    part,
    activities.filter((activity) => activity.dayPart === part),
  ])) as Record<ItineraryDayPart, ComposedItineraryActivity[]>;
  return {
    ...composition,
    planned,
    unslotted: activities.filter((activity) => activity.dayPart === null),
    freeDayParts: itineraryPlanningParts.filter((part) => planned[part].length === 0),
  };
}
