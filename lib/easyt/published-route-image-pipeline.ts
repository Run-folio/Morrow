export type PublishedRouteImageStop = {
  key: string;
  name: string;
  country: string;
  region?: string;
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
};

export type PublishedRouteImageScore = {
  score: number;
  accepted: boolean;
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
    ...(candidate.tags ?? []),
  ].filter(Boolean).join(" "));
  const exactPlace = mentions(text, stop.name);
  const attachedLandmark = stop.attachedLandmarks.find((name) => mentions(text, name));
  const textCountryMatch = mentions(text, stop.country);
  const locationCountry = candidate.location?.country?.trim();
  const locationCountryMatch = Boolean(locationCountry && normalizedCountry(locationCountry) === normalizedCountry(stop.country));
  const conflictingCountry = Boolean(locationCountry && !locationCountryMatch);
  const coordinateDistance = candidate.coordinates ? distanceKm(stop.coordinates, candidate.coordinates) : null;
  const nearbyCoordinates = coordinateDistance !== null && coordinateDistance <= 150;
  const conflictingCoordinates = coordinateDistance !== null && coordinateDistance > 500;
  const sibling = stop.siblingNames.find((name) => normalizeImageGeography(name) !== normalizeImageGeography(stop.name) && mentions(text, name));
  const nonPhotographic = /\b(map|diagram|screenshot|logo|graphic|illustration|video|webm|svg|tiff|painting|drawing|engraving|watercolor|artwork)\b/.test(`${text} ${normalizeImageGeography(candidate.id)} ${normalizeImageGeography(candidate.sourceUrl)}`);
  const incidentalSubject = /\b(portrait|close up|selfie|bikini|animal|bird|curassow|tanager|heron|dog|cat|cow|cattle|artifact|sarcophagus|wheel hub|ski jumping|seller)\b/.test(text);
  const editorialSubject = /\b(city|town|village|street|square|architecture|palace|temple|church|cathedral|mosque|skyline|landscape|mountain|coast|beach|lake|waterfront|harbour|harbor|river|bridge|historic|panorama|view|plaza|agora|old town|waterfall|volcano|desert|island|bay|garden|park)\b/.test(text);
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
  if (!landscape) concerns.push("provider asset is not landscape-oriented");
  if (!editorialSubject) concerns.push("metadata does not describe a destination-suitable scene");
  if (conflictingCountry) { score -= 100; concerns.push(`conflicting provider country: ${locationCountry}`); }
  if (conflictingCoordinates) { score -= 100; concerns.push(`provider coordinates are ${Math.round(coordinateDistance!)} km from the canonical stop`); }
  if (sibling && !exactPlace) { score -= 100; concerns.push(`different route stop named: ${sibling}`); }
  if (nonPhotographic) { score -= 100; concerns.push("non-photographic subject metadata"); }
  if (incidentalSubject) { score -= 50; concerns.push("metadata centres an incidental subject rather than the destination"); }

  const bounded = Math.max(0, Math.min(100, score));
  return { score: bounded, accepted: bounded >= 80 && concerns.length === 0, evidence, concerns };
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
    .sort((left, right) => right.score - left.score || left.candidate.id.localeCompare(right.candidate.id));
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
  const hasHardSafetyConflict = reviewed.concerns.some((concern) => (
    /conflicting provider country|provider coordinates are|different route stop named|non-photographic/.test(concern)
  ));
  return hasHardSafetyConflict ? null : reviewed;
}
