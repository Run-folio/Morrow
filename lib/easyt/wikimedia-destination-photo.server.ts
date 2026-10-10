import { scorePublishedRouteImageCandidate, type PublishedRouteImageCandidate } from "./published-route-image-pipeline.ts";
import { placeDistanceKm } from "./local-place-geography.ts";
import { withProviderTimeout } from "./provider-timeout.ts";
import type { DestinationPhotoPlace, RoutePhotoLookup } from "./route-photo-cache.ts";

type Metadata = Record<string, { value?: string }>;
type CommonsPage = { title?: string; imageinfo?: Array<{ url?: string; thumburl?: string; descriptionurl?: string; width?: number; height?: number; mime?: string; extmetadata?: Metadata }> };
const text = (value?: string) => (value ?? "").replace(/<[^>]*>/g, " ").replace(/&(?:quot|#34);/g, '"').replace(/&(?:amp|#38);/g, "&").replace(/\s+/g, " ").trim().slice(0, 2000);
function httpsUrl(value?: string, host?: string) {
  try { const url = new URL(value ?? ""); return url.protocol === "https:" && (!host || url.hostname === host) ? url.href : undefined; } catch { return undefined; }
}

/** Reuses the reviewed-image geography/subject contract; raw search hits are never displayed. */
export async function lookupWikimediaDestinationPhotos(place: DestinationPhotoPlace, options: { fetcher?: typeof fetch; excludedSources?: readonly string[]; timeoutMs?: number } = {}): Promise<RoutePhotoLookup> {
  if (!place.name.trim() || !place.country.trim()) return { candidates: [], configured: true, status: "no-result" };
  try {
    const result = await withProviderTimeout({ label: "Wikimedia destination photography", timeoutMs: options.timeoutMs ?? 6000, request: async signal => { const response = await (options.fetcher ?? fetch)(`https://commons.wikimedia.org/w/api.php?${new URLSearchParams({ action: "query", format: "json", generator: "search", gsrsearch: `"${place.name.replaceAll('"', '')}" ${place.country}`, gsrnamespace: "6", gsrlimit: "12", prop: "imageinfo", iiprop: "url|size|mime|extmetadata", iiurlwidth: "1200" })}`, { cache: "no-store", headers: { "Api-User-Agent": "MorroviaDestinationPhotos/1.0 (https://morrovia.com)" }, signal }); return { ok: response.ok, payload: response.ok ? await response.json() as { error?: unknown; query?: { pages?: Record<string, CommonsPage> } } : null }; } });
    if (!result.ok) return { candidates: [], configured: true, status: "unavailable" };
    const payload = result.payload!;
    if (payload.error) return { candidates: [], configured: true, status: "unavailable" };
    const candidates = Object.values(payload.query?.pages ?? {}).flatMap(page => {
      if (!page || typeof page !== "object") return [];
      const info = page.imageinfo?.[0], metadata = info?.extmetadata ?? {};
      const src = httpsUrl(info?.thumburl ?? info?.url, "upload.wikimedia.org"), sourceUrl = httpsUrl(info?.descriptionurl, "commons.wikimedia.org");
      const author = text(metadata.Artist?.value || metadata.Credit?.value), license = text(metadata.LicenseShortName?.value), licenseUrl = httpsUrl(metadata.LicenseUrl?.value?.replace(/^\/\//, "https://"));
      if (!page.title?.startsWith("File:") || !src || !sourceUrl || !new URL(sourceUrl).pathname.startsWith("/wiki/File:") || !author || !license || !licenseUrl || !info?.width || !info.height || !Number.isFinite(info.width) || !Number.isFinite(info.height) || info.width <= 0 || info.height <= 0 || !["image/jpeg", "image/png", "image/webp"].includes(info.mime ?? "")) return [];
      if (!/^(CC (?:BY(?:-SA)?(?: [\d.]+)?|0(?: [\d.]+)?)|Public domain)$/i.test(license) || !["creativecommons.org", "www.creativecommons.org"].includes(new URL(licenseUrl).hostname)) return [];
      const ccLicense = /^CC (BY(?:-SA)?) ([\d.]+)$/i.exec(license);
      const licensePath = new URL(licenseUrl).pathname;
      if (ccLicense ? !licensePath.startsWith(`/licenses/${ccLicense[1]!.toLowerCase()}/${ccLicense[2]}/`) : !/\/publicdomain\/(?:zero|mark)\/1\.0\//.test(licensePath)) return [];
      const longitude = metadata.GPSLongitude?.value ? Number(metadata.GPSLongitude.value) : NaN, latitude = metadata.GPSLatitude?.value ? Number(metadata.GPSLatitude.value) : NaN;
      const coordinates: [number, number] | undefined = Number.isFinite(longitude) && Number.isFinite(latitude) && Math.abs(longitude) <= 180 && Math.abs(latitude) <= 90 ? [longitude, latitude] : undefined;
      if (place.coordinates && coordinates && placeDistanceKm([...place.coordinates], coordinates) > 50) return [];
      const candidate: PublishedRouteImageCandidate = { provider: "wikimedia", id: page.title, src, sourceUrl, author, license, licenseUrl, width: info.width, height: info.height,
        alt: text(metadata.ImageDescription?.value), description: `${page.title} ${text(metadata.ImageDescription?.value)} ${text(metadata.ObjectName?.value)}`,
        ...(place.coordinates && coordinates ? { coordinates } : {}), ...(metadata.Country?.value ? { location: { country: text(metadata.Country.value) } } : {}) };
      if (!scorePublishedRouteImageCandidate({ key: "destination", name: place.name, country: place.country, coordinates: place.coordinates ? [...place.coordinates] : [0, 0], routeKeys: [], siblingNames: [], attachedLandmarks: [] }, candidate).accepted || options.excludedSources?.includes(src)) return [];
      const authorUrl = httpsUrl(metadata.Artist?.value?.match(/href=["']([^"']+)/)?.[1]);
      return [{ id: candidate.id, provider: "wikimedia" as const, src, alt: candidate.alt || `${place.name}, ${place.country}`, sourceUrl, sourceLabel: `${author} · ${license}`, author, ...(authorUrl ? { authorUrl } : {}), license, licenseUrl }];
    });
    return { candidates, configured: true, status: candidates.length ? "resolved" : "no-result" };
  } catch { return { candidates: [], configured: true, status: "unavailable" }; }
}
