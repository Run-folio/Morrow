import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "@/lib/auth";
import { getMorroviaAuthBaseURL, isEasyTAuthConfigured } from "@/lib/easyt/auth-environment";
import { isStay22Tester, isStay22TesterHost, stay22TesterSample } from "@/lib/easyt/stay22-tester-preview";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", "Vary": "Cookie" };

export async function GET(request: NextRequest) {
  const unavailable = () => NextResponse.json(null, { status: 404, headers });
  const approvedEmail = process.env.MORROVIA_STAY22_TESTER_EMAIL;
  const affiliateId = process.env.MORROVIA_STAY22_TESTER_AFFILIATE_ID;
  if (!approvedEmail || !affiliateId || !isEasyTAuthConfigured()) return unavailable();
  try {
    if (!isStay22TesterHost(getMorroviaAuthBaseURL(), request.nextUrl.origin)) return unavailable();
    const session = await getAuth().api.getSession({ headers: request.headers });
    if (!isStay22Tester(session?.user, approvedEmail)) return unavailable();
    const sample = stay22TesterSample(affiliateId);
    return sample ? NextResponse.json(sample, { headers }) : unavailable();
  } catch {
    return unavailable();
  }
}
