"use client";

import TripOverviewWorkspace from "@/components/easyt/trip-overview-workspace";
import { TripOverviewEntryBoundary, useTripShellTrip } from "@/components/easyt/trip-shell-client";
import { isFirstTripWorkspaceArrival } from "@/lib/easyt/trip-workspace-links";
import { useEffect, useState } from "react";

export default function TripOverviewWorkspacePage() {
  const trip = useTripShellTrip();
  const [firstArrival, setFirstArrival] = useState(false);
  useEffect(() => setFirstArrival(isFirstTripWorkspaceArrival(window.location.search)), []);
  return <>
    <TripOverviewEntryBoundary />
    <TripOverviewWorkspace trip={trip} firstArrival={firstArrival} />
  </>;
}
