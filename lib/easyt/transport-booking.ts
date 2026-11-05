import {SPREADSHEET_IMPORT_PARSER_VERSION} from "./spreadsheet-import.ts";
import type { CanonicalRouteEndpoint, EasyTTrip, TripBooking, TripLeg, TripStop } from "./trip.ts";
import { effectiveTripLeg } from "./transport-mode-choice.ts";
import { routeEndpointForLeg } from "./trip-legs.ts";

export type TravellerTransportDetails = { confirmation?: string; url?: string; note?: string };

const tidy = (value: string) => value.trim().replace(/\s+/g, " ");
const comparable = (value: string) => tidy(value).normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase();

function currentBinding(trip: EasyTTrip, sourceLeg: TripLeg) {
  const leg = effectiveTripLeg(trip, sourceLeg);
  const from = routeEndpointForLeg(trip, leg, "from");
  const to = routeEndpointForLeg(trip, leg, "to");
  if (!from || !to) return null;
  return {
    version: 1 as const,
    legId: leg.id,
    mode: leg.mode,
    fromEndpointId: from.id,
    toEndpointId: to.id,
    fromLabel: from.name,
    toLabel: to.name,
  };
}

function bindingMatches(a: NonNullable<TripBooking["transportLegBinding"]>, b: NonNullable<TripBooking["transportLegBinding"]>) {
  return a.version === b.version && a.legId === b.legId && a.mode === b.mode
    && a.fromEndpointId === b.fromEndpointId && a.toEndpointId === b.toEndpointId
    && comparable(a.fromLabel) === comparable(b.fromLabel) && comparable(a.toLabel) === comparable(b.toLabel);
}

export function travellerTransportBookingForLeg(trip: EasyTTrip, leg: TripLeg) {
  const expected = currentBinding(trip, leg);
  if (!expected) return null;
  return (trip.brief.bookings ?? []).find((booking) => booking.type === "transport"
    && booking.transportLegBinding && bindingMatches(booking.transportLegBinding, expected)) ?? null;
}

export function travellerTransportBookingMismatchForLeg(trip: EasyTTrip, leg: TripLeg) {
  return (trip.brief.bookings ?? []).find((booking) => booking.type === "transport"
    && booking.transportLegBinding?.legId === leg.id
    && !travellerTransportBookingForLeg(trip, leg)) ?? null;
}

export function unmatchedTravellerTransportBookings(trip: EasyTTrip) {
  return (trip.brief.bookings ?? []).filter((booking) => booking.type === "transport" && booking.transportLegBinding
    && !trip.legs.some((leg) => travellerTransportBookingForLeg(trip, leg)?.id === booking.id
      || travellerTransportBookingMismatchForLeg(trip, leg)?.id === booking.id));
}

function safeHttpsUrl(value: string | undefined) {
  const candidate = value?.trim();
  if (!candidate) return null;
  try {
    const url = new URL(candidate);
    return url.protocol === "https:" && !url.username && !url.password ? url.toString() : null;
  } catch { return null; }
}

function detailsOn(booking: TripBooking, details: TravellerTransportDetails): TripBooking {
  const confirmation = details.confirmation === undefined ? booking.confirmation : tidy(details.confirmation);
  const note = details.note === undefined ? booking.notes?.[0] ?? "" : tidy(details.note);
  return {
    ...booking,
    confirmation: confirmation || null,
    url: details.url === undefined ? booking.url : safeHttpsUrl(details.url),
    notes: details.note === undefined ? booking.notes : note ? [note] : [],
  };
}

export function markTransportLegBooked(trip: EasyTTrip, legId: string, details: TravellerTransportDetails = {}) {
  const leg = trip.legs.find((candidate) => candidate.id === legId);
  const binding = leg ? currentBinding(trip, leg) : null;
  if (!leg || !binding || !isPassengerServiceLeg(leg)) return trip;
  const existing = travellerTransportBookingForLeg(trip, leg);
  const conflicting = travellerTransportBookingMismatchForLeg(trip, leg);
  if (conflicting) return trip;
  const booking: TripBooking = existing
    ? { ...detailsOn(existing, details), travellerMarkedBooked: true }
    : detailsOn({
        id: `transport-${leg.id}`,
        type: "transport",
        title: `${binding.fromLabel} to ${binding.toLabel}`,
        date: null,
        confirmation: null,
        url: null,
        transportDetails: { mode: leg.mode === "flight" || leg.mode === "train" || leg.mode === "road" || leg.mode === "ferry" ? leg.mode : null, from: binding.fromLabel, to: binding.toLabel },
        transportLegBinding: binding,
        travellerMarkedBooked: true,
      }, details);
  const bookings = trip.brief.bookings ?? [];
  return { ...trip, brief: { ...trip.brief, bookings: existing ? bookings.map((item) => item.id === existing.id ? booking : item) : [...bookings, booking] } };
}

