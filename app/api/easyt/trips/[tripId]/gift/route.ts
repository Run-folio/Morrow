import { NextResponse } from "next/server";

import { requireEasyTOwner } from "@/lib/easyt/owner";
import { createTripGift } from "@/lib/easyt/repository";
import { sendEasyTEmail, tripGiftEmail } from "@/lib/easyt/email";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ tripId: string }> };

function appUrl() {
  return (process.env.NEXT_PUBLIC_APP_URL || process.env.BETTER_AUTH_URL || "http://localhost:3000").replace(/\/$/, "");
}

async function sendGiftEmail(input: {
  recipientEmail: string;
  tripTitle: string;
  note: string | null;
  claimUrl: string;
}) {
  const message = tripGiftEmail({ title: input.tripTitle, note: input.note, url: input.claimUrl });
  try {
    await sendEasyTEmail({ to: input.recipientEmail, ...message });
    return true;
  } catch (error) {
    // The invitation remains valid even when email delivery is unavailable.
    console.error("EasyT gift email delivery failed", error);
    return false;
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const owner = await requireEasyTOwner();
    const { tripId } = await context.params;
    const body = (await request.json()) as { email?: unknown; note?: unknown };
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const note = typeof body.note === "string" ? body.note : null;
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      return NextResponse.json({ error: "Enter a valid recipient email." }, { status: 400 });
    }
    const gift = await createTripGift(owner, tripId, email, note);
    if (!gift) return NextResponse.json({ error: "Trip not found." }, { status: 404 });
    const claimUrl = `${appUrl()}/journey/gift/${encodeURIComponent(gift.token)}`;
    const delivered = await sendGiftEmail({
      recipientEmail: email,
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
    return NextResponse.json({ error: message }, { status: message === "Unauthorized" ? 401 : 500 });
  }
}
