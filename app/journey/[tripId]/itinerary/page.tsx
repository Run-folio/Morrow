"use client";

import TripItineraryWorkspace from "@/components/easyt/trip-itinerary-workspace";
import { TripWorkspaceCommit, useTripShellTrip } from "@/components/easyt/trip-shell-client";
import { useSearchParams } from "next/navigation";
import { parseItineraryWorkspaceTarget } from "@/lib/easyt/trip-workspace-links";

export default function TripItineraryWorkspacePage() {
  const trip = useTripShellTrip();
  const searchParams = useSearchParams();
  const target = parseItineraryWorkspaceTarget(trip, searchParams);
  return <TripWorkspaceCommit view="itinerary"><TripItineraryWorkspace trip={trip} presentation="shell" selectedDayNumber={target.dayNumber} /></TripWorkspaceCommit>;
}
