import { cascadeTripSchedule } from "./cascade.ts";
import { reconcileAuthoredDayState } from "./trip-authored-day-state.ts";
import type { EasyTTrip } from "./trip.ts";

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
      retainedAuthoredContent: hydrated.brief.retainedAuthoredContent,
      cascadeStatus: hydrated.brief.cascadeStatus,
      dayNotes: hydrated.brief.dayNotes,
      customActivities: hydrated.brief.customActivities,
      itineraryIdeas: hydrated.brief.itineraryIdeas,
      mapPins: hydrated.brief.mapPins,
      bookings,
      checklist: hydrated.brief.checklist,
    },
  };
  const reconciled = reconcileAuthoredDayState(hydrated, cascadeTripSchedule(preserved).trip);
  const removedStops = hydrated.stops.filter(stop => !activeStopIds.has(stop.id));
  const affectedBookingIds = bookings?.filter(booking => removedStops.some(stop => booking.id === `stay-${stop.id}`)).map(booking => booking.id) ?? [];
  return { ...reconciled, brief: { ...reconciled.brief,
    ...(removedStops.length ? { cascadeStatus: { ...reconciled.brief.cascadeStatus,
      conflicts: [...(reconciled.brief.cascadeStatus?.conflicts ?? []), "Review retained activities and bookings after changing destinations."],
      affectedBookingIds, affectedPlanItemCount: hydrated.planItems.filter(day => !activeStopIds.has(day.stopId)).length } } : {}),
  } };
}
