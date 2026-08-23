/**
 * Small, curated planning facts for destinations and transfers.
 *
 * This module is not destination discovery and it is not a global place
 * database. It only exposes facts Morrovia can trace to an existing curated
 * source. Callers must keep using their existing stop IDs; resolution here is
 * read-only and never rewrites a trip document.
 */

export type KnowledgeConfidence = "verified" | "static" | "estimated" | "unknown";

export type KnowledgeSource = {
  id: string;
  label: string;
  kind: "curated" | "official" | "provider" | "legacy-planner";
  supports: string;
  url?: string;
  reviewedAt?: string;
};

export type KnownKnowledgeFact<T> = {
  status: "known";
  value: T;
  confidence: Exclude<KnowledgeConfidence, "unknown">;
  sources: readonly [KnowledgeSource, ...KnowledgeSource[]];
};

export type UnknownKnowledgeFact = {
  status: "unknown";
  value: null;
  confidence: "unknown";
  sources: readonly [];
  reason: string;
};

export type KnowledgeFact<T> = KnownKnowledgeFact<T> | UnknownKnowledgeFact;

export function knownKnowledgeFact<T>(
  value: T,
  confidence: Exclude<KnowledgeConfidence, "unknown">,
  source: KnowledgeSource | readonly [KnowledgeSource, ...KnowledgeSource[]],
): KnownKnowledgeFact<T> {
  return {
    status: "known",
    value,
    confidence,
    sources: Array.isArray(source) ? source : [source],
  } as KnownKnowledgeFact<T>;
}

export function unknownKnowledgeFact(reason: string): UnknownKnowledgeFact {
  return { status: "unknown", value: null, confidence: "unknown", sources: [], reason };
}

export type DestinationRole = "anchor" | "hub" | "base" | "side-trip";
export type DestinationTransportMode = "air" | "rail" | "bus" | "ferry";
export type DestinationConnectivity = {
  mode: DestinationTransportMode;
  reach: "local" | "regional" | "national" | "international";
  access: "direct" | "nearby-gateway";
  note?: string;
};
export type DestinationBorderFriction = "none" | "routine" | "variable" | "high";

export type DestinationKnowledge = {
  canonicalId: string;
  name: string;
  aliases: readonly string[];
  country: KnowledgeFact<string>;
  countryCode: KnowledgeFact<string>;
  region: KnowledgeFact<string>;
  coordinates: KnowledgeFact<[number, number]>;
  roles: KnowledgeFact<readonly DestinationRole[]>;
  minimumNights: KnowledgeFact<number>;
  idealNights: KnowledgeFact<number>;
  connectivity: KnowledgeFact<readonly DestinationConnectivity[]>;
  borderFriction: KnowledgeFact<DestinationBorderFriction>;
  experienceTags: KnowledgeFact<readonly string[]>;
  seasonalityNotes: KnowledgeFact<readonly string[]>;
  closureNotes: KnowledgeFact<readonly string[]>;
  arrivalConsiderations: KnowledgeFact<readonly string[]>;
  departureConsiderations: KnowledgeFact<readonly string[]>;
};

export type DestinationIdentityInput = {
  id?: string;
  providerId?: string;
  name: string;
  country?: string;
};

export type DestinationTransferMode = "flight" | "train" | "road" | "ferry";
export type TransferMinuteRange = { minimum: number; maximum: number };
export type TransferDurationBasis = "headline" | "door-to-door";

export type DestinationTransferKnowledge = {
  fromCanonicalId: string;
  toCanonicalId: string;
  mode: KnowledgeFact<DestinationTransferMode>;
  planningMinutes: KnowledgeFact<number>;
  durationBasis: KnowledgeFact<TransferDurationBasis>;
  realisticRangeMinutes: KnowledgeFact<TransferMinuteRange>;
  borderFriction: KnowledgeFact<DestinationBorderFriction>;
  note: KnowledgeFact<string>;
};

