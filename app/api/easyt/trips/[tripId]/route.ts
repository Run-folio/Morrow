import { NextResponse } from "next/server";

import { requireEasyTOwner } from "@/lib/easyt/owner";
import {
  archiveTripForOwner,
  deleteTripForOwner,
  duplicateTripForOwner,
  getTripForOwner,
  restoreTripForOwner,
  saveTripForOwner,
} from "@/lib/easyt/repository";
import { isEasyTTrip } from "@/lib/easyt/trip";
import { EasyTTripSaveConflictError } from "@/lib/easyt/trip-continuity";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ tripId: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    const owner = await requireEasyTOwner();
    const { tripId } = await context.params;
    const trip = await getTripForOwner(owner.id, tripId);
    return trip
      ? NextResponse.json({ trip })
      : NextResponse.json({ error: "Trip not found." }, { status: 404 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to load trip.";
    return NextResponse.json(
      { error: message },
      { status: message === "Unauthorized" ? 401 : 503 },
    );
  }
}

export async function PUT(request: Request, context: RouteContext) {
  try {
    const owner = await requireEasyTOwner();
    const { tripId } = await context.params;
    const body: unknown = await request.json();
    if (!isEasyTTrip(body) || body.id !== tripId || !body.ownerId)
      return NextResponse.json(
        { error: "Invalid EasyT trip document." },
        { status: 400 },
      );
    return NextResponse.json({ trip: await saveTripForOwner(owner.id, body) });
  } catch (error) {
    if (error instanceof EasyTTripSaveConflictError) {
      return NextResponse.json(
        { error: error.message, trip: error.canonicalTrip, conflictReason: error.reason },
        { status: 409 },
      );
    }
    const message =
      error instanceof Error ? error.message : "Unable to save trip.";
    return NextResponse.json(
      { error: message },
      { status: message === "Unauthorized" ? 401 : message === "Trip ownership mismatch." ? 403 : message === "Trip not found." ? 404 : 500 },
    );
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const owner = await requireEasyTOwner();
    const { tripId } = await context.params;
    const body = (await request.json()) as {
      action?: "archive" | "restore" | "duplicate";
    };

    if (body.action === "archive") {
      await archiveTripForOwner(owner.id, tripId);
      return NextResponse.json({ ok: true });
    }
    if (body.action === "restore") {
      await restoreTripForOwner(owner.id, tripId);
      return NextResponse.json({ ok: true });
    }
    if (body.action === "duplicate") {
      const trip = await duplicateTripForOwner(owner.id, tripId);
      return trip
        ? NextResponse.json({ trip })
        : NextResponse.json({ error: "Trip not found." }, { status: 404 });
    }
    return NextResponse.json(
      { error: "Unsupported trip action." },
      { status: 400 },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to update trip.";
    return NextResponse.json(
      { error: message },
      { status: message === "Unauthorized" ? 401 : 500 },
    );
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const owner = await requireEasyTOwner();
    const { tripId } = await context.params;
    await deleteTripForOwner(owner.id, tripId);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to delete trip.";
    return NextResponse.json(
      { error: message },
      { status: message === "Unauthorized" ? 401 : 500 },
    );
  }
}
