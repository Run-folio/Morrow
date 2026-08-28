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
import { safeTripPersistenceFailure } from "@/lib/easyt/trip-persistence-error";

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
        { error: "Invalid EasyT trip document.", category: "validation" },
        { status: 400 },
      );
    return NextResponse.json({ trip: await saveTripForOwner(owner.id, body) });
  } catch (error) {
    if (error instanceof EasyTTripSaveConflictError) {
      return NextResponse.json(
        { error: error.message, category: "conflict", trip: error.canonicalTrip, conflictReason: error.reason },
        { status: 409 },
      );
    }
    const failure = safeTripPersistenceFailure(error);
    console.error("Trip update failed.", { category: failure.category, errorName: error instanceof Error ? error.name : "UnknownError", errorCode: (error as { code?: unknown } | null)?.code });
    return NextResponse.json({ error: failure.error, category: failure.category }, { status: failure.status });
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
      const trip = await archiveTripForOwner(owner.id, tripId);
      return trip ? NextResponse.json({ ok: true, trip }) : NextResponse.json({ error: "Trip not found." }, { status: 404 });
    }
    if (body.action === "restore") {
      const trip = await restoreTripForOwner(owner.id, tripId);
      return trip ? NextResponse.json({ ok: true, trip }) : NextResponse.json({ error: "Trip not found." }, { status: 404 });
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
