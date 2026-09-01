import type { BookingCandidate, BookingCandidateType } from "./booking-candidate";
import type { EasyTTrip, TripBooking, TripStop } from "./trip";
import { stayBookingForStop } from "./accommodation.ts";

export type BookingTripMatch = {
  tripId: string;
  tripTitle: string;
  score: number;
  stopId: string | null;
  stopName: string | null;
};

export type BookingTripMatchResult = {
  status: "strong" | "ambiguous" | "none";
  suggestedTripId: string | null;
  suggestedStopId: string | null;
  matches: BookingTripMatch[];
};

const normalized = (value: string | null | undefined) => (value ?? "")
  .toLowerCase()
  .normalize("NFKD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/[^a-z0-9]+/g, " ")
  .trim();

const includesPlace = (haystack: string, needle: string) => Boolean(needle.length >= 3 && (` ${haystack} `).includes(` ${needle} `));

function candidateWithinTrip(candidate: BookingCandidate, trip: EasyTTrip) {
  if (!candidate.startDate) return false;
  return candidate.startDate >= trip.startDate && candidate.startDate <= trip.endDate
    && (!candidate.endDate || (candidate.endDate >= trip.startDate && candidate.endDate <= trip.endDate));
}

export function bookingCandidateStopForTrip(candidate: BookingCandidate, trip: EasyTTrip): TripStop | null {
  const location = normalized(candidate.location);
  const dated = candidate.startDate ? trip.stops.find((stop) => {
    if (!stop.arrivalDate || !stop.departureDate) return false;
    return candidate.startDate! >= stop.arrivalDate && candidate.startDate! <= stop.departureDate
      && (!candidate.endDate || candidate.endDate <= stop.departureDate);
  }) : null;
  const placed = location ? trip.stops.find((stop) => {
    const name = normalized(stop.name);
    const country = normalized(stop.country);
    return includesPlace(location, name) || includesPlace(name, location) || includesPlace(location, country);
  }) : null;
  if (dated && placed && dated.id === placed.id) return dated;
  return placed ?? dated ?? null;
}

function scoreTrip(candidate: BookingCandidate, trip: EasyTTrip): BookingTripMatch {
  const location = normalized(candidate.location);
  const tripText = normalized(`${trip.title} ${trip.brief.origin} ${trip.stops.map((stop) => `${stop.name} ${stop.country}`).join(" ")}`);
  const stop = bookingCandidateStopForTrip(candidate, trip);
  let score = 0;
  if (candidateWithinTrip(candidate, trip)) score += 4;
  if (candidate.endDate && candidate.endDate >= trip.startDate && candidate.endDate <= trip.endDate) score += 1;
  if (location && (includesPlace(tripText, location) || trip.stops.some((item) => includesPlace(location, normalized(item.name))))) score += 4;
  if (stop && candidate.type === "accommodation") score += 3;
  if (stop && candidate.type !== "accommodation") score += 1;
  return { tripId: trip.id, tripTitle: trip.title, score, stopId: stop?.id ?? null, stopName: stop?.name ?? null };
}

export function matchBookingCandidateToTrips(candidate: BookingCandidate, trips: EasyTTrip[]): BookingTripMatchResult {
  const matches = trips.map((trip) => scoreTrip(candidate, trip)).sort((left, right) => right.score - left.score || left.tripTitle.localeCompare(right.tripTitle));
  const strong = matches.filter((match) => match.score >= 7);
  if (strong.length === 1) return {
    status: "strong",
    suggestedTripId: strong[0].tripId,
    suggestedStopId: strong[0].stopId,
    matches,
  };
  if (strong.length > 1) return { status: "ambiguous", suggestedTripId: null, suggestedStopId: null, matches };
  return { status: "none", suggestedTripId: null, suggestedStopId: null, matches };
}

function canonicalType(type: BookingCandidateType): TripBooking["type"] {
  if (type === "accommodation") return "stay";
  if (type === "flight" || type === "ground_transport" || type === "car_rental") return "transport";
  if (type === "activity") return "reservation";
  return "other";
}

function canonicalMaskedReference(reference: string | null) {
  const value = reference?.trim() ?? "";
  if (!value) return null;
  if (value.length <= 4) return `••••${value.slice(-1)}`;
  return `••••${value.slice(-4)}`;
}

export type ConfirmBookingCandidateResult = {
  trip: EasyTTrip;
  bookingId: string;
  outcome: "created" | "enriched";
};

/** Explicit candidate → canonical booking mapping. Ingestion never calls this. */
export function confirmBookingCandidateOnTrip(candidate: BookingCandidate, trip: EasyTTrip, preferredStopId?: string): ConfirmBookingCandidateResult {
  const bookings = trip.brief.bookings ?? [];
  const matchedStop = bookingCandidateStopForTrip(candidate, trip);
  if (preferredStopId && matchedStop?.id !== preferredStopId) throw new Error("Booking candidate does not match the selected destination.");
  const stop = preferredStopId ? trip.stops.find((item) => item.id === preferredStopId) ?? null : matchedStop;
  const importedExisting = bookings.find((booking) => booking.id === candidate.canonicalBookingId
    || booking.importDetails?.candidateId === candidate.id
    || booking.importDetails?.fingerprint === candidate.fingerprint);
  const stopExisting = candidate.type === "accommodation" && stop ? stayBookingForStop(trip, stop) : undefined;
  const existing = importedExisting ?? stopExisting;
  const bookingId = candidate.type === "accommodation" && stop ? `stay-${stop.id}` : existing?.id ?? `import-${candidate.id}`;
  const booking: TripBooking = {
    ...existing,
    id: bookingId,
    type: canonicalType(candidate.type),
    title: candidate.title || existing?.title || "Travel booking",
    date: stop?.arrivalDate ?? candidate.startDate ?? existing?.date ?? null,
    confirmation: canonicalMaskedReference(candidate.reference) ?? existing?.confirmation ?? null,
    url: candidate.confirmationUrl ?? existing?.url ?? null,
    importDetails: {
      candidateId: candidate.id,
      fingerprint: candidate.fingerprint,
      sources: [...new Set([...(existing?.importDetails?.sources ?? []), ...candidate.sources])],
      provider: candidate.provider ?? existing?.importDetails?.provider ?? null,
      endDate: stop?.departureDate ?? candidate.endDate ?? existing?.importDetails?.endDate ?? null,
      location: candidate.location ?? existing?.importDetails?.location ?? null,
      confidence: candidate.confidence,
    },
  };
  return {
    trip: {
      ...trip,
      brief: { ...trip.brief, bookings: [...bookings.filter((item) => item.id !== bookingId && item.id !== existing?.id), booking] },
    },
    bookingId,
    outcome: existing ? "enriched" : "created",
  };
}
