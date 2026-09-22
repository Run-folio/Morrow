import { NextRequest, NextResponse } from "next/server";

type UnsplashPhoto = {
  id?: string;
  alt_description?: string | null;
  description?: string | null;
  urls?: { regular?: string };
  links?: { download_location?: string };
  user?: { name?: string; links?: { html?: string } };
};

const responseHeaders = {
  "Cache-Control": "public, s-maxage=604800, stale-while-revalidate=2592000",
  // Netlify's durable cache does not vary custom API responses by arbitrary
  // query parameters unless they are named explicitly.
  "Netlify-Vary": "query=query",
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

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("query")?.trim().slice(0, 180);
  if (!query) return NextResponse.json({ image: null, configured: Boolean(process.env.UNSPLASH_ACCESS_KEY), reason: "missing-query" }, { status: 400 });
  const accessKey = process.env.UNSPLASH_ACCESS_KEY?.trim();
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
      return [{
        id: photo.id,
        src,
        alt: photo.alt_description || photo.description || query,
        sourceUrl,
        sourceLabel: `Photo by ${photo.user.name} on Unsplash`,
        downloadLocation: photo.links?.download_location,
      }];
    });
    const photo = candidates[0];
    if (!photo) return NextResponse.json({ image: null, candidates: [], configured: true, reason: "no-result" }, { headers: { "Cache-Control": "no-store" } });
    return NextResponse.json(
      { image: photo, candidates, configured: true, query },
      { headers: responseHeaders },
    );
  } catch {
    return NextResponse.json(
      { image: null, configured: true, reason: "request-failed" },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
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
