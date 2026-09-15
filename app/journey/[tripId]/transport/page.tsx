"use client";

import TripTransportWorkspace from "@/components/easyt/trip-transport-workspace";
import { useTripShellTrip } from "@/components/easyt/trip-shell-client";

export default function TripTransportWorkspacePage() {
  const trip = useTripShellTrip();
  return <TripTransportWorkspace trip={trip} />;
}
