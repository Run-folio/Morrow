"use client";

import { useSearchParams } from "next/navigation";
import TripStayWorkspace from "@/components/easyt/trip-stay-workspace";
import { useTripShellTrip } from "@/components/easyt/trip-shell-client";
import { parseStayWorkspaceTarget } from "@/lib/easyt/trip-workspace-links";

export default function TripStayWorkspacePage() {
  const trip = useTripShellTrip();
  const searchParams = useSearchParams();
  const target = parseStayWorkspaceTarget(trip, searchParams);
  const resultPrefix = target.stopId ? `result:stay:${target.stopId}:` : null;
  const selectedPlaceId = resultPrefix && target.resultSelectionId?.startsWith(resultPrefix)
    ? target.resultSelectionId.slice(resultPrefix.length)
    : null;
  return <TripStayWorkspace trip={trip} initialStopId={target.stopId} initialSelectedPlaceId={selectedPlaceId} />;
}
