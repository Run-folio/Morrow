"use client";

import TripItineraryWorkspace from "@/components/easyt/trip-itinerary-workspace";
import { useTripShellTrip } from "@/components/easyt/trip-shell-client";

export default function TripItineraryWorkspacePage() {
  const trip = useTripShellTrip();
  return <TripItineraryWorkspace trip={trip} presentation="shell" />;
}
