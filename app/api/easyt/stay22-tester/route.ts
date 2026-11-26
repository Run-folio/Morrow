import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "@/lib/auth";
import { getMorroviaAuthBaseURL, isEasyTAuthConfigured } from "@/lib/easyt/auth-environment";
import { isStay22Tester, isStay22TesterHost } from "@/lib/easyt/stay22-tester-preview";
import { hasStay22PilotId } from "@/lib/easyt/stay22-map-pilot";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", "Vary": "Cookie" };

export async function GET(request: NextRequest) {
  const unavailable = () => NextResponse.json(null, { status: 404, headers });
  const approvedEmail = process.env.MORROVIA_STAY22_TESTER_EMAIL;
  const affiliateId = process.env.MORROVIA_STAY22_TESTER_AFFILIATE_ID;
  if (!approvedEmail || !hasStay22PilotId(affiliateId) || !isEasyTAuthConfigured()) return unavailable();
  try {
    if (!isStay22TesterHost(getMorroviaAuthBaseURL(), request.nextUrl.origin)) return unavailable();
    const session = await getAuth().api.getSession({ headers: request.headers });
    if (!isStay22Tester(session?.user, approvedEmail)) return unavailable();
    return NextResponse.json({ affiliateId }, { headers });
  } catch {
    return unavailable();
  }
}
