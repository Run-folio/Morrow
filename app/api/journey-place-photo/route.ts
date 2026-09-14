import { NextRequest, NextResponse } from "next/server";
import {
  encodeGooglePhotoAttributions,
  exactGooglePhotoResource,
  safeGooglePhotoAttributions,
  validGooglePlaceId,
} from "@/lib/easyt/google-place-photo";

type GooglePhoto = {
  name?: string;
  authorAttributions?: Array<{ displayName?: string; uri?: string }>;
};

const googlePlacesBase = "https://places.googleapis.com/v1";
const noStoreHeaders = { "Cache-Control": "private, no-store" };

function unavailable(status: number, error: "photo_unavailable" | "invalid_place") {
  return NextResponse.json({ error }, { status, headers: noStoreHeaders });
}

export async function GET(request: NextRequest) {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  const placeId = request.nextUrl.searchParams.get("placeId")?.trim();
  if (!apiKey) return unavailable(503, "photo_unavailable");
  if (!validGooglePlaceId(placeId)) return unavailable(400, "invalid_place");

  try {
    // Photo names can expire and must not be cached. Resolve a current photo
    // against the exact Place ID for every media request, then proxy the bytes
    // so the browser never receives the server credential or photo resource.
    const detailsResponse = await fetch(`${googlePlacesBase}/places/${encodeURIComponent(placeId)}`, {
      headers: {
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": "id,photos",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    if (!detailsResponse.ok) throw new Error("Place photo details unavailable");
    const photo = ((await detailsResponse.json()) as { photos?: GooglePhoto[] }).photos?.[0];
    const resource = exactGooglePhotoResource(placeId, photo?.name);
    if (!resource) return unavailable(404, "photo_unavailable");

    const mediaResponse = await fetch(`${googlePlacesBase}/${resource}/media?maxWidthPx=960&maxHeightPx=640`, {
      headers: { "X-Goog-Api-Key": apiKey },
      cache: "no-store",
      redirect: "follow",
      signal: AbortSignal.timeout(5000),
    });
    const contentType = mediaResponse.headers.get("content-type") ?? "";
    if (!mediaResponse.ok || !contentType.startsWith("image/") || !mediaResponse.body) throw new Error("Place photo media unavailable");
    const attributions = safeGooglePhotoAttributions(photo?.authorAttributions);
    return new NextResponse(mediaResponse.body, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        ...(attributions.length ? { "X-Morrovia-Photo-Attribution": encodeGooglePhotoAttributions(attributions) } : {}),
      },
    });
  } catch {
    return unavailable(502, "photo_unavailable");
  }
}
