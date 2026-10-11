import { isEditoriallyExcludedPhoto } from "./photo-editorial-exclusions.ts";
import { isReusableWikimediaLicense } from "./photo-attribution.ts";
import { routePhotoAssetIdentity } from "./route-photo-cache.ts";
import { isRepresentativeDestinationScene } from "./photo-subject.ts";

export type PublishedRouteImageStop = {
  key: string;
  name: string;
  country: string;
  region?: string;
  placeType?: string;
  subjectContext?: readonly string[];
  coordinates: [number, number];
  routeKeys: string[];
  siblingNames: string[];
  attachedLandmarks: string[];
};

export type PublishedRouteImageCandidate = {
  provider: "wikimedia" | "unsplash";
  id: string;
  src: string;
  width: number;
  height: number;
  alt?: string | null;
  description?: string | null;
  sourceUrl: string;
  author: string;
  authorUrl?: string;
  license: string;
  licenseUrl: string;
  downloadLocation?: string;
  location?: { city?: string | null; country?: string | null; name?: string | null };
  coordinates?: [number, number];
  tags?: string[];
  /** Administrative/file context may establish country, never photographed subject. */
  geographicContext?: string;
  /** Provider capture date, never upload date. No visual-quality claim. */
  captureDate?: string;
};

export type PublishedRouteImageScore = {
  score: number;
  accepted: boolean;
  eligible: boolean;
  coverScore: number;
  suitabilityConcerns: string[];
  evidence: string[];
  concerns: string[];
};

const countryAliases: Record<string, string> = {
  "republic of korea": "south korea",
  "korea south": "south korea",
  "usa": "united states",
  "united states of america": "united states",
  "uk": "united kingdom",
};

