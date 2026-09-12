"use client";

import { useSearchParams } from "next/navigation";
import TripExploreWorkspace from "@/components/easyt/trip-explore-workspace";
import { useTripShellTrip } from "@/components/easyt/trip-shell-client";

export default function TripExploreWorkspacePage() {
  const trip = useTripShellTrip();
  const searchParams = useSearchParams();
  const requestedStopId = searchParams.get("stop");
  const initialDestinationId = requestedStopId && trip.stops.some((stop) => stop.id === requestedStopId)
    ? requestedStopId
    : "all";
  const rawDay = searchParams.get("day") ?? "";
  const requestedDayNumber = /^\d+$/.test(rawDay) ? Number.parseInt(rawDay, 10) : null;

  return <TripExploreWorkspace
    trip={trip}
    initialDestinationId={initialDestinationId}
    requestedDayNumber={requestedDayNumber}
  />;
}