export type DestinationStayGuidance = {
  canonicalId: string | null;
  minimumNights: KnowledgeFact<number>;
  idealNights: KnowledgeFact<number>;
  roles: KnowledgeFact<readonly DestinationRole[]>;
};

export type DestinationScoringKnowledge = {
  canonicalId: string | null;
  roles: KnowledgeFact<readonly DestinationRole[]>;
  experienceTags: KnowledgeFact<readonly string[]>;
  connectivity: KnowledgeFact<readonly DestinationConnectivity[]>;
  arrivalConsiderations: KnowledgeFact<readonly string[]>;
  departureConsiderations: KnowledgeFact<readonly string[]>;
};

export type DestinationOnwardLink = {
  destinationId: string;
  mode: KnowledgeFact<DestinationTransferMode>;
  planningMinutes: KnowledgeFact<number>;
};

export type DestinationKnowledgeOverride = Partial<Omit<DestinationKnowledge, "canonicalId">> & {
  canonicalId: string;
};

const routeFamilySource = (
  key: string,
  title: string,
  reviewedAt: string,
): KnowledgeSource => ({
  id: `route-family:${key}`,
  label: `Morrovia route family: ${title}`,
  kind: "curated",
  supports: "Curated destination geography, pacing, route role, experience and planning notes.",
  reviewedAt,
});

const japanSource = routeFamilySource("japan-slow", "Japan, one good day at a time", "2026-08-08");
const italySource = routeFamilySource("italy-table", "Italy between tables", "2026-08-08");
const vietnamCambodiaSource = routeFamilySource("vietnam-cambodia", "Vietnam to Angkor, without rushing", "2026-08-08");
const southeastAsiaSource = routeFamilySource("thailand-vietnam-cambodia", "Southeast Asia, with room to land", "2026-08-14");
const iberiaSource = routeFamilySource("portugal-spain", "Iberia by rail and coast", "2026-08-09");
const plannerAllowanceSource: KnowledgeSource = {
  id: "planner:legacy-connection-allowances-v1",
  label: "Existing Morrovia connection allowances",
  kind: "legacy-planner",
  supports: "Deterministic mode and door-to-door planning allowance used by the existing route engine.",
};

type CuratedDestinationInput = {
  canonicalId: string;
  name: string;
  aliases?: readonly string[];
  country: string;
  region: string;
  coordinates: [number, number];
  roles: readonly DestinationRole[];
  minimumNights: number;
  idealNights: number;
  connectivity?: readonly DestinationConnectivity[];
  experienceTags: readonly string[];
  seasonalityNotes?: readonly string[];
  arrivalConsiderations?: readonly string[];
  departureConsiderations?: readonly string[];
  source: KnowledgeSource | readonly [KnowledgeSource, ...KnowledgeSource[]];
};

function curatedDestination(input: CuratedDestinationInput): DestinationKnowledge {
  const missing = (field: string) => unknownKnowledgeFact(`${field} has not been curated for ${input.name}.`);
  return {
    canonicalId: input.canonicalId,
    name: input.name,
    aliases: input.aliases ?? [],
    country: knownKnowledgeFact(input.country, "static", input.source),
    countryCode: missing("Country code"),
    region: knownKnowledgeFact(input.region, "static", input.source),
    coordinates: knownKnowledgeFact(input.coordinates, "static", input.source),
    roles: knownKnowledgeFact(input.roles, "static", input.source),
    minimumNights: knownKnowledgeFact(input.minimumNights, "static", input.source),
    idealNights: knownKnowledgeFact(input.idealNights, "estimated", input.source),
    connectivity: input.connectivity?.length
      ? knownKnowledgeFact(input.connectivity, "static", input.source)
      : missing("Transport connectivity"),
    borderFriction: missing("Destination-level border friction"),
    experienceTags: knownKnowledgeFact(input.experienceTags, "static", input.source),
    seasonalityNotes: input.seasonalityNotes?.length
      ? knownKnowledgeFact(input.seasonalityNotes, "static", input.source)
      : missing("Seasonality"),
    closureNotes: missing("Seasonal closure information"),
    arrivalConsiderations: input.arrivalConsiderations?.length
      ? knownKnowledgeFact(input.arrivalConsiderations, "static", input.source)
      : missing("Arrival considerations"),
    departureConsiderations: input.departureConsiderations?.length
      ? knownKnowledgeFact(input.departureConsiderations, "static", input.source)
      : missing("Departure considerations"),
  };
}

