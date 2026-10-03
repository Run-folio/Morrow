"use client";

import { useSearchParams } from "next/navigation";
import TripExploreWorkspace from "@/components/easyt/trip-explore-workspace";
import { TripWorkspaceCommit, useTripShellTrip } from "@/components/easyt/trip-shell-client";

export default function TripExploreWorkspacePage() {
  const trip = useTripShellTrip();
  const searchParams = useSearchParams();
  const requestedStopId = searchParams.get("stop");
  const initialDestinationId = requestedStopId && trip.stops.some((stop) => stop.id === requestedStopId)
    ? requestedStopId
    : undefined;
  const rawDay = searchParams.get("day") ?? "";
  const requestedDayNumber = /^\d+$/.test(rawDay) ? Number.parseInt(rawDay, 10) : null;

  return <TripWorkspaceCommit view="explore"><TripExploreWorkspace
    trip={trip}
    initialDestinationId={initialDestinationId}
    requestedDayNumber={requestedDayNumber}
  /></TripWorkspaceCommit>;
}
