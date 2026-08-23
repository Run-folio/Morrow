"use client";

import TripMapWorkspace from "@/components/easyt/trip-map-workspace";
import { useTripShellTrip } from "@/components/easyt/trip-shell-client";

export default function TripMapWorkspacePage() {
  const trip = useTripShellTrip();
  return <TripMapWorkspace trip={trip} />;
}
