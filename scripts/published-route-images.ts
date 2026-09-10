import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import destinationInventory from "../public/journey/immersive/destination-inventory.json" with { type: "json" };
import editorialInventory from "../public/journey/immersive/editorial-image-inventory.json" with { type: "json" };
import generatedInventory from "../public/journey/immersive/published-route-stop-image-inventory.generated.json" with { type: "json" };
import {
  chooseEditoriallyReviewedCandidate,
  choosePublishedRouteImageCandidate,
  normalizeImageGeography,
  publishedRouteStopKey,
  reviewedPhotoMatchesStop,
  type PublishedRouteImageCandidate,
  type PublishedRouteImageStop,
} from "../lib/easyt/published-route-image-pipeline.ts";
import { publicRoutePublishedFamilies } from "../lib/easyt/public-route.ts";
import { routeEditorialImagery } from "../lib/easyt/route-editorial-imagery.ts";
import { routeEditorialPhoto, routeImagePhoto } from "../lib/easyt/route-images.ts";
import { routeStopPhoto } from "../lib/easyt/route-stop-photography.ts";

type UnsplashPhoto = {
  id?: string;
  width?: number;
  height?: number;
  alt_description?: string | null;
  description?: string | null;
  urls?: { raw?: string; regular?: string };
  links?: { html?: string; download_location?: string };
  user?: { name?: string; links?: { html?: string } };
  location?: { city?: string | null; country?: string | null; name?: string | null };
  tags?: Array<{ title?: string }>;
};

type GeneratedPhoto = {
  key: string;
  place: string;
  country: string;
  author: string;
  authorUrl?: string;
  license: string;
  licenseUrl: string;
  sourceUrl: string;
  changes: string;
  alt: string;
  variants: Array<{ src: string; width: number; height: number }>;
  intendedUses: string[];
  provider: "wikimedia" | "unsplash";
  providerAssetId: string;
  providerDownloadLocation?: string;
  reviewStatus: "automatically accepted" | "editorially accepted";
  confidenceScore: number;
  confidenceEvidence: string[];
  pipelineVersion: 2;
};

const pipelineVersion = 2 as const;

const apply = process.argv.includes("--apply");
const onlyDestination = process.argv.find((argument) => argument.startsWith("--only-destination="))?.slice("--only-destination=".length).trim();
const root = process.cwd();
const generatedPath = path.join(root, "public/journey/immersive/published-route-stop-image-inventory.generated.json");
const creditsPath = path.join(root, "public/journey/immersive/credits.html");
const reportPath = path.join(root, "artifacts/published-route-image-review/report.json");
const decisionsPath = path.join(root, "artifacts/published-route-image-review/editorial-decisions.json");
const accessKey = process.env.UNSPLASH_ACCESS_KEY?.trim();
const routes = publicRoutePublishedFamilies();
let wikimediaSearchCalls = 0;
let unsplashSearchCalls = 0;
let unsplashDetailCalls = 0;

function referrer(url: string) {
  const target = new URL(url);
  target.searchParams.set("utm_source", "morrovia");
  target.searchParams.set("utm_medium", "referral");
  return target.toString();
}

function enumerateStops(): PublishedRouteImageStop[] {
  const stops = new Map<string, PublishedRouteImageStop>();
  for (const route of routes) {
    const siblingNames = route.stops.map((stop) => stop.name);
    for (const stop of route.stops) {
      const key = publishedRouteStopKey(stop.name, stop.country);
      const current = stops.get(key) ?? {
        key,
        name: stop.name,
        country: stop.country,
        region: route.region,
        coordinates: stop.coordinates,
        routeKeys: [],
        siblingNames: [],
        attachedLandmarks: [],
      };
      current.routeKeys = [...new Set([...current.routeKeys, route.key])];
      current.siblingNames = [...new Set([...current.siblingNames, ...siblingNames])];
      current.attachedLandmarks = [...new Set([
        ...current.attachedLandmarks,
        ...(route.visitIntents?.filter((visit) => visit.base === stop.name).map((visit) => visit.name) ?? []),
      ])];
      stops.set(key, current);
    }
  }
  return [...stops.values()].sort((left, right) => left.country.localeCompare(right.country) || left.name.localeCompare(right.name));
}

