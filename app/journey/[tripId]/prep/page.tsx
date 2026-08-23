"use client";

import TripPrepWorkspace from "@/components/easyt/trip-prep-workspace";
import { useTripShellTrip } from "@/components/easyt/trip-shell-client";

export default function TripPrepWorkspacePage() {
  const trip = useTripShellTrip();
  return <TripPrepWorkspace trip={trip} presentation="shell" />;
}
