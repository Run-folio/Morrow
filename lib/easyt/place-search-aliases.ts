/**
 * Explicit, evidence-backed query aliases for completed searches. This is a
 * small bootstrap registry for the reusable alias-resolution path, not a
 * claim of global place-name coverage. Provider identities and coordinates
 * always come from a returned source record.
 */
export type ReviewedPlaceSearchAlias = {
  id: string;
  displayName: string;
  countryCode: string;
  /** Exact input spellings accepted for this query alias. */
  inputAliases: readonly string[];
  /** Bounded provider query variants; never used during keystroke autocomplete. */
  queryVariants: readonly string[];
  /** Reviewed OSM object identity, feature name and taxonomy must all agree. */
  providerFeatures: readonly { providerId: string; name: string; key: string; value: string }[];
  /** Optional display aliases attached only after a source feature passes the guards. */
  displayAliases: readonly string[];
  evidence: readonly { label: string; url: string }[];
};

const normalize = (value: string) => value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
  .toLocaleLowerCase().replace(/[’']/g, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim().replace(/\s+/g, " ");

export const REVIEWED_PLACE_SEARCH_ALIASES: readonly ReviewedPlaceSearchAlias[] = [
  {
    id: "hirayu-onsen",
    displayName: "Hirayu Onsen",
    countryCode: "JP",
    inputAliases: ["Hirayu", "Hirayu Onsen", "平湯温泉"],
    queryVariants: ["平湯温泉"],
    providerFeatures: [{ providerId: "N:2481035449", name: "平湯温泉", key: "place", value: "hamlet" }],
    displayAliases: ["Hirayu Onsen", "Hirayu", "平湯温泉"],
    evidence: [
      { label: "Japan National Tourism Organization: Hirayu Onsen in Takayama", url: "https://www.japan.travel/en/spot/1263/" },
      { label: "Photon response fixture for the Hirayu native-name query", url: "https://photon.komoot.io/" },
    ],
  },
  {
    id: "fanjingshan-scenic-area",
    displayName: "Fanjingshan",
    countryCode: "CN",
    inputAliases: ["Fanjingshan", "Fanjing Mountain", "Fangjin mountain"],
    queryVariants: ["Fanjingshan"],
    providerFeatures: [{ providerId: "W:626892766", name: "梵净山风景区", key: "leisure", value: "nature_reserve" }],
    displayAliases: ["Fanjingshan", "Fanjing Mountain", "梵净山风景区"],
    evidence: [
      { label: "UNESCO World Heritage Centre: Fanjingshan", url: "https://whc.unesco.org/en/list/1559/" },
      { label: "Photon response fixture for the Fanjingshan query", url: "https://photon.komoot.io/" },
    ],
  },
];

export function lookupReviewedPlaceSearchAlias(value: string, countryCode?: string): ReviewedPlaceSearchAlias | undefined {
  const key = normalize(value);
  if (!key) return undefined;
  return REVIEWED_PLACE_SEARCH_ALIASES.find((entry) => (!countryCode || entry.countryCode === countryCode.toUpperCase())
    && entry.inputAliases.some((alias) => normalize(alias) === key));
}

export function reviewedAliasMatchesPhotonFeature(input: {
  query: string;
  name: string;
  countryCode?: string;
  providerId?: string;
  key?: string;
  value?: string;
}): ReviewedPlaceSearchAlias | undefined {
  const entry = lookupReviewedPlaceSearchAlias(input.query);
  if (!entry || input.countryCode?.toUpperCase() !== entry.countryCode) return undefined;
  const name = normalize(input.name);
  return entry.providerFeatures.some((feature) => normalize(feature.name) === name
    && feature.providerId === input.providerId && feature.key === input.key && feature.value === input.value) ? entry : undefined;
}

export function reviewedAliasMatchesCandidate(candidate: {
  canonicalName: string;
  aliases?: string[];
  countryCode?: string;
  providerId: string;
  providerKey?: string;
  providerKind?: string;
}, entry: ReviewedPlaceSearchAlias): boolean {
  if (candidate.countryCode?.toUpperCase() !== entry.countryCode) return false;
  const providerId = candidate.providerId.replace(/^photon:/, "");
  const names = [candidate.canonicalName, ...(candidate.aliases ?? [])].map(normalize);
  return entry.providerFeatures.some(feature => feature.providerId === providerId
    && feature.key === candidate.providerKey && feature.value === candidate.providerKind
    && names.includes(normalize(feature.name)));
}

export function reviewedPlaceSearchQueries(value: string, countryCode?: string): string[] {
  const entry = lookupReviewedPlaceSearchAlias(value, countryCode);
  if (!entry) return [];
  const original = normalize(value);
  return [...new Set(entry.queryVariants.filter((query) => normalize(query) !== original))];
}
