import { countryFor } from "./country-registry.ts";

export type ViatorDestinationCoordinates = { latitude: number; longitude: number };

export type ActivityDestinationIdentity = {
  canonicalPlaceId: string;
  name: string;
  aliases?: string[];
  country?: string;
  countryCode?: string;
  region?: string;
  coordinates?: ViatorDestinationCoordinates;
  placeType?: string;
};

export type ViatorDestinationTaxonomyItem = {
  destinationId: string;
  name: string;
  type: string;
  parentDestinationId?: string;
  lookupIds: string[];
  center?: ViatorDestinationCoordinates;
  country?: { code?: string; name: string };
  ancestorNames: string[];
};

export type ViatorDestinationTaxonomy = {
  destinations: ViatorDestinationTaxonomyItem[];
  byId: ReadonlyMap<string, ViatorDestinationTaxonomyItem>;
};

export type ViatorDestinationResolution = {
  provider: "viator";
  destinationId: string;
  destinationName: string;
  parentDestination?: { destinationId: string; destinationName: string };
  confidence: "high" | "medium";
  resolvedFrom:
    | "exact_name_country_type"
    | "exact_alias_country_type"
    | "name_country_coordinates"
    | "alias_country_region"
    | "normalized_locality_name"
    | "parent_destination";
};

export type ViatorDestinationResolutionEvaluation = {
  status: "resolved_automatically" | "resolved_via_provider_parent" | "ambiguous" | "unsupported";
  resolution?: ViatorDestinationResolution;
};

type RawDestination = {
  destinationId?: unknown;
  name?: unknown;
  type?: unknown;
  parentDestinationId?: unknown;
  lookupId?: unknown;
  center?: { latitude?: unknown; longitude?: unknown };
};

const DIRECT_PROVIDER_TYPES = new Set(["CITY", "TOWN", "ISLAND"]);
const CHILD_PROVIDER_TYPES = new Set(["AREA", "COUNTY", "DISTRICT", "HAMLET", "NEIGHBORHOOD", "VILLAGE", "WARD"]);
const UNSUPPORTED_CANONICAL_TYPES = new Set(["continent", "landmark", "point_of_interest", "transport_gateway_landmark"]);

export class ViatorDestinationTaxonomyError extends Error {
  constructor() {
    super("Viator destination taxonomy is malformed.");
    this.name = "ViatorDestinationTaxonomyError";
  }
}

