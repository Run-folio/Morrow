import { NextResponse } from "next/server";

import { requireEasyTOwner } from "@/lib/easyt/owner";
import { claimTripGift, getTripGiftPreview } from "@/lib/easyt/repository";

export const dynamic = "force-dynamic";
type RouteContext = { params: Promise<{ token: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const { token } = await context.params;
  try {
    const gift = await getTripGiftPreview(token);
    // A capability token grants this invitation preview, not recipient identity
    // or any present/future internal fields returned by the repository.
    const headers = { "Cache-Control": "no-store" };
    return gift
      ? NextResponse.json({ gift: {
        tripTitle: gift.tripTitle,
        senderName: gift.senderName,
        note: gift.note,
        status: gift.status,
        expiresAt: gift.expiresAt,
      } }, { headers })
      : NextResponse.json({ error: "Invitation not found." }, { status: 404, headers });
  } catch {
    return NextResponse.json({ error: "Unable to load invitation." }, { status: 503, headers: { "Cache-Control": "no-store" } });
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
