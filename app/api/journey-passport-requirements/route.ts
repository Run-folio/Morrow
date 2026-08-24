import { NextResponse } from "next/server";

import { canonicalCountry } from "@/lib/easyt/travel-readiness";
import { supportedPassportCountries, touristEntryRequirementFor } from "@/lib/easyt/visa-requirements";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { nationality?: unknown; destination?: unknown; language?: unknown };
    const nationality = typeof body.nationality === "string" ? canonicalCountry(body.nationality) : "";
    const destination = typeof body.destination === "string" ? canonicalCountry(body.destination) : "";
    if (!supportedPassportCountries.includes(nationality) || !destination) return NextResponse.json({ error: "Passport and destination need review." }, { status: 400 });
    const language = body.language === "es" ? "es" : "en";
    return NextResponse.json({ nationality, destination, language, requirement: touristEntryRequirementFor(nationality, destination, language) });
  } catch {
    return NextResponse.json({ error: "Passport requirements are unavailable." }, { status: 400 });
  }
}
