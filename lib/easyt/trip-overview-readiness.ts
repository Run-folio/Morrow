import { accommodationProgress } from "./accommodation.ts";
import { transportBookingProgress } from "./booking-readiness.ts";
import type { EasyTTrip } from "./trip.ts";
import { deriveItineraryCoverage } from "./trip-facts.ts";
import type { TripPrepTask, TripPrepTaskStatus } from "./trip-prep.ts";

export type OverviewReadinessStatus = "complete" | "in-progress" | "to-do" | "needs-review";
export type OverviewReadinessCategoryId = "itinerary" | "accommodation" | "transport" | "passport" | "insurance" | "connectivity" | "checklist";

export type OverviewReadinessCategory = {
  id: OverviewReadinessCategoryId;
  label: string;
  detail: string;
  status: OverviewReadinessStatus;
  percent: number | null;
};

function overviewStatus(status: TripPrepTaskStatus | undefined): OverviewReadinessStatus {
  if (status === "complete") return "complete";
  if (status === "in-progress") return "in-progress";
  if (status === "urgent") return "needs-review";
  return "to-do";
}

function taskForKind(tasks: TripPrepTask[], kind: TripPrepTask["kind"]) {
  return tasks.find((task) => task.kind === kind);
}

function providerFallback(providerStatus: "loading" | "available" | "unavailable") {
  if (providerStatus === "loading") return { detail: "Checking current guidance…", status: "in-progress" as const };
  if (providerStatus === "unavailable") return { detail: "Check again before relying on this status", status: "needs-review" as const };
  return { detail: "Review before departure", status: "to-do" as const };
}

/** Read-only adapter over canonical itinerary, booking and Prep selectors. */
export function deriveOverviewReadinessCategories({
  trip,
  prepTasks,
  providerStatus,
}: {
  trip: EasyTTrip;
  prepTasks: TripPrepTask[];
  providerStatus: "loading" | "available" | "unavailable";
}): OverviewReadinessCategory[] {
  const itinerary = deriveItineraryCoverage(trip);
  const stays = accommodationProgress(trip);
  const transport = transportBookingProgress(trip);
  const passport = taskForKind(prepTasks, "passport");
  const insurance = taskForKind(prepTasks, "insurance");
  const connectivity = taskForKind(prepTasks, "connectivity");
  const checklist = trip.brief.checklist ?? [];
  const checklistComplete = checklist.filter((item) => item.complete).length;
  const fallback = providerFallback(providerStatus);

  return [
    {
      id: "itinerary",
      label: "Itinerary",
      detail: itinerary.label,
      status: itinerary.state === "complete" ? "complete" : itinerary.plannedDays ? "in-progress" : "to-do",
      percent: itinerary.percent ?? 0,
    },
    {
      id: "accommodation",
      label: "Accommodation",
      detail: stays.stops.length ? `${stays.sortedCount} of ${stays.stops.length} overnight ${stays.stops.length === 1 ? "stop" : "stops"} sorted` : "No overnight stays to arrange",
      status: stays.complete ? "complete" : stays.sortedCount || stays.datesReadyCount ? "in-progress" : "to-do",
      percent: stays.stops.length ? Math.round((stays.sortedCount / stays.stops.length) * 100) : 100,
    },
    {
      id: "transport",
      label: "Transport",
      detail: transport.total ? `${transport.sortedCount} of ${transport.total} ${transport.total === 1 ? "transfer" : "transfers"} sorted` : "No transfers to arrange",
      status: transport.complete ? "complete" : transport.sortedCount ? "in-progress" : "to-do",
      percent: transport.total ? Math.round((transport.sortedCount / transport.total) * 100) : 100,
    },
    {
      id: "passport",
      label: "Passport & details",
      detail: passport?.detail ?? "Add traveller details",
      status: overviewStatus(passport?.status),
      percent: passport?.status === "complete" ? 100 : null,
    },
    {
      id: "insurance",
      label: "Insurance",
      detail: insurance?.detail ?? fallback.detail,
      status: insurance ? overviewStatus(insurance.status) : fallback.status,
      percent: insurance?.status === "complete" ? 100 : null,
    },
    {
      id: "connectivity",
      label: "Connectivity",
      detail: connectivity?.detail ?? fallback.detail,
      status: connectivity ? overviewStatus(connectivity.status) : fallback.status,
      percent: connectivity?.status === "complete" ? 100 : null,
    },
    {
      id: "checklist",
      label: "Saved checklist",
      detail: checklist.length ? `${checklistComplete} of ${checklist.length} practicals complete` : "Review practicals",
      status: checklist.length && checklistComplete === checklist.length ? "complete" : checklistComplete ? "in-progress" : "to-do",
      percent: checklist.length ? Math.round((checklistComplete / checklist.length) * 100) : null,
    },
  ];
}
