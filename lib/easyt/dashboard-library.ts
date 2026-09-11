import { tripDisplayTitle } from "./trip-display.ts";
import { tripStartDateSortKey } from "./trip-status.ts";
import type { EasyTTrip, TripStatus } from "./trip.ts";

export type DashboardSortMode = "updated" | "upcoming" | "title";
export type DashboardLibraryView = "all" | TripStatus;

function timestamp(value: string | null | undefined) {
  const parsed = value ? Date.parse(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : 0;
}

function stableTripTieBreak(left: EasyTTrip, right: EasyTTrip) {
  return timestamp(right.createdAt) - timestamp(left.createdAt) || left.id.localeCompare(right.id);
}

export function compareDashboardTrips(left: EasyTTrip, right: EasyTTrip, sort: DashboardSortMode) {
  if (sort === "title") {
    return tripDisplayTitle(left).localeCompare(tripDisplayTitle(right))
      || timestamp(right.updatedAt) - timestamp(left.updatedAt)
      || stableTripTieBreak(left, right);
  }
  if (sort === "upcoming") {
    return tripStartDateSortKey(left) - tripStartDateSortKey(right)
      || timestamp(right.updatedAt) - timestamp(left.updatedAt)
      || stableTripTieBreak(left, right);
  }
  return timestamp(right.updatedAt) - timestamp(left.updatedAt) || stableTripTieBreak(left, right);
}

export function dashboardLibraryTrips(
  trips: EasyTTrip[],
  { view, sort, query }: { view: DashboardLibraryView; sort: DashboardSortMode; query: string },
) {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  return trips
    .filter((trip) => view === "all" || trip.status === view)
    .filter((trip) => !normalizedQuery || `${tripDisplayTitle(trip)} ${[...trip.stops].sort((left, right) => left.order - right.order).map((stop) => stop.name).join(" → ")}`.toLocaleLowerCase().includes(normalizedQuery))
    .sort((left, right) => compareDashboardTrips(left, right, sort));
}
