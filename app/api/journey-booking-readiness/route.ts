import { NextResponse } from "next/server";
import { resolveOptionalAffiliateConfiguration, warnOptionalAffiliateConfiguration } from "@/lib/easyt/affiliate-configuration";
import { affiliatePartners, buildBookingReadiness } from "@/lib/easyt/booking-readiness";
import { isEasyTTrip } from "@/lib/easyt/trip";

export const dynamic = "force-dynamic";

const optionalAffiliateConfiguration = resolveOptionalAffiliateConfiguration();
warnOptionalAffiliateConfiguration(optionalAffiliateConfiguration);

export async function POST(request: Request) {
  try {
    const body = await request.json() as { trip?: unknown };
    if (!isEasyTTrip(body.trip)) return NextResponse.json({ error: "A valid trip is required." }, { status: 400 });
    return NextResponse.json({ actions: buildBookingReadiness(body.trip, {
      activitiesUrl: affiliatePartners.viator.activitiesUrl,
      activitiesProvider: affiliatePartners.viator.provider,
      carHireUrl: optionalAffiliateConfiguration.urls.carHireUrl,
      sailyUrl: optionalAffiliateConfiguration.urls.sailyUrl,
      groundTransportUrl: optionalAffiliateConfiguration.urls.groundTransportUrl,
    }) });
  } catch {
    return NextResponse.json({ error: "Unable to prepare booking actions." }, { status: 400 });
  }
}
