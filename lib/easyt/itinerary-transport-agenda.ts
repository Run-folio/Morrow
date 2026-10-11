import { transportBookingForLeg } from "./booking-readiness.ts";
import { routeEndpointForLeg } from "./trip-legs.ts";
import type { CanonicalRouteEndpoint, EasyTTrip, TripBooking, TripLeg } from "./trip.ts";
import { effectiveTripLeg } from "./transport-mode-choice.ts";
import { guardTripRoutingGeometry } from "./geographic-binding.ts";
import type { PlanningEvidenceState, TransferAssessment } from './planning-evidence-state.ts';
import { transferAssessmentForLeg } from './planning-evidence-presentation.ts';

export type TransportAssessmentState = "pending" | "failed" | "blocked" | "review" | "supported" | "unknown";

/** An unresolved result is settled unless the current reconciliation owns a pending unit. */
export function transportAssessmentState(trip: EasyTTrip, leg: TripLeg, assessment?: PlanningEvidenceState): TransportAssessmentState {
  const unit = trip.brief.cascadeStatus?.routeReconciliation?.residual.find(unit => unit.kind === "leg" && unit.targetId === leg.id);
  if (unit?.phase === "conflict") return "review";
  if (unit?.phase === "pending") return "pending";
  if (assessment?.retrieval === 'checking') return 'pending';
  if (assessment?.retrieval === 'blocked' || assessment?.retrieval === 'unavailable') return assessment.retryable ? 'failed' : 'blocked';
  if (unit?.phase === "failed") return "failed";
  if (assessment && (assessment.retrieval !== 'completed' || !['verified', 'conditional'].includes(assessment.evidence))) return 'unknown';
  // The resolver can settle successfully with unknown evidence. Its HTTP result
  // does not expose swallowed provider failures; do not infer a failure here.
  return leg.mode !== "unknown" && ["provider", "canonical_schedule", "routing_engine", "planning_estimate"].includes(leg.provenance ?? "") ? "supported" : "unknown";
}

export function transportAssessmentSummary(trip: EasyTTrip, language: "en" | "es", assessments?: readonly TransferAssessment[]) {
  const projected = guardTripRoutingGeometry(trip);
  const states = projected.legs.map(leg => transportAssessmentState(trip, effectiveTripLeg(projected, leg), transferAssessmentForLeg(assessments, leg.id)));
  const count = (state: TransportAssessmentState) => states.filter(value => value === state).length;
  const supported = count("supported");
  const pending = count("pending");
  const failed = count("failed");
  const blocked = count("blocked");
  const unknown = count("unknown");
  const review = count("review");
  const residual = trip.brief.cascadeStatus?.routeReconciliation?.residual ?? [];
  const coverage = language === "es"
    ? `Transporte encontrado para ${supported} de ${states.length} traslados`
    : `Transport found for ${supported} of ${states.length} transfers`;
  const details = [
    unknown ? language === "es" ? `${unknown} por comprobar` : `${unknown} need checking` : null,
    failed + blocked ? language === "es" ? `${failed + blocked} no se pudieron comprobar` : `${failed + blocked} could not be checked` : null,
    pending ? language === "es" ? `Comprobando ${pending}…` : `Checking ${pending}…` : null,
    review ? language === "es" ? `${review} por revisar` : `${review} need review` : null,
  ].filter(Boolean);
  const label = states.length ? [coverage, ...details].join(" · ")
    : language === "es" ? "Sin traslados que comprobar" : "No transfers to check";
  if (residual.some(unit => unit.phase === "conflict")) return { state: "device" as const, label: `${language === "es" ? "Revisión necesaria" : "Review needed"} · ${label}` };
  if (pending) return { state: "saving" as const, label };
  if (failed || blocked || residual.some(unit => unit.phase === "failed")) return { state: "error" as const, label };
  if (residual.some(unit => unit.phase === "pending")) return { state: "saving" as const, label: `${language === "es" ? "Actualizando datos…" : "Updating details…"} · ${label}` };
  return { state: unknown || review ? "device" as const : "saved" as const, label };
}

export type ItineraryTransportAgendaStatus = "booked" | "available" | "confirm";
export type TransportJourneyKnowledge = "known" | "partial" | "unknown";
export type TransportPresentationState = "booked" | "planning-estimate" | "check-timetable" | "check-service" | "needs-checking";

export type ItineraryTransportAgendaLeg = {
  leg: TripLeg;
  from: CanonicalRouteEndpoint;
  to: CanonicalRouteEndpoint;
  date: string | null;
  dayNumber: number | null;
  booking: TripBooking | null;
  status: ItineraryTransportAgendaStatus;
};