/** A deliberately modest set drawn from current curated route families. */
export const CURATED_DESTINATION_KNOWLEDGE: readonly DestinationKnowledge[] = [
  curatedDestination({
    canonicalId: "tokyo", name: "Tokyo", aliases: ["seed-tokyo"], country: "Japan", region: "asia",
    coordinates: [139.6917, 35.6895], roles: ["anchor", "hub"], minimumNights: 3, idealNights: 4,
    connectivity: [{ mode: "rail", reach: "national", access: "direct" }],
    experienceTags: ["food", "culture", "rail"],
    seasonalityNotes: ["Spring and autumn are popular and need earlier accommodation planning.", "Summer is hot and humid in cities."],
    source: japanSource,
  }),
  curatedDestination({
    canonicalId: "takayama", name: "Takayama", aliases: ["seed-takayama", "tokayama"], country: "Japan", region: "asia",
    coordinates: [137.2523, 36.146], roles: ["side-trip"], minimumNights: 2, idealNights: 2,
    connectivity: [{ mode: "rail", reach: "regional", access: "direct", note: "Regional connections need timetable verification." }],
    experienceTags: ["food", "culture", "rail"], source: japanSource,
  }),
  curatedDestination({
    canonicalId: "kyoto", name: "Kyoto", aliases: ["seed-kyoto"], country: "Japan", region: "asia",
    coordinates: [135.7681, 35.0116], roles: ["anchor"], minimumNights: 3, idealNights: 4,
    connectivity: [{ mode: "rail", reach: "national", access: "direct" }],
    experienceTags: ["food", "culture", "rail"],
    seasonalityNotes: ["Spring and autumn are popular and need earlier accommodation planning.", "Summer is hot and humid in cities."],
    source: japanSource,
  }),
  curatedDestination({
    canonicalId: "bologna", name: "Bologna", aliases: ["seed-bologna"], country: "Italy", region: "europe",
    coordinates: [11.3426, 44.4949], roles: ["hub", "base"], minimumNights: 3, idealNights: 3,
    connectivity: [{ mode: "rail", reach: "national", access: "direct" }],
    experienceTags: ["food", "culture", "rail"],
    seasonalityNotes: ["Spring and autumn offer a better balance of heat and crowd levels."], source: italySource,
  }),
  curatedDestination({
    canonicalId: "florence", name: "Florence", aliases: ["seed-florence"], country: "Italy", region: "europe",
    coordinates: [11.2558, 43.7696], roles: ["anchor", "base"], minimumNights: 3, idealNights: 4,
    connectivity: [{ mode: "rail", reach: "national", access: "direct" }],
    experienceTags: ["food", "culture", "rail"],
    seasonalityNotes: ["Spring and autumn offer a better balance of heat and crowd levels."], source: italySource,
  }),
  curatedDestination({
    canonicalId: "rome", name: "Rome", aliases: ["seed-rome"], country: "Italy", region: "europe",
    coordinates: [12.4964, 41.9028], roles: ["anchor", "hub"], minimumNights: 4, idealNights: 5,
    connectivity: [{ mode: "rail", reach: "national", access: "direct" }],
    experienceTags: ["food", "culture", "rail"],
    seasonalityNotes: ["Spring and autumn offer a better balance of heat and crowd levels."], source: italySource,
  }),
  curatedDestination({
    canonicalId: "hanoi", name: "Hanoi", aliases: ["seed-hanoi"], country: "Vietnam", region: "asia",
    coordinates: [105.8342, 21.0278], roles: ["anchor", "hub"], minimumNights: 3, idealNights: 4,
    connectivity: [{ mode: "air", reach: "national", access: "direct" }, { mode: "rail", reach: "national", access: "direct" }],
    experienceTags: ["food", "culture", "nature"],
    seasonalityNotes: ["Monsoon patterns vary by coast and region; Vietnam should not be treated as one weather season."],
    source: vietnamCambodiaSource,
  }),
  curatedDestination({
    canonicalId: "hoi-an", name: "Hoi An", aliases: ["seed-hoi-an"], country: "Vietnam", region: "asia",
    coordinates: [108.338, 15.88], roles: ["base"], minimumNights: 3, idealNights: 4,
    connectivity: [{ mode: "air", reach: "national", access: "nearby-gateway", note: "Flight access is planned via Da Nang and needs a ground-transfer allowance." }],
    experienceTags: ["food", "culture", "nature"],
    arrivalConsiderations: ["Flight access is via Da Nang, so arrival planning must include the onward ground transfer."],
    seasonalityNotes: ["Monsoon patterns vary by coast and region; Vietnam should not be treated as one weather season."],
    source: [vietnamCambodiaSource, southeastAsiaSource],
  }),
  curatedDestination({
    canonicalId: "ho-chi-minh-city", name: "Ho Chi Minh City", country: "Vietnam", region: "asia",
    coordinates: [106.6297, 10.8231], roles: ["hub"], minimumNights: 3, idealNights: 3,
    connectivity: [{ mode: "air", reach: "international", access: "direct" }],
    experienceTags: ["food", "culture"],
    departureConsiderations: ["Cross-border onward travel needs current schedule and entry-rule verification."],
    seasonalityNotes: ["Monsoon patterns vary by coast and region; Vietnam should not be treated as one weather season."],
    source: vietnamCambodiaSource,
  }),
  curatedDestination({
    canonicalId: "siem-reap", name: "Siem Reap", country: "Cambodia", region: "asia",
    coordinates: [103.8564, 13.3633], roles: ["anchor"], minimumNights: 3, idealNights: 4,
    connectivity: [{ mode: "air", reach: "international", access: "direct" }],
    experienceTags: ["culture", "nature"],
    arrivalConsiderations: ["Protect recovery time and early starts rather than treating Angkor as an arrival-day stop."],
    source: vietnamCambodiaSource,
  }),
  curatedDestination({
    canonicalId: "lisbon", name: "Lisbon", aliases: ["seed-lisbon"], country: "Portugal", region: "europe",
    coordinates: [-9.1393, 38.7223], roles: ["anchor", "hub"], minimumNights: 4, idealNights: 4,
    connectivity: [{ mode: "rail", reach: "national", access: "direct" }],
    experienceTags: ["rail", "food", "coast"],
    seasonalityNotes: ["Summer heat and rail demand increase; plan the south early or late in the day."], source: iberiaSource,
  }),
  curatedDestination({
    canonicalId: "seville", name: "Seville", country: "Spain", region: "europe",
    coordinates: [-5.9845, 37.3891], roles: ["anchor"], minimumNights: 3, idealNights: 4,
    connectivity: [{ mode: "rail", reach: "national", access: "direct" }],
    experienceTags: ["rail", "food", "culture"],
    seasonalityNotes: ["Summer heat and rail demand increase; plan the south early or late in the day."], source: iberiaSource,
  }),
  curatedDestination({
    canonicalId: "barcelona", name: "Barcelona", aliases: ["seed-barcelona"], country: "Spain", region: "europe",
    coordinates: [2.1734, 41.3851], roles: ["anchor", "hub"], minimumNights: 4, idealNights: 4,
    connectivity: [{ mode: "rail", reach: "international", access: "direct" }],
    experienceTags: ["rail", "food", "coast"],
    seasonalityNotes: ["Summer heat and rail demand increase."], source: iberiaSource,
  }),
];

