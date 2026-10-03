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

export function shapedItineraryDayNumbers(trip: EasyTTrip) {
  const byId = new Map(trip.planItems.map((day) => [day.id, day.dayNumber]));
  const shaped = new Set<number>();
  for (const idea of trip.brief.itineraryIdeas ?? []) {
    const dayNumber = idea.dayId ? byId.get(idea.dayId) : undefined;
    if (dayNumber !== undefined) shaped.add(dayNumber);
  }
  for (const [dayNumber, activities] of Object.entries(trip.brief.customActivities ?? {})) {
    if (activities.some((activity) => activity.trim())) shaped.add(Number(dayNumber));
  }
  for (const [dayNumber, notes] of Object.entries(trip.brief.dayNotes ?? {})) {
    if (notes.some((note) => note.trim())) shaped.add(Number(dayNumber));
  }
  return new Set([...shaped].filter((dayNumber) => Number.isInteger(dayNumber) && trip.planItems.some((day) => day.dayNumber === dayNumber)));
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
  const shapedDays = shapedItineraryDayNumbers(trip).size;
  const itineraryTarget = itinerary.expectedDays ?? itinerary.plannedDays;
  const itineraryComplete = itinerary.expectedDays !== null && itinerary.expectedDays > 0 && shapedDays >= itinerary.expectedDays;
  const itineraryDetail = itinerary.plannedDays === 0
    ? "No day outline yet"
    : shapedDays === 0
      ? `Outline created for ${itinerary.plannedDays} ${itinerary.plannedDays === 1 ? "day" : "days"}. Add activities or leave time free.`
      : itineraryComplete
        ? `${shapedDays} of ${itinerary.expectedDays} days shaped.`
        : `${shapedDays} of ${itineraryTarget} days shaped. Keep planning or leave time free.`;
  const stays = accommodationProgress(trip);
  const unknownNights = trip.stops.length === 0 || trip.stops.some((stop) => stop.nights === null || stop.nights === undefined);
  const transport = transportBookingProgress(trip);
  const unknownTransfers = trip.stops.length === 0 || (trip.stops.length > 1 && transport.total === 0);
  const passport = taskForKind(prepTasks, "passport");
  const insurance = taskForKind(prepTasks, "insurance");
  const connectivity = taskForKind(prepTasks, "connectivity");
  const checklist = trip.brief.checklist ?? [];
  const checklistComplete = checklist.filter((item) => item.complete).length;
  const fallback = providerFallback(providerStatus);

  return [
    {
      id: "itinerary",
      label: "Days",
      detail: itineraryDetail,
      status: itineraryComplete ? "complete" : itinerary.plannedDays ? "in-progress" : "to-do",
      percent: itineraryTarget ? Math.min(100, Math.round((shapedDays / itineraryTarget) * 100)) : null,
    },
    {
      id: "accommodation",
      label: "Stays",
      detail: unknownNights ? "Confirm overnight stops to see stay progress" : stays.stops.length ? `${stays.sortedCount} of ${stays.stops.length} overnight ${stays.stops.length === 1 ? "stay" : "stays"} selected` : "No overnight stays to arrange",
      status: unknownNights ? "needs-review" : !stays.stops.length || stays.complete ? "complete" : stays.sortedCount ? "in-progress" : "to-do",
      percent: unknownNights ? null : stays.stops.length ? Math.round((stays.sortedCount / stays.stops.length) * 100) : 100,
    },
    {
      id: "transport",
      label: "Transport",
      detail: unknownTransfers ? "Confirm transfers to see transport progress" : transport.total ? `${transport.sortedCount} of ${transport.total} ${transport.total === 1 ? "transfer" : "transfers"} sorted` : "No transfers to arrange",
      status: unknownTransfers ? "needs-review" : transport.complete ? "complete" : transport.sortedCount ? "in-progress" : "to-do",
      percent: unknownTransfers ? null : transport.total ? Math.round((transport.sortedCount / transport.total) * 100) : 100,
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

/** Concise localized card copy, using the same canonical counts as the progress selector. */
export function overviewPlanningCardText(trip: EasyTTrip, category: OverviewReadinessCategory, language: "en" | "es") {
  const spanish = language === "es";
  if (category.id === "itinerary") {
    const coverage = deriveItineraryCoverage(trip);
    const total = coverage.expectedDays ?? coverage.plannedDays;
    const count = shapedItineraryDayNumbers(trip).size;
    return { label: spanish ? "Días" : "Days", detail: total
      ? spanish ? `${count} de ${total} días preparados.` : `${count} of ${total} days shaped.`
      : spanish ? "Añade fechas o un esquema de días para ver el progreso." : "Add dates or a day outline to see progress." };
  }
  if (category.id === "accommodation") {
    const stays = accommodationProgress(trip);
    return { label: spanish ? "Alojamientos" : "Stays", detail: category.percent === null
      ? spanish ? "Confirma las noches para ver el progreso." : "Confirm overnight stops to see stay progress."
      : stays.stops.length ? spanish ? `${stays.sortedCount} de ${stays.stops.length} alojamientos seleccionados.` : `${stays.sortedCount} of ${stays.stops.length} overnight ${stays.stops.length === 1 ? "stay" : "stays"} selected.`
      : spanish ? "No hay alojamientos que organizar." : "No overnight stays to arrange." };
  }
  const transport = transportBookingProgress(trip);
  return { label: spanish ? "Transporte" : "Transport", detail: category.percent === null
    ? spanish ? "Confirma los traslados para ver el progreso." : "Confirm transfers to see transport progress."
    : transport.total
    ? spanish ? `${transport.sortedCount} de ${transport.total} traslados organizados.` : `${transport.sortedCount} of ${transport.total} ${transport.total === 1 ? "transfer" : "transfers"} sorted.`
    : spanish ? "No hay traslados que organizar." : "No transfers to arrange." };
}
