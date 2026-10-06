import { cascadeTripSchedule } from "./cascade.ts";
import { reconcileAuthoredDayState } from "./trip-authored-day-state.ts";
import type { EasyTTrip, ItineraryIdea } from "./trip.ts";

/** Carry canonical traveller state through the Builder's derived document rebuild. */
export function preserveBuilderCanonicalState(hydrated: EasyTTrip | null, rebuilt: EasyTTrip): EasyTTrip {
  if (!hydrated || hydrated.id !== rebuilt.id) return cascadeTripSchedule(rebuilt).trip;
  const activeStopIds = new Set(rebuilt.stops.map((stop) => stop.id));
  const bookings = hydrated.brief.bookings;
  const preserved: EasyTTrip = {
    ...rebuilt,
    ownerId: hydrated.ownerId,
    archivedFromStatus: hydrated.archivedFromStatus,
    changeHistory: hydrated.changeHistory,
    brief: {
      ...rebuilt.brief,
      dayNotes: hydrated.brief.dayNotes,
      customActivities: hydrated.brief.customActivities,
      itineraryIdeas: hydrated.brief.itineraryIdeas,
      mapPins: hydrated.brief.mapPins,
      bookings,
      checklist: hydrated.brief.checklist,
    },
  };
  const reconciled = reconcileAuthoredDayState(hydrated, cascadeTripSchedule(preserved).trip);
  const orphanIdeas = (hydrated.brief.itineraryIdeas ?? []).filter(idea => !activeStopIds.has(idea.stopId)).map(idea => ({ ...idea, dayId: undefined, dayPart: undefined }));
  const removedDays = new Set(hydrated.planItems.filter(day => !activeStopIds.has(day.stopId)).map(day => day.dayNumber));
  const orphanPins = (hydrated.brief.mapPins ?? []).filter(pin => removedDays.has(pin.dayNumber)).map(pin => ({ ...pin, dayNumber: 0 }));
  const orphanNotes: ItineraryIdea[] = hydrated.planItems.filter(day => removedDays.has(day.dayNumber)).flatMap(day => [
    ...(hydrated.brief.dayNotes?.[day.dayNumber] ?? []), ...(hydrated.brief.customActivities?.[day.dayNumber] ?? []),
  ].map((title, index) => ({ id: `retained-${day.id}-${index}`, stopId: day.stopId, placeId: `retained-${day.id}-${index}`,
    title, category: "activity" as const, source: "personalised-recommendation" as const, reasons: [] })));
  const needsReview = orphanIdeas.length || orphanPins.length || removedDays.size || bookings?.some(booking => hydrated.stops.some(stop => booking.id === `stay-${stop.id}` && !activeStopIds.has(stop.id)));
  return { ...reconciled, brief: { ...reconciled.brief,
    itineraryIdeas: [...(reconciled.brief.itineraryIdeas ?? []), ...orphanIdeas, ...orphanNotes],
    ...(orphanPins.length ? { mapPins: [...(reconciled.brief.mapPins ?? []), ...orphanPins] } : {}),
    ...(needsReview ? { cascadeStatus: { conflicts: [...(reconciled.brief.cascadeStatus?.conflicts ?? []), "Review retained activities and bookings after changing destinations."],
      affectedBookingIds: bookings?.filter(booking => hydrated.stops.some(stop => booking.id === `stay-${stop.id}` && !activeStopIds.has(stop.id))).map(booking => booking.id) ?? [],
      affectedPlanItemCount: removedDays.size } } : {}),
  } };

}
