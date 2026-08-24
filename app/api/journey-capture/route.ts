import { NextRequest, NextResponse } from "next/server";
import { captureJourneyBrief } from "@/lib/easyt/journey-capture";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  let body: { brief?: unknown };
  try {
    body = await request.json() as { brief?: unknown };
  } catch {
    return NextResponse.json({ message: "Invalid trip brief." }, { status: 400 });
  }
  const brief = typeof body.brief === "string" ? body.brief.slice(0, 600) : "";
  if (!brief.trim()) return NextResponse.json({ message: "Add a trip brief first." }, { status: 400 });

  // Capture is a fast handoff, not a network validation gate. Curated and
  // canonical matches resolve synchronously; unresolved provider work remains
  // visible for the builder instead of delaying or blanking the transition.
  return NextResponse.json(captureJourneyBrief(brief));
}
