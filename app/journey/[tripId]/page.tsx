"use client";

import TripStarter from "@/components/easyt/trip-starter";
import TripOverviewWorkspace from "@/components/easyt/trip-overview-workspace";
import { TripOverviewEntryBoundary, TripWorkspaceCommit, useTripShellTrip } from "@/components/easyt/trip-shell-client";
import { isFirstTripWorkspaceArrival } from "@/lib/easyt/trip-workspace-links";
import { useEffect, useState } from "react";

export default function TripOverviewWorkspacePage() {
  const trip = useTripShellTrip();
  const [firstArrival, setFirstArrival] = useState(false);
  useEffect(() => setFirstArrival(isFirstTripWorkspaceArrival(window.location.search)), []);
  return <TripWorkspaceCommit view="overview">
    <TripOverviewEntryBoundary />
    <TripStarter key={`${trip.ownerId ?? "guest"}:${trip.id}`} />
    <TripOverviewWorkspace trip={trip} firstArrival={firstArrival} />
  </TripWorkspaceCommit>;
}
