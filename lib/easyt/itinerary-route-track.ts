import { itineraryDestinationTrack } from "./trip-workspace-links.ts";
import type { OverviewPlaceImage } from "./trip-overview-imagery.ts";
import type { RouteTimelineStop } from "./route-timeline.ts";
import type { EasyTTrip } from "./trip.ts";

/** Adapts canonical stop occurrences to the shared photo track, without an origin entry. */
export function itineraryRouteTrackStops(
  trip: Pick<EasyTTrip, "stops" | "planItems">,
  selectedDayId: string | null,
  stopImages: Readonly<Record<string, OverviewPlaceImage | null>>,
  language: "en" | "es",
): RouteTimelineStop[] {
  return itineraryDestinationTrack(trip, selectedDayId).map(({ stop, active, firstDayNumber }) => {
    const days = trip.planItems.filter((day) => day.stopId === stop.id).sort((a, b) => a.dayNumber - b.dayNumber);
    const lastDayNumber = days.at(-1)?.dayNumber ?? null;
    const dayLabel = firstDayNumber === null
      ? language === "es" ? "Fechas por confirmar" : "Dates to confirm"
      : firstDayNumber === lastDayNumber
        ? `${language === "es" ? "Día" : "Day"} ${firstDayNumber}`
        : `${language === "es" ? "Días" : "Days"} ${firstDayNumber}–${lastDayNumber}`;
    const image = stopImages[stop.id]?.src;
    return { id: stop.id, name: stop.name, dayLabel, active, kind: "stop", disabled: firstDayNumber === null, ...(image ? { image } : {}) };
  });
}
