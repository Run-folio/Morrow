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
      next: { revalidate: 60 * 60 * 24 * 7 },
      signal: AbortSignal.timeout(6000),
    });
    if (!response.ok) return NextResponse.json(
      { image: null, configured: true, reason: response.status === 429 ? "rate-limited" : "unsplash-error" },
      { status: response.status === 429 ? 429 : 502, headers: { "Cache-Control": "no-store" } },
    );
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
    if (!photo) return NextResponse.json({ image: null, candidates: [], configured: true, reason: "no-result" }, { headers: responseHeaders });
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
