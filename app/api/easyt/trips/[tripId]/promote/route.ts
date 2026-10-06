import { NextResponse } from "next/server";

import { requireEasyTOwner } from "@/lib/easyt/owner";
import { promoteTripForOwner } from "@/lib/easyt/repository";
import { readTripDocument, TripDocumentReadError } from "@/lib/easyt/trip-document";
import { safeTripPersistenceFailure } from "@/lib/easyt/trip-persistence-error";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ tripId: string }> };

export async function POST(request: Request, context: RouteContext) {
  try {
    const owner = await requireEasyTOwner();
    const { tripId } = await context.params;
    const decoded = readTripDocument(await request.json().catch(() => null));
    if (decoded.kind !== "readable") return NextResponse.json({ error: "Invalid or unsupported trip document.", category: "validation" }, { status: 400 });
    const body = decoded.trip;
    if (body.id !== tripId) {
      return NextResponse.json(
        { error: "Invalid EasyT trip document.", category: "validation" },
        { status: 400 },
      );
    }

    const result = await promoteTripForOwner(owner.id, body);
    if (result.outcome === "conflict") {
      return NextResponse.json(
        {
          ...result,
          category: "conflict",
          error: result.conflictReason === "cloud-newer"
            ? "A newer cloud copy already exists. This device did not replace it."
            : result.conflictReason === "cloud-deleted"
              ? "This trip was removed from the cloud. This device did not recreate it."
              : "A different cloud copy already exists. This device did not replace it.",
        },
        { status: 409 },
      );
    }
    return NextResponse.json(result, {
      status: result.outcome === "promoted" ? 201 : 200,
    });
  } catch (error) {
    const failure = safeTripPersistenceFailure(error);
    console.error("Trip promotion failed.", { category: failure.category, errorName: error instanceof Error ? error.name : "UnknownError", errorCode: (error as { code?: unknown } | null)?.code });
    return NextResponse.json({ ...failure }, { status: failure.status });
  }
}
