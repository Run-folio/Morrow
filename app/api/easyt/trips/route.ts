import { NextResponse } from "next/server";

import { requireEasyTOwner } from "@/lib/easyt/owner";
import { listTripsForOwner, promoteTripForOwner, saveTripForOwner } from "@/lib/easyt/repository";
import { isEasyTTrip } from "@/lib/easyt/trip";
import { EasyTTripSaveConflictError } from "@/lib/easyt/trip-continuity";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const owner = await requireEasyTOwner();
    return NextResponse.json({ trips: await listTripsForOwner(owner.id) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load trips.";
    return NextResponse.json({ error: message }, { status: message === "Unauthorized" ? 401 : 503 });
  }
}

export async function POST(request: Request) {
  try {
    const owner = await requireEasyTOwner();
    const body: unknown = await request.json();
    if (!isEasyTTrip(body)) return NextResponse.json({ error: "Invalid EasyT trip document." }, { status: 400 });
    // Compatibility for an already-open legacy client: local documents sent
    // to the old save URL still enter the same insert-only promotion boundary.
    if (!body.ownerId) {
      const result = await promoteTripForOwner(owner.id, body);
      return result.outcome === "conflict"
        ? NextResponse.json({ ...result, error: "A cloud copy already exists. This device did not replace it." }, { status: 409 })
        : NextResponse.json({ trip: result.trip });
    }
    try {
      return NextResponse.json({ trip: await saveTripForOwner(owner.id, body) });
    } catch (error) {
      // Old browser bundles used this collection route for both create and
      // update. A truly missing owned row may still enter the same insert-only
      // recovery boundary; conflicts and deleted rows never reach this branch.
      if (error instanceof Error && error.message === "Trip not found.") {
        const result = await promoteTripForOwner(owner.id, body);
        return result.outcome === "conflict"
          ? NextResponse.json({ ...result, error: "A cloud copy already exists. This device did not replace it." }, { status: 409 })
          : NextResponse.json({ trip: result.trip });
      }
      throw error;
    }
  } catch (error) {
    if (error instanceof EasyTTripSaveConflictError) {
      return NextResponse.json(
        { error: error.message, trip: error.canonicalTrip, conflictReason: error.reason },
        { status: 409 },
      );
    }
    const message = error instanceof Error ? error.message : "Unable to save trip.";
    return NextResponse.json({ error: message }, { status: message === "Unauthorized" ? 401 : message === "Trip ownership mismatch." ? 403 : message === "Trip not found." ? 404 : 500 });
  }
}
