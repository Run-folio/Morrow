import { NextResponse } from "next/server";
import { buildBookingReadiness } from "@/lib/easyt/booking-readiness";
import { isEasyTTrip } from "@/lib/easyt/trip";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { trip?: unknown };
    if (!isEasyTTrip(body.trip)) return NextResponse.json({ error: "A valid trip is required." }, { status: 400 });
    return NextResponse.json({ actions: buildBookingReadiness(body.trip, {
      bookingUrl: process.env.BOOKING_AFFILIATE_URL,
      activitiesUrl: process.env.ACTIVITIES_AFFILIATE_URL,
      carHireUrl: process.env.CAR_HIRE_AFFILIATE_URL,
      sailyUrl: process.env.SAILY_AFFILIATE_URL,
      groundTransportUrl: process.env.GROUND_TRANSPORT_AFFILIATE_URL,
    }) });
  } catch {
    return NextResponse.json({ error: "Unable to prepare booking actions." }, { status: 400 });
  }
}
