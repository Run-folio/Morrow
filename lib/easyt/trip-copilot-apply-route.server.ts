import "server-only";

import { NextResponse } from "next/server";

import { requireEasyTOwner } from "./owner.ts";
import { applyConfirmedTripCopilotPreview } from "./trip-copilot-apply.server.ts";
import { TripCopilotApplyError } from "./trip-copilot-apply.ts";
import { consumeTripCopilotRateLimit } from "./trip-copilot.server.ts";
import { EasyTTripSaveConflictError } from "./trip-continuity.ts";

const noStoreHeaders = { "Cache-Control": "no-store" };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function handleTripCopilotApplyRequest(
  request: Request,
  context: { params: Promise<{ tripId: string }> },
  expectedAction: "change_stop_nights" | "set_trip_preference" | "change_transport_preference",
) {
  try {
    const owner = await requireEasyTOwner();
    const { tripId } = await context.params;
    if (!tripId || tripId.length > 160) return NextResponse.json({ error: "Trip not found." }, { status: 404, headers: noStoreHeaders });
    let body: unknown;
    try { body = await request.json(); }
    catch { return NextResponse.json({ error: "Invalid request body." }, { status: 400, headers: noStoreHeaders }); }
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "A preview ID is required." }, { status: 400, headers: noStoreHeaders });
    }
    const row = body as Record<string, unknown>;
    if (Object.keys(row).length !== 1 || typeof row.previewId !== "string" || !UUID.test(row.previewId)) {
      return NextResponse.json({ error: "A valid preview ID is required." }, { status: 400, headers: noStoreHeaders });
    }
    const limit = consumeTripCopilotRateLimit(owner.id);
    if (!limit.allowed) {
      return NextResponse.json(
        { error: "Too many co-pilot requests. Try again shortly." },
        { status: 429, headers: { ...noStoreHeaders, "Retry-After": String(limit.retryAfterSeconds) } },
      );
    }
    const result = await applyConfirmedTripCopilotPreview({ ownerId: owner.id, tripId, previewId: row.previewId, expectedAction });
    if (process.env.NODE_ENV === "development") {
      console.info("[trip-copilot] change applied", { action: expectedAction, idempotent: result.idempotent });
    }
    return NextResponse.json({ trip: result.trip, applied: true, idempotent: result.idempotent }, { headers: noStoreHeaders });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "Unauthorized") return NextResponse.json({ error: "Sign in to change this trip." }, { status: 401, headers: noStoreHeaders });
    if (error instanceof TripCopilotApplyError) {
      const status = error.code === "not-found" ? 404 : error.code === "in-progress" ? 409 : error.code === "expired" || error.code === "stale" ? 409 : 422;
      return NextResponse.json({ error: error.message, code: error.code }, { status, headers: noStoreHeaders });
    }
    if (error instanceof EasyTTripSaveConflictError) {
      return NextResponse.json({ error: "The trip changed after this preview. Ask Morrovia to prepare it again.", code: "stale" }, { status: 409, headers: noStoreHeaders });
    }
    console.error("[trip-copilot] apply failed", { category: "canonical-save" });
    return NextResponse.json({ error: "The trip was not changed. Try again or prepare a fresh preview." }, { status: 500, headers: noStoreHeaders });
  }
}
