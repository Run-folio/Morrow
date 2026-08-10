import { NextResponse } from "next/server";

import { requireEasyTOwner } from "@/lib/easyt/owner";
import { createEasyTFeedback } from "@/lib/easyt/repository";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const owner = await requireEasyTOwner();
    const body = await request.json() as { rating?: unknown; comment?: unknown };
    const rating = Number(body.rating);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return NextResponse.json({ error: "Choose a rating from 1 to 5." }, { status: 400 });
    }
    const comment = typeof body.comment === "string" ? body.comment.slice(0, 1000) : undefined;
    await createEasyTFeedback({ ownerId: owner.id, rating, comment });
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to save feedback.";
    console.error("EasyT CSAT persistence failed", error);
    return NextResponse.json({ error: message }, { status: message === "Unauthorized" ? 401 : 500 });
  }
}
