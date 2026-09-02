import { NextResponse } from "next/server";

import { resolveCanonicalRoadFallbacks } from "@/lib/easyt/road-transfer-resolution.server";
import type { TripLeg } from "@/lib/easyt/trip";

export const dynamic = "force-dynamic";

const MAX_REQUEST_BYTES = 100_000;

function isEndpoint(value: unknown) {
  if (!value || typeof value !== "object") return false;
  const endpoint = value as { id?: unknown; name?: unknown; kind?: unknown; coordinates?: unknown };
  return typeof endpoint.id === "string"
    && typeof endpoint.name === "string"
    && (endpoint.kind === "origin" || endpoint.kind === "stop" || endpoint.kind === "end")
    && (endpoint.coordinates === null || (Array.isArray(endpoint.coordinates) && endpoint.coordinates.length === 2));
}

function isRoadFallbackLeg(value: unknown): value is TripLeg {
  if (!value || typeof value !== "object") return false;
  const leg = value as Partial<TripLeg>;
  return typeof leg.id === "string"
    && typeof leg.fromStopId === "string"
    && typeof leg.toStopId === "string"
    && ["flight", "train", "road", "ferry", "walk", "unknown"].includes(leg.mode ?? "")
    && (leg.durationMinutes === null || (typeof leg.durationMinutes === "number" && Number.isFinite(leg.durationMinutes)))
    && typeof leg.routeMetadata === "object"
    && leg.routeMetadata !== null
    && isEndpoint(leg.fromEndpoint)
    && isEndpoint(leg.toEndpoint);
}

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) {
    return NextResponse.json({ error: "Road route request is too large." }, { status: 413 });
  }
  try {
    const body: unknown = await request.json();
    if (JSON.stringify(body).length > MAX_REQUEST_BYTES) {
      return NextResponse.json({ error: "Road route request is too large." }, { status: 413 });
    }
    const legs = body && typeof body === "object" && Array.isArray((body as { legs?: unknown }).legs)
      ? (body as { legs: unknown[] }).legs
      : null;
    if (!legs || legs.length > 8 || !legs.every(isRoadFallbackLeg)) {
      return NextResponse.json({ error: "Invalid canonical road fallback request." }, { status: 400 });
    }
    return NextResponse.json(
      { legs: await resolveCanonicalRoadFallbacks(legs) },
      { headers: { "cache-control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      { error: "Road routing is temporarily unavailable." },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
}
