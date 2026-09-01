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