function configuredPhoto(stop: PublishedRouteImageStop) {
  const exact = destinationInventory.find((photo) => publishedRouteStopKey(photo.place, photo.country) === stop.key);
  if (exact) return { kind: "existing reviewed" as const, photo: exact };
  for (const routeKey of stop.routeKeys) {
    const photoKey = routeEditorialImagery[routeKey]?.bases[stop.name]?.photoKey;
    const photo = photoKey ? routeEditorialPhoto(photoKey) : null;
    if (photo && reviewedPhotoMatchesStop(stop, photo)) return { kind: "existing reviewed" as const, photo };
  }
  const generated = generatedInventory.find((photo) => photo.pipelineVersion === pipelineVersion && publishedRouteStopKey(photo.place, photo.country) === stop.key);
  return generated ? { kind: "automatically filled" as const, photo: generated } : null;
}

function invalidOverrides(stops: PublishedRouteImageStop[]) {
  const byKey = new Map(stops.map((stop) => [stop.key, stop]));
  return routes.flatMap((route) => route.stops.flatMap((routeStop) => {
    const stop = byKey.get(publishedRouteStopKey(routeStop.name, routeStop.country))!;
    const photoKey = routeEditorialImagery[route.key]?.bases[routeStop.name]?.photoKey;
    const photo = photoKey ? routeEditorialPhoto(photoKey) : null;
    if (!photo || reviewedPhotoMatchesStop(stop, photo)) return [];
    return [{ routeKey: route.key, destination: `${stop.name}, ${stop.country}`, rejectedPhotoKey: photo.key, rejectedSubject: `${photo.place}, ${photo.country}`, reason: "The photo is neither the canonical stop nor a reviewed landmark attached to that base." }];
  }));
}

type ProviderSearchResult = { candidates: PublishedRouteImageCandidate[]; query: string; status?: number; error?: string };
type ImageSearchResult = { candidates: PublishedRouteImageCandidate[]; attempts: { wikimedia: ProviderSearchResult; unsplash: ProviderSearchResult | null }; error?: string };

async function search(stop: PublishedRouteImageStop): Promise<ImageSearchResult> {
  const wikimedia = await searchWikimedia(stop);
  if (choosePublishedRouteImageCandidate(stop, wikimedia.candidates).selected) return { candidates: wikimedia.candidates, attempts: { wikimedia, unsplash: null } };
  const unsplash = await searchUnsplash(stop);
  const candidates = [...wikimedia.candidates, ...unsplash.candidates];
  return { candidates, attempts: { wikimedia, unsplash }, ...(candidates.length ? {} : { error: unsplash.error ?? wikimedia.error }) };
}

type WikimediaMetadata = Record<string, { value?: string }>;
type WikimediaPage = { title?: string; imageinfo?: Array<{ url?: string; thumburl?: string; width?: number; height?: number; descriptionurl?: string; extmetadata?: WikimediaMetadata }> };

function plainText(value?: string) {
  return (value ?? "").replace(/<[^>]*>/g, " ").replaceAll("&amp;", "&").replaceAll("&quot;", '"').replaceAll("&#039;", "'").replace(/\s+/g, " ").trim();
}

function absoluteUrl(value?: string) {
  if (!value) return undefined;
  return value.startsWith("//") ? `https:${value}` : value;
}

function commonsUrl(value?: string) {
  const url = absoluteUrl(value);
  const decoded = url?.replaceAll("&amp;", "&");
  return decoded?.startsWith("/") ? `https://commons.wikimedia.org${decoded}` : decoded;
}