function plannerTransfer(
  fromCanonicalId: string,
  toCanonicalId: string,
  mode: DestinationTransferMode,
  planningMinutes: number,
  note: string,
): DestinationTransferKnowledge {
  return {
    fromCanonicalId,
    toCanonicalId,
    mode: knownKnowledgeFact(mode, "static", plannerAllowanceSource),
    planningMinutes: knownKnowledgeFact(planningMinutes, "estimated", plannerAllowanceSource),
    durationBasis: knownKnowledgeFact("door-to-door", "static", plannerAllowanceSource),
    realisticRangeMinutes: unknownKnowledgeFact("Only a single door-to-door planning allowance is currently curated; no defensible range is available."),
    borderFriction: unknownKnowledgeFact("No stable border-friction value is curated for this connection."),
    note: knownKnowledgeFact(note, "static", plannerAllowanceSource),
  };
}

const verifyLiveService = "verify the live service before booking.";
const verifyLiveTimetable = "verify the live timetable before booking.";

/** Existing planner allowances, moved intact behind the knowledge boundary. */
export const CURATED_DESTINATION_TRANSFERS: readonly DestinationTransferKnowledge[] = [
  plannerTransfer("guatemala-city", "los-angeles", "flight", 480, `Approximate door-to-door flight allowance; ${verifyLiveService}`),
  plannerTransfer("los-angeles", "tokyo", "flight", 840, `Approximate door-to-door trans-Pacific allowance; ${verifyLiveService}`),
  plannerTransfer("tokyo", "hong-kong", "flight", 360, `Approximate door-to-door flight allowance; ${verifyLiveService}`),
  plannerTransfer("hong-kong", "los-angeles", "flight", 1020, `Approximate door-to-door trans-Pacific allowance; ${verifyLiveService}`),
  plannerTransfer("los-angeles", "guatemala-city", "flight", 480, `Approximate door-to-door flight allowance; ${verifyLiveService}`),
  plannerTransfer("london", "paris", "train", 270, `Typical Eurostar door-to-door allowance; ${verifyLiveTimetable}`),
  plannerTransfer("paris", "london", "train", 270, `Typical Eurostar door-to-door allowance; ${verifyLiveTimetable}`),
  plannerTransfer("madrid", "barcelona", "train", 210, `Typical high-speed rail door-to-door allowance; ${verifyLiveTimetable}`),
  plannerTransfer("barcelona", "madrid", "train", 210, `Typical high-speed rail door-to-door allowance; ${verifyLiveTimetable}`),
  plannerTransfer("paris", "rome", "flight", 330, "Typical door-to-door flight allowance, including airport time; verify flight schedules before booking."),
  plannerTransfer("rome", "paris", "flight", 330, "Typical door-to-door flight allowance, including airport time; verify flight schedules before booking."),
  plannerTransfer("london", "amsterdam", "train", 300, `Typical Eurostar door-to-door allowance; ${verifyLiveTimetable}`),
  plannerTransfer("amsterdam", "london", "train", 300, `Typical Eurostar door-to-door allowance; ${verifyLiveTimetable}`),
  plannerTransfer("paris", "brussels", "train", 120, `Typical high-speed rail door-to-door allowance; ${verifyLiveTimetable}`),
  plannerTransfer("brussels", "paris", "train", 120, `Typical high-speed rail door-to-door allowance; ${verifyLiveTimetable}`),
  plannerTransfer("rome", "florence", "train", 120, `Typical high-speed rail door-to-door allowance; ${verifyLiveTimetable}`),
  plannerTransfer("florence", "rome", "train", 120, `Typical high-speed rail door-to-door allowance; ${verifyLiveTimetable}`),
  plannerTransfer("tokyo", "kanazawa", "train", 190, `Typical Hokuriku Shinkansen door-to-door allowance; ${verifyLiveTimetable}`),
  plannerTransfer("kanazawa", "takayama", "train", 180, `Typical regional rail and bus door-to-door allowance; ${verifyLiveTimetable}`),
  plannerTransfer("kanazawa", "tokayama", "train", 150, `Typical regional rail and bus door-to-door allowance; ${verifyLiveTimetable}`),
  plannerTransfer("takayama", "matsumoto", "train", 150, `Typical regional rail and bus door-to-door allowance; ${verifyLiveTimetable}`),
  plannerTransfer("chengdu", "tongren", "train", 360, `Typical high-speed rail door-to-door allowance; ${verifyLiveTimetable}`),
  plannerTransfer("tongren", "zhangjiajie", "train", 210, `Typical rail connection door-to-door allowance; ${verifyLiveTimetable}`),
  plannerTransfer("zhangjiajie", "hong-kong", "train", 420, `Typical high-speed rail door-to-door allowance; ${verifyLiveTimetable}`),
  plannerTransfer("hong-kong", "zhangjiajie", "train", 420, `Typical high-speed rail door-to-door allowance; ${verifyLiveTimetable}`),
];

