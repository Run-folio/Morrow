import { NextRequest, NextResponse } from "next/server";
import { executePlannerShadowRequest } from "@/lib/easyt/planner-shadow-api";

export const runtime = "nodejs";
export const maxDuration = 15;

/** Server-only advisory endpoint. It never receives or mutates TripDocument. */
export async function POST(request: NextRequest) {
  let body: { shadow?: unknown };
  try { body = await request.json() as { shadow?: unknown }; }
  catch { return NextResponse.json({ message: "Invalid request body." }, { status: 400 }); }
  const result = await executePlannerShadowRequest(body.shadow, { log: (event) => console.info("planner_shadow", event) });
  if (!result) return NextResponse.json({ message: "A deterministic shadow planning input is required." }, { status: 400 });
  return NextResponse.json({ shadow: result });
}
