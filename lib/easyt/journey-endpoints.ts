import { canonicalPlaceFactsMatch, type CanonicalPlaceSuggestion, type ResolvedPlaceMention } from "./place-intelligence.ts";
import { findCatalogPlaceById, matchCatalogPlace, type PlaceCatalogEntry } from "./place-catalog.ts";
import type { JourneyEndSelection, JourneyEndpointPlace, TripBrief } from "./trip.ts";

const normalise = (value: string | undefined) => value?.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") ?? "";

export const unknownJourneyEnd = (): JourneyEndSelection => ({ mode: "unknown" });

function validCoordinates(value: [number, number] | undefined): value is [number, number] {
  return Boolean(value
    && Number.isFinite(value[0]) && value[0] >= -180 && value[0] <= 180
    && Number.isFinite(value[1]) && value[1] >= -90 && value[1] <= 90);
}

/** Build one complete endpoint identity. Callers replace the prior value with
 * this object; they must never merge a new label into old spatial fields. */
export function canonicalJourneyEndpointPlace(place: JourneyEndpointPlace): JourneyEndpointPlace {
  return {
    name: place.name.trim(),
    canonicalPlaceId: place.canonicalPlaceId,
    country: place.country,
    providerId: place.providerId,
    coordinates: validCoordinates(place.coordinates) ? [...place.coordinates] as [number, number] : undefined,
  };
}

export function journeyEndpointPlaceFromSuggestion(suggestion: CanonicalPlaceSuggestion): JourneyEndpointPlace {
  return canonicalJourneyEndpointPlace({
    name: suggestion.name,
    canonicalPlaceId: suggestion.canonicalPlaceId,
    country: suggestion.country,
    providerId: suggestion.provenance.find((source) => source.kind === "provider")?.id,
    coordinates: suggestion.coordinates,
  });
}

/** Known catalogue identities must agree with their country and coordinates.
 * Provider-only identities still receive strict coordinate validation. */
export function journeyEndpointIdentityIsCoherent(place: JourneyEndpointPlace) {
  return Boolean(place.name.trim()
    && validCoordinates(place.coordinates)
    && (!place.canonicalPlaceId || canonicalPlaceFactsMatch(place.canonicalPlaceId, place)));
}

export function normalizeJourneyEnd(value: JourneyEndSelection | null | undefined): JourneyEndSelection {
  if (!value || value.mode === "unknown") return unknownJourneyEnd();
  if (value.mode === "same_as_start") return { mode: "same_as_start" };
  const name = value.place?.name?.trim();
  if (!name) return unknownJourneyEnd();
  return {
    mode: "explicit",
    place: canonicalJourneyEndpointPlace({
      name,
      canonicalPlaceId: value.place.canonicalPlaceId,
      country: value.place.country,
      providerId: value.place.providerId,
      coordinates: value.place.coordinates,
    }),
  };
}

export function originPlaceFromBrief(brief: Pick<TripBrief, "origin" | "originCoordinates" | "originCanonicalPlaceId" | "originCountry" | "originProviderId">): JourneyEndpointPlace {
  return canonicalJourneyEndpointPlace({
    name: brief.origin,
    canonicalPlaceId: brief.originCanonicalPlaceId,
    country: brief.originCountry,
    providerId: brief.originProviderId,
    coordinates: brief.originCoordinates,
  });
}

export function resolvedJourneyEndPlace(
  origin: JourneyEndpointPlace,
  selection: JourneyEndSelection | null | undefined,
): JourneyEndpointPlace | null {
  const normalized = normalizeJourneyEnd(selection);
  if (normalized.mode === "unknown") return null;
  return normalized.mode === "same_as_start" ? { ...origin } : { ...normalized.place };
}

function coordinateDistanceKm(left: [number, number], right: [number, number]) {
  const radians = Math.PI / 180;
  const deltaLatitude = (right[1] - left[1]) * radians;
  const deltaLongitude = (right[0] - left[0]) * radians;
  const area = Math.sin(deltaLatitude / 2) ** 2
    + Math.cos(left[1] * radians) * Math.cos(right[1] * radians) * Math.sin(deltaLongitude / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(area), Math.sqrt(1 - area));
}

function stableOsmIdentity(providerId: string | undefined) {
  const parts = providerId?.split(":") ?? [];
  const rawType = parts.at(-2)?.toLocaleLowerCase();
  const rawId = parts.at(-1);
  const type = rawType === "n" || rawType === "node"
    ? "node"
    : rawType === "w" || rawType === "way"
      ? "way"
      : rawType === "r" || rawType === "relation"
        ? "relation"
        : undefined;
  return type && rawId && /^\d+$/.test(rawId) ? `${type}:${rawId}` : undefined;
}

function countriesContradict(left: JourneyEndpointPlace, right: JourneyEndpointPlace) {
  return Boolean(left.country && right.country && normalise(left.country) !== normalise(right.country));
}

function coordinatesContradict(left: JourneyEndpointPlace, right: JourneyEndpointPlace, maximumKm: number) {
  return Boolean(validCoordinates(left.coordinates) && validCoordinates(right.coordinates)
    && coordinateDistanceKm(left.coordinates, right.coordinates) > maximumKm);
}

