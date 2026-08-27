import { NextResponse } from "next/server";
import { safeOpenAIError } from "@/lib/easyt/openai.server";
import { requireEasyTOwner } from "@/lib/easyt/owner";
import { getTripForOwner } from "@/lib/easyt/repository";
import {
  answerTripCopilotQuestion,
  consumeTripCopilotRateLimit,
  TripCopilotResponseError,
} from "@/lib/easyt/trip-copilot.server";
import {
  TRIP_COPILOT_MESSAGE_LIMIT,
  type TripCopilotSelection,
} from "@/lib/easyt/trip-copilot";
import { TripCopilotActionValidationError, type TripCopilotResponse } from "@/lib/easyt/trip-copilot-actions";
import { prepareTripCopilotMutationPreview } from "@/lib/easyt/trip-copilot-mutations.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 20;

type RouteContext = { params: Promise<{ tripId: string }> };
type RequestBody = {
  message?: unknown;
  context?: unknown;
};

const noStoreHeaders = { "Cache-Control": "no-store" };

function parseSelection(value: unknown): TripCopilotSelection | null {
  if (value === undefined) return {};
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (Object.keys(row).some((key) => !["stopId", "dayNumber", "legId"].includes(key))) return null;
  if (row.stopId !== undefined && (typeof row.stopId !== "string" || !row.stopId.trim() || row.stopId.length > 160)) return null;
  if (row.legId !== undefined && (typeof row.legId !== "string" || !row.legId.trim() || row.legId.length > 160)) return null;
  if (row.dayNumber !== undefined && (typeof row.dayNumber !== "number" || !Number.isInteger(row.dayNumber) || row.dayNumber < 1 || row.dayNumber > 366)) return null;
  return {
    ...(typeof row.stopId === "string" ? { stopId: row.stopId.trim() } : {}),
    ...(typeof row.dayNumber === "number" ? { dayNumber: row.dayNumber } : {}),
    ...(typeof row.legId === "string" ? { legId: row.legId.trim() } : {}),
  };
}

/** Interpretation and preview endpoint. It never imports or invokes a canonical save. */
export async function POST(request: Request, context: RouteContext) {
  try {
    const owner = await requireEasyTOwner();
    const { tripId } = await context.params;
    if (!tripId || tripId.length > 160) return NextResponse.json({ error: "Trip not found." }, { status: 404, headers: noStoreHeaders });
    let body: RequestBody;
    try { body = await request.json() as RequestBody; }
    catch { return NextResponse.json({ error: "Invalid request body." }, { status: 400, headers: noStoreHeaders }); }
    if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).some((key) => !["message", "context"].includes(key))) {
      return NextResponse.json({ error: "Only a message and selected trip context are accepted." }, { status: 400, headers: noStoreHeaders });
    }
    const message = typeof body.message === "string" ? body.message.trim() : "";
    if (!message) return NextResponse.json({ error: "Ask a trip question first." }, { status: 400, headers: noStoreHeaders });
    if (message.length > TRIP_COPILOT_MESSAGE_LIMIT) {
      return NextResponse.json({ error: `Keep the question under ${TRIP_COPILOT_MESSAGE_LIMIT} characters.` }, { status: 400, headers: noStoreHeaders });
    }
    const selection = parseSelection(body.context);
    if (!selection) return NextResponse.json({ error: "Invalid selected trip context." }, { status: 400, headers: noStoreHeaders });

    const trip = await getTripForOwner(owner.id, tripId);
    if (!trip) return NextResponse.json({ error: "Trip not found." }, { status: 404, headers: noStoreHeaders });
    const limit = consumeTripCopilotRateLimit(owner.id);
    if (!limit.allowed) {
      return NextResponse.json(
        { error: "Too many co-pilot questions. Try again shortly." },
        { status: 429, headers: { ...noStoreHeaders, "Retry-After": String(limit.retryAfterSeconds) } },
      );
    }
    const result = await answerTripCopilotQuestion({ trip, message, selection });
    let response: TripCopilotResponse;
    if (result.interpretation.kind === "answer") {
      response = result.interpretation.answer;
    } else {
      const mutationPreview = await prepareTripCopilotMutationPreview({ ownerId: owner.id, trip, action: result.interpretation.action });
      response = {
        answer: mutationPreview.canApply
          ? "Morrovia has prepared this change from your saved trip. Review it before applying."
          : "There is more than one safe way to make that change. Choose the outcome you want to review.",
        scope: result.interpretation.action.action === "change_stop_nights" ? "stop" : "trip",
        proposedChange: {
          type: result.interpretation.action.action,
          summary: mutationPreview.summary,
        },
        mutationPreview,
      };
    }

    if (process.env.NODE_ENV === "development") {
      console.info("[trip-copilot] completed", {
        model: result.model,
        usage: result.usage,
        projection: {
          stopCount: result.projection.trip.route.stops.length,
          transferCount: result.projection.trip.route.transfers.length,
          dayCount: result.projection.trip.itinerary.days.length,
          healthFindingCount: result.projection.trip.health.findings.length,
          selectedScope: result.projection.selectedContext.requestedScope,
          selectedContextAvailable: result.projection.selectedContext.available,
        },
      });
    }

    return NextResponse.json(response, { headers: noStoreHeaders });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "Unauthorized") return NextResponse.json({ error: "Sign in to ask about this trip." }, { status: 401, headers: noStoreHeaders });
    if (error instanceof TripCopilotResponseError) {
      console.error("[trip-copilot] failed", { category: "malformed-response" });
      return NextResponse.json({ error: "The co-pilot could not prepare a grounded answer." }, { status: 502, headers: noStoreHeaders });
    }
    if (error instanceof TripCopilotActionValidationError) {
      return NextResponse.json({ error: error.message }, { status: 422, headers: noStoreHeaders });
    }
    const safeError = safeOpenAIError(error);
    console.error("[trip-copilot] failed", safeError);
    const status = safeError.category === "configuration" ? 503 : safeError.category === "rate-limit" ? 429 : 502;
    const safeMessage = safeError.category === "configuration"
      ? "The trip co-pilot is not configured on this server."
      : safeError.category === "rate-limit"
        ? "The trip co-pilot is busy. Try again shortly."
        : "The trip co-pilot is temporarily unavailable.";
    return NextResponse.json({ error: safeMessage }, { status, headers: noStoreHeaders });
  }
}