export function normalizeImageGeography(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function normalizedCountry(value: string) {
  if (value.trim() === "대한민국") return "south korea";
  const normalized = normalizeImageGeography(value);
  return countryAliases[normalized] ?? normalized;
}

function mentions(text: string, value: string) {
  const subject = normalizeImageGeography(value);
  if (!subject) return false;
  return ` ${text} `.includes(` ${subject} `);
}

function distanceKm(from: [number, number], to: [number, number]) {
  const radians = (value: number) => value * Math.PI / 180;
  const lat1 = radians(from[1]);
  const lat2 = radians(to[1]);
  const deltaLat = lat2 - lat1;
  const deltaLon = radians(to[0] - from[0]);
  const a = Math.sin(deltaLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Vehicle-centred captions are different from a place scene with background traffic. */
function describesTransitSubject(caption: string) {
  // Commons prefixes descriptions with an asset filename. Its indexing words
  // are not the caption's grammatical subject (for example, "boats.jpg").
  const subjectCaption = caption.replace(/^File:.*?\.(?:jpe?g|png|webp|gif)\b\s*/i, "").trim();
  const text = normalizeImageGeography(subjectCaption || caption);
  const vehicle = /\b(ferr(?:y|ies)|ships?|vessels?|boats?|buses?|aircraft|airplanes?|planes?|trains?|cruise ships?)\b/.exec(text);
  if (!vehicle) return false;
  const scene = /\b(skyline|landscape|street|streets|square|architecture|coast|beach|lake|waterfront|harbour|harbor|river|bridge|panorama|bay)\b/.exec(text);
  // Require an explicit relationship to the primary scene, rather than treating
  // any place/harbour keyword anywhere in a vehicle caption as an exemption.
  return !(scene && scene.index < vehicle.index
    && /\b(with|including|background|distant|small|moored|passing)\b/.test(text.slice(scene.index, vehicle.index)));
}

export function publishedRouteStopKey(name: string, country: string) {
  return `${normalizeImageGeography(name)}|${normalizedCountry(country)}`;
}

export function scorePublishedRouteImageCandidate(stop: PublishedRouteImageStop, candidate: PublishedRouteImageCandidate): PublishedRouteImageScore {
  const evidence: string[] = [];
  const concerns: string[] = [];
  const text = normalizeImageGeography([
    candidate.alt,
    candidate.description,
    candidate.location?.city,
    candidate.location?.country,
    candidate.location?.name,
    candidate.geographicContext,
    ...(candidate.tags ?? []),
  ].filter(Boolean).join(" "));
  // Camera/provider location can describe where a photo was taken, not its subject.
  const subjectText = normalizeImageGeography([candidate.alt, candidate.description, ...(candidate.tags ?? [])].filter(Boolean).join(" "));
  const exactPlace = mentions(subjectText, stop.name);
  const attachedLandmark = stop.attachedLandmarks.find((name) => mentions(subjectText, name));
  const textCountryMatch = mentions(text, stop.country);
  const locationCountry = candidate.location?.country?.trim();
  const locationCountryMatch = Boolean(locationCountry && normalizedCountry(locationCountry) === normalizedCountry(stop.country));
  const conflictingCountry = Boolean(locationCountry && !locationCountryMatch);
  const coordinateDistance = candidate.coordinates ? distanceKm(stop.coordinates, candidate.coordinates) : null;
  const nearbyCoordinates = coordinateDistance !== null && coordinateDistance <= 150;
  const conflictingCoordinates = coordinateDistance !== null && coordinateDistance > 500;
  const sibling = stop.siblingNames.find((name) => normalizeImageGeography(name) !== normalizeImageGeography(stop.name) && mentions(text, name));
  const nonPhotographic = /\b(map|diagram|screenshot|logo|graphic|illustration|video|webm|svg|tiff|painting|drawing|engraving|watercolor|artwork|postcard)\b/.test(`${text} ${normalizeImageGeography(candidate.id)} ${normalizeImageGeography(candidate.sourceUrl)}`);
  const incidentalSubject = /\b(portrait|close up|selfie|bikini|animal|bird|curassow|tanager|heron|dog|cat|cow|cattle|artifact|sarcophagus|wheel hub|ski jumping|seller)\b/.test(text);
  const captions = [candidate.alt, candidate.description].filter((value): value is string => Boolean(value));
  const transitSubject = captions.some(describesTransitSubject);
  const editorialSubject = /\b(airport|airfield|terminal|runway|city|town|village|street|square|architecture|palace|temple|church|cathedral|mosque|skyline|landscape|mountain|coast|beach|lake|waterfront|harbour|harbor|river|bridge|historic|panorama|view|plaza|agora|old town|waterfall|volcano|desert|island|bay|garden|park)\b/.test(text);
  const landscape = candidate.width > candidate.height;

  let score = 0;
  if (exactPlace) { score += 55; evidence.push("exact canonical place name"); }
  if (attachedLandmark) { score += 50; evidence.push(`reviewed attached landmark: ${attachedLandmark}`); }
  if (locationCountryMatch) { score += 25; evidence.push("provider country metadata match"); }
  else if (textCountryMatch) { score += 20; evidence.push("country named in provider metadata"); }
  else if (nearbyCoordinates) { score += 25; evidence.push(`provider coordinates within ${Math.round(coordinateDistance!)} km`); }
  if (landscape) { score += 5; evidence.push("landscape composition"); }
  if (editorialSubject) evidence.push("destination-suitable subject metadata");

  if (!exactPlace && !attachedLandmark) concerns.push("no exact place or reviewed landmark evidence");
  if (!locationCountryMatch && !textCountryMatch && !nearbyCoordinates) concerns.push("country or coordinate proximity is not confirmed by provider metadata");
  const subjectContext = stop.subjectContext?.filter(Boolean).at(-1);
  if (subjectContext && !mentions(subjectText, subjectContext)) concerns.push("photographed subject is not identified in the selected administrative context");
  if (!landscape) concerns.push("provider asset is not landscape-oriented");
  if (!editorialSubject) concerns.push("metadata does not describe a destination-suitable scene");
  if (captions.some(caption => !isRepresentativeDestinationScene(caption))) concerns.push("caption describes an incidental park or bench rather than representative destination scenery");
  // A park/location keyword can describe the setting of an incidental subject.
  // Country illustrations need explicit wider geographic scenery evidence.
  if (stop.placeType === "country" && !/\b(city|town|village|street|square|architecture|palace|temple|church|cathedral|mosque|skyline|landscape|mountain|coast|beach|lake|waterfront|harbour|harbor|river|bridge|panorama|plaza|agora|waterfall|volcano|desert|island|bay|cliffs)\b/.test(subjectText)) concerns.push("country illustration does not identify a geographic scene");
  if (conflictingCountry) { score -= 100; concerns.push(`conflicting provider country: ${locationCountry}`); }
  if (conflictingCoordinates) { score -= 100; concerns.push(`provider coordinates are ${Math.round(coordinateDistance!)} km from the canonical stop`); }
  if (sibling && !exactPlace) { score -= 100; concerns.push(`different route stop named: ${sibling}`); }
  if (nonPhotographic) { score -= 100; concerns.push("non-photographic subject metadata"); }
  if (incidentalSubject) { score -= 50; concerns.push("metadata centres an incidental subject rather than the destination"); }
  if (transitSubject) { score -= 50; concerns.push("metadata centres a transit vehicle rather than the destination"); }

  if (!candidate.author?.trim() || !candidate.license?.trim() || !candidate.licenseUrl?.trim()
    || (candidate.provider === "wikimedia" && !isReusableWikimediaLicense(candidate.license, candidate.licenseUrl))) concerns.push("missing or incompatible reusable photo rights");
  const bounded = Math.max(0, Math.min(100, score));
  const eligible = bounded >= 80 && concerns.length === 0;
  const suitabilityConcerns: string[] = [];
  if (isEditoriallyExcludedPhoto(candidate.sourceUrl)) suitabilityConcerns.push("provider asset excluded by verified editorial review");
  // This ranks factual scene/date evidence, not sharpness, exposure or watermark absence.
  const settlement = ["city", "town", "village"].includes(stop.placeType ?? "");
  const civicScene = /\b(cityscape|skyline|architecture|street|streets|square|palace|temple|church|cathedral|mosque|bridge|monument|landmark|plaza|agora|old town)\b/.test(subjectText);
  const widerScene = /\b(panorama|landscape|coast|beach|lake|waterfront|harbour|harbor|river|island|bay)\b/.test(subjectText);
  const explicitWiderScene = /\b(panorama|landscape|coast|beach|waterfront|harbour|harbor|river|lake)\b/.test(subjectText);
  const sunsetOnly = /\b(sunset|sun setting|water|sky)\b/.test(subjectText) && !civicScene && !explicitWiderScene;
  const archivalCapture = /\b(?:18|19)\d{2}\b/.test(candidate.captureDate ?? "")
    || /\b(?:photographed|captured|taken)(?: in)? (?:18|19)\d{2}\b/.test(subjectText)
    || /\b(archival|archive|historic photograph|historical photograph|vintage photograph)\b/.test(subjectText);
  if (settlement && sunsetOnly) suitabilityConcerns.push("settlement cover describes sunset/water/sky without a legible civic scene");
  // Providers may repeat the same canonical name in alt, description and tags.
  // Every such mention is identity evidence, never independent scene evidence.
  const gatewayScene = subjectText.replaceAll(normalizeImageGeography(stop.name), "");
  if (stop.placeType === "transport_gateway" && !/\b(airport|airfield|terminal|runway|aerial)\b/.test(gatewayScene)) suitabilityConcerns.push("gateway cover does not identify airport scenery");
  if (archivalCapture) evidence.push("explicit archival capture metadata; ranking preference only");
  const coverScore = (civicScene ? 30 : widerScene ? 10 : 0) - (archivalCapture ? 20 : 0) - (sunsetOnly ? 20 : 0);
  return { score: bounded, eligible, coverScore, suitabilityConcerns,
    accepted: eligible && suitabilityConcerns.length === 0, evidence, concerns };
}

export function reviewedPhotoMatchesStop(stop: Pick<PublishedRouteImageStop, "name" | "country" | "attachedLandmarks">, photo: { place: string; country: string }) {
  if (normalizedCountry(photo.country) !== normalizedCountry(stop.country)) return false;
  const photoPlace = normalizeImageGeography(photo.place);
  const stopPlace = normalizeImageGeography(stop.name);
  return photoPlace === stopPlace
    || mentions(photoPlace, stop.name)
    || stop.attachedLandmarks.some((landmark) => photoPlace === normalizeImageGeography(landmark));
}

export function choosePublishedRouteImageCandidate(
  stop: PublishedRouteImageStop,
  candidates: readonly PublishedRouteImageCandidate[],
  unavailableSources: ReadonlySet<string> = new Set(),
) {
  const ranked = candidates.map((candidate) => ({ candidate, ...scorePublishedRouteImageCandidate(stop, candidate) }))
    .sort((left, right) => Number(right.accepted) - Number(left.accepted) || right.coverScore - left.coverScore
      || right.score - left.score || left.candidate.id.localeCompare(right.candidate.id) || left.candidate.src.localeCompare(right.candidate.src))
    .filter((item, index, sorted) => sorted.findIndex(other => routePhotoAssetIdentity(other.candidate) === routePhotoAssetIdentity(item.candidate)) === index);
  const selected = ranked.find((item) => item.accepted && !unavailableSources.has(item.candidate.sourceUrl)) ?? null;
  return { selected, ranked };
}

export function chooseEditoriallyReviewedCandidate(
  ranked: ReturnType<typeof choosePublishedRouteImageCandidate>["ranked"],
  providerAssetId: string,
  unavailableSources: ReadonlySet<string> = new Set(),
) {
  const reviewed = ranked.find((item) => item.candidate.id === providerAssetId) ?? null;
  if (!reviewed || unavailableSources.has(reviewed.candidate.sourceUrl)) return null;
  const hasHardSafetyConflict = [...reviewed.concerns, ...reviewed.suitabilityConcerns].some((concern) => (
    /conflicting provider country|provider coordinates are|different route stop named|non-photographic|excluded by verified editorial review|missing or incompatible reusable photo rights|no exact place or reviewed landmark|metadata centres|caption describes an incidental/.test(concern)
  ));
  return hasHardSafetyConflict ? null : reviewed;
}
