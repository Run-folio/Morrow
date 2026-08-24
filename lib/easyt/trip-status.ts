import type { EasyTTrip, TripStatus } from "./trip.ts";
import { tripLifecycle } from "./trip-lifecycle.ts";

type ActiveTripStatus = Exclude<TripStatus, "archived">;

/** An edit changes trip content, not the traveller's deliberate planning state. */
export function statusForTripEdit(previous: TripStatus, incoming: TripStatus): TripStatus {
  return previous === "planned" && incoming === "draft" ? "planned" : incoming;
}

export function archiveTripStatus(status: TripStatus): ActiveTripStatus {
  return status === "planned" ? "planned" : "draft";
}

export function restoreTripStatus(archivedFromStatus: unknown): ActiveTripStatus {
  return archivedFromStatus === "planned" ? "planned" : "draft";
}

/** Date presentation is deliberately derived; it never changes stored planning status. */
export function tripDatePresentation(trip: Pick<EasyTTrip, "startDate" | "endDate">, now = new Date()) {
  return tripLifecycle(trip.startDate, trip.endDate, now);
}

function timestamp(value: string) {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** A local-noon calendar key avoids date-only values shifting across timezones. */
export function tripStartDateSortKey(trip: Pick<EasyTTrip, "startDate" | "endDate">) {
  const start = tripDatePresentation(trip).start;
  return start?.getTime() ?? Number.MAX_SAFE_INTEGER;
}

/** Prefer a meaningful current or future itinerary over a recently touched, stale draft. */
export function dashboardHeroTrip(trips: EasyTTrip[], now = new Date()): EasyTTrip | null {
  const available = trips.filter((trip) => trip.status !== "archived");
  const stateFor = (trip: EasyTTrip) => tripDatePresentation(trip, now).state;
  const current = available
    .filter((trip) => ["starts-today", "started", "in-progress", "ends-today"].includes(stateFor(trip)))
    .sort((left, right) => tripStartDateSortKey(right) - tripStartDateSortKey(left))[0];
  if (current) return current;
  const futurePlanned = available
    .filter((trip) => trip.status === "planned" && stateFor(trip) === "upcoming")
    .sort((left, right) => tripStartDateSortKey(left) - tripStartDateSortKey(right))[0];
  if (futurePlanned) return futurePlanned;
  const futureDraft = available
    .filter((trip) => trip.status === "draft" && stateFor(trip) === "upcoming")
    .sort((left, right) => tripStartDateSortKey(left) - tripStartDateSortKey(right))[0];
  if (futureDraft) return futureDraft;
  return available.sort((left, right) => timestamp(right.updatedAt) - timestamp(left.updatedAt))[0] ?? null;
}
