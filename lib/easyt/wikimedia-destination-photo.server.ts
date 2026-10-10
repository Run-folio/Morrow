import { normalizeImageGeography, scorePublishedRouteImageCandidate, type PublishedRouteImageCandidate } from "./published-route-image-pipeline.ts";
import { placeDistanceKm } from "./local-place-geography.ts";
import { isReusableWikimediaLicense, isWikimediaCommonsImageUrl } from "./photo-attribution.ts";
import { withProviderTimeout } from "./provider-timeout.ts";
import type { CachedRoutePhoto, DestinationPhotoPlace, RoutePhotoLookup } from "./route-photo-cache.ts";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown) {
  return typeof value === "string" ? value.replace(/<[^>]*>/g, " ")
    .replace(/&(?:quot|#34);/g, '"').replace(/&(?:amp|#38);/g, "&")
    .replace(/\s+/g, " ").trim().slice(0, 2000) : "";
}

function httpsUrl(value: unknown, host?: string) {
  if (typeof value !== "string") return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && (!host || url.hostname === host) ? url.href : undefined;
  } catch { return undefined; }
}

function destinationPhoto(page: unknown, place: DestinationPhotoPlace, excludedSources: readonly string[]): CachedRoutePhoto[] {
  if (!isRecord(page) || typeof page.title !== "string" || !page.title.startsWith("File:") || !Array.isArray(page.imageinfo)) return [];
  const info: unknown = page.imageinfo[0];
  if (!isRecord(info)) return [];
  const metadata = isRecord(info.extmetadata) ? info.extmetadata : {};
  const value = (field: string) => {
    const entry = metadata[field];
    return isRecord(entry) && typeof entry.value === "string" ? entry.value : undefined;
  };
  const thumbnail = httpsUrl(info.thumburl);
  const original = httpsUrl(info.url);
  const src = thumbnail && isWikimediaCommonsImageUrl(thumbnail) ? thumbnail
    : original && isWikimediaCommonsImageUrl(original) ? original : undefined;
  const sourceUrl = httpsUrl(info.descriptionurl, "commons.wikimedia.org");
  const author = text(value("Artist") || value("Credit"));
  const license = text(value("LicenseShortName"));
  const licenseUrl = httpsUrl(value("LicenseUrl")?.replace(/^\/\//, "https://"));
  if (!src || !sourceUrl || !new URL(sourceUrl).pathname.startsWith("/wiki/File:") || !author || !license || !licenseUrl ||
    typeof info.width !== "number" || typeof info.height !== "number" || !Number.isFinite(info.width) || !Number.isFinite(info.height) ||
    info.width <= 0 || info.height <= 0 || typeof info.mime !== "string" || !["image/jpeg", "image/png", "image/webp"].includes(info.mime)) return [];
  if (!isReusableWikimediaLicense(license, licenseUrl)) return [];
  const longitude = value("GPSLongitude") ? Number(value("GPSLongitude")) : NaN;
  const latitude = value("GPSLatitude") ? Number(value("GPSLatitude")) : NaN;
  const coordinates: [number, number] | undefined = Number.isFinite(longitude) && Number.isFinite(latitude) &&
    Math.abs(longitude) <= 180 && Math.abs(latitude) <= 90 ? [longitude, latitude] : undefined;
  if (place.coordinates && coordinates && placeDistanceKm([...place.coordinates], coordinates) > 50) return [];
  const region = normalizeImageGeography(place.region?.trim() ?? "");
  const regionEvidence = normalizeImageGeography(`${page.title} ${text(value("ImageDescription"))} ${text(value("ObjectName"))}`);
  const nearbyCoordinates = Boolean(place.coordinates && coordinates && placeDistanceKm([...place.coordinates], coordinates) <= 50);
  if (region && !nearbyCoordinates && (region.length < 4 || !` ${regionEvidence} `.includes(` ${region} `))) return [];
  const candidate: PublishedRouteImageCandidate = {
    provider: "wikimedia", id: page.title, src, sourceUrl, author, license, licenseUrl, width: info.width, height: info.height,
    alt: text(value("ImageDescription")), description: `${page.title} ${text(value("ImageDescription"))} ${text(value("ObjectName"))}`,
    ...(place.coordinates && coordinates ? { coordinates } : {}),
    ...(value("Country") ? { location: { country: text(value("Country")) } } : {}),
  };
  if (!scorePublishedRouteImageCandidate({ key: "destination", name: place.name, country: place.country,
    coordinates: place.coordinates ? [...place.coordinates] : [0, 0], routeKeys: [], siblingNames: [], attachedLandmarks: [] }, candidate).accepted ||
    (excludedSources.includes(src) || excludedSources.includes(sourceUrl))) return [];
  const authorUrl = httpsUrl(value("Artist")?.match(/href=["']([^"']+)/)?.[1]);
  return [{ id: candidate.id, provider: "wikimedia", src, alt: candidate.alt || `${place.name}, ${place.country}`,
    sourceUrl, sourceLabel: `${author} · ${license}`, author, ...(authorUrl ? { authorUrl } : {}), license, licenseUrl }];
}

/** Reuses the reviewed-image geography/subject contract; raw search hits are never displayed. */
export async function lookupWikimediaDestinationPhotos(place: DestinationPhotoPlace, options: {
  fetcher?: typeof fetch; excludedSources?: readonly string[]; timeoutMs?: number;
} = {}): Promise<RoutePhotoLookup> {
  if (!place.name.trim() || !place.country.trim()) return { candidates: [], configured: true, status: "no-result" };
  try {
    const name = place.name.replaceAll('"', "");
    const geography = (place.region?.trim() || place.country).replaceAll('"', "");
    const subject = place.placeType === "city" ? "skyline" : "landscape";
    const searches = [`"${name}" ${place.country}`, `"${name}" ${geography} ${subject} filetype:bitmap`];
    const result = await withProviderTimeout({
      label: "Wikimedia destination photography", timeoutMs: options.timeoutMs ?? 6000,
      request: async signal => {
        for (const search of searches) {
          const params = new URLSearchParams({ action: "query", format: "json", generator: "search",
            gsrsearch: search, gsrnamespace: "6", gsrlimit: "12",
            prop: "imageinfo", iiprop: "url|size|mime|extmetadata", iiurlwidth: "1200" });
          const response = await (options.fetcher ?? fetch)(`https://commons.wikimedia.org/w/api.php?${params}`, {
            cache: "no-store", headers: { "Api-User-Agent": "MorroviaDestinationPhotos/1.0 (https://morrovia.com)" }, signal,
          });
          if (!response.ok) return { ok: false, candidates: [] as CachedRoutePhoto[] };
          const payload: unknown = await response.json();
          if (!isRecord(payload) || payload.error) return { ok: false, candidates: [] as CachedRoutePhoto[] };
          const query = isRecord(payload.query) ? payload.query : {};
          const pages = isRecord(query.pages) ? query.pages : {};
          const searchIndex = (page: unknown) => isRecord(page) && typeof page.index === "number" && Number.isInteger(page.index)
            ? page.index : Number.MAX_SAFE_INTEGER;
          const candidates = Object.values(pages).sort((a, b) => searchIndex(a) - searchIndex(b))
            .flatMap(page => destinationPhoto(page, place, options.excludedSources ?? []));
          if (candidates.length) return { ok: true, candidates };
        }
        return { ok: true, candidates: [] as CachedRoutePhoto[] };
      },
    });
    if (!result.ok) return { candidates: [], configured: true, status: "unavailable" };
    return { candidates: result.candidates, configured: true, status: result.candidates.length ? "resolved" : "no-result" };
  } catch { return { candidates: [], configured: true, status: "unavailable" }; }
}