function normalized(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’']/g, "")
    .toLocaleLowerCase("en")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function numericId(value: unknown) {
  if ((typeof value !== "number" && typeof value !== "string") || !/^\d+$/.test(String(value))) return undefined;
  return String(value);
}

function validCenter(value: RawDestination["center"]): ViatorDestinationCoordinates | undefined {
  const latitude = value?.latitude;
  const longitude = value?.longitude;
  if (typeof latitude !== "number" || !Number.isFinite(latitude) || Math.abs(latitude) > 90) return undefined;
  if (typeof longitude !== "number" || !Number.isFinite(longitude) || Math.abs(longitude) > 180) return undefined;
  return { latitude, longitude };
}

/**
 * Normalizes only the provider fields needed to resolve destinations. The full
 * affiliate URLs and all other taxonomy content remain outside Morrovia data.
 */
export function normalizeViatorDestinationTaxonomy(value: unknown): ViatorDestinationTaxonomy {
  if (!value || typeof value !== "object" || !Array.isArray((value as { destinations?: unknown }).destinations)) {
    throw new ViatorDestinationTaxonomyError();
  }
  const rawItems = (value as { destinations: unknown[] }).destinations;
  const provisional = new Map<string, Omit<ViatorDestinationTaxonomyItem, "country" | "ancestorNames">>();
  for (const raw of rawItems) {
    if (!raw || typeof raw !== "object") throw new ViatorDestinationTaxonomyError();
    const item = raw as RawDestination;
    const destinationId = numericId(item.destinationId);
    const parentDestinationId = numericId(item.parentDestinationId);
    const name = typeof item.name === "string" ? item.name.trim() : "";
    const type = typeof item.type === "string" ? item.type.trim().toUpperCase() : "";
    const lookupIds = typeof item.lookupId === "string" ? item.lookupId.split(".").map(numericId) : [];
    if (!destinationId || !name || !type || lookupIds.some((entry) => !entry) || lookupIds.at(-1) !== destinationId) {
      throw new ViatorDestinationTaxonomyError();
    }
    if (provisional.has(destinationId)) throw new ViatorDestinationTaxonomyError();
    provisional.set(destinationId, {
      destinationId,
      name,
      type,
      ...(parentDestinationId ? { parentDestinationId } : {}),
      lookupIds: lookupIds as string[],
      ...(validCenter(item.center) ? { center: validCenter(item.center) } : {}),
    });
  }
  if (!provisional.size) throw new ViatorDestinationTaxonomyError();

  const destinations = [...provisional.values()].map((item): ViatorDestinationTaxonomyItem => {
    const ancestors = item.lookupIds.slice(0, -1).flatMap((id) => {
      const ancestor = provisional.get(id);
      return ancestor ? [ancestor] : [];
    });
    const countryAncestors = ancestors.filter((ancestor) => ancestor.type === "COUNTRY");
    // Viator can nest constituent countries (for example England) beneath a
    // supported ISO country (United Kingdom). Prefer the first recognized
    // travel jurisdiction so canonical ISO context remains comparable.
    const countryItem = item.type === "COUNTRY"
      ? item
      : countryAncestors.find((ancestor) => countryFor(ancestor.name)) ?? countryAncestors[0];
    const canonicalCountry = countryItem ? countryFor(countryItem.name) : null;
    return {
      ...item,
      ...(countryItem ? { country: { ...(canonicalCountry ? { code: canonicalCountry.code } : {}), name: canonicalCountry?.name ?? countryItem.name } } : {}),
      ancestorNames: ancestors.map((ancestor) => ancestor.name),
    };
  });
  const byId = new Map(destinations.map((destination) => [destination.destinationId, destination]));
  return { destinations, byId };
}

function canonicalCountry(identity: ActivityDestinationIdentity) {
  return countryFor(identity.countryCode) ?? countryFor(identity.country);
}

function countryAgrees(identity: ActivityDestinationIdentity, candidate: ViatorDestinationTaxonomyItem) {
  if (!identity.country?.trim() && !identity.countryCode?.trim()) return false;
  if (!candidate.country) return false;
  const expected = canonicalCountry(identity);
  if (expected && candidate.country.code) return expected.code === candidate.country.code;
  return normalized(expected?.name ?? identity.country ?? identity.countryCode ?? "") === normalized(candidate.country.name);
}

function compatibleProviderTypes(placeType: string | undefined) {
  switch (placeType?.toLocaleLowerCase()) {
    case "city": return new Set(["CITY"]);
    case "town": return new Set(["TOWN", "CITY"]);
    case "transport_gateway": return new Set(["CITY", "TOWN"]);
    case "island": return new Set(["ISLAND", "REGION"]);
    case "country": return new Set(["COUNTRY"]);
    case "region":
    case "sub_region":
    case "macro_region": return new Set(["REGION", "PROVINCE", "STATE", "COUNTY", "DISTRICT"]);
    case "natural_area": return new Set(["NATIONAL PARK", "AREA"]);
    case "coast":
    case "valley": return new Set(["AREA", "REGION"]);
    case "archipelago": return new Set(["ISLAND", "REGION"]);
    default: return DIRECT_PROVIDER_TYPES;
  }
}

function distanceKm(left: ViatorDestinationCoordinates, right: ViatorDestinationCoordinates) {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const dLat = radians(right.latitude - left.latitude);
  const dLon = radians(right.longitude - left.longitude);
  const lat1 = radians(left.latitude);
  const lat2 = radians(right.latitude);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function distanceThresholdKm(candidate: ViatorDestinationTaxonomyItem) {
  if (candidate.type === "CITY" || candidate.type === "TOWN") return 100;
  if (candidate.type === "ISLAND" || candidate.type === "NATIONAL PARK") return 250;
  return 500;
}

function regionAgrees(identity: ActivityDestinationIdentity, candidate: ViatorDestinationTaxonomyItem) {
  const region = normalized(identity.region ?? "");
  return Boolean(region) && candidate.ancestorNames.some((ancestor) => normalized(ancestor) === region);
}

function localityVariant(value: string) {
  return normalized(value).replace(/\s+(?:city|town)$/u, "");
}

type CandidateEvidence = {
  candidate: ViatorDestinationTaxonomyItem;
  nameSource: "name" | "alias" | "locality_variant";
  distance?: number;
  regionMatch: boolean;
};

function matchingEvidence(identity: ActivityDestinationIdentity, candidate: ViatorDestinationTaxonomyItem): CandidateEvidence | undefined {
  if (!countryAgrees(identity, candidate)) return undefined;
  const providerName = normalized(candidate.name);
  const canonicalName = normalized(identity.name);
  const aliases = (identity.aliases ?? []).map(normalized).filter(Boolean);
  const nameSource = providerName === canonicalName
    ? "name"
    : aliases.includes(providerName)
      ? "alias"
      : localityVariant(providerName) === localityVariant(canonicalName) && localityVariant(providerName) !== providerName
        ? "locality_variant"
        : undefined;
  if (!nameSource) return undefined;
  const distance = identity.coordinates && candidate.center ? distanceKm(identity.coordinates, candidate.center) : undefined;
  if (distance !== undefined && distance > distanceThresholdKm(candidate)) return undefined;
  return { candidate, nameSource, ...(distance !== undefined ? { distance } : {}), regionMatch: regionAgrees(identity, candidate) };
}

function resolutionForDirect(evidence: CandidateEvidence): ViatorDestinationResolution {
  const { candidate } = evidence;
  const resolvedFrom = evidence.nameSource === "locality_variant"
    ? "normalized_locality_name"
    : evidence.nameSource === "alias"
      ? evidence.regionMatch ? "alias_country_region" : "exact_alias_country_type"
      : evidence.distance !== undefined ? "name_country_coordinates" : "exact_name_country_type";
  return {
    provider: "viator",
    destinationId: candidate.destinationId,
    destinationName: candidate.name,
    confidence: evidence.nameSource === "locality_variant" || evidence.nameSource === "alias" ? "medium" : "high",
    resolvedFrom,
  };
}

function parentResolution(evidence: CandidateEvidence, taxonomy: ViatorDestinationTaxonomy, compatibleTypes: ReadonlySet<string>) {
  if (!CHILD_PROVIDER_TYPES.has(evidence.candidate.type)) return undefined;
  const parent = [...evidence.candidate.lookupIds].reverse().slice(1)
    .map((id) => taxonomy.byId.get(id))
    .find((candidate) => candidate && compatibleTypes.has(candidate.type));
  if (!parent?.country || !evidence.candidate.country) return undefined;
  const sameCountry = parent.country.code && evidence.candidate.country.code
    ? parent.country.code === evidence.candidate.country.code
    : normalized(parent.country.name) === normalized(evidence.candidate.country.name);
  if (!sameCountry) return undefined;
  return {
    provider: "viator" as const,
    destinationId: parent.destinationId,
    destinationName: parent.name,
    parentDestination: { destinationId: parent.destinationId, destinationName: parent.name },
    confidence: "medium" as const,
    resolvedFrom: "parent_destination" as const,
  };
}

/**
 * Exact provider-name evidence is necessary but never sufficient by itself.
 * Country and type must agree; coordinates reject conflicts and disambiguate
 * duplicates. A provider parent is used only through its explicit hierarchy.
 */
export function evaluateViatorDestinationResolution(
  identity: ActivityDestinationIdentity,
  taxonomy: ViatorDestinationTaxonomy,
): ViatorDestinationResolutionEvaluation {
  if (!identity.canonicalPlaceId.trim() || !identity.name.trim()) return { status: "unsupported" };
  if (identity.placeType && UNSUPPORTED_CANONICAL_TYPES.has(identity.placeType.toLocaleLowerCase())) return { status: "unsupported" };
  const compatibleTypes = compatibleProviderTypes(identity.placeType);
  const evidence = taxonomy.destinations.flatMap((candidate) => {
    if (!compatibleTypes.has(candidate.type) && !CHILD_PROVIDER_TYPES.has(candidate.type)) return [];
    const match = matchingEvidence(identity, candidate);
    return match ? [match] : [];
  });
  if (!evidence.length) return { status: "unsupported" };

  const direct = evidence.filter(({ candidate }) => compatibleTypes.has(candidate.type));
  const regionNarrowed = direct.filter((candidate) => candidate.regionMatch);
  const viableDirect = regionNarrowed.length === 1 ? regionNarrowed : direct;
  if (viableDirect.length === 1) return { status: "resolved_automatically", resolution: resolutionForDirect(viableDirect[0]) };
  if (viableDirect.length > 1 && identity.coordinates) {
    const withDistance = viableDirect.filter((candidate): candidate is CandidateEvidence & { distance: number } => candidate.distance !== undefined)
      .sort((left, right) => left.distance - right.distance);
    if (withDistance.length === 1) return { status: "resolved_automatically", resolution: resolutionForDirect(withDistance[0]) };
    if (withDistance.length > 1 && withDistance[0].distance + 25 < withDistance[1].distance) {
      return { status: "resolved_automatically", resolution: resolutionForDirect(withDistance[0]) };
    }
  }
  if (viableDirect.length) return { status: "ambiguous" };

  const parentResolutions = evidence.flatMap((candidate) => {
    const result = parentResolution(candidate, taxonomy, compatibleTypes);
    return result ? [result] : [];
  });
  const uniqueParents = new Map(parentResolutions.map((resolution) => [resolution.destinationId, resolution]));
  if (uniqueParents.size === 1) return { status: "resolved_via_provider_parent", resolution: [...uniqueParents.values()][0] };
  return { status: uniqueParents.size > 1 ? "ambiguous" : "unsupported" };
}

export function resolveViatorDestinationFromTaxonomy(
  identity: ActivityDestinationIdentity,
  taxonomy: ViatorDestinationTaxonomy,
): ViatorDestinationResolution | undefined {
  return evaluateViatorDestinationResolution(identity, taxonomy).resolution;
}

export const viatorTaxonomyCachePolicy = Object.freeze({
  source: "Viator /destinations",
  refreshIntervalMs: 7 * 24 * 60 * 60_000,
  policy: "refresh weekly",
});
