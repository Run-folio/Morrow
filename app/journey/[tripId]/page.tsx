"use client";

import TripOverviewWorkspace from "@/components/easyt/trip-overview-workspace";
import { useTripShellTrip } from "@/components/easyt/trip-shell-client";

export default function TripOverviewWorkspacePage() {
  const trip = useTripShellTrip();
  return <TripOverviewWorkspace trip={trip} />;
}
