import type { TripRecoveryRecord } from "./storage.ts";
import { tripSyncRecoveryPath } from "./trip-continuity.ts";

export type GuestDeviceTrip = { id: string; title: string; href: string };
export type GuestDeviceTripsState =
  | { kind: "withheld" }
  | { kind: "unavailable" }
  | { kind: "ready"; trips: GuestDeviceTrip[] };

/** Discovery grants no authority to claim, resolve, merge or mutate a copy. */
export async function loadGuestDeviceTrips(
  session: { pending: boolean; ownerId: string | null },
  isCurrent: () => boolean,
  read: () => Promise<TripRecoveryRecord[]>,
): Promise<GuestDeviceTripsState> {
  if (session.pending || session.ownerId !== null || !isCurrent()) return { kind: "withheld" };
  try {
    const recoveries = await read();
    if (!isCurrent()) return { kind: "withheld" };
    if (recoveries.some(row => row.ownerId !== null || row.trip.ownerId !== null || row.tripId !== row.trip.id)) return { kind: "unavailable" };
    return { kind: "ready", trips: recoveries.map(({ trip }) => ({
      id: trip.id,
      title: trip.title.trim() || "Untitled trip",
      href: tripSyncRecoveryPath(trip.id, trip.status === "draft" ? "builder" : "planner"),
    })) };
  } catch {
    return isCurrent() ? { kind: "unavailable" } : { kind: "withheld" };
  }
}
