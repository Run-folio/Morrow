import { NextResponse } from "next/server";
import { applyEasyTRouteControls, listEasyTRouteControls } from "@/lib/easyt/admin-content";
import { publicRoutePublishedFamilies } from "@/lib/easyt/public-route";
import { publicDiscoveryDraft } from "@/lib/easyt/discovery-catalogue";
export const dynamic = "force-dynamic";
export async function GET(_request: Request, { params }: { params: Promise<{ routeKey: string }> }) {
  const { routeKey } = await params;
  try {
    const controls = await listEasyTRouteControls();
    const draft = publicDiscoveryDraft(routeKey, applyEasyTRouteControls(publicRoutePublishedFamilies(), controls));
    return NextResponse.json(draft ? { draft } : { error: "This route is no longer available." }, { status: draft ? 200 : 404, headers: { "cache-control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "We couldn’t load this starting route. Please try again." }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}

