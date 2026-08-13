import { NextRequest, NextResponse } from "next/server";

type UnsplashPhoto = {
  alt_description?: string | null;
  description?: string | null;
  urls?: { regular?: string };
  links?: { download_location?: string };
  user?: { name?: string; links?: { html?: string } };
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
    const response = await fetch(`https://api.unsplash.com/search/photos?${new URLSearchParams({ query, per_page: "1", orientation: "landscape", content_filter: "high" })}`, {
      headers: { Authorization: `Client-ID ${accessKey}` },
      next: { revalidate: 60 * 60 * 24 * 7 },
      signal: AbortSignal.timeout(6000),
    });
    if (!response.ok) return NextResponse.json(
      { image: null, configured: true, reason: response.status === 429 ? "rate-limited" : "unsplash-error" },
      { status: response.status === 429 ? 429 : 502, headers: { "Cache-Control": "no-store" } },
    );
    const photo = ((await response.json()) as { results?: UnsplashPhoto[] }).results?.[0];
    const src = photo?.urls?.regular;
    const sourceUrl = withUnsplashReferral(photo?.user?.links?.html);
    if (!src || !sourceUrl || !photo.user?.name) return NextResponse.json({ image: null, configured: true, reason: "no-result" });
    if (photo.links?.download_location) void fetch(photo.links.download_location, { headers: { Authorization: `Client-ID ${accessKey}` }, cache: "no-store", signal: AbortSignal.timeout(4000) }).catch(() => undefined);
    return NextResponse.json(
      { image: { src, alt: photo.alt_description || photo.description || query, sourceUrl, sourceLabel: `Photo by ${photo.user.name} on Unsplash` }, configured: true },
      { headers: { "Cache-Control": "public, s-maxage=604800, stale-while-revalidate=2592000" } },
    );
  } catch {
    return NextResponse.json(
      { image: null, configured: true, reason: "request-failed" },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
}
