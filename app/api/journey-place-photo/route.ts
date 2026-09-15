import { NextRequest, NextResponse } from "next/server";
import {
  encodeGooglePhotoAttributions,
  exactGooglePhotoResource,
  exactGooglePropertyMatch,
  safeGooglePhotoAttributions,
  validGooglePlaceId,
} from "@/lib/easyt/google-place-photo";

type GooglePhoto = {
  name?: string;
  authorAttributions?: Array<{ displayName?: string; uri?: string }>;
};

type GoogleProperty = {
  id?: string;
  displayName?: { text?: string };
  location?: { latitude?: number; longitude?: number };
  photos?: GooglePhoto[];
};

const googlePlacesBase = "https://places.googleapis.com/v1";
const noStoreHeaders = { "Cache-Control": "private, no-store" };

function unavailable(status: number, error: "photo_unavailable" | "invalid_place") {
  return NextResponse.json({ error }, { status, headers: noStoreHeaders });
}

function validCoordinate(value: number, limit: number) {
  return Number.isFinite(value) && Math.abs(value) <= limit;
}

async function resolveExactFallbackProperty(input: {
  apiKey: string;
  name: string;
  address: string;
  coordinates: [number, number];
}) {
  const [longitude, latitude] = input.coordinates;
  const response = await fetch(`${googlePlacesBase}/places:searchText`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": input.apiKey,
      "X-Goog-FieldMask": "places.id,places.displayName,places.location,places.photos",
    },
    body: JSON.stringify({
      textQuery: [input.name, input.address].filter(Boolean).join(", "),
      includedType: "lodging",
      locationBias: { circle: { center: { latitude, longitude }, radius: 150 } },
      pageSize: 5,
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error("Property photo identity unavailable");
  const candidates = ((await response.json()) as { places?: GoogleProperty[] }).places ?? [];
  return candidates.find((candidate) => {
    const candidateLatitude = candidate.location?.latitude;
    const candidateLongitude = candidate.location?.longitude;
    return validGooglePlaceId(candidate.id)
      && validCoordinate(candidateLatitude ?? Number.NaN, 90)
      && validCoordinate(candidateLongitude ?? Number.NaN, 180)
      && exactGooglePropertyMatch(
        { name: input.name, coordinates: input.coordinates },
        { name: candidate.displayName?.text, coordinates: [candidateLongitude!, candidateLatitude!] },
      );
  }) ?? null;
}

export async function GET(request: NextRequest) {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  const placeId = request.nextUrl.searchParams.get("placeId")?.trim();
  const fallbackName = request.nextUrl.searchParams.get("name")?.trim() ?? "";
  const fallbackAddress = request.nextUrl.searchParams.get("address")?.trim().slice(0, 240) ?? "";
  const fallbackLatitude = Number(request.nextUrl.searchParams.get("lat"));
  const fallbackLongitude = Number(request.nextUrl.searchParams.get("lon"));
  const fallbackRequested = !placeId
    && fallbackName.length >= 2
    && fallbackName.length <= 160
    && validCoordinate(fallbackLatitude, 90)
    && validCoordinate(fallbackLongitude, 180);
  if (!apiKey) return unavailable(503, "photo_unavailable");
  if (!validGooglePlaceId(placeId) && !fallbackRequested) return unavailable(400, "invalid_place");

  try {
    // Photo names can expire and must not be cached. Resolve a current photo
    // against the exact Place ID for every media request, then proxy the bytes
    // so the browser never receives the server credential or photo resource.
    const property = validGooglePlaceId(placeId)
      ? await (async () => {
        const detailsResponse = await fetch(`${googlePlacesBase}/places/${encodeURIComponent(placeId)}`, {
          headers: {
            "X-Goog-Api-Key": apiKey,
            "X-Goog-FieldMask": "id,photos",
          },
          cache: "no-store",
          signal: AbortSignal.timeout(5000),
        });
        if (!detailsResponse.ok) throw new Error("Place photo details unavailable");
        return { id: placeId, ...(await detailsResponse.json()) as { photos?: GooglePhoto[] } };
      })()
      : await resolveExactFallbackProperty({
        apiKey,
        name: fallbackName,
        address: fallbackAddress,
        coordinates: [fallbackLongitude, fallbackLatitude],
      });
    if (!property?.id) return unavailable(404, "photo_unavailable");
    const photo = property.photos?.[0];
    const resource = exactGooglePhotoResource(property.id, photo?.name);
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
