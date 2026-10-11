"use client";

import TripTransportWorkspace from "@/components/easyt/trip-transport-workspace";
import { TripWorkspaceCommit, useTripShellTrip } from "@/components/easyt/trip-shell-client";

export default function TripTransportWorkspacePage() {
  const trip = useTripShellTrip();
  return <TripWorkspaceCommit view="transport"><TripTransportWorkspace trip={trip} /></TripWorkspaceCommit>;
}
