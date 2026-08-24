import { accommodationProgress } from "./accommodation.ts";
import { tripHealth } from "./review.ts";
import { deriveItineraryCoverage } from "./trip-facts.ts";
import type { EasyTTrip } from "./trip.ts";

export type TripReadinessSignal = {
  id: "itinerary" | "stays" | "route" | "prep";
  complete: boolean;
  blocked: boolean;
  label: string;
};

/**
 * A read-only dashboard/Overview projection. It deliberately composes the
 * existing canonical selectors; it is not stored and does not affect Stamps.
 */
export function tripReadinessSummary(trip: EasyTTrip) {
  const itinerary = deriveItineraryCoverage(trip);
  const stays = accommodationProgress(trip);
  const health = tripHealth(trip);
  const savedPrep = trip.brief.checklist ?? [];
  const completedPrep = savedPrep.filter((item) => item.complete).length;
  const persistedCritical = trip.recommendations.some((item) => item.status === "open" && item.severity === "critical");

  const signals: TripReadinessSignal[] = [
    { id: "itinerary", complete: itinerary.state === "complete", blocked: false, label: itinerary.label },
    {
      id: "stays",
      complete: stays.complete,
      blocked: false,
      label: stays.stops.length ? `${stays.sortedCount} of ${stays.stops.length} stays sorted` : "Overnight stays to confirm",
    },
    {
      id: "route",
      complete: health.isReady && !persistedCritical,
      blocked: health.blockingCount > 0 || persistedCritical,
      label: health.blockingCount || persistedCritical ? "Route needs a critical review" : health.openIssueCount ? "Route has checks to review" : "Route checks clear",
    },
    {
      id: "prep",
      complete: savedPrep.length > 0 && completedPrep === savedPrep.length,
      blocked: false,
      label: savedPrep.length ? `${completedPrep} of ${savedPrep.length} saved Prep tasks complete` : "Prep tasks to review",
    },
  ];

  return {
    signals,
    completeCount: signals.filter((signal) => signal.complete).length,
    isReady: signals.every((signal) => signal.complete),
  };
}