const normalise = (value: string) => value
  .normalize("NFKD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase()
  .replace(/[’']/g, "")
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/(^-|-$)/g, "");

const identityCountryKey = (name: string, country: string) => `${normalise(name)}|${normalise(country)}`;
const transferKey = (fromCanonicalId: string, toCanonicalId: string) => `${normalise(fromCanonicalId)}|${normalise(toCanonicalId)}`;

export type DestinationKnowledgeStore = {
  findDestination(input: DestinationIdentityInput): DestinationKnowledge | undefined;
  canonicalId(input: DestinationIdentityInput): string | null;
  forNightAllocation(input: DestinationIdentityInput): DestinationStayGuidance;
  forRouteScoring(input: DestinationIdentityInput): DestinationScoringKnowledge;
  findTransfer(from: DestinationIdentityInput, to: DestinationIdentityInput): DestinationTransferKnowledge | undefined;
  commonOnwardLinks(input: DestinationIdentityInput): KnowledgeFact<readonly DestinationOnwardLink[]>;
};

export function createDestinationKnowledgeStore(options: {
  destinations?: readonly DestinationKnowledge[];
  destinationOverrides?: readonly DestinationKnowledgeOverride[];
  transfers?: readonly DestinationTransferKnowledge[];
  transferOverrides?: readonly DestinationTransferKnowledge[];
} = {}): DestinationKnowledgeStore {
  const destinationById = new Map((options.destinations ?? CURATED_DESTINATION_KNOWLEDGE).map((destination) => [normalise(destination.canonicalId), destination]));
  for (const override of options.destinationOverrides ?? []) {
    const key = normalise(override.canonicalId);
    const existing = destinationById.get(key);
    if (!existing && !override.name) throw new Error(`A new destination override for ${override.canonicalId} must include a name.`);
    destinationById.set(key, {
      ...(existing ?? {
        canonicalId: override.canonicalId,
        name: override.name as string,
        aliases: [],
        country: unknownKnowledgeFact("Country has not been supplied."),
        countryCode: unknownKnowledgeFact("Country code has not been supplied."),
        region: unknownKnowledgeFact("Region has not been supplied."),
        coordinates: unknownKnowledgeFact("Coordinates have not been supplied."),
        roles: unknownKnowledgeFact("Destination role has not been supplied."),
        minimumNights: unknownKnowledgeFact("Minimum nights have not been supplied."),
        idealNights: unknownKnowledgeFact("Ideal nights have not been supplied."),
        connectivity: unknownKnowledgeFact("Transport connectivity has not been supplied."),
        borderFriction: unknownKnowledgeFact("Border friction has not been supplied."),
        experienceTags: unknownKnowledgeFact("Experience tags have not been supplied."),
        seasonalityNotes: unknownKnowledgeFact("Seasonality has not been supplied."),
        closureNotes: unknownKnowledgeFact("Closure information has not been supplied."),
        arrivalConsiderations: unknownKnowledgeFact("Arrival considerations have not been supplied."),
        departureConsiderations: unknownKnowledgeFact("Departure considerations have not been supplied."),
      }),
      ...override,
      canonicalId: override.canonicalId,
    });
  }

  const aliasToId = new Map<string, string>();
  const nameCountryToId = new Map<string, string>();
  const nameCandidates = new Map<string, string[]>();
  for (const destination of destinationById.values()) {
    const canonicalId = normalise(destination.canonicalId);
    aliasToId.set(canonicalId, canonicalId);
    for (const alias of destination.aliases) aliasToId.set(normalise(alias), canonicalId);
    if (destination.country.status === "known") nameCountryToId.set(identityCountryKey(destination.name, destination.country.value), canonicalId);
    const nameKey = normalise(destination.name);
    nameCandidates.set(nameKey, [...(nameCandidates.get(nameKey) ?? []), canonicalId]);
  }

  const resolveId = (input: DestinationIdentityInput) => {
    for (const identity of [input.id, input.providerId]) {
      const resolved = identity ? aliasToId.get(normalise(identity)) : undefined;
      if (resolved) return resolved;
    }
    if (input.country) {
      const resolved = nameCountryToId.get(identityCountryKey(input.name, input.country));
      if (resolved) return resolved;
    }
    const candidates = nameCandidates.get(normalise(input.name));
    return candidates?.length === 1 ? candidates[0] : undefined;
  };

  const transferByPair = new Map<string, DestinationTransferKnowledge>();
  for (const transfer of [...(options.transfers ?? CURATED_DESTINATION_TRANSFERS), ...(options.transferOverrides ?? [])]) {
    transferByPair.set(transferKey(transfer.fromCanonicalId, transfer.toCanonicalId), transfer);
  }

  const rawIdentityForTransfer = (input: DestinationIdentityInput) => normalise(input.id ?? input.name);
  const identityForTransfer = (input: DestinationIdentityInput) => resolveId(input) ?? rawIdentityForTransfer(input);
  const unknownFor = (field: string, input: DestinationIdentityInput) => unknownKnowledgeFact(`${field} is unknown for ${input.name}.`);
  const findDestination = (input: DestinationIdentityInput) => {
    const id = resolveId(input);
    return id ? destinationById.get(id) : undefined;
  };

  return {
    findDestination,
    canonicalId: (input) => findDestination(input)?.canonicalId ?? null,
    forNightAllocation: (input) => {
      const destination = findDestination(input);
      return {
        canonicalId: destination?.canonicalId ?? null,
        minimumNights: destination?.minimumNights ?? unknownFor("Minimum nights", input),
        idealNights: destination?.idealNights ?? unknownFor("Ideal nights", input),
        roles: destination?.roles ?? unknownFor("Destination role", input),
      };
    },
    forRouteScoring: (input) => {
      const destination = findDestination(input);
      return {
        canonicalId: destination?.canonicalId ?? null,
        roles: destination?.roles ?? unknownFor("Destination role", input),
        experienceTags: destination?.experienceTags ?? unknownFor("Experience tags", input),
        connectivity: destination?.connectivity ?? unknownFor("Transport connectivity", input),
        arrivalConsiderations: destination?.arrivalConsiderations ?? unknownFor("Arrival considerations", input),
        departureConsiderations: destination?.departureConsiderations ?? unknownFor("Departure considerations", input),
      };
    },
    findTransfer: (from, to) => transferByPair.get(transferKey(rawIdentityForTransfer(from), rawIdentityForTransfer(to)))
      ?? transferByPair.get(transferKey(identityForTransfer(from), identityForTransfer(to))),
    commonOnwardLinks: (input) => {
      const fromId = identityForTransfer(input);
      const links = [...transferByPair.values()]
        .filter((transfer) => normalise(transfer.fromCanonicalId) === fromId)
        .map((transfer) => ({
          destinationId: transfer.toCanonicalId,
          mode: transfer.mode,
          planningMinutes: transfer.planningMinutes,
        }));
      return links.length
        ? knownKnowledgeFact(links, "static", plannerAllowanceSource)
        : unknownFor("Common onward links", input);
    },
  };
}

export const destinationKnowledge = createDestinationKnowledgeStore();
