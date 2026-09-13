import { composeItineraryDayWithExplicitPeriods } from "./itinerary-day-part-intent.ts";
import { mapResultSelectionIdForIdea } from "./map-result-selection.ts";
import type { EasyTTrip, ItineraryDayPart } from "./trip.ts";

export type MapPlanAgendaItem = {
  id: string;
  kind: "transfer" | "activity";
  title: string;
  scheduleLabel: string | null;
  metadata: string | null;
  detail: string | null;
  mapSelectionId: string | null;
  transferMode?: EasyTTrip["legs"][number]["mode"];
};

export type MapPlanDayOption = {
  id: string;
  dayNumber: number;
  date: string;
};

const dayPartLabel = (dayPart: ItineraryDayPart) => `${dayPart[0]!.toUpperCase()}${dayPart.slice(1)}`;

function canonicalTime(value: string | null) {
  const match = value?.trim().match(/^(?:[01]\d|2[0-3]):[0-5]\d/);
  return match?.[0] ?? null;
}

export function compactMapPlanDuration(minutes: number | null) {
  if (minutes === null || !Number.isFinite(minutes) || minutes < 0) return null;
  const rounded = Math.round(minutes);
  const hours = Math.floor(rounded / 60);
  const remainder = rounded % 60;
  if (!hours) return `${remainder}m`;
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
}

export function mapPlanDaysForStop(trip: EasyTTrip, stopId: string): MapPlanDayOption[] {
  return trip.planItems
    .filter((day) => day.stopId === stopId)
    .sort((left, right) => left.dayNumber - right.dayNumber || left.id.localeCompare(right.id))
    .map(({ id, dayNumber, date }) => ({ id, dayNumber, date }));
}

/** A read-only compact projection of the canonical itinerary document. */
export function mapPlanAgendaForDay(trip: EasyTTrip, dayId: string) {
  const composition = composeItineraryDayWithExplicitPeriods(trip, dayId);
  if (!composition) return null;
  const exactStart = canonicalTime(composition.day.startsAt);
  const activities = [
    ...Object.values(composition.planned).flat(),
    ...composition.unslotted,
  ];
  let exactStartUsed = false;
  const useExactStart = () => {
    if (!exactStart || exactStartUsed) return null;
    exactStartUsed = true;
    return exactStart;
  };
  const transfers: MapPlanAgendaItem[] = composition.transfers.map((transfer) => ({
    id: transfer.id,
    kind: "transfer",
    title: transfer.origin && transfer.destination
      ? `${transfer.origin} → ${transfer.destination}`
      : transfer.direction === "arriving"
        ? `Arrive in ${composition.context.destination}`
        : `Travel onward from ${composition.context.destination}`,
    scheduleLabel: useExactStart(),
    metadata: compactMapPlanDuration(transfer.durationMinutes),
    detail: [
      transfer.durationIsEstimate ? "Planning estimate" : null,
      transfer.scheduleNeedsChecking ? "check current schedules" : null,
      !transfer.durationIsEstimate && transfer.provider ? transfer.provider : null,
    ].filter(Boolean).join(" · ") || null,
    mapSelectionId: null,
    transferMode: transfer.mode,
  }));
  const agendaActivities: MapPlanAgendaItem[] = activities.map((activity) => ({
    id: activity.id,
    kind: "activity",
    title: activity.title,
    scheduleLabel: useExactStart() ?? (activity.dayPart ? dayPartLabel(activity.dayPart) : null),
    metadata: activity.area ?? activity.placeType ?? null,
    detail: null,
    mapSelectionId: activity.source === "itinerary-idea" && activity.mapPinId
      ? mapResultSelectionIdForIdea(activity.id)
      : null,
  }));
  const freeTime = composition.day.type !== "arrival"
    && composition.day.type !== "transport"
    && composition.unslotted.length === 0
    ? (["afternoon", "midday", "morning", "evening"] as ItineraryDayPart[])
      .find((dayPart) => composition.planned[dayPart].length === 0) ?? null
    : null;

  return {
    day: composition.day,
    stop: composition.stop,
    items: [...transfers, ...agendaActivities],
    freeTime,
  };
}
