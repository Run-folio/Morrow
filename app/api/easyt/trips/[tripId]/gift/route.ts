import { NextResponse } from "next/server";

import { getMorroviaApplicationUrl } from "@/lib/easyt/auth-environment";
import { requireEasyTOwner } from "@/lib/easyt/owner";
import { createTripGift } from "@/lib/easyt/repository";
import { sendMorroviaEmail, tripGiftEmail } from "@/lib/easyt/email";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ tripId: string }> };

async function sendGiftEmail(input: {
  giftId: string;
  recipientEmail: string;
  inviterName: string | null;
  tripTitle: string;
  note: string | null;
  claimUrl: string;
}) {
  const message = tripGiftEmail({
    giftId: input.giftId,
    inviterName: input.inviterName,
    title: input.tripTitle,
    note: input.note,
    url: input.claimUrl,
    supportUrl: getMorroviaApplicationUrl("/journey/contact?topic=support"),
  });
  try {
    await sendMorroviaEmail({ to: input.recipientEmail, ...message });
    return true;
  } catch (error) {
    // The invitation remains valid even when email delivery is unavailable.
    console.error("Morrovia gift email delivery failed.", {
      errorName: error instanceof Error ? error.name : "UnknownError",
      errorCode: (error as { code?: unknown } | null)?.code,
    });
    return false;
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const owner = await requireEasyTOwner();
    const { tripId } = await context.params;
    const idempotencyKey = request.headers.get("idempotency-key")?.trim() ?? "";
    if (idempotencyKey.length < 16 || idempotencyKey.length > 200 || !/^[A-Za-z0-9._:-]+$/.test(idempotencyKey)) {
      return NextResponse.json({ error: "Please retry this invitation from the sharing form." }, { status: 400 });
    }
    let body: { email?: unknown; note?: unknown };
    try {
      body = (await request.json()) as { email?: unknown; note?: unknown };
    } catch {
      return NextResponse.json({ error: "The invitation could not be read." }, { status: 400 });
    }
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const note = typeof body.note === "string" ? body.note : null;
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      return NextResponse.json({ error: "Enter a valid recipient email." }, { status: 400 });
    }
    const gift = await createTripGift(owner, tripId, email, note, idempotencyKey);
    if (!gift) return NextResponse.json({ error: "Trip not found." }, { status: 404 });
    const claimUrl = getMorroviaApplicationUrl(`/journey/gift/${encodeURIComponent(gift.token)}`);
    const delivered = await sendGiftEmail({
      giftId: gift.id,
      recipientEmail: gift.recipientEmail,
      inviterName: owner.name?.trim() || null,
      tripTitle: gift.tripTitle,
      note: gift.note,
      claimUrl,
    });
    return NextResponse.json({
      gift: {
        id: gift.id,
        tripTitle: gift.tripTitle,
        recipientEmail: gift.recipientEmail,
        note: gift.note,
        expiresAt: gift.expiresAt,
      },
      claimUrl,
      delivered,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create invitation.";
    if (message === "Unauthorized") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (message === "Trip invitation request key was already used.") {
      return NextResponse.json({ error: "This invitation request changed while it was being retried. Please submit it again." }, { status: 409 });
    }
    console.error("Morrovia trip invitation could not be created.", { errorName: error instanceof Error ? error.name : "UnknownError" });
    return NextResponse.json({ error: "Unable to create invitation." }, { status: 500 });
  }
}
