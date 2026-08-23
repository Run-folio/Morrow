import { NextResponse } from "next/server";

import { requireEasyTOwner } from "@/lib/easyt/owner";
import { promoteTripForOwner } from "@/lib/easyt/repository";
import { isEasyTTrip } from "@/lib/easyt/trip";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ tripId: string }> };

export async function POST(request: Request, context: RouteContext) {
  try {
    const owner = await requireEasyTOwner();
    const { tripId } = await context.params;
    const body: unknown = await request.json();
    if (!isEasyTTrip(body) || body.id !== tripId) {
      return NextResponse.json(
        { error: "Invalid EasyT trip document." },
        { status: 400 },
      );
    }

    const result = await promoteTripForOwner(owner.id, body);
    if (result.outcome === "conflict") {
      return NextResponse.json(
        {
          ...result,
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
    const message = error instanceof Error ? error.message : "Unable to sync trip.";
    return NextResponse.json(
      { error: message },
      {
        status: message === "Unauthorized"
          ? 401
          : message === "Trip ownership mismatch."
            ? 403
            : 500,
      },
    );
  }
}
