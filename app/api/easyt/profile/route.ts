import { NextResponse } from "next/server";

import { requireEasyTOwner } from "@/lib/easyt/owner";
import { updateEasyTUserPreferences } from "@/lib/easyt/repository";
import { isTravelProfile } from "@/lib/easyt/travel-profile";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request) {
  try {
    const owner = await requireEasyTOwner();
    const body = (await request.json()) as { language?: string; travelProfile?: unknown };
    if (body.language !== undefined && body.language !== "en" && body.language !== "es") {
      return NextResponse.json(
        { error: "Unsupported language." },
        { status: 400 },
      );
    }
    if (body.travelProfile !== undefined && !isTravelProfile(body.travelProfile)) {
      return NextResponse.json({ error: "Unsupported travel profile." }, { status: 400 });
    }
    await updateEasyTUserPreferences(owner.id, {
      language: body.language === "es" ? "es" : "en",
      ...(body.travelProfile ? { travelProfile: body.travelProfile } : {}),
    } as Parameters<typeof updateEasyTUserPreferences>[1]);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to update preferences.";
    return NextResponse.json(
      { error: message },
      { status: message === "Unauthorized" ? 401 : 500 },
    );
  }
}
