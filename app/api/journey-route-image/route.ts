import { NextRequest, NextResponse } from "next/server";
import { lookupWikimediaDestinationPhotos } from "@/lib/easyt/wikimedia-destination-photo.server";
import { referencePhotoPlaceContext } from "@/lib/easyt/place-reference.server";
import { countryFor } from "@/lib/easyt/country-registry";
import type { DestinationPhotoPlace } from "@/lib/easyt/route-photo-cache";
import { scorePublishedRouteImageCandidate } from "@/lib/easyt/published-route-image-pipeline";

type UnsplashPhoto = {
  id?: string;
  alt_description?: string | null;
  description?: string | null;
  urls?: { regular?: string };
  links?: { download_location?: string };
  user?: { name?: string; links?: { html?: string } };
  width?: number;
  height?: number;
  location?: { city?: string; country?: string; name?: string };
  tags?: Array<{ title?: string }>;
};

const responseHeaders = {
  "Cache-Control": "public, s-maxage=604800, stale-while-revalidate=2592000",
  // Generic positives must have a different CDN key from a place-scoped lookup.
  // Netlify otherwise serves an unvalidated generic result before this route runs.
  "Netlify-Vary": "query=query|place|country|region|district|canonicalPlaceId|providerId|placeType|lon|lat|exclude",
};

function withUnsplashReferral(url?: string) {
  if (!url) return undefined;
  const target = new URL(url);
  target.searchParams.set("utm_source", "morrovia");
  target.searchParams.set("utm_medium", "referral");
  return target.toString();
}

function upstreamReason(status: number) {
  if (status === 401) return "unauthorized";
  if (status === 403) return "forbidden";
  if (status === 429) return "rate-limited";
  if (status >= 500) return "upstream-server-error";
  return "other-upstream-error";
}

function sanitizedProviderErrors(value: unknown, accessKey: string): string[] {
  if (!value || typeof value !== "object") return [];
  const payload = value as { errors?: unknown; message?: unknown };
  const messages = Array.isArray(payload.errors) ? payload.errors : [payload.message];
  return messages.filter((message): message is string => typeof message === "string").slice(0, 3).map((message) =>
    message
      .replaceAll(accessKey, "[redacted]")
      .replace(/\b(?:Client-ID|Bearer)\s+[^\s,;]+/gi, (match) => `${match.split(/\s/)[0]} [redacted]`)
      .replace(/\b(client_id|access_key|token)=[^&\s]+/gi, "$1=[redacted]")
      .replace(/\b[A-Za-z0-9_-]{24,}\b/g, "[redacted]")
      .replace(/[\x00-\x1f\x7f]/g, " ")
      .trim()
      .slice(0, 160)
  ).filter(Boolean);
}

function numericHeader(value: string | null) {
  return value && /^\d{1,6}$/.test(value) ? value : null;
}

function retryAfterHeader(value: string | null) {
  if (!value) return null;
  if (/^\d{1,6}$/.test(value)) return value;
  const date = Date.parse(value);
  return Number.isFinite(date) && value.endsWith(" GMT") ? new Date(date).toUTCString() : null;
}

