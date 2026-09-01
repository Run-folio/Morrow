import { NextResponse } from "next/server";

import { createPrivateBookingImportAlias, getPrivateBookingImportAliasState, listBookingCandidatesForOwner } from "@/lib/easyt/booking-candidate-repository";
import { bookingCandidateView } from "@/lib/easyt/booking-import-view";
import { requireEasyTOwner } from "@/lib/easyt/owner";
import { listTripsForOwner } from "@/lib/easyt/repository";

export const dynamic = "force-dynamic";

const statusFor = (message: string) => message === "Unauthorized" ? 401 : 503;

export async function GET(request: Request) {
  try {
    const owner = await requireEasyTOwner();
    const [alias, candidates, trips] = await Promise.all([
      getPrivateBookingImportAliasState(owner.id),
      listBookingCandidatesForOwner(owner.id),
      listTripsForOwner(owner.id),
    ]);
    const url = new URL(request.url);
    const requestedTripId = url.searchParams.get("tripId");
    const requestedStopId = url.searchParams.get("stopId");
    const scopedTrip = requestedTripId ? trips.find((trip) => trip.id === requestedTripId) : null;
    if (requestedTripId && !scopedTrip) return NextResponse.json({ error: "Trip not found." }, { status: 404 });
    if (requestedStopId && !scopedTrip?.stops.some((stop) => stop.id === requestedStopId)) {
      return NextResponse.json({ error: "Destination not found." }, { status: 404 });
    }
    const views = candidates.map((candidate) => bookingCandidateView(candidate, trips));
    const visibleCandidates = scopedTrip ? views.filter((candidate) => candidate.type === "accommodation"
      && candidate.status === "pending"
      && candidate.match.matches.some((match) => match.tripId === scopedTrip.id
        && match.score >= 7
        && (!requestedStopId || match.stopId === requestedStopId))) : views;
    return NextResponse.json({
      configured: process.env.BOOKING_IMPORT_ENABLED === "true" && Boolean(
        process.env.BOOKING_IMPORT_RECEIVING_DOMAIN
          && process.env.RESEND_INBOUND_WEBHOOK_SECRET
          && process.env.RESEND_API_KEY,
      ),
      calendar: { available: false, connected: false },
      alias,
      candidates: visibleCandidates,
      trips: (scopedTrip ? [scopedTrip] : trips).map((trip) => ({ id: trip.id, title: trip.title, startDate: trip.startDate, endDate: trip.endDate })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load imported bookings.";
    return NextResponse.json({ error: message === "Unauthorized" ? message : "Unable to load imported bookings." }, { status: statusFor(message) });
  }
}

export async function POST() {
  try {
    const owner = await requireEasyTOwner();
    const domain = process.env.BOOKING_IMPORT_RECEIVING_DOMAIN?.trim().toLowerCase();
    if (
      process.env.BOOKING_IMPORT_ENABLED !== "true"
      || !domain
      || !process.env.RESEND_INBOUND_WEBHOOK_SECRET
      || !process.env.RESEND_API_KEY
    ) {
      return NextResponse.json({ error: "Forwarded booking import is not configured yet." }, { status: 503 });
    }
    const { token, hint } = await createPrivateBookingImportAlias(owner.id);
    return NextResponse.json({ address: `bookings+${token}@${domain}`, hint });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create a forwarding address.";
    return NextResponse.json({ error: message === "Unauthorized" ? message : "Unable to create a forwarding address." }, { status: statusFor(message) });
  }
}
