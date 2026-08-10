import { NextResponse } from "next/server";
import { applyEasyTRouteControls, listEasyTRouteControls } from "@/lib/easyt/admin-content";
import { recommendRouteFamilies, routeFamilies, type RouteInterest, type RouteRegion } from "@/lib/easyt/route-catalog";

export const dynamic = "force-dynamic";

const regions = new Set<RouteRegion>(["asia", "europe", "south-america", "central-america", "north-america", "africa", "oceania"]);
const interests = new Set<RouteInterest>(["food", "culture", "nature", "rail", "coast", "hiking", "wildlife", "heritage"]);

export async function GET(request: Request) {
  const url = new URL(request.url);
  const region = regions.has(url.searchParams.get("region") as RouteRegion) ? url.searchParams.get("region") as RouteRegion : undefined;
  const requestedInterests = url.searchParams.getAll("interest").filter((value): value is RouteInterest => interests.has(value as RouteInterest));
  const daysValue = Number(url.searchParams.get("days"));
  const days = Number.isFinite(daysValue) && daysValue > 0 ? daysValue : undefined;
  const input = { region, interests: requestedInterests, days };
  const routes = region || requestedInterests.length || days ? recommendRouteFamilies(input) : routeFamilies;
  const controls = await listEasyTRouteControls().catch(() => []);
  return NextResponse.json({ routes: applyEasyTRouteControls(routes, controls), applied: input }, { headers: { "cache-control": "no-store" } });
}
