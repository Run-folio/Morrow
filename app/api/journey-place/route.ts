import { NextRequest, NextResponse } from "next/server";

type Summary = { extract?: string; thumbnail?: { source?: string }; content_urls?: { desktop?: { page?: string } } };
type SearchResult = { title?: string; snippet?: string };
type SearchPage = { title?: string; extract?: string; thumbnail?: { source?: string } };
type UnsplashPhoto = {
  alt_description?: string | null;
  description?: string | null;
  urls?: { regular?: string };
  links?: { download_location?: string };
  user?: { name?: string; links?: { html?: string } };
};

async function summaryFor(title: string) {
  const response = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`, { next: { revalidate: 60 * 60 * 24 * 14 } });
  if (!response.ok) return null;
  return response.json() as Promise<Summary>;
}

async function imageFor(title: string, area?: string, country?: string) {
  const query = [title, area, country].filter(Boolean).join(" ");
  const params = new URLSearchParams({
    action: "query", format: "json", generator: "search", gsrsearch: query,
    gsrnamespace: "0", gsrlimit: "6", prop: "pageimages|extracts", piprop: "thumbnail",
    pithumbsize: "900", exintro: "1", explaintext: "1", origin: "*",
  });
  const response = await fetch(`https://en.wikipedia.org/w/api.php?${params}`, { next: { revalidate: 60 * 60 * 24 * 14 } });
  if (!response.ok) return undefined;
  const data = await response.json() as { query?: { pages?: Record<string, SearchPage> } };
  const normalisedTitle = title.toLocaleLowerCase();
  const pages = Object.values(data.query?.pages ?? {});
  const closest = pages.find((page) => page.title?.toLocaleLowerCase() === normalisedTitle)
    ?? pages.find((page) => page.title?.toLocaleLowerCase().includes(normalisedTitle));
  return closest?.thumbnail?.source ?? pages.find((page) => page.thumbnail?.source)?.thumbnail?.source;
}

function withUnsplashReferral(url?: string) {
  if (!url) return undefined;
  const target = new URL(url);
  target.searchParams.set("utm_source", "morrovia");
  target.searchParams.set("utm_medium", "referral");
  return target.toString();
}

async function unsplashImageFor(title: string, area?: string, country?: string) {
  const accessKey = process.env.UNSPLASH_ACCESS_KEY;
  if (!accessKey) return null;
  const query = [title, area, country].filter(Boolean).join(" ");
  const response = await fetch(`https://api.unsplash.com/search/photos?${new URLSearchParams({ query, per_page: "1", orientation: "landscape", content_filter: "high" })}`, {
    headers: { Authorization: `Client-ID ${accessKey}` },
    next: { revalidate: 60 * 60 * 24 * 7 },
    signal: AbortSignal.timeout(6000),
  });
  if (!response.ok) return null;
  const photo = ((await response.json()) as { results?: UnsplashPhoto[] }).results?.[0];
  const image = photo?.urls?.regular;
  const photographerUrl = withUnsplashReferral(photo?.user?.links?.html);
  if (!image || !photographerUrl || !photo.user?.name) return null;

  // Unsplash asks API clients to register an image selection through its
  // download endpoint. This also keeps their photographer metrics accurate.
  if (photo.links?.download_location) {
    void fetch(photo.links.download_location, {
      headers: { Authorization: `Client-ID ${accessKey}` },
      cache: "no-store",
      signal: AbortSignal.timeout(4000),
    }).catch(() => undefined);
  }
  return {
    image,
    alt: photo.alt_description || photo.description || `${title}, ${country ?? area ?? ""}`.trim(),
    sourceUrl: photographerUrl,
    sourceLabel: `Photo by ${photo.user.name} on Unsplash`,
  };
}

function isInCountry(summary: Summary | null, country?: string) {
  return Boolean(summary && (!country || summary.extract?.toLocaleLowerCase().includes(country.toLocaleLowerCase())));
}

export async function GET(request: NextRequest) {
  const title = request.nextUrl.searchParams.get("title")?.trim();
  const area = request.nextUrl.searchParams.get("area")?.trim();
  const country = request.nextUrl.searchParams.get("country")?.trim();
  if (!title || title.length > 140) return NextResponse.json({ place: null }, { status: 400 });
  try {
    const unsplash = await unsplashImageFor(title, area, country);
    let summary = await summaryFor(title);
    // Title-only Wikipedia resolution is global. If it does not clearly relate to
    // the requested country, do a contextual search rather than using a wrong city.
    if (!isInCountry(summary, country) && country) {
      const params = new URLSearchParams({ action: "query", format: "json", list: "search", srsearch: `${title} ${country}`, srnamespace: "0", srlimit: "5", origin: "*" });
      const response = await fetch(`https://en.wikipedia.org/w/api.php?${params}`, { next: { revalidate: 60 * 60 * 24 * 14 } });
      const data = response.ok ? await response.json() as { query?: { search?: SearchResult[] } } : {};
      const candidate = data.query?.search?.find((item) => item.title && `${item.title} ${item.snippet ?? ""}`.toLocaleLowerCase().includes(country.toLocaleLowerCase()));
      summary = candidate?.title ? await summaryFor(candidate.title) : null;
    }
    const image = unsplash?.image ?? summary?.thumbnail?.source ?? await imageFor(title, area, country);
    if (!summary && !image) return NextResponse.json({ place: null });
    return NextResponse.json({ place: {
      image,
      alt: unsplash?.alt,
      description: isInCountry(summary, country) ? summary?.extract : undefined,
      sourceUrl: unsplash?.sourceUrl ?? summary?.content_urls?.desktop?.page,
      sourceLabel: unsplash?.sourceLabel,
    } });
  } catch {
    return NextResponse.json({ place: null });
  }
}
