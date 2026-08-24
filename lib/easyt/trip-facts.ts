import { formatIsoDate, isoDateKey, parseIsoDate, tripLifecycle, type TripLifecycle } from "./trip-lifecycle.ts";
import type { EasyTTrip, PlanItem, TripLeg, TripStop } from "./trip.ts";

const DAY_MS = 86_400_000;

export type TripDateFacts = {
  state: "unknown" | "invalid" | "valid";
  lifecycle: TripLifecycle;
  start: Date | null;
  end: Date | null;
  durationDays: number | null;
  rangeLabel: string;
};

export type ItineraryCoverage = {
  state: "empty" | "unknown" | "partial" | "complete";
  plannedDays: number;
  expectedDays: number | null;
  missingDays: number | null;
  percent: number | null;
  label: string;
};

/**
 * The canonical boundary for dates shown by saved-trip surfaces. A malformed,
 * missing, or reversed date never becomes a rolled-over JavaScript Date.
 */
export function deriveTripDateFacts(
  input: Pick<EasyTTrip, "startDate" | "endDate">,
  now = new Date(),
): TripDateFacts {
  const start = parseIsoDate(input.startDate);
  const end = parseIsoDate(input.endDate);
  const lifecycle = tripLifecycle(input.startDate, input.endDate, now);
  const state = lifecycle.state === "invalid"
    ? "invalid"
    : start && end
      ? "valid"
      : "unknown";
  const durationDays = state === "valid" && start && end
    ? Math.round((end.getTime() - start.getTime()) / DAY_MS) + 1
    : null;
  const startLabel = formatIsoDate(input.startDate, "en-GB", { day: "numeric", month: "short", year: "numeric" });
  const endLabel = formatIsoDate(input.endDate, "en-GB", { day: "numeric", month: "short", year: "numeric" });
  const rangeLabel = state === "invalid"
    ? "Dates need review"
    : startLabel && endLabel
      ? `${startLabel} – ${endLabel}`
      : startLabel
        ? `From ${startLabel}`
        : endLabel
          ? `Until ${endLabel}`
          : "Dates to confirm";

  return { state, lifecycle, start, end, durationDays, rangeLabel };
}

export function orderedTripPlanItems(trip: Pick<EasyTTrip, "planItems">) {
  return [...trip.planItems].sort((left, right) => left.dayNumber - right.dayNumber || left.id.localeCompare(right.id));
}

/** Count represented calendar days, not rows. Duplicate or invalid day numbers do not inflate readiness. */
export function deriveItineraryCoverage(
  trip: Pick<EasyTTrip, "startDate" | "endDate" | "planItems">,
): ItineraryCoverage {
  const dates = deriveTripDateFacts(trip);
  const expectedDays = dates.durationDays;
  const represented = new Set(trip.planItems
    .filter((item) => {
      const day = item.dayNumber;
      if (!Number.isInteger(day) || day <= 0 || (expectedDays !== null && day > expectedDays)) return false;
      if (dates.state !== "valid" || !dates.start) return true;
      const expected = new Date(dates.start);
      expected.setDate(expected.getDate() + day - 1);
      return item.date === isoDateKey(expected) && parseIsoDate(item.date) !== null;
    })
    .map((item) => item.dayNumber));
  const plannedDays = represented.size;
  const missingDays = expectedDays === null ? null : Math.max(0, expectedDays - plannedDays);
  const percent = expectedDays === null ? null : expectedDays === 0 ? 0 : Math.min(100, Math.round((plannedDays / expectedDays) * 100));
  const state = plannedDays === 0
    ? "empty"
    : expectedDays === null
      ? "unknown"
      : plannedDays >= expectedDays
        ? "complete"
        : "partial";
  const label = expectedDays === null
    ? dates.state === "invalid"
      ? `${plannedDays} planned ${plannedDays === 1 ? "day" : "days"}; trip dates need review`
      : `${plannedDays} planned ${plannedDays === 1 ? "day" : "days"}; trip dates to confirm`
    : state === "complete"
      ? `${expectedDays} ${expectedDays === 1 ? "day" : "days"} planned`
      : `${plannedDays} of ${expectedDays} days planned`;

  return { state, plannedDays, expectedDays, missingDays, percent, label };
}

export function legForTransition(
  trip: Pick<EasyTTrip, "legs">,
  fromStopId: string,
  toStopId: string,
): TripLeg | null {
  return trip.legs.find((leg) => leg.fromStopId === fromStopId && leg.toStopId === toStopId) ?? null;
}

/** Resolve an inbound leg from the adjacent itinerary visit, including returns to a repeated stop. */
export function incomingLegForPlanItem(
  trip: Pick<EasyTTrip, "planItems" | "legs">,
  item: PlanItem,
): TripLeg | null {
  const ordered = orderedTripPlanItems(trip);
  const index = ordered.findIndex((candidate) => candidate.id === item.id);
  if (index <= 0) return null;
  const previous = ordered[index - 1];
  if (previous.stopId === item.stopId) return null;
  return legForTransition(trip, previous.stopId, item.stopId);
}

export function formatTripDuration(minutes: number | null, unknown = "Timing to confirm") {
  if (minutes === null || !Number.isFinite(minutes) || minutes < 0) return unknown;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return `${hours ? `${hours}h ` : ""}${remainder ? `${remainder}m` : ""}`.trim() || "0m";
}

export function formatTripNights(nights: number | null, unknown = "Nights to confirm") {
  if (nights === null || !Number.isInteger(nights) || nights < 0) return unknown;
  return `${nights} ${nights === 1 ? "night" : "nights"}`;
}

/** Five-to-under-ten hours is a warning; ten hours or more is critical. */
export function transferSeverity(minutes: number | null): "unknown" | "normal" | "warning" | "critical" {
  if (minutes === null || !Number.isFinite(minutes) || minutes < 0) return "unknown";
  if (minutes >= 600) return "critical";
  if (minutes >= 300) return "warning";
  return "normal";
}

/** Booking/search dates are exposed only when both stop and trip boundaries are strict and coherent. */
export function stableStopDateRange(
  stop: Pick<TripStop, "arrivalDate" | "departureDate">,
  trip: Pick<EasyTTrip, "startDate" | "endDate">,
) {
  const tripDates = deriveTripDateFacts(trip);
  const arrival = parseIsoDate(stop.arrivalDate);
  const departure = parseIsoDate(stop.departureDate);
  if (tripDates.state !== "valid" || !tripDates.start || !tripDates.end || !arrival || !departure || departure <= arrival) return null;
  const dayAfterEnd = new Date(tripDates.end);
  dayAfterEnd.setDate(dayAfterEnd.getDate() + 1);
  if (arrival < tripDates.start || departure > dayAfterEnd) return null;
  return { checkIn: stop.arrivalDate as string, checkOut: stop.departureDate as string };
}

export function tripVisibleFacts(trip: EasyTTrip) {
  const dates = deriveTripDateFacts(trip);
  const itinerary = deriveItineraryCoverage(trip);
  const days = orderedTripPlanItems(trip);
  return {
    dates,
    itinerary,
    days,
    transitions: days.map((day) => ({ dayId: day.id, inboundLeg: incomingLegForPlanItem(trip, day) })),
  };
}