const isIsoDate = (value: string | null | undefined): value is string => Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));

function itineraryDateForLeg(trip: EasyTTrip, leg: TripLeg, to: CanonicalRouteEndpoint) {
  if (to.kind === "end") return isIsoDate(trip.endDate) ? { date: trip.endDate, dayNumber: null } : { date: null, dayNumber: null };

  const arrivalDay = [...trip.planItems]
    .filter((day) => day.stopId === leg.toStopId && isIsoDate(day.date))
    .sort((left, right) => left.dayNumber - right.dayNumber)[0];
  if (arrivalDay) return { date: arrivalDay.date, dayNumber: arrivalDay.dayNumber };

  const stop = trip.stops.find((candidate) => candidate.id === leg.toStopId);
  return {
    date: isIsoDate(stop?.arrivalDate) ? stop.arrivalDate : null,
    dayNumber: null,
  };
}

export function itineraryTransportAgendaStatus(leg: TripLeg, booking: TripBooking | null): ItineraryTransportAgendaStatus {
  if (booking?.type === "transport") return "booked";
  const duration = leg.doorToDoorMinutes ?? leg.durationMinutes;
  if (leg.mode === "unknown" || typeof duration !== "number" || leg.scheduleNeedsChecking || leg.confidence === "low" || leg.confidence === "unknown") return "confirm";
  return "available";
}

export function transportJourneyKnowledge(leg: TripLeg): TransportJourneyKnowledge {
  const duration = leg.doorToDoorMinutes ?? leg.durationMinutes;
  if (leg.mode === "unknown" && typeof duration !== "number") return "unknown";
  if (leg.mode === "unknown"
    || typeof duration !== "number"
    || leg.scheduleNeedsChecking
    || leg.confidence === "low"
    || leg.confidence === "unknown") return "partial";
  return "known";
}

function hasUsableJourneyDuration(leg: TripLeg) {
  const duration = leg.doorToDoorMinutes ?? leg.durationMinutes;
  return typeof duration === "number" && Number.isFinite(duration) && duration > 0;
}

function isScheduledTransport(leg: TripLeg) {
  if (["train", "flight", "ferry"].includes(leg.mode)) return true;
  if (leg.mode === "road") {
    return /\b(bus|coach|shuttle)\b/i.test(`${leg.provider ?? ""} ${(leg.segments ?? []).map((segment) => segment.provider ?? "").join(" ")}`);
  }
  return leg.mode === "mixed";
}

/** Traveller-facing status projection. Confidence and provenance remain on the canonical leg. */
export function transportPresentationState(leg: TripLeg, booked = false): TransportPresentationState {
  if (booked) return "booked";
  if (leg.mode === "unknown" || !hasUsableJourneyDuration(leg)) return "needs-checking";
  if (isScheduledTransport(leg) && (leg.scheduleNeedsChecking || leg.confidence === "low" || leg.confidence === "unknown")) {
    return leg.mode === "train" || leg.mode === "flight" ? "check-timetable" : "check-service";
  }
  return "planning-estimate";
}

export function transportPresentationCounts(items: readonly Pick<ItineraryTransportAgendaLeg, "leg" | "booking">[]) {
  const counts = new Map<TransportPresentationState, number>();
  for (const item of items) {
    const state = transportPresentationState(item.leg, item.booking?.type === "transport");
    counts.set(state, (counts.get(state) ?? 0) + 1);
  }
  return [
    { state: "journeys" as const, count: items.length },
    ...(["booked", "planning-estimate", "check-timetable", "check-service", "needs-checking"] as const)
      .map((state) => ({ state, count: counts.get(state) ?? 0 }))
      .filter(({ count }) => count > 0),
  ];
}

/**
 * Read-only itinerary projection. Canonical trip legs, endpoints and bookings
 * remain the sole durable owners of transport state.
 */
export function itineraryTransportAgenda(trip: EasyTTrip): ItineraryTransportAgendaLeg[] {
  return trip.legs.flatMap((recommendedLeg) => {
    const leg = effectiveTripLeg(trip, recommendedLeg);
    const from = routeEndpointForLeg(trip, leg, "from");
    const to = routeEndpointForLeg(trip, leg, "to");
    if (!from || !to || from.id === to.id) return [];

    const fromStop = trip.stops.find((stop) => stop.id === leg.fromStopId);
    const toStop = trip.stops.find((stop) => stop.id === leg.toStopId);
    const booking = transportBookingForLeg(trip, leg, fromStop, toStop) ?? null;
    return [{
      leg,
      from,
      to,
      ...itineraryDateForLeg(trip, leg, to),
      booking,
      status: itineraryTransportAgendaStatus(leg, booking),
    }];
  });
}
