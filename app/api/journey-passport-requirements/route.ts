import { NextResponse } from "next/server";

import { countryFor } from "@/lib/easyt/country-registry";
import { passportCountryCodeFor } from "@/lib/easyt/passport-countries";
import { touristEntryRequirementFor } from "@/lib/easyt/visa-requirements";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { nationality?: unknown; destination?: unknown; language?: unknown };
    const nationality = countryFor(passportCountryCodeFor(body.nationality));
    const destination = countryFor(body.destination);
    if (!nationality || !destination) return NextResponse.json({ error: "Passport and destination need review." }, { status: 400 });
    const language = body.language === "es" ? "es" : "en";
    return NextResponse.json({ nationality: nationality.code, destination: destination.code, language, requirement: touristEntryRequirementFor(nationality.code, destination.code, language) });
  } catch {
    return NextResponse.json({ error: "Passport requirements are unavailable." }, { status: 400 });
  }
}
