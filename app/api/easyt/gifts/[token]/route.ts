import { NextResponse } from "next/server";

import { requireEasyTOwner } from "@/lib/easyt/owner";
import { claimTripGift, getTripGiftPreview } from "@/lib/easyt/repository";

export const dynamic = "force-dynamic";
type RouteContext = { params: Promise<{ token: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const { token } = await context.params;
  try {
    const gift = await getTripGiftPreview(token);
    return gift
      ? NextResponse.json({ gift })
      : NextResponse.json({ error: "Invitation not found." }, { status: 404 });
  } catch {
    return NextResponse.json({ error: "Unable to load invitation." }, { status: 503 });
  }
}

export async function POST(_request: Request, context: RouteContext) {
  try {
    const owner = await requireEasyTOwner();
    const { token } = await context.params;
    const result = await claimTripGift(token, owner);
    return result
      ? NextResponse.json(result)
      : NextResponse.json({ error: "Invitation not found." }, { status: 404 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to claim invitation.";
    return NextResponse.json({ error: message }, { status: message === "Unauthorized" ? 401 : 400 });
  }
}