async function destinationGET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("query")?.trim().slice(0, 180);
  if (!query) return NextResponse.json({ image: null, configured: Boolean(process.env.UNSPLASH_ACCESS_KEY), reason: "missing-query" }, { status: 400 });
  const placeName = request.nextUrl.searchParams.get("place")?.trim();
  const country = request.nextUrl.searchParams.get("country")?.trim();
  const region = request.nextUrl.searchParams.get("region")?.trim();
  const district = request.nextUrl.searchParams.get("district")?.trim();
  const canonicalPlaceId = request.nextUrl.searchParams.get("canonicalPlaceId")?.trim();
  const providerId = request.nextUrl.searchParams.get("providerId")?.trim();
  const placeType = request.nextUrl.searchParams.get("placeType")?.trim();
  const lon = request.nextUrl.searchParams.get("lon"), lat = request.nextUrl.searchParams.get("lat");
  if ((placeName !== undefined || country !== undefined) && (!placeName || placeName.length > 140 || !country || country.length > 100 || (region && region.length > 100) || (district && district.length > 100) || (canonicalPlaceId && canonicalPlaceId.length > 180) || (providerId && providerId.length > 250) || (placeType && placeType.length > 40) || ((lon !== null || lat !== null) && (lon === null || lat === null || !lon.trim() || !lat.trim() || !Number.isFinite(Number(lon)) || !Number.isFinite(Number(lat)) || Math.abs(Number(lon)) > 180 || Math.abs(Number(lat)) > 90)))) return NextResponse.json({ image: null, reason: "invalid-place" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  const coordinates = lon !== null && lat !== null ? [Number(lon), Number(lat)] as [number, number] : undefined;
  const reference = placeName && country ? referencePhotoPlaceContext({ canonicalPlaceId, name: placeName, country, coordinates }) : null;
  if (reference && (!reference.valid || (district && district !== reference.administrativeHierarchy[1]))) return NextResponse.json({ image: null, reason: "invalid-place" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  const place: DestinationPhotoPlace | undefined = placeName && country ? { name: placeName, country, ...(reference?.valid && reference.region ? { region: reference.region } : region ? { region } : {}),
    ...(reference?.valid ? { administrativeHierarchy: reference.administrativeHierarchy, requiresPhotoCoordinates: reference.requiresPhotoCoordinates } : district ? { administrativeHierarchy: [region ?? "", district].filter(Boolean) } : {}),
    ...(canonicalPlaceId ? { canonicalPlaceId } : {}), ...(providerId ? { providerId } : {}),
    ...(placeType ? { placeType } : {}), ...(coordinates ? { coordinates } : {}) } : undefined;
  const excludedSources = request.nextUrl.searchParams.getAll("exclude").filter(src => src.length <= 2048).slice(0, 18);
  const wikimedia = place ? await lookupWikimediaDestinationPhotos(place, { excludedSources }) : null;
  if (wikimedia?.status === "resolved") return NextResponse.json({ image: wikimedia.candidates[0], candidates: wikimedia.candidates, configured: true }, { headers: { "Cache-Control": "no-store" } });
  // Unsplash responses lack a usable photo point; ambiguous same-province identities require one.
  if (place?.requiresPhotoCoordinates) return NextResponse.json({ image: null, candidates: [], configured: true,
    reason: wikimedia?.status === "unavailable" ? "provider-unavailable" : "no-result" },
    { status: wikimedia?.status === "unavailable" ? 502 : 200, headers: { "Cache-Control": "no-store" } });
  const accessKey = process.env.UNSPLASH_ACCESS_KEY?.trim();
  if (!accessKey && wikimedia) return NextResponse.json({ image: null, candidates: [], configured: true, reason: wikimedia.status === "no-result" ? "no-result" : "provider-unavailable" }, { status: wikimedia.status === "no-result" ? 200 : 502, headers: { "Cache-Control": "no-store" } });
  if (!accessKey) return NextResponse.json(
    { image: null, configured: false, reason: "missing-access-key" },
    { headers: { "Cache-Control": "no-store" } },
  );
  try {
    const response = await fetch(`https://api.unsplash.com/search/photos?${new URLSearchParams({ query, per_page: "8", orientation: "landscape", content_filter: "high" })}`, {
      headers: { Authorization: `Client-ID ${accessKey}` },
      // Only a validated positive API response receives the durable image cache.
      cache: "no-store",
      signal: AbortSignal.timeout(6000),
    });
    if (!response.ok) {
      const providerPayload: unknown = await response.json().catch(() => null);
      return NextResponse.json(
        {
          image: null,
          configured: true,
          reason: upstreamReason(response.status),
          upstreamStatus: response.status,
          upstreamErrors: sanitizedProviderErrors(providerPayload, accessKey),
          rateLimitLimit: numericHeader(response.headers.get("X-Ratelimit-Limit")),
          rateLimitRemaining: numericHeader(response.headers.get("X-Ratelimit-Remaining")),
          retryAfter: retryAfterHeader(response.headers.get("Retry-After")),
        },
        { status: response.status === 429 ? 429 : 502, headers: { "Cache-Control": "no-store" } },
      );
    }
    const photos = ((await response.json()) as { results?: UnsplashPhoto[] }).results ?? [];
    const candidates = photos.flatMap((photo) => {
      const src = photo.urls?.regular;
      const sourceUrl = withUnsplashReferral(photo.user?.links?.html);
      if (!photo.id || !src || !sourceUrl || !photo.user?.name) return [];
      if (excludedSources.includes(src) || excludedSources.includes(`unsplash:${photo.id}`)) return [];
      if (place && !scorePublishedRouteImageCandidate({ key: "destination", ...place, subjectContext: place.administrativeHierarchy?.length ? place.administrativeHierarchy : place.region ? [place.region] : [], coordinates: place.coordinates ? [...place.coordinates] : [0, 0], routeKeys: [], siblingNames: [], attachedLandmarks: [] }, { provider: "unsplash", id: photo.id, src, sourceUrl, author: photo.user.name, license: "Unsplash License", licenseUrl: "https://unsplash.com/license", width: photo.width ?? 0, height: photo.height ?? 0, alt: photo.alt_description, description: photo.description, location: photo.location, tags: photo.tags?.flatMap(tag => tag.title ? [tag.title] : []) }).accepted) return [];
      return [{
        id: photo.id,
        src,
        alt: photo.alt_description || photo.description || query,
        sourceUrl,
        sourceLabel: `Photo by ${photo.user.name} on Unsplash`,
        downloadLocation: photo.links?.download_location,
        ...(place ? { provider: "unsplash" as const, author: photo.user.name, authorUrl: sourceUrl, license: "Unsplash License", licenseUrl: "https://unsplash.com/license" } : {}),
      }];
    });
    const photo = candidates[0];
    if (!photo) return NextResponse.json({ image: null, candidates: [], configured: true, reason: wikimedia?.status === "unavailable" ? "provider-unavailable" : "no-result" }, { status: wikimedia?.status === "unavailable" ? 502 : 200, headers: { "Cache-Control": "no-store" } });
    return NextResponse.json(
      { image: photo, candidates, configured: true, query },
      { headers: place ? { "Cache-Control": "no-store" } : responseHeaders },
    );
  } catch {
    return NextResponse.json(
      { image: null, configured: true, reason: "request-failed" },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
}

/** Country illustrations retain their own geography and never impersonate a destination. */
export async function GET(request: NextRequest) {
  const destination = await destinationGET(request);
  const body = await destination.clone().json();
  const country = countryFor(request.nextUrl.searchParams.get("country"));
  if (body.image || destination.status === 400 || !country || !request.nextUrl.searchParams.get("place")) return destination;
  const nextUrl = new URL(request.nextUrl);
  // Country context has no city identity, administrative district or camera point.
  for (const key of ["region", "district", "canonicalPlaceId", "providerId", "lon", "lat"]) nextUrl.searchParams.delete(key);
  nextUrl.searchParams.set("place", country.name);
  nextUrl.searchParams.set("country", country.name);
  nextUrl.searchParams.set("placeType", "country");
  nextUrl.searchParams.set("query", `${country.name} landscape`);
  const illustrative = await destinationGET({ ...request, nextUrl } as NextRequest);
  const fallback = await illustrative.clone().json();
  if (!fallback.image) {
    // A completed empty search must not disguise an earlier provider outage.
    return destination.ok && !illustrative.ok ? illustrative : destination;
  }
  const candidates = (fallback.candidates ?? [fallback.image]).map((photo: Record<string, unknown>) => ({
    ...photo, scope: "country", country: country.name,
    alt: `Illustrative ${country.name} imagery: ${photo.alt || "country landscape"}`,
  }));
  return NextResponse.json({ ...fallback, image: candidates[0], candidates,
    destinationStatus: body.reason ?? "no-result" }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
  const accessKey = process.env.UNSPLASH_ACCESS_KEY?.trim();
  if (!accessKey) return NextResponse.json({ tracked: false }, { status: 503 });
  try {
    const { downloadLocation } = await request.json() as { downloadLocation?: string };
    if (!downloadLocation) return NextResponse.json({ tracked: false }, { status: 400 });
    const target = new URL(downloadLocation);
    if (target.protocol !== "https:" || target.hostname !== "api.unsplash.com" || !/^\/photos\/[^/]+\/download$/.test(target.pathname)) {
      return NextResponse.json({ tracked: false }, { status: 400 });
    }
    const response = await fetch(target, { headers: { Authorization: `Client-ID ${accessKey}` }, cache: "no-store", signal: AbortSignal.timeout(4000) });
    return NextResponse.json({ tracked: response.ok }, { status: response.ok ? 200 : 502, headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ tracked: false }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
}