function catalogIdentity(place: JourneyEndpointPlace): PlaceCatalogEntry | undefined {
  return (place.canonicalPlaceId ? findCatalogPlaceById(place.canonicalPlaceId) : undefined)
    ?? matchCatalogPlace(place.name);
}

/**
 * Strong, symmetric endpoint equivalence for travel sequencing. Durable place
 * records keep their original journey roles; this predicate only decides
 * whether travelling between two adjacent endpoint snapshots is meaningful.
 */
export function isSameCanonicalPlace(left: JourneyEndpointPlace | null | undefined, right: JourneyEndpointPlace | null | undefined) {
  if (!left || !right) return false;
  const leftCanonical = normalise(left.canonicalPlaceId);
  const rightCanonical = normalise(right.canonicalPlaceId);
  if (leftCanonical && leftCanonical === rightCanonical) return true;

  const leftProvider = normalise(left.providerId);
  const rightProvider = normalise(right.providerId);
  if (leftProvider && leftProvider === rightProvider) return true;
  const leftOsm = stableOsmIdentity(left.providerId);
  if (leftOsm && leftOsm === stableOsmIdentity(right.providerId)) return true;

  if (countriesContradict(left, right)) return false;
  const leftCatalog = catalogIdentity(left);
  const rightCatalog = catalogIdentity(right);
  if (leftCatalog || rightCatalog) {
    if (!leftCatalog || !rightCatalog || leftCatalog.canonicalPlaceId !== rightCatalog.canonicalPlaceId) return false;
    return !coordinatesContradict(left, right, 50);
  }

  const sameName = Boolean(normalise(left.name) && normalise(left.name) === normalise(right.name));
  const sameKnownCountry = Boolean(left.country && right.country && !countriesContradict(left, right));
  return sameName && sameKnownCountry
    && validCoordinates(left.coordinates) && validCoordinates(right.coordinates)
    && coordinateDistanceKm(left.coordinates, right.coordinates) <= 0.25;
}

export function sameJourneyPlace(left: JourneyEndpointPlace | null | undefined, right: JourneyEndpointPlace | null | undefined) {
  return isSameCanonicalPlace(left, right);
}

function endpointPlaceFromMention(mention: ResolvedPlaceMention): JourneyEndpointPlace {
  return {
    name: mention.canonicalName?.trim() || mention.sourceText.trim(),
    canonicalPlaceId: mention.canonicalPlaceId,
    country: mention.parentCountries.length === 1 ? mention.parentCountries[0] : undefined,
    coordinates: mention.coordinates,
  };
}

/**
 * Derive only endpoint semantics that the traveller actually supplied. Place
 * identity still comes from Place Intelligence; relationship words such as
 * `home` never become fabricated geography.
 */
export function journeyEndFromCapturedIntent(
  rawBrief: string,
  mentions: readonly ResolvedPlaceMention[],
): JourneyEndSelection {
  const text = rawBrief.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase();
  if (/\b(?:do not|don't|dont)\s+know\b.{0,70}\b(?:end|finish|fly home|return)\b|\bnot sure\b.{0,50}\b(?:end|finish|fly home|return)\b/.test(text)) {
    return unknownJourneyEnd();
  }

  const startMention = mentions.find((mention) => mention.role === "origin" || mention.role === "fixed_start");
  const start = startMention ? endpointPlaceFromMention(startMention) : null;
  const fixedEnd = mentions.find((mention) => mention.role === "fixed_end");
  const fixedEndPlace = fixedEnd ? endpointPlaceFromMention(fixedEnd) : null;
  const relationshipToHome = /\b(?:then|and|going|travel(?:ling|ing))\s+home\b|\bback\s+home\b/.test(text);
  const relationshipToStart = Boolean(start && new RegExp(`\\b(?:back|return(?:ing)?)\\s+(?:to\\s+)?${normalise(start.name).replace(/-/g, "[\\s-]+")}\\b`).test(normalise(rawBrief).replace(/-/g, " ")));

  if (start && (relationshipToHome || relationshipToStart || (fixedEndPlace && sameJourneyPlace(start, fixedEndPlace) && /\b(?:back|return)\b/.test(text)))) {
    return { mode: "same_as_start" };
  }
  if (fixedEndPlace) return { mode: "explicit", place: fixedEndPlace };
  const explicitEndText = /\b(?:finish|finishing|end|ending)(?: the trip)?\s+(?:(?:in|at)\s+)?([^,.\n;]+?)(?=\s+(?:and|then)\b|[,.;\n]|$)/i.exec(rawBrief)?.[1]?.trim();
  if (start && explicitEndText && normalise(explicitEndText) === normalise(start.name)) {
    return { mode: "explicit", place: start };
  }
  return unknownJourneyEnd();
}

export function plannerEndpointForJourneyEnd(
  tripId: string,
  origin: JourneyEndpointPlace,
  selection: JourneyEndSelection | null | undefined,
) {
  const place = resolvedJourneyEndPlace(origin, selection);
  return place ? {
    id: `${tripId}-end`,
    name: place.name,
    country: place.country ?? "",
    canonicalPlaceId: place.canonicalPlaceId,
    providerId: place.providerId,
    coordinates: place.coordinates,
  } : undefined;
}
