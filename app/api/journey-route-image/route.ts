import { NextRequest, NextResponse } from "next/server";
import { lookupWikimediaDestinationPhotos } from "@/lib/easyt/wikimedia-destination-photo.server";
import { referencePhotoPlaceContext } from "@/lib/easyt/place-reference.server";
import { countryFor } from "@/lib/easyt/country-registry";
import type { DestinationPhotoPlace } from "@/lib/easyt/route-photo-cache";
import { choosePublishedRouteImageCandidate, type PublishedRouteImageCandidate } from "@/lib/easyt/published-route-image-pipeline";

type UnsplashPhoto = {
  id?: string;
  alt_description?: string | null;
  description?: string | null;
  urls?: { regular?: string };
  links?: { download_location?: string; html?: string };
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
  const place: DestinationPhotoPlace | undefined = placeName && country ? { name: reference?.valid ? reference.canonicalName : placeName, country, ...(reference?.valid && reference.region ? { region: reference.region } : region ? { region } : {}),
    ...(reference?.valid ? { administrativeHierarchy: reference.administrativeHierarchy, requiresPhotoCoordinates: reference.requiresPhotoCoordinates } : district ? { administrativeHierarchy: [region ?? "", district].filter(Boolean) } : {}),
    ...(canonicalPlaceId ? { canonicalPlaceId } : {}), ...(providerId ? { providerId } : {}),
    ...(reference?.valid ? { placeType: reference.placeType } : placeType ? { placeType } : {}), ...(coordinates ? { coordinates } : {}) } : undefined;
  const excludedSources = request.nextUrl.searchParams.getAll("exclude").filter(src => src.length <= 2048).slice(0, 18);
  const accessKey = process.env.UNSPLASH_ACCESS_KEY?.trim();
  const wikimedia = place ? await lookupWikimediaDestinationPhotos(place, { excludedSources }) : null;
  const providers = {
    wikimedia: { configured: true, attempted: Boolean(place), status: wikimedia?.status ?? "not-attempted", ...(wikimedia?.diagnostics ? { diagnostics: wikimedia.diagnostics } : {}) },
    unsplash: { configured: Boolean(accessKey), attempted: false, status: "not-attempted", diagnostics: { queries: 0, inspected: 0, eligible: 0, suitable: 0, rejections: {} as Record<string, number> } },
  };
  const respond = (body: Record<string, unknown>, init?: ResponseInit) => NextResponse.json({ ...body, providers }, init);
  if (wikimedia?.candidates.length) return respond({ image: wikimedia.candidates[0], candidates: wikimedia.candidates, configured: true }, { headers: { "Cache-Control": "no-store" } });
  // Unsplash responses lack a usable photo point; ambiguous same-province identities require one.
  if (place?.requiresPhotoCoordinates) return respond({ image: null, candidates: [], configured: true,
    reason: wikimedia?.status === "unavailable" ? "provider-unavailable" : "no-result" },
    { status: wikimedia?.status === "unavailable" ? 502 : 200, headers: { "Cache-Control": "no-store" } });
  if (!accessKey && wikimedia) return respond({ image: null, candidates: [], configured: true, reason: wikimedia.status === "no-result" ? "no-result" : "provider-unavailable" }, { status: wikimedia.status === "no-result" ? 200 : 502, headers: { "Cache-Control": "no-store" } });
  if (!accessKey) return respond(
    { image: null, configured: false, reason: "missing-access-key" },
    { headers: { "Cache-Control": "no-store" } },
  );
  try {
    providers.unsplash.attempted = true;
    providers.unsplash.diagnostics.queries = 1;
    const response = await fetch(`https://api.unsplash.com/search/photos?${new URLSearchParams({ query: place ? `${place.name} ${place.country} ${place.placeType === "transport_gateway" ? "airport" : "landscape"}` : query, per_page: "8", orientation: "landscape", content_filter: "high" })}`, {
      headers: { Authorization: `Client-ID ${accessKey}` },
      // Only a validated positive API response receives the durable image cache.
      cache: "no-store",
      signal: AbortSignal.timeout(6000),
    });
    if (!response.ok) {
      providers.unsplash.status = "unavailable";
      const providerPayload: unknown = await response.json().catch(() => null);
      return respond(
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
    providers.unsplash.diagnostics.inspected = Math.min(photos.length, 8);
    const pool = photos.slice(0, 8).flatMap((photo) => {
      const src = photo.urls?.regular;
      const authorUrl = withUnsplashReferral(photo.user?.links?.html);
      const sourceUrl = withUnsplashReferral(photo.links?.html) ?? authorUrl;
      if (!photo.id || !src || !sourceUrl || !authorUrl || !photo.user?.name) return [];
      if (excludedSources.includes(src) || excludedSources.includes(`unsplash:${photo.id}`)) return [];
      const candidate: PublishedRouteImageCandidate = { provider: "unsplash", id: photo.id, src, sourceUrl, author: photo.user.name,
        authorUrl, license: "Unsplash License", licenseUrl: "https://unsplash.com/license", width: photo.width ?? 0, height: photo.height ?? 0,
        alt: photo.alt_description, description: photo.description, location: photo.location, tags: photo.tags?.flatMap(tag => tag.title ? [tag.title] : []) };
      const cachedPhoto = {
        id: photo.id, src, alt: photo.alt_description || photo.description || query, sourceUrl,
        sourceLabel: `Photo by ${photo.user.name} on Unsplash`, downloadLocation: photo.links?.download_location,
        ...(place ? { provider: "unsplash" as const, author: photo.user.name, authorUrl, license: candidate.license, licenseUrl: candidate.licenseUrl,
          width: candidate.width, height: candidate.height, description: photo.description ?? undefined } : {}),
      };
      return [{ candidate, photo: cachedPhoto }];
    });
    const ranked = place ? choosePublishedRouteImageCandidate({ key: "destination", ...place,
      subjectContext: place.administrativeHierarchy?.length ? place.administrativeHierarchy : place.region ? [place.region] : [],
      coordinates: place.coordinates ? [...place.coordinates] : [0, 0], routeKeys: [], siblingNames: [], attachedLandmarks: [] }, pool.map(item => item.candidate)).ranked : null;
    const candidates = ranked ? ranked.filter(item => item.accepted).map(item => pool.find(entry => entry.candidate === item.candidate)!.photo) : pool.map(item => item.photo);
    if (ranked) {
      providers.unsplash.diagnostics.eligible = ranked.filter(item => item.eligible).length;
      providers.unsplash.diagnostics.suitable = ranked.filter(item => item.accepted).length;
      for (const item of ranked) for (const reason of [...item.concerns, ...item.suitabilityConcerns]) providers.unsplash.diagnostics.rejections[reason] = (providers.unsplash.diagnostics.rejections[reason] ?? 0) + 1;
    }
    providers.unsplash.status = candidates.length ? "resolved" : "no-result";
    const photo = candidates[0];
    if (!photo) return respond({ image: null, candidates: [], configured: true, reason: wikimedia?.status === "unavailable" ? "provider-unavailable" : "no-result" }, { status: wikimedia?.status === "unavailable" ? 502 : 200, headers: { "Cache-Control": "no-store" } });
    return respond(
      { image: photo, candidates, configured: true, query },
      { headers: place ? { "Cache-Control": "no-store" } : responseHeaders },
    );
  } catch {
    providers.unsplash.status = "unavailable";
    return respond(
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
    destinationProviders: body.providers, destinationStatus: body.reason ?? "no-result" }, { headers: { "Cache-Control": "no-store" } });
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
