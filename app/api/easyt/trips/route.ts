import { NextResponse } from "next/server";

import { requireEasyTOwner } from "@/lib/easyt/owner";
import { listTripsForOwner, saveTripForOwner } from "@/lib/easyt/repository";
import { isEasyTTrip } from "@/lib/easyt/trip";

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
    return NextResponse.json({ trip: await saveTripForOwner(owner.id, body) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to save trip.";
    return NextResponse.json({ error: message }, { status: message === "Unauthorized" ? 401 : 500 });
  }
}