export function updateTravellerTransportBookingDetails(trip: EasyTTrip, legId: string, details: TravellerTransportDetails) {
  const leg = trip.legs.find((candidate) => candidate.id === legId);
  const booking = leg ? travellerTransportBookingForLeg(trip, leg) : null;
  if (!booking) return trip;
  return { ...trip, brief: { ...trip.brief, bookings: trip.brief.bookings!.map((item) => item.id === booking.id ? detailsOn(item, details) : item) } };
}

export function unmarkTransportBooking(trip: EasyTTrip, bookingId: string) {
  const booking = trip.brief.bookings?.find((item) => item.id === bookingId && item.transportLegBinding);
  if (!booking || booking.travellerMarkedBooked === false) return trip;
  return { ...trip, brief: { ...trip.brief, bookings: trip.brief.bookings!.map((item) => item.id === booking.id ? { ...item, travellerMarkedBooked: false } : item) } };
}

export function transportBookingMarkedByTraveller(booking: TripBooking | null | undefined) {
  return Boolean(booking?.transportLegBinding && booking.travellerMarkedBooked !== false);
}

export function isPassengerServiceLeg(leg: TripLeg) {
  if (["flight", "train", "ferry"].includes(leg.mode)) return true;
  const evidence = `${leg.provider ?? ""} ${JSON.stringify(leg.routeMetadata)} ${(leg.segments ?? []).map((segment) => `${segment.mode} ${segment.provider ?? ""}`).join(" ")}`;
  return leg.mode === "road" && /\b(bus|coach|shuttle)\b/i.test(evidence)
    || leg.mode === "mixed" && (leg.segments ?? []).some((segment) => ["flight", "train", "ferry"].includes(segment.mode)
      || segment.mode === "road" && /\b(bus|coach|shuttle)\b/i.test(segment.provider ?? ""));
}

export function sameTransportBookingBinding(booking: TripBooking, leg: TripLeg, from: CanonicalRouteEndpoint, to: CanonicalRouteEndpoint) {
  const binding = booking.transportLegBinding;
  return Boolean(binding && bindingMatches(binding, {
    version: 1,
    legId: leg.id,
    mode: leg.mode,
    fromEndpointId: from.id,
    toEndpointId: to.id,
    fromLabel: from.name,
    toLabel: to.name,
  }));
}

const normalise = (value: string) => value.trim().toLocaleLowerCase();

export function transportBookingForLeg(trip: EasyTTrip, leg: TripLeg, from?: Pick<TripStop, "name">, to?: Pick<TripStop, "name">) {
  const manual = travellerTransportBookingForLeg(trip, leg);
  if (manual) return manual.travellerMarkedBooked === false ? undefined : manual;
  if (trip.brief.capturedIntent?.parserVersion === SPREADSHEET_IMPORT_PARSER_VERSION) {
    // Spreadsheet bookings are attached to a dated, canonical leg at import.
    // Matching their free-text endpoint names again would attach an unmatched
    // booking to a different occurrence or date after review.
    const importedBookingId = leg.routeMetadata.importedBookingId;
    return (trip.brief.bookings ?? []).find((booking) => booking.type === "transport"
      && !booking.transportLegBinding
      && (booking.id === leg.id
        || booking.id === `transport-${leg.id}`
        || (typeof importedBookingId === "string" && booking.id === importedBookingId)));
  }
  const fromName = normalise(from?.name ?? "");
  const toName = normalise(to?.name ?? "");
  return (trip.brief.bookings ?? []).find((booking) => {
    if (booking.type !== "transport" || booking.transportLegBinding) return false;
    if (booking.id === leg.id || booking.id === `transport-${leg.id}`) return true;
    const explicitFrom = normalise(booking.transportDetails?.from ?? "");
    const explicitTo = normalise(booking.transportDetails?.to ?? "");
    if (explicitFrom || explicitTo) return explicitFrom === fromName && explicitTo === toName;
    const title = normalise(booking.title);
    const fromIndex = title.indexOf(fromName);
    const toIndex = title.indexOf(toName, fromIndex + fromName.length);
    return Boolean(fromName && toName && fromName !== toName && fromIndex >= 0 && toIndex > fromIndex);
  });
}
