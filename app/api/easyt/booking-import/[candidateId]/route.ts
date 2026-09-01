import { NextResponse } from "next/server";

import { getBookingCandidateForOwner, setBookingCandidateStatus } from "@/lib/easyt/booking-candidate-repository";
import { bookingCandidateStopForTrip, confirmBookingCandidateOnTrip } from "@/lib/easyt/booking-candidate-trip";
import { requireEasyTOwner } from "@/lib/easyt/owner";
import { getTripForOwner, saveTripForOwner } from "@/lib/easyt/repository";
import { EasyTTripSaveConflictError } from "@/lib/easyt/trip-continuity";

export const dynamic = "force-dynamic";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function PATCH(_request: Request, context: { params: Promise<{ candidateId: string }> }) {
  try {
    const owner = await requireEasyTOwner();
    const { candidateId } = await context.params;
    if (!uuidPattern.test(candidateId)) return NextResponse.json({ error: "Booking suggestion not found." }, { status: 404 });
    const candidate = await getBookingCandidateForOwner(owner.id, candidateId);
    if (!candidate) return NextResponse.json({ error: "Booking suggestion not found." }, { status: 404 });
    const updated = await setBookingCandidateStatus({ ownerId: owner.id, candidate, status: "ignored" });
    return NextResponse.json({ ok: Boolean(updated) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to dismiss booking suggestion.";
    return NextResponse.json({ error: message === "Unauthorized" ? message : "Unable to dismiss booking suggestion." }, { status: message === "Unauthorized" ? 401 : 503 });
  }
}

export async function POST(request: Request, context: { params: Promise<{ candidateId: string }> }) {
  try {
    const owner = await requireEasyTOwner();
    const { candidateId } = await context.params;
    if (!uuidPattern.test(candidateId)) return NextResponse.json({ error: "Booking suggestion not found." }, { status: 404 });
    const body = (await request.json()) as { tripId?: unknown; stopId?: unknown };
    if (typeof body.tripId !== "string" || !body.tripId || body.tripId.length > 200) {
      return NextResponse.json({ error: "Choose a trip before adding this booking." }, { status: 400 });
    }
    const [candidate, trip] = await Promise.all([
      getBookingCandidateForOwner(owner.id, candidateId),
      getTripForOwner(owner.id, body.tripId),
    ]);
    if (!candidate || !trip) return NextResponse.json({ error: "Booking suggestion or trip not found." }, { status: 404 });
    if (candidate.status !== "pending") return NextResponse.json({ error: "This booking suggestion has already been reviewed." }, { status: 409 });
    if (candidate.canonicalTripId && candidate.canonicalTripId !== trip.id) {
      return NextResponse.json({ error: "This update belongs to the trip where the booking was first added." }, { status: 409 });
    }
    const stopId = typeof body.stopId === "string" && body.stopId.length <= 200 ? body.stopId : undefined;
    if (stopId && bookingCandidateStopForTrip(candidate, trip)?.id !== stopId) {
      return NextResponse.json({ error: "This booking suggestion no longer matches the selected destination." }, { status: 409 });
    }
    const confirmation = confirmBookingCandidateOnTrip(candidate, trip, stopId);
    const savedTrip = await saveTripForOwner(owner.id, confirmation.trip);
    await setBookingCandidateStatus({
      ownerId: owner.id,
      candidate,
      status: "added",
      canonicalTripId: trip.id,
      canonicalBookingId: confirmation.bookingId,
    });
    return NextResponse.json({ ok: true, outcome: confirmation.outcome, tripId: trip.id, trip: savedTrip });
  } catch (error) {
    if (error instanceof EasyTTripSaveConflictError) {
      return NextResponse.json({ error: "This trip changed on another device. Refresh before adding the booking." }, { status: 409 });
    }
    const message = error instanceof Error ? error.message : "Unable to add booking.";
    return NextResponse.json({ error: message === "Unauthorized" ? message : "Unable to add booking." }, { status: message === "Unauthorized" ? 401 : 503 });
  }
}
