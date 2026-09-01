import { stayBookingForStop } from "./accommodation.ts";
import type { BookingCandidateConfidence, BookingCandidateSource } from "./booking-candidate.ts";
import type { BookingCandidateView } from "./booking-import-view.ts";
import type { EasyTTrip, TripBooking, TripStop } from "./trip.ts";
import { stableStopDateRange } from "./trip-facts.ts";

export type DestinationAccommodationCandidate = BookingCandidateView;

type DestinationStayFacts = {
  stopId: string;
  destination: string;
  checkIn: string | null;
  checkOut: string | null;
  nights: number;
  travellers: number;
};

export type DestinationStayState =
  | (DestinationStayFacts & { status: "needs_stay" })
  | (DestinationStayFacts & { status: "candidate_found"; candidates: DestinationAccommodationCandidate[] })
  | (DestinationStayFacts & { status: "stay_sorted"; booking: TripBooking });

function candidateMatchesStop(candidate: DestinationAccommodationCandidate, tripId: string, stopId: string) {
  if (candidate.status !== "pending") return false;
  const match = candidate.match.matches.find((item) => item.tripId === tripId);
  return Boolean(match && match.score >= 7 && match.stopId === stopId);
}

/**
 * One non-persisted presentation selector for every overnight-stop surface.
 * Canonical bookings always win; candidates can only propose the next action.
 */
export function destinationStayState(
  trip: EasyTTrip,
  stop: TripStop,
  candidates: DestinationAccommodationCandidate[] = [],
): DestinationStayState {
  const range = stableStopDateRange(stop, trip);
  const facts: DestinationStayFacts = {
    stopId: stop.id,
    destination: stop.name,
    checkIn: range?.checkIn ?? null,
    checkOut: range?.checkOut ?? null,
    nights: Math.max(0, stop.nights ?? 0),
    travellers: Math.max(1, trip.travellers),
  };
  const booking = stayBookingForStop(trip, stop);
  if (booking) return { ...facts, status: "stay_sorted", booking };
  const active = candidates.filter((candidate) => candidateMatchesStop(candidate, trip.id, stop.id));
  if (active.length) return { ...facts, status: "candidate_found", candidates: active };
  return { ...facts, status: "needs_stay" };
}

export type BookingCandidateLifecycle = "active" | "confirmed" | "dismissed" | "stale";

/** Staleness is relative to the current owned trips, not an invented retention period. */
export function bookingCandidateLifecycle(candidate: BookingCandidateView): BookingCandidateLifecycle {
  if (candidate.status === "added") return "confirmed";
  if (candidate.status === "ignored") return "dismissed";
  if (candidate.match.matches.some((match) => match.score >= 4)) return "active";
  return "stale";
}

export function destinationStayProvenance(booking: TripBooking) {
  const sources = new Set(booking.importDetails?.sources ?? []);
  if (sources.has("calendar") && sources.has("forwarded_email")) return "Imported from Google Calendar and a forwarded confirmation";
  if (sources.has("calendar")) return "Imported from Google Calendar";
  if (sources.has("forwarded_email")) return "Imported from a forwarded confirmation";
  return "Added manually";
}

export function maskCanonicalBookingReference(reference: string | null) {
  const value = reference?.trim() ?? "";
  if (!value) return null;
  if (value.length <= 4) return `••••${value.slice(-1)}`;
  return `••••${value.slice(-4)}`;
}

export function candidateSourceLabel(sources: BookingCandidateSource[]) {
  const unique = new Set(sources);
  if (unique.has("calendar") && unique.has("forwarded_email")) return "Found in Google Calendar and a forwarded confirmation";
  if (unique.has("calendar")) return "Found in Google Calendar";
  return "Found from a confirmation you forwarded";
}

export type DestinationCandidateAnalytics = {
  source: BookingCandidateSource | "multiple";
  booking_type: "accommodation";
  confidence: BookingCandidateConfidence;
  surface: "itinerary";
};

export function destinationCandidateAnalytics(candidate: DestinationAccommodationCandidate): DestinationCandidateAnalytics {
  return {
    source: candidate.sources.length > 1 ? "multiple" : candidate.sources[0] ?? "forwarded_email",
    booking_type: "accommodation",
    confidence: candidate.confidence,
    surface: "itinerary",
  };
}
