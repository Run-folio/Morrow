import { tripProjectionNeedsReview } from "./trip-route-intent.ts";
import { accommodationProgress } from "./accommodation.ts";
import { tripHealth } from "./review.ts";
import { deriveItineraryCoverage } from "./trip-facts.ts";
import { shapedItineraryDayNumbers } from "./trip-overview-readiness.ts";
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
  const projectionPending = tripProjectionNeedsReview(trip);
  const itinerary = deriveItineraryCoverage(trip);
  const stays = accommodationProgress(trip);
  const health = tripHealth(trip);
  const savedPrep = trip.brief.checklist ?? [];
  const completedPrep = savedPrep.filter((item) => item.complete).length;
  const persistedCritical = trip.recommendations.some((item) => item.status === "open" && item.severity === "critical");
  const importedOutline = trip.brief.capturedIntent?.parserVersion === "spreadsheet-v1";
  const shapedDays = importedOutline ? shapedItineraryDayNumbers(trip).size : 0;
  const itineraryComplete = itinerary.state === "complete"
    && (!importedOutline || (itinerary.expectedDays !== null && shapedDays >= itinerary.expectedDays));
  const itineraryLabel = importedOutline && !itineraryComplete
    ? shapedDays === 0
      ? `Outline created for ${itinerary.plannedDays} ${itinerary.plannedDays === 1 ? "day" : "days"}. Add activities or leave time free.`
      : `${shapedDays} of ${itinerary.expectedDays ?? itinerary.plannedDays} days shaped. Keep planning or leave time free.`
    : itinerary.label;

  const signals: TripReadinessSignal[] = [
    { id: "itinerary", complete: itineraryComplete, blocked: false, label: itineraryLabel },
    {
      id: "stays",
      complete: stays.complete,
      blocked: false,
      label: stays.stops.length ? `${stays.sortedCount} of ${stays.stops.length} stays sorted` : "Overnight stays to confirm",
    },
    {
      id: "route",
      complete: !projectionPending && health.isReady && !persistedCritical,
      blocked: projectionPending || health.blockingCount > 0 || persistedCritical,
      label: projectionPending ? "Route reconciliation needs review" : health.blockingCount || persistedCritical ? "Route needs a critical review" : health.openIssueCount ? "Route has checks to review" : "Route checks clear",
    },
    {
      id: "prep",
      complete: savedPrep.length > 0 && completedPrep === savedPrep.length,
      blocked: false,
      label: savedPrep.length ? `${completedPrep} of ${savedPrep.length} saved practical tasks complete` : "Practical tasks to review",
    },
  ];

  return {
    signals,
    completeCount: signals.filter((signal) => signal.complete).length,
    isReady: signals.every((signal) => signal.complete),
  };
}
