import { NextResponse } from "next/server";

import { buildTripReadiness, defaultTravelReadinessProfile, isTravelReadinessProfile } from "@/lib/easyt/travel-readiness";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { countries?: unknown; startDate?: unknown; avoidDriving?: unknown; profile?: unknown; language?: unknown };
    const countries = Array.isArray(body.countries) ? body.countries.filter((country): country is string => typeof country === "string").slice(0, 20) : [];
    const profile = isTravelReadinessProfile(body.profile) ? body.profile : defaultTravelReadinessProfile;
    return NextResponse.json({ cards: buildTripReadiness({
      countries,
      startDate: typeof body.startDate === "string" ? body.startDate : undefined,
      avoidDriving: body.avoidDriving === true,
      profile,
      sailyHref: process.env.SAILY_AFFILIATE_URL,
      language: body.language === "es" ? "es" : "en",
    }) });
  } catch {
    return NextResponse.json({ error: "Unable to prepare this trip." }, { status: 400 });
  }
}
