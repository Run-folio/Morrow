import { NextResponse } from "next/server";
import { ViatorAffiliateClient, ViatorAffiliateError, resolveViatorApiConfiguration } from "@/lib/easyt/viator-affiliate.server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 10;

const testDestination = { canonicalPlaceId: "paris", name: "Paris" };
const noStoreHeaders = { "Cache-Control": "no-store" };

/** Development-only connectivity probe. It accepts no traveller or trip content. */
export async function POST() {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "Not found." }, { status: 404, headers: noStoreHeaders });
  }

  try {
    const configuration = resolveViatorApiConfiguration();
    if (configuration.environment !== "sandbox") {
      return NextResponse.json({ error: "Activity search is unavailable." }, { status: 404, headers: noStoreHeaders });
    }
    const activities = await new ViatorAffiliateClient(configuration).searchActivities({ destination: testDestination, count: 3 });
    return NextResponse.json({ environment: "sandbox", destination: testDestination, activities }, { headers: noStoreHeaders });
  } catch (error) {
    const category = error instanceof ViatorAffiliateError ? error.category : "unavailable";
    const providerStatus = error instanceof ViatorAffiliateError ? error.status : undefined;
    const status = category === "rate_limited" ? 429 : 503;
    return NextResponse.json({ error: "Activity search is unavailable.", category, ...(providerStatus ? { providerStatus } : {}) }, { status, headers: noStoreHeaders });
  }
}
