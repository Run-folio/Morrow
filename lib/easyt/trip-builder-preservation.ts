import { cascadeTripSchedule } from "./cascade.ts";
import { reconcileAuthoredDayState } from "./trip-authored-day-state.ts";
import type { EasyTTrip } from "./trip.ts";

/** Carry canonical traveller state through the Builder's derived document rebuild. */
export function preserveBuilderCanonicalState(hydrated: EasyTTrip | null, rebuilt: EasyTTrip): EasyTTrip {
  if (!hydrated || hydrated.id !== rebuilt.id) return cascadeTripSchedule(rebuilt).trip;
  const activeStopIds = new Set(rebuilt.stops.map((stop) => stop.id));
  const bookings = hydrated.brief.bookings?.filter((booking) => {
    if (booking.type !== "stay") return true;
    const bookedStop = hydrated.stops.find((stop) => booking.id === `stay-${stop.id}`
      || booking.title.toLocaleLowerCase().includes(stop.name.toLocaleLowerCase()));
    return !bookedStop || activeStopIds.has(bookedStop.id);
  });
  const preserved: EasyTTrip = {
    ...rebuilt,
    ownerId: hydrated.ownerId,
    archivedFromStatus: hydrated.archivedFromStatus,
    changeHistory: hydrated.changeHistory,
    brief: {
      ...rebuilt.brief,
      dayNotes: hydrated.brief.dayNotes,
      customActivities: hydrated.brief.customActivities,
      itineraryIdeas: hydrated.brief.itineraryIdeas?.filter((idea) => activeStopIds.has(idea.stopId)),
      mapPins: hydrated.brief.mapPins,
      bookings,
      checklist: hydrated.brief.checklist,
    },
  };
  return reconcileAuthoredDayState(hydrated, cascadeTripSchedule(preserved).trip);
}
