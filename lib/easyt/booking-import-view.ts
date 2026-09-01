import { maskBookingReference, type BookingCandidate, type BookingCandidateConfidence, type BookingCandidateSource, type BookingCandidateStatus, type BookingCandidateType } from "./booking-candidate";
import { matchBookingCandidateToTrips, type BookingTripMatchResult } from "./booking-candidate-trip";
import type { EasyTTrip } from "./trip";

export type BookingImportTripView = { id: string; title: string; startDate: string; endDate: string };
export type BookingImportCalendarView = { available: boolean; connected: boolean; connectHref?: string };

export type BookingCandidateView = {
  id: string;
  source: BookingCandidateSource;
  sources: BookingCandidateSource[];
  type: BookingCandidateType;
  title: string;
  provider: string | null;
  startDate: string | null;
  endDate: string | null;
  location: string | null;
  referenceMasked: string | null;
  confidence: BookingCandidateConfidence;
  status: BookingCandidateStatus;
  canonicalTripId: string | null;
  match: BookingTripMatchResult;
};

export type BookingImportPayload = {
  configured: boolean;
  calendar?: BookingImportCalendarView;
  alias: { hint: string; createdAt: string; updatedAt: string } | null;
  candidates: BookingCandidateView[];
  trips: BookingImportTripView[];
};

export function bookingCandidateView(candidate: BookingCandidate, trips: EasyTTrip[]): BookingCandidateView {
  return {
    id: candidate.id,
    source: candidate.source,
    sources: candidate.sources,
    type: candidate.type,
    title: candidate.title,
    provider: candidate.provider,
    startDate: candidate.startDate,
    endDate: candidate.endDate,
    location: candidate.location,
    referenceMasked: maskBookingReference(candidate.reference),
    confidence: candidate.confidence,
    status: candidate.status,
    canonicalTripId: candidate.canonicalTripId,
    match: matchBookingCandidateToTrips(candidate, trips),
  };
}
