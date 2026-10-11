import { normalizeImageGeography, choosePublishedRouteImageCandidate, type PublishedRouteImageCandidate } from "./published-route-image-pipeline.ts";
import { placeDistanceKm } from "./local-place-geography.ts";
import { isReusableWikimediaLicense, isWikimediaCommonsImageUrl } from "./photo-attribution.ts";
import { withProviderTimeout } from "./provider-timeout.ts";
import { routePhotoAssetIdentity } from "./route-photo-cache.ts";
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

function destinationPhoto(page: unknown, place: DestinationPhotoPlace, excludedSources: readonly string[]): Array<{ candidate: PublishedRouteImageCandidate; photo: CachedRoutePhoto }> {
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
  if (place.requiresPhotoCoordinates && (!place.coordinates || !coordinates)) return [];
  if (place.coordinates && coordinates && placeDistanceKm([...place.coordinates], coordinates) > 50) return [];
  const hierarchy = place.administrativeHierarchy?.filter(Boolean) ?? [];
  const region = normalizeImageGeography(hierarchy.at(-1) || place.region?.trim() || "");
  const regionEvidence = normalizeImageGeography(`${page.title} ${text(value("ImageDescription"))} ${text(value("ObjectName"))}`);
  // GPS constrains location; it cannot identify a namesake in the selected district.
  if (region && !` ${regionEvidence} `.includes(` ${region} `)) return [];
  const candidate: PublishedRouteImageCandidate = {
    provider: "wikimedia", id: page.title, src, sourceUrl, author, license, licenseUrl, width: info.width, height: info.height,
    alt: text(value("ImageDescription")), description: text(value("ImageDescription")) || `${page.title} ${text(value("ObjectName"))}`,
    geographicContext: `${page.title} ${text(value("ObjectName"))}`,
    ...(place.coordinates && coordinates ? { coordinates } : {}),
    ...(value("DateTimeOriginal") ? { captureDate: text(value("DateTimeOriginal")) } : {}),
    ...(value("Country") ? { location: { country: text(value("Country")) } } : {}),
  };
  if (excludedSources.includes(src) || excludedSources.includes(sourceUrl) || excludedSources.includes(routePhotoAssetIdentity(candidate))) return [];
  const authorUrl = httpsUrl(value("Artist")?.match(/href=["']([^"']+)/)?.[1]);
  return [{ candidate, photo: { width: candidate.width, height: candidate.height, description: candidate.description ?? undefined, captureDate: candidate.captureDate, id: candidate.id, provider: "wikimedia", src, alt: candidate.alt || `${place.name}, ${place.country}`,
    sourceUrl, sourceLabel: `${author} · ${license}`, author, ...(authorUrl ? { authorUrl } : {}), license, licenseUrl } }];
}

/** Reuses the reviewed-image geography/subject contract; raw search hits are never displayed. */
export async function lookupWikimediaDestinationPhotos(place: DestinationPhotoPlace, options: {
  fetcher?: typeof fetch; excludedSources?: readonly string[]; timeoutMs?: number;
} = {}): Promise<RoutePhotoLookup> {
  if (!place.name.trim() || !place.country.trim()) return { candidates: [], configured: true, status: "no-result" };
  const diagnostics = { queries: 0, inspected: 0, eligible: 0, suitable: 0, rejections: {} as Record<string, number> };
  const stop = { key: "destination", ...place, subjectContext: place.administrativeHierarchy?.length ? place.administrativeHierarchy : place.region ? [place.region] : [],
    coordinates: (place.coordinates ? [...place.coordinates] : [0, 0]) as [number, number], routeKeys: [], siblingNames: [], attachedLandmarks: [] };
  const pool: Array<{ candidate: PublishedRouteImageCandidate; photo: CachedRoutePhoto }> = [];
  const rank = () => choosePublishedRouteImageCandidate(stop, pool.map(item => item.candidate));
  const complete = (unavailable: boolean): RoutePhotoLookup => {
    const ranked = rank().ranked;
    diagnostics.eligible = ranked.filter(item => item.eligible).length;
    diagnostics.suitable = ranked.filter(item => item.accepted).length;
    diagnostics.rejections = {};
    for (const item of ranked) for (const reason of [...item.concerns, ...item.suitabilityConcerns]) diagnostics.rejections[reason] = (diagnostics.rejections[reason] ?? 0) + 1;
    const candidates = ranked.filter(item => item.accepted).map(item => pool.find(entry => entry.candidate === item.candidate)!.photo);
    return { candidates, configured: true, status: unavailable ? "unavailable" : candidates.length ? "resolved" : "no-result", diagnostics };
  };
  try {
    const name = place.name.replaceAll('"', "");
    const geography = (place.region?.trim() || place.country).replaceAll('"', "");
    const subject = place.placeType === "transport_gateway" ? "airport" : place.placeType === "city" ? "skyline" : "landscape";
    const searches = [`"${name}" ${place.country}`, `"${name}" ${geography} ${subject} filetype:bitmap`];
    const result = await withProviderTimeout({
      label: "Wikimedia destination photography", timeoutMs: options.timeoutMs ?? 6000,
      request: async signal => {
        for (const search of searches) {
          const params = new URLSearchParams({ action: "query", format: "json", generator: "search",
            gsrsearch: search, gsrnamespace: "6", gsrlimit: "12",
            prop: "imageinfo", iiprop: "url|size|mime|extmetadata", iiurlwidth: "1200" });
          diagnostics.queries++;
          const response = await (options.fetcher ?? fetch)(`https://commons.wikimedia.org/w/api.php?${params}`, {
            cache: "no-store", headers: { "Api-User-Agent": "MorroviaDestinationPhotos/1.0 (https://morrovia.com)" }, signal,
          });
          if (signal.aborted || !response.ok) return false;
          const payload: unknown = await response.json();
          if (signal.aborted || !isRecord(payload) || payload.error) return false;
          const query = isRecord(payload.query) ? payload.query : {};
          const pages = isRecord(query.pages) ? query.pages : {};
          const hits = Object.values(pages).slice(0, 12);
          diagnostics.inspected += hits.length;
          pool.push(...hits.flatMap(page => destinationPhoto(page, place, options.excludedSources ?? [])));
          // A second bounded query is useful when only one representative asset exists.
          if (rank().ranked.filter(item => item.accepted).length >= 2) break;
        }
        return true;
      },
    });
    return complete(!result);
  } catch { return complete(true); }
}