async function searchWikimedia(stop: PublishedRouteImageStop): Promise<ProviderSearchResult> {
  const query = `"${stop.name}" ${stop.country}`;
  const params = new URLSearchParams({ action: "query", format: "json", generator: "search", gsrsearch: query, gsrnamespace: "6", gsrlimit: "30",
    prop: "imageinfo", iiprop: "url|size|extmetadata", iiurlwidth: "1536", origin: "*" });
  try {
    wikimediaSearchCalls += 1;
    const response = await fetch(`https://commons.wikimedia.org/w/api.php?${params}`, { headers: { "Api-User-Agent": "MorroviaRouteImageReview/1.0 (https://morrovia.com)" }, signal: AbortSignal.timeout(12_000) });
    if (!response.ok) return { candidates: [], query, status: response.status, error: `Wikimedia HTTP ${response.status}` };
    const pages = Object.values(((await response.json()) as { query?: { pages?: Record<string, WikimediaPage> } }).query?.pages ?? {});
    return { query, status: response.status, candidates: pages.flatMap((page): PublishedRouteImageCandidate[] => {
      const info = page.imageinfo?.[0];
      const metadata = info?.extmetadata ?? {};
      const src = info?.thumburl ?? info?.url;
      const sourceUrl = info?.descriptionurl;
      const author = plainText(metadata.Artist?.value || metadata.Credit?.value);
      const license = plainText(metadata.LicenseShortName?.value);
      const licenseUrl = absoluteUrl(metadata.LicenseUrl?.value);
      if (!page.title || !src || !sourceUrl || !author || !license || !licenseUrl || !info?.width || !info.height) return [];
      const description = [page.title.replace(/^File:/, ""), plainText(metadata.ImageDescription?.value), plainText(metadata.ObjectName?.value)].filter(Boolean).join(". ");
      const latitude = Number(metadata.GPSLatitude?.value);
      const longitude = Number(metadata.GPSLongitude?.value);
      return [{ provider: "wikimedia", id: page.title, src, width: info.width, height: info.height, alt: plainText(metadata.ImageDescription?.value), description,
        sourceUrl, author, authorUrl: commonsUrl(metadata.Artist?.value?.match(/href=["']([^"']+)/)?.[1]), license, licenseUrl,
        ...(Number.isFinite(latitude) && Number.isFinite(longitude) ? { coordinates: [longitude, latitude] as [number, number] } : {}),
        tags: plainText(metadata.Categories?.value).split("|").filter(Boolean) }];
    }) };
  } catch (error) {
    return { candidates: [], query, error: error instanceof Error ? error.name : "Wikimedia request failed" };
  }
}

async function searchUnsplash(stop: PublishedRouteImageStop): Promise<ProviderSearchResult> {
  const query = `${stop.name} ${stop.country}`;
  if (!accessKey) return { candidates: [], query, error: "UNSPLASH_ACCESS_KEY is not configured" };
  try {
    unsplashSearchCalls += 1;
    const response = await fetch(`https://api.unsplash.com/search/photos?${new URLSearchParams({ query, per_page: "12", orientation: "landscape", content_filter: "high" })}`, {
      headers: { Authorization: `Client-ID ${accessKey}`, "Accept-Version": "v1" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return { candidates: [], query, status: response.status, error: response.status === 429 || response.status === 403 ? "Unsplash search rate/config issue" : `provider HTTP ${response.status}` };
    const photos = ((await response.json()) as { results?: UnsplashPhoto[] }).results ?? [];
    return { query, status: response.status, candidates: photos.flatMap((photo) => {
      const candidate = unsplashCandidate(photo);
      return candidate ? [candidate] : [];
    }) };
  } catch (error) {
    return { candidates: [], query, error: error instanceof Error ? error.name : "provider request failed" };
  }
}

function unsplashCandidate(photo: UnsplashPhoto): PublishedRouteImageCandidate | null {
  const src = photo.urls?.raw ?? photo.urls?.regular;
  const sourceUrl = photo.links?.html;
  const authorUrl = photo.user?.links?.html;
  const downloadLocation = photo.links?.download_location;
  if (!photo.id || !src || !sourceUrl || !authorUrl || !downloadLocation || !photo.user?.name || !photo.width || !photo.height) return null;
  return { provider: "unsplash", id: photo.id, src, width: photo.width, height: photo.height, alt: photo.alt_description, description: photo.description,
    sourceUrl: referrer(sourceUrl), author: photo.user.name, authorUrl: referrer(authorUrl), downloadLocation,
    license: "Unsplash License", licenseUrl: "https://unsplash.com/license", location: photo.location, tags: photo.tags?.flatMap((tag) => tag.title ? [tag.title] : []) };
}

async function reviewedUnsplashAsset(providerAssetId: string): Promise<ProviderSearchResult> {
  const query = `reviewed asset ${providerAssetId}`;
  if (!accessKey) return { candidates: [], query, error: "UNSPLASH_ACCESS_KEY is not configured" };
  try {
    unsplashDetailCalls += 1;
    const response = await fetch(`https://api.unsplash.com/photos/${encodeURIComponent(providerAssetId)}`, {
      headers: { Authorization: `Client-ID ${accessKey}`, "Accept-Version": "v1" }, signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return { candidates: [], query, status: response.status, error: response.status === 429 || response.status === 403 ? "Unsplash detail rate/config issue" : `provider HTTP ${response.status}` };
    const candidate = unsplashCandidate((await response.json()) as UnsplashPhoto);
    return { candidates: candidate ? [candidate] : [], query, status: response.status, ...(candidate ? {} : { error: "Reviewed provider asset was incomplete" }) };
  } catch (error) {
    return { candidates: [], query, error: error instanceof Error ? error.name : "provider request failed" };
  }
}

function variantUrl(source: string, width: number) {
  const target = new URL(source);
  if (target.hostname === "upload.wikimedia.org" || target.hostname === "thumb.wikimedia.org") {
    target.pathname = target.pathname.replace(/\/\d+px-([^/]+)$/, `/${width}px-$1`);
    for (const parameter of ["auto", "fit", "q", "w"]) target.searchParams.delete(parameter);
    return target.toString();
  }
  target.searchParams.set("auto", "format");
  target.searchParams.set("fit", "max");
  target.searchParams.set("q", "80");
  target.searchParams.set("w", String(width));
  return target.toString();
}

function slug(value: string) {
  return normalizeImageGeography(value).replaceAll(" ", "-");
}

function generatedPhoto(stop: PublishedRouteImageStop, selected: ReturnType<typeof choosePublishedRouteImageCandidate>["selected"], reviewStatus: GeneratedPhoto["reviewStatus"] = "automatically accepted"): GeneratedPhoto {
  if (!selected) throw new Error("A selected candidate is required.");
  const { candidate } = selected;
  return {
    key: `published-stop-${slug(stop.name)}-${slug(stop.country)}-${candidate.id}`,
    place: stop.name,
    country: stop.country,
    author: candidate.author,
    ...(candidate.authorUrl ? { authorUrl: candidate.authorUrl } : {}),
    license: candidate.license,
    licenseUrl: candidate.licenseUrl,
    sourceUrl: candidate.sourceUrl,
    changes: "Provider-hosted responsive derivative; display crops to fit the composition.",
    alt: candidate.alt?.trim() || `${stop.name}, ${stop.country}`,
    variants: [384, 768, 1536].map((width) => ({ src: variantUrl(candidate.src, width), width, height: Math.max(1, Math.round(width * candidate.height / candidate.width)) })),
    intendedUses: ["Canonical published-route stop photography"],
    provider: candidate.provider,
    providerAssetId: candidate.id,
    ...(candidate.downloadLocation ? { providerDownloadLocation: candidate.downloadLocation } : {}),
    reviewStatus,
    confidenceScore: selected.score,
    confidenceEvidence: selected.evidence,
    pipelineVersion,
  };
}

async function trackSelection(candidate: PublishedRouteImageCandidate) {
  if (candidate.provider === "wikimedia") return { ok: true as const, status: 200, classification: "not required" };
  if (!accessKey || !candidate.downloadLocation) return { ok: false as const, classification: "request/configuration failure" };
  try {
    const target = new URL(candidate.downloadLocation);
    if (target.protocol !== "https:" || target.hostname !== "api.unsplash.com" || !/^\/photos\/[^/]+\/download$/.test(target.pathname)) return { ok: false as const, classification: "request/configuration failure" };
    const response = await fetch(target, { headers: { Authorization: `Client-ID ${accessKey}`, "Accept-Version": "v1" }, signal: AbortSignal.timeout(8_000) });
    return { ok: response.ok, status: response.status, remaining: response.headers.get("x-ratelimit-remaining"), classification: response.ok ? "tracked" : response.status === 403 || response.status === 429 ? "Unsplash selection-tracking rate exhaustion" : "request/configuration failure" };
  } catch {
    return { ok: false as const, classification: "request/configuration failure" };
  }
}

function compactCandidate(item: ReturnType<typeof choosePublishedRouteImageCandidate>["ranked"][number]) {
  return { provider: item.candidate.provider, id: item.candidate.id, sourceUrl: item.candidate.sourceUrl, previewUrl: variantUrl(item.candidate.src, 768),
    author: item.candidate.author, authorUrl: item.candidate.authorUrl, license: item.candidate.license, licenseUrl: item.candidate.licenseUrl,
    downloadLocation: item.candidate.downloadLocation, score: item.score, evidence: item.evidence, concerns: item.concerns };
}

type EditorialDecision = { destination: string; decision: "accepted" | "rejected" | "alternative selected"; providerAssetId?: string };

async function editorialDecisions(): Promise<EditorialDecision[]> {
  try {
    const parsed = JSON.parse(await readFile(decisionsPath, "utf8"));
    return Array.isArray(parsed) ? parsed.filter((item): item is EditorialDecision => item && typeof item.destination === "string" && ["accepted", "rejected", "alternative selected"].includes(item.decision)) : [];
  } catch {
    return [];
  }
}

type PreviousReviewItem = { destination?: string; selectedCandidate?: { id?: string; provider?: string }; alternatives?: Array<{ id?: string; provider?: string }> };

async function previousReviewReport(): Promise<{ reviewRequired?: PreviousReviewItem[]; unresolved?: PreviousReviewItem[] }> {
  try {
    return JSON.parse(await readFile(reportPath, "utf8"));
  } catch {
    return {};
  }
}

function unresolvedCategory(result: Awaited<ReturnType<typeof search>>, tracking?: Awaited<ReturnType<typeof trackSelection>>) {
  if (tracking && !tracking.ok) return tracking.classification;
  if (result.attempts.wikimedia.status === 429 && (result.attempts.unsplash?.status === 403 || result.attempts.unsplash?.status === 429)) return "provider search rate exhaustion";
  if (result.attempts.unsplash?.error === "Unsplash search rate/config issue") return "Unsplash search rate/config issue";
  if (!result.attempts.unsplash) return result.attempts.wikimedia.candidates.length ? "Wikimedia result confidence too low" : "Wikimedia returned no suitable result";
  if (result.attempts.unsplash.error === "UNSPLASH_ACCESS_KEY is not configured") return "Unsplash was not queried";
  if (result.attempts.unsplash.error) return "request/configuration failure";
  if (!result.attempts.unsplash.candidates.length) return "Unsplash returned no result";
  return "Unsplash returned results but metadata insufficient";
}

function compactAttempts(result: Awaited<ReturnType<typeof search>>) {
  const compact = (attempt: ProviderSearchResult | null) => attempt && ({ query: attempt.query, status: attempt.status, candidateCount: attempt.candidates.length, error: attempt.error });
  return { wikimedia: compact(result.attempts.wikimedia), unsplash: compact(result.attempts.unsplash) };
}

function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

async function updateCredits(photos: readonly GeneratedPhoto[]) {
  const start = "<!-- published-route-stop-images:start -->";
  const end = "<!-- published-route-stop-images:end -->";
  const rows = photos.map((photo) => `<li id="${escapeHtml(photo.key)}"><a href="${escapeHtml(photo.sourceUrl)}">${escapeHtml(photo.place)}, ${escapeHtml(photo.country)}</a> — ${photo.authorUrl ? `<a href="${escapeHtml(photo.authorUrl)}">${escapeHtml(photo.author)}</a>` : escapeHtml(photo.author)}; <a href="${escapeHtml(photo.licenseUrl)}">${escapeHtml(photo.license)}</a>. ${escapeHtml(photo.changes)}</li>`).join("");
  const block = `${start}${rows}${end}`;
  const original = await readFile(creditsPath, "utf8");
  const updated = original.includes(start)
    ? original.replace(new RegExp(`${start}[\\s\\S]*?${end}`), block)
    : original.replace("</ul>", `${block}</ul>`);
  await writeFile(creditsPath, updated);
}

const stops = enumerateStops();
const coverage = stops.map((stop) => ({ stop, coverage: configuredPhoto(stop) }));
const previousReport = await previousReviewReport();
const previousReviewOrder = new Map((previousReport.reviewRequired ?? []).map((item, index) => [item.destination, index]));
const allMissing = coverage.filter((item) => !item.coverage).map((item) => item.stop).sort((left, right) => {
  const leftOrder = previousReviewOrder.get(`${left.name}, ${left.country}`);
  const rightOrder = previousReviewOrder.get(`${right.name}, ${right.country}`);
  return (leftOrder ?? Number.MAX_SAFE_INTEGER) - (rightOrder ?? Number.MAX_SAFE_INTEGER)
    || left.country.localeCompare(right.country)
    || left.name.localeCompare(right.name);
});
const missing = onlyDestination
  ? allMissing.filter((stop) => `${stop.name}, ${stop.country}` === onlyDestination)
  : allMissing;
if (onlyDestination && !missing.length) throw new Error(`No uncovered published-route destination matches ${onlyDestination}.`);
const untouchedDestinations = new Set(allMissing.filter((stop) => `${stop.name}, ${stop.country}` !== onlyDestination).map((stop) => `${stop.name}, ${stop.country}`));
const decisions = await editorialDecisions();
const usedByRoute = new Map(routes.map((route) => {
  const sources = new Set<string>();
  const hero = routeImagePhoto(route.key);
  if (hero) sources.add(hero.sourceUrl);
  for (const stop of route.stops) {
    const photo = routeStopPhoto(route, stop);
    if (photo) sources.add(photo.sourceUrl);
  }
  return [route.key, sources] as const;
}));
const accepted: GeneratedPhoto[] = [];
const reviewRequired: unknown[] = onlyDestination
  ? (previousReport.reviewRequired ?? []).filter((item) => item.destination && untouchedDestinations.has(item.destination))
  : [];
const unresolved: unknown[] = onlyDestination
  ? (previousReport.unresolved ?? []).filter((item) => item.destination && untouchedDestinations.has(item.destination))
  : [];
let trackingCalls = 0;

for (let index = 0; index < missing.length; index += 1) {
  const stop = missing[index];
  const destination = `${stop.name}, ${stop.country}`;
  const decision = decisions.find((item) => item.destination === destination);
  const reviewedProvider = decision?.providerAssetId
    ? previousReport.reviewRequired?.flatMap((item) => [item.selectedCandidate, ...(item.alternatives ?? [])]).find((candidate) => candidate?.id === decision.providerAssetId)?.provider
    : null;
  const reviewedResult = apply && decision?.providerAssetId && reviewedProvider === "unsplash"
    ? await reviewedUnsplashAsset(decision.providerAssetId)
    : null;
  const result: ImageSearchResult = apply
    ? reviewedResult
      ? { candidates: reviewedResult.candidates, attempts: { wikimedia: { candidates: [], query: "not required for exact editorial decision" }, unsplash: reviewedResult }, error: reviewedResult.error }
      : await search(stop)
    : { candidates: [], attempts: { wikimedia: { candidates: [], query: `"${stop.name}" ${stop.country}`, error: "dry run" }, unsplash: null }, error: accessKey ? "dry run" : "UNSPLASH_ACCESS_KEY is not configured" };
  const unavailable = new Set(stop.routeKeys.flatMap((routeKey) => [...(usedByRoute.get(routeKey) ?? [])]));
  const choice = choosePublishedRouteImageCandidate(stop, result.candidates, unavailable);
  if (decision?.decision === "rejected") {
    unresolved.push({ destination, routeKeys: stop.routeKeys, coordinates: stop.coordinates, selectedCandidate: null, alternatives: [], category: "editorial rejection", reason: "The editorial review file rejects this destination's candidates." });
    continue;
  }
  const reviewedSelection = decision?.providerAssetId
    ? chooseEditoriallyReviewedCandidate(choice.ranked, decision.providerAssetId, unavailable)
    : null;
  const selected = reviewedSelection ?? choice.selected;
  const editoriallyAccepted = Boolean(reviewedSelection && selected === reviewedSelection);
  if (decision && !editoriallyAccepted) {
    reviewRequired.push({ destination, routeKeys: stop.routeKeys, coordinates: stop.coordinates,
      selectedCandidate: reviewedSelection ? compactCandidate(reviewedSelection) : null, alternatives: choice.ranked.slice(0, 3).map(compactCandidate),
      category: reviewedSelection ? "geographic ambiguity" : "request/configuration failure",
      reason: reviewedSelection ? "The requested editorial candidate has a hard geographic/media conflict or duplicates a visible route source." : "The requested editorial candidate was not returned by the provider." });
    continue;
  }
  if (!selected) {
    const category = unresolvedCategory(result);
    const item = { destination, routeKeys: stop.routeKeys, coordinates: stop.coordinates,
      selectedCandidate: choice.ranked[0] ? compactCandidate(choice.ranked[0]) : null,
      alternatives: choice.ranked.slice(1, 4).map(compactCandidate),
      category,
      providerAttempts: compactAttempts(result),
      reason: result.error ?? (choice.ranked.some((candidate) => candidate.accepted) ? "High-confidence source duplicates another visible image on the route." : "Provider metadata did not meet the conservative acceptance threshold.") };
    if (choice.ranked.length) reviewRequired.push(item); else unresolved.push(item);
    continue;
  }
  if (selected.candidate.provider === "unsplash") trackingCalls += 1;
  const tracking = await trackSelection(selected.candidate);
  if (!tracking.ok) {
    unresolved.push({ destination, routeKeys: stop.routeKeys, coordinates: stop.coordinates,
      selectedCandidate: compactCandidate(selected), alternatives: choice.ranked.filter((item) => item !== selected).slice(0, 3).map(compactCandidate),
      category: unresolvedCategory(result, tracking), providerAttempts: compactAttempts(result), tracking,
      reason: "Provider selection tracking failed; the candidate was not persisted." });
    continue;
  }
  const photo = generatedPhoto(stop, selected, editoriallyAccepted ? "editorially accepted" : "automatically accepted");
  accepted.push(photo);
  for (const routeKey of stop.routeKeys) usedByRoute.get(routeKey)?.add(photo.sourceUrl);
}

const previousGenerated = (generatedInventory as GeneratedPhoto[]).filter((photo) => photo.pipelineVersion === pipelineVersion);
const mergedGenerated = [...previousGenerated.filter((photo) => !accepted.some((candidate) => publishedRouteStopKey(candidate.place, candidate.country) === publishedRouteStopKey(photo.place, photo.country))), ...accepted]
  .sort((left, right) => left.country.localeCompare(right.country) || left.place.localeCompare(right.place));
const prevented = invalidOverrides(stops);
const existingReviewed = coverage.filter((item) => item.coverage?.kind === "existing reviewed").length;
const automaticallyFilled = coverage.filter((item) => item.coverage?.kind === "automatically filled").length + accepted.length;
const report = {
  generatedAt: new Date().toISOString(),
  mode: apply ? "apply" : "audit-only",
  scope: onlyDestination ? { destination: onlyDestination } : { destination: "all uncovered published-route destinations" },
  provider: "Wikimedia Commons API with configured Unsplash fallback",
  summary: {
    publishedRoutes: routes.length,
    routeStopOccurrences: routes.reduce((total, route) => total + route.stops.length, 0),
    uniquePublishedDestinations: stops.length,
    existingReviewedCoverage: existingReviewed,
    automaticallyFilled,
    manualReviewRequired: reviewRequired.length,
    unresolved: unresolved.length,
    duplicateSourcesAvoided: reviewRequired.filter((item) => JSON.stringify(item).includes("duplicates another visible image")).length,
    incorrectSubstitutionsPrevented: prevented.length,
  },
  assetImpact: { localRasterFilesAdded: 0, providerHostedResponsiveRecords: mergedGenerated.length, variantsPerRecord: 3 },
  providerCalls: { canonicalSearchesRequired: missing.filter((stop) => !decisions.some((decision) => decision.destination === `${stop.name}, ${stop.country}`)).length,
    canonicalSearchesMade: wikimediaSearchCalls, wikimediaSearchesMade: wikimediaSearchCalls, unsplashSearchesMade: unsplashSearchCalls,
    reviewedUnsplashAssetLookupsMade: unsplashDetailCalls, unsplashSelectionTrackingMade: trackingCalls },
  unresolvedFailureCategories: Object.entries(unresolved.reduce<Record<string, number>>((counts, item) => {
    const category = String((item as { category?: string }).category ?? "another cause");
    counts[category] = (counts[category] ?? 0) + 1;
    return counts;
  }, {})).map(([category, count]) => ({ category, count })),
  automaticallyAccepted: mergedGenerated.map((photo) => ({
    destination: `${photo.place}, ${photo.country}`,
    provider: photo.provider,
    providerAssetId: photo.providerAssetId,
    sourceUrl: photo.sourceUrl,
    score: photo.confidenceScore,
    evidence: photo.confidenceEvidence,
  })),
  incorrectSubstitutionsPrevented: prevented,
  reviewRequired,
  unresolved,
};

await mkdir(path.dirname(reportPath), { recursive: true });
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
if (apply) {
  await writeFile(generatedPath, `${JSON.stringify(mergedGenerated, null, 2)}\n`);
  await updateCredits(mergedGenerated);
}
console.log(JSON.stringify(report.summary));
console.log(`Review report: ${path.relative(root, reportPath)}`);
