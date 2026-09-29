import { captureJourneyBrief, type JourneyCaptureResult } from "./journey-capture.ts";
import { catalogPlaceForProviderIdentity, isOvernightBaseEligible, normalizePlacePhrase, placeResolutionIssuesForMentions, type CanonicalPlaceSuggestion, type GeographicBounds, type PlaceRoutability, type ResolvedPlaceMention } from "./place-intelligence.ts";
import { findCatalogPlaceById } from "./place-catalog.ts";
import type { EasyTTrip, JourneyEndSelection, JourneyEndpointPlace, TripBudgetPreference } from "./trip.ts";
import type { CuratedRouteKnowledge } from "./curated-route-knowledge.ts";
import { normalizeTripInterests, tripInterestIds, type TripInterest } from "./trip-interest.ts";
import { canonicalJourneyEndpointPlace, normalizeJourneyEnd, originPlaceFromBrief, resolvedJourneyEndPlace, sameJourneyPlace } from "./journey-endpoints.ts";
import { createPlanningConfidence } from "./planning-confidence.ts";
import { structuredTripBriefFromSavedSelections, validateStructuredTripBrief, type StructuredTripBrief, type TripBriefProvenance } from "./structured-trip-brief.ts";
import type { TravelProfile } from "./travel-profile.ts";
import { homepageInputStorageKey } from "./private-browser-context.ts";

export const HOME_TRIP_DRAFT_KEY = "easyt-home-trip-draft";

export type HomepageDestinationEntry = {
  id: string;
  text: string;
  selection: CanonicalPlaceSuggestion | null;
};

export type HomepageChoice<T> =
  | { state: "untouched" }
  | { state: "selected"; value: T }
  | { state: "cleared" };

export type HomepageInputSnapshot = {
  version: 1;
  ownerId: string | null;
  revision: number;
  mode: "stops" | "describe";
  entries: HomepageDestinationEntry[];
  prompt: string;
  dates: HomepageChoice<{ start: string; end: string }>;
  budget: HomepageChoice<"value" | "mid" | "high">;
  interests: HomepageChoice<TripInterest[]>;
  travellers: HomepageChoice<number>;
  origin: HomepageChoice<JourneyEndpointPlace>;
  journeyEnd: HomepageChoice<JourneyEndSelection>;
};

export function homepageSnapshotForDescribePrompt(snapshot: HomepageInputSnapshot, prompt: string): HomepageInputSnapshot {
  if (snapshot.mode !== "describe" || prompt === snapshot.prompt
    || (snapshot.origin.state !== "selected" && snapshot.journeyEnd.state !== "selected")) return { ...snapshot, prompt };
  const mentions = captureJourneyBrief(prompt).mentions;
  const start = mentions.find((mention) => mention.role === "origin" || mention.role === "fixed_start");
  const end = mentions.find((mention) => mention.role === "fixed_end");
  const differs = (selected: string, mention: ResolvedPlaceMention) =>
    normalizePlacePhrase(selected) !== normalizePlacePhrase(mention.canonicalName)
    && normalizePlacePhrase(selected) !== normalizePlacePhrase(mention.sourceText);
  return {
    ...snapshot,
    prompt,
    origin: start && snapshot.origin.state === "selected" && differs(snapshot.origin.value.name, start)
      ? { state: "untouched" } : snapshot.origin,
    journeyEnd: end && snapshot.journeyEnd.state === "selected"
      && (snapshot.journeyEnd.value.mode !== "explicit" || differs(snapshot.journeyEnd.value.place.name, end))
      ? { state: "untouched" } : snapshot.journeyEnd,
  };
}

export type HomepageInputIssue = {
  field: "destinations" | "prompt" | "dates" | "travellers";
  code: "required" | "unresolved" | "invalid";
  entryId?: string;
};

export type HomepageHandoffReceipt = {
  version: 1;
  ownerId: string | null;
  handoffId: string;
  inputFingerprint: string;
  /** Traveller-controlled input at submission, before capture or enrichment. */
  semanticInputFingerprint?: string;
  tripId: string;
};

/** Frozen traveller input awaiting Builder-owned interpretation. */
export type PendingIntakeReceipt = {
  version: 2;
  phase: "pending-interpretation";
  ownerId: string | null;
  handoffId: string;
  tripId: string;
  inputRevision: number;
  semanticInputFingerprint: string;
  frozenSnapshot: HomepageInputSnapshot;
};

export type PendingHomeTripHandoff = {
  version: 2;
  phase: "pending-interpretation";
  receipt: PendingIntakeReceipt;
};

export type StoredHomepageInput = {
  snapshot: HomepageInputSnapshot;
  receipt?: HomepageHandoffReceipt | PendingIntakeReceipt;
};

export function moveHomepageEntry(
  entries: readonly HomepageDestinationEntry[],
  id: string,
  offset: -1 | 1,
): HomepageDestinationEntry[] {
  const from = entries.findIndex((entry) => entry.id === id);
  const to = from + offset;
  if (from < 0 || to < 0 || to >= entries.length) return [...entries];
  const next = [...entries];
  const [entry] = next.splice(from, 1);
  next.splice(to, 0, entry);
  return next;
}

export type HomeTripDraft = {
  handoffId?: string;
  sourceRouteKey?: string;
  curatedRoute?: CuratedRouteKnowledge;
  origin?: string;
  originCoordinates?: [number, number];
  originCanonicalPlaceId?: string;
  originCountry?: string;
  originProviderId?: string;
  journeyEnd?: JourneyEndSelection;
  destination?: { id: string; name: string; country: string; canonicalPlaceId?: string; providerId?: string; coordinates?: [number, number] };
  destinations?: Array<{ id: string; name: string; country: string; canonicalPlaceId?: string; providerId?: string; coordinates?: [number, number] }>;
  locationMentions?: ResolvedPlaceMention[];
  routeHints?: string[];
  regions?: string[];
  parserVersion?: string;
  structuredBrief?: JourneyCaptureResult["structuredBrief"];
  planningSuggestions?: JourneyCaptureResult["planningSuggestions"];
  planningAssessment?: JourneyCaptureResult["planningAssessment"];
  startDate?: string;
  endDate?: string;
  durationDays?: number;
  datesExplicit?: boolean;
  travellers?: number;
  travellersExplicit?: boolean;
  interests?: TripInterest[];
  /** Distinguishes an explicit empty selection from an untouched control. */
  interestsExplicit?: boolean;
  budget?: "value" | "mid" | "high";
  budgetPreference?: TripBudgetPreference;
  homepage?: {
    version: 1;
    ownerId: string | null;
    revision: number;
    mode: HomepageInputSnapshot["mode"];
    occurrenceMentionIds: Record<string, string>;
    choices: Pick<HomepageInputSnapshot, "dates" | "budget" | "interests" | "travellers" | "origin" | "journeyEnd">;
    receipt?: HomepageHandoffReceipt;
  };
  brief?: string;
  nightAllocations?: Record<string, number>;
  decisionSelections?: EasyTTrip["brief"]["decisionSelections"];
};

const HOMEPAGE_PROMPT_LIMIT = 4_000;
const HOMEPAGE_SHORT_TEXT_LIMIT = 256;
const HOMEPAGE_ENTRY_LIMIT = 12;
const homepagePlaceTypes = new Set([
  "continent", "country", "macro_region", "region", "sub_region", "island", "archipelago",
  "city", "town", "natural_area", "coast", "mountain_range", "valley", "travel_corridor",
  "landmark", "transport_gateway", "unknown",
]);
const homepageRoutabilities = new Set([
  "direct_destination", "planning_area", "anchor_or_poi", "needs_base_selection", "non_routable_reference",
]);
const homepageInterestIds = new Set<TripInterest>(tripInterestIds);

function homepageRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function boundedHomepageString(value: unknown, maximum = HOMEPAGE_SHORT_TEXT_LIMIT, allowEmpty = false): value is string {
  return typeof value === "string" && value.length <= maximum && (allowEmpty || value.trim().length > 0);
}

function homepageCoordinates(value: unknown): value is [number, number] {
  return Array.isArray(value) && value.length === 2
    && typeof value[0] === "number" && Number.isFinite(value[0]) && value[0] >= -180 && value[0] <= 180
    && typeof value[1] === "number" && Number.isFinite(value[1]) && value[1] >= -90 && value[1] <= 90;
}

function homepageBounds(value: unknown) {
  if (!homepageRecord(value)) return false;
  const { south, west, north, east } = value;
  return typeof south === "number" && Number.isFinite(south) && south >= -90 && south <= 90
    && typeof north === "number" && Number.isFinite(north) && north >= -90 && north <= 90 && south <= north
    && typeof west === "number" && Number.isFinite(west) && west >= -180 && west <= 180
    && typeof east === "number" && Number.isFinite(east) && east >= -180 && east <= 180 && west <= east;
}

function homepageProvenance(value: unknown) {
  if (!Array.isArray(value) || !value.length || value.length > 32) return false;
  return value.every((candidate) => homepageRecord(candidate)
    && boundedHomepageString(candidate.id)
    && boundedHomepageString(candidate.label)
    && ["canonical", "curated_alias", "context", "provider", "unresolved", "builder"].includes(String(candidate.kind))
    && boundedHomepageString(candidate.supports, 1_000)
    && (candidate.reviewedAt === undefined || boundedHomepageString(candidate.reviewedAt)));
}

function homepageSelection(value: unknown): value is CanonicalPlaceSuggestion {
  if (!homepageRecord(value)) return false;
  return boundedHomepageString(value.canonicalPlaceId)
    && boundedHomepageString(value.name)
    && boundedHomepageString(value.label, 512)
    && boundedHomepageString(value.country, HOMEPAGE_SHORT_TEXT_LIMIT, true)
    && (value.region === undefined || boundedHomepageString(value.region))
    && (value.accessPlaceName === undefined || boundedHomepageString(value.accessPlaceName))
    && typeof value.placeType === "string" && homepagePlaceTypes.has(value.placeType)
    && (value.coordinates === undefined || homepageCoordinates(value.coordinates))
    && (value.bounds === undefined || homepageBounds(value.bounds))
    && (value.routability === undefined || typeof value.routability === "string" && homepageRoutabilities.has(value.routability))
    && homepageProvenance(value.provenance);
}

function homepageEndpoint(value: unknown): value is JourneyEndpointPlace {
  if (!homepageRecord(value) || !boundedHomepageString(value.name)) return false;
  return (value.canonicalPlaceId === undefined || boundedHomepageString(value.canonicalPlaceId))
    && (value.country === undefined || boundedHomepageString(value.country))
    && (value.providerId === undefined || boundedHomepageString(value.providerId))
    && (value.coordinates === undefined || homepageCoordinates(value.coordinates));
}

function homepageEnd(value: unknown): value is JourneyEndSelection {
  if (!homepageRecord(value)) return false;
  if (value.mode === "unknown" || value.mode === "same_as_start") return true;
  return value.mode === "explicit" && homepageEndpoint(value.place);
}

function homepageChoice(value: unknown, selected: (candidate: unknown) => boolean) {
  if (!homepageRecord(value)) return false;
  if (value.state === "untouched" || value.state === "cleared") return value.value === undefined;
  return value.state === "selected" && selected(value.value);
}

function homepageDate(value: unknown) {
  return typeof value === "string" && validHomepageDate(value);
}

function homepageSnapshot(value: unknown, ownerId: string | null): value is HomepageInputSnapshot {
  if (!homepageRecord(value)
    || value.version !== 1
    || value.ownerId !== ownerId
    || !(value.ownerId === null || boundedHomepageString(value.ownerId))
    || !Number.isSafeInteger(value.revision) || (value.revision as number) < 0
    || (value.mode !== "stops" && value.mode !== "describe")
    || !boundedHomepageString(value.prompt, HOMEPAGE_PROMPT_LIMIT, true)
    || !Array.isArray(value.entries) || value.entries.length > HOMEPAGE_ENTRY_LIMIT) return false;

  const occurrenceIds = new Set<string>();
  for (const candidate of value.entries) {
    if (!homepageRecord(candidate)
      || !boundedHomepageString(candidate.id)
      || occurrenceIds.has(candidate.id)
      || !boundedHomepageString(candidate.text, 512, true)
      || !(candidate.selection === null || homepageSelection(candidate.selection))) return false;
    occurrenceIds.add(candidate.id);
  }

  return homepageChoice(value.dates, (candidate) => homepageRecord(candidate)
      && homepageDate(candidate.start) && homepageDate(candidate.end) && String(candidate.end) >= String(candidate.start))
    && homepageChoice(value.budget, (candidate) => ["value", "mid", "high"].includes(String(candidate)))
    && homepageChoice(value.interests, (candidate) => Array.isArray(candidate)
      && candidate.length <= homepageInterestIds.size
      && candidate.every((interest) => typeof interest === "string" && homepageInterestIds.has(interest as TripInterest))
      && new Set(candidate).size === candidate.length)
    && homepageChoice(value.travellers, (candidate) => Number.isInteger(candidate) && Number(candidate) >= 1 && Number(candidate) <= 12)
    && homepageChoice(value.origin, homepageEndpoint)
    && homepageChoice(value.journeyEnd, homepageEnd);
}

function homepageReceipt(value: unknown, snapshot: HomepageInputSnapshot): value is HomepageHandoffReceipt {
  return homepageRecord(value)
    && value.version === 1
    && value.ownerId === snapshot.ownerId
    && boundedHomepageString(value.handoffId)
    && boundedHomepageString(value.inputFingerprint, 512)
    && (value.semanticInputFingerprint === undefined || boundedHomepageString(value.semanticInputFingerprint, 512))
    && boundedHomepageString(value.tripId);
}

export function createPendingIntakeReceipt(
  snapshot: HomepageInputSnapshot,
  identity: { handoffId: string; tripId: string },
): PendingIntakeReceipt {
  if (!homepageSnapshot(snapshot, snapshot.ownerId)
    || !boundedHomepageString(identity.handoffId)
    || !boundedHomepageString(identity.tripId)) throw new Error("Invalid pending intake identity");
  const frozenSnapshot = structuredClone(snapshot);
  return {
    version: 2,
    phase: "pending-interpretation",
    ownerId: snapshot.ownerId,
    handoffId: identity.handoffId,
    tripId: identity.tripId,
    inputRevision: snapshot.revision,
    semanticInputFingerprint: homepageSemanticInputFingerprint(frozenSnapshot),
    frozenSnapshot,
  };
}

export function pendingIntakeReceiptForOwner(value: unknown, ownerId: string | null): PendingIntakeReceipt | null {
  if (!homepageRecord(value) || value.version !== 2 || value.phase !== "pending-interpretation"
    || value.ownerId !== ownerId || !boundedHomepageString(value.handoffId)
    || !boundedHomepageString(value.tripId) || !Number.isSafeInteger(value.inputRevision)
    || Number(value.inputRevision) < 0 || value.inputFingerprint !== undefined
    || !homepageSnapshot(value.frozenSnapshot, ownerId)
    || value.inputRevision !== value.frozenSnapshot.revision
    || value.semanticInputFingerprint !== homepageSemanticInputFingerprint(value.frozenSnapshot)) return null;
  return value as unknown as PendingIntakeReceipt;
}

export function pendingHomepageHandoffForOwner(
  value: unknown,
  ownerId: string | null,
  handoffId: string,
): PendingIntakeReceipt | null {
  if (!homepageRecord(value) || value.version !== 2 || value.phase !== "pending-interpretation") return null;
  const receipt = pendingIntakeReceiptForOwner(value.receipt, ownerId);
  return receipt?.handoffId === handoffId ? receipt : null;
}

/** Decode owner-private intake without repairing or adopting malformed state. */
export function readHomepageInput(value: unknown, ownerId: string | null): StoredHomepageInput | null {
  if (!homepageRecord(value) || !homepageSnapshot(value.snapshot, ownerId)) return null;
  if (value.receipt !== undefined
    && !homepageReceipt(value.receipt, value.snapshot)
    && !pendingIntakeReceiptForOwner(value.receipt, ownerId)) return null;
  return value.receipt === undefined
    ? { snapshot: value.snapshot }
    : { snapshot: value.snapshot, receipt: value.receipt as HomepageHandoffReceipt | PendingIntakeReceipt };
}

/** Edits share the receipt lock with submissions so another tab cannot erase
 * an unacknowledged frozen intake. This writes the existing owner key only. */
export async function persistEditableHomepageInput(input: {
  storage: Pick<Storage, "getItem" | "setItem" | "removeItem">;
  snapshot: HomepageInputSnapshot;
  preserveCompletedReceipt?: boolean;
  isCurrent?: () => boolean;
  lock?: <T>(key: string, run: () => Promise<T>) => Promise<T>;
}): Promise<{ ok: true; stored: StoredHomepageInput } | { ok: false; reason: "reserved" | "storage" | "stale" }> {
  try {
    return await withHomepageReceiptLock(input.snapshot.ownerId, input.lock, async () => {
      if (input.isCurrent && !input.isCurrent()) return { ok: false as const, reason: "stale" as const };
      const key = homepageInputStorageKey(input.snapshot.ownerId);
      const raw = input.storage.getItem(key);
      let previous: StoredHomepageInput | null = null;
      try { previous = raw ? readHomepageInput(JSON.parse(raw), input.snapshot.ownerId) : null; }
      catch { return { ok: false as const, reason: "storage" as const }; }
      if (raw && !previous) return { ok: false as const, reason: "storage" as const };
      if (previous?.receipt?.version === 2) return { ok: false as const, reason: "reserved" as const };
      const stored: StoredHomepageInput = input.preserveCompletedReceipt && previous?.receipt?.version === 1
        ? { snapshot: input.snapshot, receipt: previous.receipt } : { snapshot: input.snapshot };
      const serialized = JSON.stringify(stored);
      try {
        input.storage.setItem(key, serialized);
        if (input.storage.getItem(key) !== serialized) throw new Error("Editable intake write was not durable");
      } catch {
        try {
          if (raw === null) input.storage.removeItem(key);
          else input.storage.setItem(key, raw);
        } catch { /* Keep the original storage failure. */ }
        return { ok: false as const, reason: "storage" as const };
      }
      return { ok: true as const, stored };
    });
  } catch { return { ok: false, reason: "storage" }; }
}

/** Preserve the current intake before leaving for the existing import route. */
export async function persistHomepageIntakeForImport(
  storage: Pick<Storage, "getItem" | "setItem" | "removeItem">,
  snapshot: HomepageInputSnapshot,
  lock?: <T>(key: string, run: () => Promise<T>) => Promise<T>,
  isCurrent?: () => boolean,
): Promise<boolean> {
  return (await persistEditableHomepageInput({ storage, snapshot, lock, isCurrent })).ok;
}

function canonicalFingerprintValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalFingerprintValue);
  if (!homepageRecord(value)) return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key, candidate]) => candidate !== undefined
      && !["receipt", "revision", "requestId", "createdAt", "updatedAt", "checkedAt"].includes(key))
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, candidate]) => [key, canonicalFingerprintValue(candidate)]));
}

function homepageFingerprintHash(value: string) {
  let left = 0x811c9dc5;
  let right = 0x9e3779b9;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    left = Math.imul(left ^ code, 0x01000193) >>> 0;
    right = Math.imul(right ^ code, 0x85ebca6b) >>> 0;
  }
  return `${left.toString(16).padStart(8, "0")}${right.toString(16).padStart(8, "0")}`;
}

function semanticText(value: string) {
  return value.normalize("NFC").trim().replace(/\s+/gu, " ");
}

function semanticEndpoint(place: JourneyEndpointPlace) {
  return place.canonicalPlaceId
    ? { canonicalPlaceId: place.canonicalPlaceId }
    : { name: semanticText(place.name), country: semanticText(place.country ?? "") };
}

/** Stable, traveller-authored submission meaning before any provider capture. */
export function homepageSemanticInputFingerprint(snapshot: HomepageInputSnapshot): string {
  const choice = <T>(value: HomepageChoice<T>, selected: (selectedValue: T) => unknown) =>
    value.state === "selected" ? { state: "selected", value: selected(value.value) } : { state: value.state };
  const meaning = {
    version: 1,
    ownerId: snapshot.ownerId,
    mode: snapshot.mode,
    active: snapshot.mode === "describe"
      ? { prompt: semanticText(snapshot.prompt) }
      : { entries: snapshot.entries.map((entry) => ({
        occurrenceId: entry.id,
        place: entry.selection?.canonicalPlaceId
          ? { canonicalPlaceId: entry.selection.canonicalPlaceId }
          : { name: semanticText(entry.text), country: entry.selection?.country ?? "" },
      })) },
    dates: choice(snapshot.dates, (value) => value),
    travellers: choice(snapshot.travellers, (value) => value),
    budget: choice(snapshot.budget, (value) => value),
    interests: choice(snapshot.interests, (value) => [...value].sort()),
    origin: choice(snapshot.origin, semanticEndpoint),
    journeyEnd: choice(snapshot.journeyEnd, (value) => value.mode === "explicit"
      ? { mode: "explicit", place: semanticEndpoint(value.place) }
      : { mode: value.mode }),
  };
  return `homepage-input-v1-${homepageFingerprintHash(JSON.stringify(canonicalFingerprintValue(meaning)))}`;
}

/** A legacy completed receipt is also treated as unchanged: it cannot prove an edit. */
export function homepageCompletedReceiptIsUnchanged(stored: StoredHomepageInput): boolean {
  const receipt = stored.receipt;
  if (receipt?.version === 2) return false;
  return Boolean(receipt && (!receipt.semanticInputFingerprint
    || receipt.semanticInputFingerprint === homepageSemanticInputFingerprint(stored.snapshot)));
}

/** Construct the existing receipt for either producer of a Builder projection. */
export function homepageReceiptForProjection(
  snapshot: HomepageInputSnapshot,
  draft: HomeTripDraft,
  tripId: string,
): HomepageHandoffReceipt {
  if (!draft.handoffId || draft.homepage?.ownerId !== snapshot.ownerId || !tripId.trim()) {
    throw new Error("Homepage projection has no matching owner or reserved identity");
  }
  return {
    version: 1, ownerId: snapshot.ownerId, handoffId: draft.handoffId,
    inputFingerprint: homepageSubmissionFingerprint(draft),
    semanticInputFingerprint: homepageSemanticInputFingerprint(snapshot), tripId,
  };
}

/** Fingerprint only projected planning meaning. UI state, revisions and handoff
 * bookkeeping cannot create another canonical trip. */
export function homepageSubmissionFingerprint(draft: HomeTripDraft) {
  const semantic = canonicalFingerprintValue({
    version: 1,
    ownerId: draft.homepage?.ownerId ?? null,
    mode: draft.homepage?.mode ?? "legacy",
    sourceRouteKey: draft.sourceRouteKey,
    curatedRoute: draft.curatedRoute,
    origin: draft.origin,
    originCoordinates: draft.originCoordinates,
    originCanonicalPlaceId: draft.originCanonicalPlaceId,
    originCountry: draft.originCountry,
    originProviderId: draft.originProviderId,
    journeyEnd: draft.journeyEnd,
    destinations: draft.destinations,
    locationMentions: draft.locationMentions,
    routeHints: draft.routeHints,
    regions: draft.regions,
    parserVersion: draft.parserVersion,
    structuredBrief: draft.structuredBrief,
    startDate: draft.startDate,
    endDate: draft.endDate,
    durationDays: draft.durationDays,
    datesExplicit: draft.datesExplicit,
    travellers: draft.travellers,
    travellersExplicit: draft.travellersExplicit,
    interests: draft.interests,
    interestsExplicit: draft.interestsExplicit,
    budget: draft.budget,
    brief: draft.brief,
    nightAllocations: draft.nightAllocations,
    decisionSelections: draft.decisionSelections,
    occurrenceMentionIds: draft.homepage?.occurrenceMentionIds,
    choices: draft.homepage?.choices,
  });
  return `homepage-v1-${homepageFingerprintHash(JSON.stringify(semantic))}`;
}

export function reusableHomepageReceipt(
  stored: StoredHomepageInput,
  draft: HomeTripDraft,
): HomepageHandoffReceipt | null {
  const receipt = stored.receipt;
  if (!receipt || receipt.version !== 1 || !draft.homepage || !draft.handoffId) return null;
  return receipt.ownerId === stored.snapshot.ownerId
    && receipt.ownerId === draft.homepage.ownerId
    && (receipt.semanticInputFingerprint === undefined
      || receipt.semanticInputFingerprint === homepageSemanticInputFingerprint(stored.snapshot))
    && receipt.handoffId === draft.handoffId
    && receipt.inputFingerprint === homepageSubmissionFingerprint(draft)
    ? receipt
    : null;
}

function restoreHomepageStorageValue(
  storage: Pick<Storage, "setItem" | "removeItem">,
  key: string,
  value: string | null,
) {
  if (value === null) storage.removeItem(key);
  else storage.setItem(key, value);
}

/** Atomically prepares the versioned Homepage-to-Builder boundary around the
 * existing current-trip preservation owner. The caller remains responsible
 * for navigation and for displaying existing recovery feedback. */
type HomepageHandoffCommitInput = {
  storage: Pick<Storage, "getItem" | "setItem" | "removeItem">;
  stored: StoredHomepageInput;
  draft: HomeTripDraft | PendingHomeTripHandoff;
  isCurrent: () => boolean;
  preserveAndBegin: () => boolean;
  lock?: <T>(key: string, run: () => Promise<T>) => Promise<T>;
};
type HomepageHandoffCommitResult = { ok: true; href: string } | { ok: false; reason: "stale" | "storage" | "preservation" };

export async function commitHomepageHandoff(input: HomepageHandoffCommitInput): Promise<HomepageHandoffCommitResult> {
  if (!input.isCurrent()) return { ok: false, reason: "stale" };
  const ownerId = input.stored.snapshot.ownerId;
  try {
    return await withHomepageReceiptLock(ownerId, input.lock, async () => {
      if (!input.isCurrent()) return { ok: false as const, reason: "stale" as const };
      const raw = input.storage.getItem(homepageInputStorageKey(ownerId));
      let previous: StoredHomepageInput | null = null;
      try { previous = raw ? readHomepageInput(JSON.parse(raw), ownerId) : null; }
      catch { return { ok: false as const, reason: "storage" as const }; }
      if (raw && !previous) return { ok: false as const, reason: "storage" as const };
      if (previous?.receipt?.version === 2) {
        const pending = pendingIntakeReceiptForOwner(previous.receipt, ownerId);
        const incoming = "version" in input.draft && input.draft.version === 2
          ? pendingHomepageHandoffForOwner(input.draft, ownerId, input.draft.receipt.handoffId) : null;
        if (!pending || !incoming || pending.handoffId !== incoming.handoffId
          || pending.tripId !== incoming.tripId || pending.inputRevision !== incoming.inputRevision
          || pending.semanticInputFingerprint !== incoming.semanticInputFingerprint)
          return { ok: false as const, reason: "preservation" as const };
        let envelope: unknown;
        try { envelope = JSON.parse(input.storage.getItem(HOME_TRIP_DRAFT_KEY) ?? "null"); }
        catch { return { ok: false as const, reason: "storage" as const }; }
        const durable = pendingHomepageHandoffForOwner(envelope, ownerId, pending.handoffId);
        if (!durable || durable.tripId !== pending.tripId || durable.inputRevision !== pending.inputRevision
          || durable.semanticInputFingerprint !== pending.semanticInputFingerprint)
          return { ok: false as const, reason: "storage" as const };
        if (!input.isCurrent()) return { ok: false as const, reason: "stale" as const };
        try {
          if (!input.preserveAndBegin()) return { ok: false as const, reason: "preservation" as const };
        } catch { return { ok: false as const, reason: "preservation" as const }; }
        return { ok: true as const, href: `/journey/new?homeDraft=1&handoff=${encodeURIComponent(pending.handoffId)}` };
      }
      if (previous?.receipt?.version === 1
        && homepageSemanticInputFingerprint(previous.snapshot) === homepageSemanticInputFingerprint(input.stored.snapshot)
        && (previous.receipt.handoffId !== input.stored.receipt?.handoffId
          || previous.receipt.tripId !== input.stored.receipt?.tripId))
        return { ok: false as const, reason: "preservation" as const };
      return commitHomepageHandoffWithinLock(input);
    });
  } catch { return { ok: false, reason: "storage" }; }
}

async function commitHomepageHandoffWithinLock(input: HomepageHandoffCommitInput): Promise<HomepageHandoffCommitResult> {
  if (!input.isCurrent()) return { ok: false, reason: "stale" };
  const ownerId = input.stored.snapshot.ownerId;
  const decoded = readHomepageInput(input.stored, ownerId);
  const pendingDraft = "version" in input.draft && input.draft.version === 2 ? input.draft : null;
  const pending = pendingDraft
    ? pendingHomepageHandoffForOwner(pendingDraft, ownerId, pendingDraft.receipt.handoffId)
    : null;
  const projected = pendingDraft ? null : decoded ? reusableHomepageReceipt(decoded, input.draft as HomeTripDraft) : null;
  const draftReceipt = pendingDraft ? null : (input.draft as HomeTripDraft).homepage?.receipt;
  const receipt = pending ?? projected;
  if (!receipt || !decoded?.receipt
    || (pending ? decoded.receipt.version !== 2
      || decoded.receipt.handoffId !== pending.handoffId
      || decoded.receipt.tripId !== pending.tripId
      || decoded.receipt.semanticInputFingerprint !== pending.semanticInputFingerprint
      || decoded.receipt.inputRevision !== pending.inputRevision
      : !draftReceipt || draftReceipt.version !== 1
        || draftReceipt.ownerId !== projected?.ownerId
        || draftReceipt.handoffId !== projected.handoffId
        || draftReceipt.inputFingerprint !== projected.inputFingerprint
        || draftReceipt.semanticInputFingerprint !== projected.semanticInputFingerprint
        || draftReceipt.tripId !== projected.tripId)) {
    return { ok: false, reason: "storage" };
  }

  const inputKey = homepageInputStorageKey(ownerId);
  let previousInput: string | null = null;
  let previousDraft: string | null = null;
  try {
    previousInput = input.storage.getItem(inputKey);
    previousDraft = input.storage.getItem(HOME_TRIP_DRAFT_KEY);
    input.storage.setItem(inputKey, JSON.stringify(input.stored));
    if (!input.isCurrent()) {
      restoreHomepageStorageValue(input.storage, inputKey, previousInput);
      return { ok: false, reason: "stale" };
    }
    input.storage.setItem(HOME_TRIP_DRAFT_KEY, JSON.stringify(input.draft));
    const stagedInput = input.storage.getItem(inputKey);
    const stagedDraft = input.storage.getItem(HOME_TRIP_DRAFT_KEY);
    const observed = stagedInput ? readHomepageInput(JSON.parse(stagedInput), ownerId) : null;
    if (!observed?.receipt || !stagedDraft || stagedInput !== JSON.stringify(input.stored)
      || stagedDraft !== JSON.stringify(input.draft)) throw new Error("Handoff staging was not durable");
    if (!input.isCurrent()) {
      restoreHomepageStorageValue(input.storage, HOME_TRIP_DRAFT_KEY, previousDraft);
      restoreHomepageStorageValue(input.storage, inputKey, previousInput);
      return { ok: false, reason: "stale" };
    }
  } catch {
    try {
      restoreHomepageStorageValue(input.storage, inputKey, previousInput);
      restoreHomepageStorageValue(input.storage, HOME_TRIP_DRAFT_KEY, previousDraft);
    } catch {
      // The caller keeps the current page visible and uses its existing
      // recovery feedback when browser storage cannot be repaired.
    }
    return { ok: false, reason: "storage" };
  }

  if (!input.isCurrent()) {
    try {
      restoreHomepageStorageValue(input.storage, HOME_TRIP_DRAFT_KEY, previousDraft);
      restoreHomepageStorageValue(input.storage, inputKey, previousInput);
    } catch {
      return { ok: false, reason: "storage" };
    }
    return { ok: false, reason: "stale" };
  }
  let preserved = false;
  try {
    preserved = input.preserveAndBegin();
  } catch {
    preserved = false;
  }
  if (!preserved) {
    try {
      restoreHomepageStorageValue(input.storage, HOME_TRIP_DRAFT_KEY, previousDraft);
    } catch {
      return { ok: false, reason: "storage" };
    }
    return { ok: false, reason: "preservation" };
  }
  return {
    ok: true,
    href: `/journey/new?homeDraft=1&handoff=${encodeURIComponent(receipt.handoffId)}`,
  };
}

/** The receipt owner serializes Describe reservation across browser tabs.
 * Read and ID allocation must happen inside the same owner-scoped Web Lock;
 * localStorage read-then-write alone cannot prevent duplicate trip IDs. */
export async function reservePendingDescribeHandoff(input: {
  storage: Pick<Storage, "getItem" | "setItem" | "removeItem">;
  snapshot: HomepageInputSnapshot;
  isCurrent: () => boolean;
  preserveAndBegin: () => boolean;
  createIds: () => { handoffId: string; tripId: string };
  lock?: <T>(key: string, run: () => Promise<T>) => Promise<T>;
}): Promise<({ ok: true; href: string; receipt: PendingIntakeReceipt; stored: StoredHomepageInput }) | { ok: false; reason: "stale" | "storage" | "preservation" }> {
  try {
    return await withHomepageReceiptLock(input.snapshot.ownerId, input.lock, async () => {
      if (!input.isCurrent()) return { ok: false as const, reason: "stale" as const };
      let raw: string | null;
      let existingDraft: unknown;
      try {
        raw = input.storage.getItem(homepageInputStorageKey(input.snapshot.ownerId));
        existingDraft = JSON.parse(input.storage.getItem(HOME_TRIP_DRAFT_KEY) ?? "null");
      } catch { return { ok: false as const, reason: "storage" as const }; }
      let existingInput: StoredHomepageInput | null = null;
      try { existingInput = raw ? readHomepageInput(JSON.parse(raw), input.snapshot.ownerId) : null; }
      catch { return { ok: false as const, reason: "storage" as const }; }
      if (raw && !existingInput) return { ok: false as const, reason: "storage" as const };
      const sameInput = existingInput
        && homepageSemanticInputFingerprint(existingInput.snapshot) === homepageSemanticInputFingerprint(input.snapshot);
      if (existingInput?.receipt?.version === 2 && !sameInput) {
        const oldPending = pendingIntakeReceiptForOwner(existingInput.receipt, input.snapshot.ownerId);
        if (!oldPending) return { ok: false as const, reason: "storage" as const };
        // A second tab must not replace a frozen submission before its
        // canonical Builder document has acknowledged the reservation.
        return { ok: false as const, reason: "preservation" as const };
      }
      if (sameInput && existingInput?.receipt?.version === 1) {
        return { ok: false as const, reason: "storage" as const };
      }
      const pending = sameInput && existingInput?.receipt?.version === 2
        ? pendingIntakeReceiptForOwner(existingInput.receipt, input.snapshot.ownerId) : null;
      if (sameInput && existingInput?.receipt?.version === 2
        && (!pending || !samePendingReceipt(
          pendingHomepageHandoffForOwner(existingDraft, input.snapshot.ownerId, pending.handoffId), pending))) {
        return { ok: false as const, reason: "storage" as const };
      }
      const receipt = pending ?? createPendingIntakeReceipt(input.snapshot, input.createIds());
      const stored: StoredHomepageInput = { snapshot: input.snapshot, receipt };
      const draft: PendingHomeTripHandoff = { version: 2, phase: "pending-interpretation", receipt };
      const committed = await commitHomepageHandoffWithinLock({
        storage: input.storage, stored, draft, isCurrent: input.isCurrent, preserveAndBegin: input.preserveAndBegin,
      });
      return committed.ok ? { ...committed, receipt, stored } : committed;
    });
  } catch { return { ok: false, reason: "storage" }; }
}

async function withHomepageReceiptLock<T>(
  ownerId: string | null,
  supplied: (<R>(key: string, run: () => Promise<R>) => Promise<R>) | undefined,
  run: () => Promise<T>,
): Promise<T> {
  const lock = supplied ?? (typeof navigator !== "undefined" && navigator.locks
    ? <R,>(key: string, work: () => Promise<R>) => navigator.locks.request(key, { mode: "exclusive" }, work)
    : null);
  // localStorage has no compare-and-swap; browsers without Web Locks cannot
  // safely allocate a cross-tab trip identity and must fail closed.
  if (!lock) throw new Error("Cross-tab receipt lock unavailable");
  return lock(`morrovia-home-handoff:${ownerId ?? "guest"}`, run);
}

/** Direct New Trip shares the receipt lock but keeps its already-mounted
 * Builder as the only document owner. It never writes a Homepage URL envelope. */
export async function reserveDirectDescribeIntake(input: {
  storage: Pick<Storage, "getItem" | "setItem" | "removeItem">;
  snapshot: HomepageInputSnapshot;
  tripId: string;
  handoffId: string;
  lock?: <T>(key: string, run: () => Promise<T>) => Promise<T>;
}): Promise<{ ok: true; receipt: PendingIntakeReceipt } | { ok: false; reason: "reserved" | "storage" }> {
  try {
    return await withHomepageReceiptLock(input.snapshot.ownerId, input.lock, async () => {
      const key = homepageInputStorageKey(input.snapshot.ownerId);
      const raw = input.storage.getItem(key);
      let previous: StoredHomepageInput | null = null;
      try { previous = raw ? readHomepageInput(JSON.parse(raw), input.snapshot.ownerId) : null; }
      catch { return { ok: false as const, reason: "storage" as const }; }
      if (raw && !previous) return { ok: false as const, reason: "storage" as const };
      if (previous?.receipt?.version === 2) {
        const pending = pendingIntakeReceiptForOwner(previous.receipt, input.snapshot.ownerId);
        let homepageEnvelope: unknown;
        try { homepageEnvelope = JSON.parse(input.storage.getItem(HOME_TRIP_DRAFT_KEY) ?? "null"); }
        catch { return { ok: false as const, reason: "storage" as const }; }
        if (!pending || pending.semanticInputFingerprint !== homepageSemanticInputFingerprint(input.snapshot)
          || pendingHomepageHandoffForOwner(homepageEnvelope, input.snapshot.ownerId, pending.handoffId)) {
          return { ok: false as const, reason: "reserved" as const };
        }
        return { ok: true as const, receipt: pending };
      }
      // A completed receipt has already been acknowledged by canonical
      // recovery. A deliberate submission from a fresh mounted Builder gets
      // a new identity even when its traveller input happens to match.
      const receipt = createPendingIntakeReceipt(input.snapshot, { handoffId: input.handoffId, tripId: input.tripId });
      const serialized = JSON.stringify({ snapshot: input.snapshot, receipt });
      try {
        input.storage.setItem(key, serialized);
        if (input.storage.getItem(key) !== serialized) throw new Error("Intake write was not durable");
      } catch {
        try {
          if (raw === null) input.storage.removeItem(key);
          else input.storage.setItem(key, raw);
        } catch { /* Preserve failure; Builder must remain on intake. */ }
        return { ok: false as const, reason: "storage" as const };
      }
      return { ok: true as const, receipt };
    });
  } catch { return { ok: false, reason: "storage" }; }
}

/** Capture application rechecks the durable receipt, not just the mounted
 * component's ref: another tab can edit or replace intake while a model runs. */
export function pendingReceiptStillCurrent(
  storage: Pick<Storage, "getItem">,
  receipt: PendingIntakeReceipt,
  fromHomepage: boolean,
): boolean {
  try {
    const raw = storage.getItem(homepageInputStorageKey(receipt.ownerId));
    const stored = raw ? readHomepageInput(JSON.parse(raw), receipt.ownerId) : null;
    const current = pendingIntakeReceiptForOwner(stored?.receipt, receipt.ownerId);
    if (!current || current.handoffId !== receipt.handoffId || current.tripId !== receipt.tripId
      || current.inputRevision !== receipt.inputRevision
      || current.semanticInputFingerprint !== receipt.semanticInputFingerprint) return false;
    if (!fromHomepage) return true;
    const envelope = JSON.parse(storage.getItem(HOME_TRIP_DRAFT_KEY) ?? "null");
    return Boolean(pendingHomepageHandoffForOwner(envelope, receipt.ownerId, receipt.handoffId));
  } catch { return false; }
}

function samePendingReceipt(left: PendingIntakeReceipt | null, right: PendingIntakeReceipt): boolean {
  return Boolean(left && left.ownerId === right.ownerId && left.handoffId === right.handoffId
    && left.tripId === right.tripId && left.inputRevision === right.inputRevision
    && left.semanticInputFingerprint === right.semanticInputFingerprint);
}

/** Edit only the frozen intake this Builder actually received. Both keys are
 * changed under the submission lock, so a newer tab's receipt survives. */
export async function discardPendingIntakeForEdit(input: {
  storage: Pick<Storage, "getItem" | "setItem" | "removeItem">;
  receipt: PendingIntakeReceipt;
  fromHomepage: boolean;
  isCurrent?: () => boolean;
  lock?: <T>(key: string, run: () => Promise<T>) => Promise<T>;
}): Promise<{ ok: true } | { ok: false; reason: "stale" | "storage" }> {
  try {
    return await withHomepageReceiptLock(input.receipt.ownerId, input.lock, async () => {
      if (input.isCurrent && !input.isCurrent()) return { ok: false as const, reason: "stale" as const };
      const key = homepageInputStorageKey(input.receipt.ownerId);
      const priorInput = input.storage.getItem(key);
      const priorEnvelope = input.fromHomepage ? input.storage.getItem(HOME_TRIP_DRAFT_KEY) : null;
      let stored: StoredHomepageInput | null;
      try { stored = readHomepageInput(JSON.parse(priorInput ?? "null"), input.receipt.ownerId); }
      catch { return { ok: false as const, reason: "storage" as const }; }
      if (!samePendingReceipt(pendingIntakeReceiptForOwner(stored?.receipt, input.receipt.ownerId), input.receipt))
        return { ok: false as const, reason: "stale" as const };
      if (input.fromHomepage) {
        let envelope: unknown;
        try { envelope = JSON.parse(priorEnvelope ?? "null"); }
        catch { return { ok: false as const, reason: "storage" as const }; }
        if (!samePendingReceipt(pendingHomepageHandoffForOwner(envelope, input.receipt.ownerId, input.receipt.handoffId), input.receipt))
          return { ok: false as const, reason: "stale" as const };
      }
      const editable = JSON.stringify({ snapshot: input.receipt.frozenSnapshot });
      try {
        input.storage.setItem(key, editable);
        if (input.storage.getItem(key) !== editable) throw new Error("Intake edit was not durable");
        if (input.fromHomepage) {
          input.storage.removeItem(HOME_TRIP_DRAFT_KEY);
          if (input.storage.getItem(HOME_TRIP_DRAFT_KEY) !== null) throw new Error("Handoff edit was not durable");
        }
        return { ok: true as const };
      } catch {
        try {
          if (priorInput === null) input.storage.removeItem(key);
          else input.storage.setItem(key, priorInput);
          if (input.fromHomepage) {
            if (priorEnvelope === null) input.storage.removeItem(HOME_TRIP_DRAFT_KEY);
            else input.storage.setItem(HOME_TRIP_DRAFT_KEY, priorEnvelope);
          }
        } catch { /* Preserve the failure. */ }
        return { ok: false as const, reason: "storage" as const };
      }
    });
  } catch { return { ok: false, reason: "storage" }; }
}

/** A canonical recovery has been written; complete only its own receipt.
 * A replacement intake token must never be overwritten by old completion. */
export async function acknowledgePendingIntakeReceipt(input: {
  storage: Pick<Storage, "getItem" | "setItem" | "removeItem">;
  pending?: PendingIntakeReceipt;
  completed: HomepageHandoffReceipt;
  draft: HomeTripDraft;
  fromHomepage: boolean;
  isCurrent?: () => boolean;
  lock?: <T>(key: string, run: () => Promise<T>) => Promise<T>;
}): Promise<{ ok: true } | { ok: false; reason: "stale" | "storage" }> {
  try {
    return await withHomepageReceiptLock(input.completed.ownerId, input.lock, async () => {
      if (input.isCurrent && !input.isCurrent()) return { ok: false as const, reason: "stale" as const };
      const { completed, pending } = input;
      if (homepageHandoffReceiptForOwner(input.draft, completed.ownerId)?.handoffId !== completed.handoffId
        || input.draft.homepage?.receipt?.tripId !== completed.tripId
        || (pending && (pending.ownerId !== completed.ownerId || pending.handoffId !== completed.handoffId
          || pending.tripId !== completed.tripId || pending.semanticInputFingerprint !== completed.semanticInputFingerprint)))
        return { ok: false as const, reason: "stale" as const };
      const key = homepageInputStorageKey(completed.ownerId);
      const priorInput = input.storage.getItem(key);
      const priorEnvelope = input.fromHomepage ? input.storage.getItem(HOME_TRIP_DRAFT_KEY) : null;
      let stored: StoredHomepageInput | null;
      let envelope: unknown = null;
      try {
        stored = readHomepageInput(JSON.parse(priorInput ?? "null"), completed.ownerId);
        if (input.fromHomepage) envelope = JSON.parse(priorEnvelope ?? "null");
      } catch { return { ok: false as const, reason: "storage" as const }; }
      if (!stored || (pending
        ? !samePendingReceipt(pendingIntakeReceiptForOwner(stored.receipt, completed.ownerId), pending)
          || (input.fromHomepage && !samePendingReceipt(pendingHomepageHandoffForOwner(envelope, completed.ownerId, pending.handoffId), pending))
        : stored.receipt?.version === 2
          || (stored.receipt?.version === 1
            && (stored.receipt.handoffId !== completed.handoffId || stored.receipt.tripId !== completed.tripId))
          || homepageSemanticInputFingerprint(stored.snapshot) !== completed.semanticInputFingerprint))
        return { ok: false as const, reason: "stale" as const };
      const serialized = JSON.stringify({ snapshot: stored.snapshot, receipt: completed });
      const completedEnvelope = JSON.stringify(input.draft);
      try {
        input.storage.setItem(key, serialized);
        if (input.storage.getItem(key) !== serialized) throw new Error("Receipt acknowledgement was not durable");
        if (pending && input.fromHomepage) {
          input.storage.setItem(HOME_TRIP_DRAFT_KEY, completedEnvelope);
          if (input.storage.getItem(HOME_TRIP_DRAFT_KEY) !== completedEnvelope) throw new Error("Handoff acknowledgement was not durable");
        }
        return { ok: true as const };
      } catch {
        try {
          if (priorInput === null) input.storage.removeItem(key);
          else input.storage.setItem(key, priorInput);
          if (input.fromHomepage) {
            if (priorEnvelope === null) input.storage.removeItem(HOME_TRIP_DRAFT_KEY);
            else input.storage.setItem(HOME_TRIP_DRAFT_KEY, priorEnvelope);
          }
        } catch { /* Preserve the failure. */ }
        return { ok: false as const, reason: "storage" as const };
      }
    });
  } catch { return { ok: false, reason: "storage" }; }
}

export type HandoffLocationChoice = {
  canonicalPlaceId?: string;
  name: string;
  country: string;
  countryCode?: string;
  region?: string;
  providerId?: string;
  providerSourceLabel?: string;
  coordinates: [number, number];
  bounds?: GeographicBounds;
  routability?: PlaceRoutability;
  placeType?: string;
  kind?: string;
  matchQuality?: string;
  rankScore?: number;
  locality?: string;
};

export type HandoffRouteStop = {
  id: string;
  name: string;
  country: string;
  canonicalPlaceId?: string;
  countryCode?: string;
  region?: string;
  providerId?: string;
  coordinates?: [number, number];
  intent?: "place" | "landmark";
  locality?: string;
};

function handoffRouteStopId(mention: ResolvedPlaceMention) {
  return `${mention.canonicalName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${mention.order}`;
}

function endpointOwnedRouteMentionId(
  mentions: ResolvedPlaceMention[],
  journeyEnd?: JourneyEndSelection,
) {
  if (journeyEnd?.mode !== "explicit") return undefined;
  return routableHandoffMentions(mentions)
    .filter((mention) => mention.role !== "origin" && mention.role !== "fixed_start")
    .filter((mention) => sameJourneyPlace({
      name: mention.canonicalName,
      canonicalPlaceId: mention.canonicalPlaceId,
      country: mention.parentCountries.length === 1 ? mention.parentCountries[0] : undefined,
    }, journeyEnd.place))
    .at(-1)?.mentionId;
}

/** Canonical capture owns route-stop existence. Provider geocoding may enrich
 * these seeds later, but an unavailable coordinate must never delete one. */
export function handoffRouteStops(
  mentions: ResolvedPlaceMention[],
  journeyEnd?: JourneyEndSelection,
): HandoffRouteStop[] {
  const endpointOwnedMentionId = endpointOwnedRouteMentionId(mentions, journeyEnd);
  return routableHandoffMentions(mentions)
    .filter((mention) => mention.role !== "origin" && mention.role !== "fixed_start")
    .filter((mention) => mention.mentionId !== endpointOwnedMentionId)
    .map((mention) => ({
      id: handoffRouteStopId(mention),
      name: mention.canonicalName,
      country: mention.parentCountries.length === 1 ? mention.parentCountries[0] : "",
      canonicalPlaceId: mention.canonicalPlaceId,
      coordinates: mention.coordinates,
      intent: "place" as const,
    }));
}

/** Curated and legacy handoffs may already own a complete route with stable
 * IDs and allocation keys. Seed from capture only when no such route exists. */
export function initialHandoffRouteStops(
  mentions: ResolvedPlaceMention[],
  draftStops: HandoffRouteStop[],
  journeyEnd?: JourneyEndSelection,
): HandoffRouteStop[] {
  return draftStops.length ? draftStops : handoffRouteStops(mentions, journeyEnd);
}

/** Merge optional provider metadata into one canonical occurrence. The stable
 * capture identity, name and ordering remain authoritative. */
export function mergeHandoffLocationChoice(
  stops: HandoffRouteStop[],
  mention: ResolvedPlaceMention,
  choice?: HandoffLocationChoice,
  occurrenceId?: string,
): HandoffRouteStop[] {
  if (!choice) return stops;
  const stopId = occurrenceId ?? handoffRouteStopId(mention);
  return stops.map((stop) => stop.id !== stopId ? stop : {
    ...stop,
    country: mention.parentCountries.length === 1 ? mention.parentCountries[0] : choice.country,
    countryCode: choice.countryCode,
    region: choice.region,
    providerId: choice.providerId,
    coordinates: choice.coordinates,
    locality: choice.locality,
  });
}

/** Keep an already resolved capture identity authoritative during Builder
 * enrichment. A second provider lookup may return a lower-ranked namesake. */
export function preferredHandoffLocationChoice(
  mention: ResolvedPlaceMention,
  choices: HandoffLocationChoice[],
): HandoffLocationChoice | undefined {
  if (mention.coordinates && mention.parentCountries.length === 1) {
    return {
      name: mention.canonicalName,
      country: mention.parentCountries[0],
      coordinates: mention.coordinates,
    };
  }
  return choices[0];
}

export function createHomeTripDraft(input: {
  capture: JourneyCaptureResult;
  handoffId: string;
  datesExplicit: boolean;
  startDate: string;
  endDate: string;
  travellers: number;
  travellersExplicit: boolean;
  interests: TripInterest[];
  interestsExplicit?: boolean;
  origin?: JourneyEndpointPlace;
  journeyEnd?: JourneyEndSelection;
}): HomeTripDraft {
  const origin = input.origin ? canonicalJourneyEndpointPlace(input.origin) : undefined;
  return {
    handoffId: input.handoffId,
    locationMentions: input.capture.mentions,
    routeHints: input.capture.routeHints,
    regions: input.capture.regions,
    parserVersion: input.capture.parserVersion,
    structuredBrief: input.capture.structuredBrief,
    planningSuggestions: input.capture.planningSuggestions,
    planningAssessment: input.capture.planningAssessment,
    ...(origin ? {
      origin: origin.name,
      originCoordinates: origin.coordinates,
      originCanonicalPlaceId: origin.canonicalPlaceId,
      originCountry: origin.country,
      originProviderId: origin.providerId,
    } : {}),
    journeyEnd: normalizeJourneyEnd(input.journeyEnd ?? input.capture.journeyEnd),
    durationDays: input.capture.durationDays,
    ...(input.datesExplicit ? { startDate: input.startDate, endDate: input.endDate } : {}),
    datesExplicit: input.datesExplicit,
    travellers: input.travellers,
    travellersExplicit: input.travellersExplicit,
    interests: normalizeTripInterests(input.interests),
    interestsExplicit: input.interestsExplicit ?? input.interests.length > 0,
    brief: input.capture.rawBrief,
  };
}

const homepageExplicit = (): TripBriefProvenance => ({ source: "builder", kind: "explicit", confidence: "high" });
const homepageProfileDefault = (): TripBriefProvenance => ({ source: "morrovia-default", kind: "default", confidence: "low" });

function validHomepageDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function homepageEntryRoutability(selection: CanonicalPlaceSuggestion): PlaceRoutability {
  if (selection.routability) return selection.routability;
  if (isOvernightBaseEligible({ placeType: selection.placeType, routability: "direct_destination" })) return "direct_destination";
  return selection.placeType === "landmark" ? "anchor_or_poi" : "planning_area";
}

function homepageEntryMention(entry: HomepageDestinationEntry, order: number): ResolvedPlaceMention {
  const originalSelection = entry.selection!;
  const catalogPlace = findCatalogPlaceById(originalSelection.canonicalPlaceId)
    ? undefined
    : catalogPlaceForProviderIdentity({
      canonicalName: originalSelection.name,
      placeType: originalSelection.placeType,
      parentCountries: originalSelection.country ? [originalSelection.country] : [],
      coordinates: originalSelection.coordinates,
    });
  const selection: CanonicalPlaceSuggestion = catalogPlace ? {
    ...originalSelection,
    canonicalPlaceId: catalogPlace.canonicalPlaceId,
    name: catalogPlace.canonicalName,
    country: catalogPlace.parentCountries[0] ?? originalSelection.country,
    placeType: catalogPlace.placeType,
    routability: catalogPlace.routability,
    provenance: [...originalSelection.provenance, {
      ...catalogPlace.provenance,
      kind: catalogPlace.provenance.kind === "curated" ? "curated_alias" as const : "canonical" as const,
    }],
  } : originalSelection;
  const routability = homepageEntryRoutability(selection);
  const provenance = [...selection.provenance, {
    id: `homepage-entry:${entry.id}`,
    label: "Homepage destination selection",
    kind: "builder" as const,
    supports: "The traveller explicitly selected this canonical destination occurrence on the homepage.",
  }];
  const confidence = createPlanningConfidence({
    state: "structured",
    level: "high",
    freshness: "current",
    scope: "traveller-intent",
    sources: [{ id: `homepage-entry:${entry.id}`, label: "Homepage destination selection", kind: "traveller", supports: "The traveller explicitly selected this canonical destination occurrence on the homepage." }],
    reason: "The traveller explicitly selected this canonical destination occurrence.",
  });
  const direct = isOvernightBaseEligible({ placeType: selection.placeType, routability });
  return {
    mentionId: `homepage-entry:${entry.id}`,
    sourceText: selection.name,
    sourceTexts: [selection.name],
    normalizedPhrase: normalizePlacePhrase(selection.name),
    canonicalName: selection.name,
    canonicalPlaceId: selection.canonicalPlaceId,
    aliases: [],
    placeType: selection.placeType,
    status: "resolved",
    confidence,
    provenance,
    parentCountries: selection.country ? [selection.country] : [],
    parentRegionId: selection.region,
    accessPlaceName: selection.accessPlaceName,
    bounds: selection.bounds,
    coordinates: selection.coordinates ? [...selection.coordinates] : undefined,
    routability,
    directlyRoutable: direct,
    requiresBaseSelection: !direct,
    isAnchor: routability === "anchor_or_poi",
    role: "preferred",
    order,
    candidates: [{
      canonicalPlaceId: selection.canonicalPlaceId,
      canonicalName: selection.name,
      aliases: [],
      placeType: selection.placeType,
      parentCountries: selection.country ? [selection.country] : [],
      parentRegionId: selection.region,
      accessPlaceName: selection.accessPlaceName,
      bounds: selection.bounds,
      coordinates: selection.coordinates ? [...selection.coordinates] : undefined,
      routability,
      confidence,
      provenance,
    }],
  };
}

function homepageStructuredBrief(mentions: ResolvedPlaceMention[]): StructuredTripBrief {
  const destinations = mentions.map((mention) => ({
    ...(mention.directlyRoutable ? { id: mention.mentionId.replace("homepage-entry:", "") } : {}),
    name: mention.canonicalName,
    canonicalPlaceId: mention.canonicalPlaceId,
    placeMentionId: mention.mentionId,
    placeType: mention.placeType,
    resolutionStatus: mention.status,
    routability: mention.routability,
    sourceLabel: mention.sourceText,
    parentCountries: [...mention.parentCountries],
    parentCanonicalPlaceId: mention.parentRegionId,
    role: mention.isAnchor ? "trip-anchor" as const : "preferred" as const,
    priority: mention.isAnchor ? "high" as const : "normal" as const,
    provenance: homepageExplicit(),
  }));
  const savedSelectionBrief = structuredTripBriefFromSavedSelections({
    destinations: destinations.filter((destination) => Boolean(destination.id)),
  });
  const brief: StructuredTripBrief = {
    ...savedSelectionBrief,
    destinations,
    countries: mentions.filter((mention) => mention.placeType === "country").map((mention) => ({ value: mention.canonicalName, provenance: homepageExplicit() })),
    preferredRegions: mentions.filter((mention) => !mention.directlyRoutable && mention.placeType !== "country").map((mention) => ({ value: mention.canonicalName, provenance: homepageExplicit() })),
    dates: {},
    interests: [],
    transportPreferences: [],
    accommodationPreferences: [],
    hardConstraints: [],
    softPreferences: [],
    source: { parserVersion: "homepage-input-v1", inputs: ["builder"] },
    confidence: mentions.length ? "high" : "low",
    placeMentions: mentions,
    placeIssues: placeResolutionIssuesForMentions(mentions),
    placeSelections: mentions.filter((mention) => mention.directlyRoutable && mention.canonicalPlaceId).map((mention) => ({
      mentionId: mention.mentionId,
      kind: "visit" as const,
      selectedCanonicalPlaceId: mention.canonicalPlaceId!,
      selectedName: mention.canonicalName,
      selectedPlaceType: mention.placeType,
      selectedParentCountries: [...mention.parentCountries],
      routeStopId: mention.mentionId.replace("homepage-entry:", ""),
      provenance: mention.provenance.at(-1)!,
      confidence: mention.confidence,
    })),
    completedPlanningAreaMentionIds: [],
    removedPlaceMentionIds: [],
    issues: [],
  };
  return { ...brief, issues: validateStructuredTripBrief(brief) };
}

function withHomepageChoices(
  draft: HomeTripDraft,
  snapshot: HomepageInputSnapshot,
  profile: TravelProfile | null,
  capture: JourneyCaptureResult | undefined,
) {
  let structured = draft.structuredBrief;
  const capturedInterests = normalizeTripInterests(structured?.interests.map((item) => item.value) ?? []);
  const chosenInterests = snapshot.interests.state === "selected"
    ? normalizeTripInterests(snapshot.interests.value)
    : snapshot.interests.state === "cleared"
      ? []
      : capturedInterests.length ? capturedInterests : normalizeTripInterests(profile?.usualInterests ?? []);
  const interestsExplicit = snapshot.interests.state !== "untouched";
  const capturedBudget = structured?.budget?.value;
  const budget = snapshot.budget.state === "selected"
    ? snapshot.budget.value
    : snapshot.budget.state === "cleared"
      ? undefined
      : capturedBudget ?? profile?.budget ?? "mid";
  const budgetPreference: TripBudgetPreference = snapshot.budget.state === "selected"
    ? { source: "explicit", value: snapshot.budget.value }
    : snapshot.budget.state === "cleared"
      ? { source: "cleared" }
      : capturedBudget
        ? { source: "capture", value: capturedBudget }
        : profile?.budget
          ? { source: "profile", value: profile.budget }
          : { source: "fallback", value: "mid" };
  const budgetProvenance = snapshot.budget.state === "selected" ? homepageExplicit()
    : capturedBudget ? structured?.budget?.provenance
      : budget ? homepageProfileDefault() : undefined;
  const capturedTravellers = structured?.travellers?.value ?? capture?.structuredBrief.travellers?.value;
  const travellers = snapshot.travellers.state === "selected"
    ? snapshot.travellers.value
    : snapshot.travellers.state === "cleared" ? undefined : capturedTravellers ?? draft.travellers;
  const travellersExplicit = snapshot.travellers.state !== "untouched";

  const selectedDates = snapshot.dates.state === "selected" ? snapshot.dates.value : undefined;
  const datesExplicit = Boolean(selectedDates);
  const origin = snapshot.origin.state === "selected" ? canonicalJourneyEndpointPlace(snapshot.origin.value)
    : snapshot.origin.state === "cleared" ? undefined
      : draft.origin ? canonicalJourneyEndpointPlace({
        name: draft.origin,
        coordinates: draft.originCoordinates,
        canonicalPlaceId: draft.originCanonicalPlaceId,
        country: draft.originCountry,
        providerId: draft.originProviderId,
      }) : undefined;
  const journeyEnd = snapshot.journeyEnd.state === "selected" ? normalizeJourneyEnd(snapshot.journeyEnd.value)
    : snapshot.journeyEnd.state === "cleared" ? { mode: "unknown" } as const
      : normalizeJourneyEnd(draft.journeyEnd);

  if (structured) {
    const softPreferences = structured.softPreferences.filter((preference) => preference.type !== "interest" && preference.type !== "budget");
    if (snapshot.interests.state !== "cleared") softPreferences.push(...chosenInterests.map((value) => ({ type: "interest" as const, value, provenance: interestsExplicit ? homepageExplicit() : structured!.interests.find((item) => item.value === value)?.provenance ?? homepageProfileDefault() })));
    if (budget && snapshot.budget.state !== "cleared") softPreferences.push({ type: "budget", value: budget, provenance: budgetProvenance! });
    const hardConstraints = structured.hardConstraints.filter((constraint) => {
      if (snapshot.origin.state !== "untouched" && constraint.type === "start-at") return false;
      if (snapshot.journeyEnd.state !== "untouched" && constraint.type === "end-at") return false;
      return true;
    });
    const destinations = structured.destinations.filter((destination) => {
      if (snapshot.origin.state !== "untouched" && destination.role === "arrival-gateway") return false;
      if (snapshot.journeyEnd.state !== "untouched" && destination.role === "departure-gateway") return false;
      return true;
    });
    const placeMentions = structured.placeMentions?.filter((mention) => {
      if (snapshot.origin.state !== "untouched" && (mention.role === "origin" || mention.role === "fixed_start")) return false;
      if (snapshot.journeyEnd.state !== "untouched" && mention.role === "fixed_end") return false;
      return true;
    });
    if (snapshot.origin.state === "selected") {
      destinations.push({
        name: origin!.name,
        canonicalPlaceId: origin!.canonicalPlaceId,
        role: "arrival-gateway",
        priority: "required",
        provenance: homepageExplicit(),
      });
      hardConstraints.push({ type: "start-at", value: origin!.name, provenance: homepageExplicit() });
    }
    if (snapshot.journeyEnd.state === "selected" && journeyEnd.mode === "explicit") {
      destinations.push({
        name: journeyEnd.place.name,
        canonicalPlaceId: journeyEnd.place.canonicalPlaceId,
        role: "departure-gateway",
        priority: "required",
        provenance: homepageExplicit(),
      });
      hardConstraints.push({ type: "end-at", value: journeyEnd.place.name, provenance: homepageExplicit() });
    }
    structured = {
      ...structured,
      ...(snapshot.dates.state === "cleared" ? { dates: {} } : selectedDates ? { dates: {
        start: { value: selectedDates.start, provenance: homepageExplicit() },
        end: { value: selectedDates.end, provenance: homepageExplicit() },
        fixed: { value: true, provenance: homepageExplicit() },
      } } : {}),
      ...(snapshot.travellers.state === "cleared" ? { travellers: undefined } : travellers ? { travellers: { value: travellers, provenance: travellersExplicit ? homepageExplicit() : structured.travellers?.provenance ?? homepageProfileDefault() } } : {}),
      interests: snapshot.interests.state === "cleared" ? [] : chosenInterests.map((value) => ({ value, provenance: interestsExplicit ? homepageExplicit() : structured!.interests.find((item) => item.value === value)?.provenance ?? homepageProfileDefault() })),
      budget: snapshot.budget.state === "cleared" ? undefined : budget ? { value: budget, provenance: budgetProvenance! } : undefined,
      softPreferences,
      hardConstraints,
      destinations,
      placeMentions,
    };
    structured = { ...structured, issues: validateStructuredTripBrief(structured) };
  }

  return {
    ...draft,
    ...(origin ? {
      origin: origin.name,
      originCoordinates: origin.coordinates,
      originCanonicalPlaceId: origin.canonicalPlaceId,
      originCountry: origin.country,
      originProviderId: origin.providerId,
    } : { origin: undefined, originCoordinates: undefined, originCanonicalPlaceId: undefined, originCountry: undefined, originProviderId: undefined }),
    journeyEnd,
    ...(selectedDates ? { startDate: selectedDates.start, endDate: selectedDates.end } : { startDate: undefined, endDate: undefined }),
    datesExplicit,
    travellers,
    travellersExplicit,
    interests: chosenInterests,
    interestsExplicit,
    budget,
    budgetPreference,
    structuredBrief: structured,
  };
}

export function projectHomepageInput(input: {
  snapshot: HomepageInputSnapshot;
  capture?: JourneyCaptureResult;
  profile: TravelProfile | null;
  handoffId: string;
}): { ok: true; draft: HomeTripDraft } | { ok: false; issues: HomepageInputIssue[] } {
  const { snapshot } = input;
  const issues: HomepageInputIssue[] = [];
  if (snapshot.dates.state === "selected") {
    const { start, end } = snapshot.dates.value;
    if (!validHomepageDate(start) || !validHomepageDate(end) || end < start) issues.push({ field: "dates", code: "invalid" });
  }
  if (snapshot.travellers.state === "selected" && (!Number.isInteger(snapshot.travellers.value) || snapshot.travellers.value < 1 || snapshot.travellers.value > 12)) {
    issues.push({ field: "travellers", code: "invalid" });
  }
  if (snapshot.mode === "describe" && !snapshot.prompt.trim()) issues.push({ field: "prompt", code: "required" });
  if (snapshot.mode === "stops") {
    if (!snapshot.entries.length) issues.push({ field: "destinations", code: "required" });
    snapshot.entries.forEach((entry) => {
      if (!entry.selection) issues.push({ field: "destinations", code: "unresolved", entryId: entry.id });
    });
  }
  if (issues.length) return { ok: false, issues };

  const capture = snapshot.mode === "describe" ? input.capture ?? captureJourneyBrief(snapshot.prompt) : undefined;
  const draft = snapshot.mode === "describe"
    ? createHomeTripDraft({
      capture: capture!,
      handoffId: input.handoffId,
      datesExplicit: false,
      startDate: "",
      endDate: "",
      travellers: capture!.structuredBrief.travellers?.value ?? 2,
      travellersExplicit: false,
      interests: normalizeTripInterests(capture!.structuredBrief.interests.map((interest) => interest.value)),
      interestsExplicit: false,
    })
    : (() => {
      const mentions = snapshot.entries.map(homepageEntryMention);
      const occurrenceMentionIds = Object.fromEntries(snapshot.entries.map((entry, index) => [entry.id, mentions[index]!.mentionId]));
      const structuredBrief = homepageStructuredBrief(mentions);
      return {
        handoffId: input.handoffId,
        destinations: mentions.filter((mention) => mention.directlyRoutable).map((mention) => ({
          id: mention.mentionId.replace("homepage-entry:", ""),
          name: mention.canonicalName,
          country: mention.parentCountries[0] ?? "",
          canonicalPlaceId: mention.canonicalPlaceId,
          coordinates: mention.coordinates,
        })),
        locationMentions: mentions,
        structuredBrief,
        interests: [],
        interestsExplicit: false,
        datesExplicit: false,
        travellersExplicit: false,
        decisionSelections: { routeOrder: "entered", transportByLeg: {} },
        homepage: {
          version: 1 as const,
          ownerId: snapshot.ownerId,
          revision: snapshot.revision,
          mode: snapshot.mode,
          occurrenceMentionIds,
          choices: {
            dates: snapshot.dates,
            budget: snapshot.budget,
            interests: snapshot.interests,
            travellers: snapshot.travellers,
            origin: snapshot.origin,
            journeyEnd: snapshot.journeyEnd,
          },
        },
      } satisfies HomeTripDraft;
    })();

  const projected = withHomepageChoices(draft, snapshot, input.profile, capture);
  return {
    ok: true,
    draft: {
      ...projected,
      homepage: projected.homepage ?? {
        version: 1,
        ownerId: snapshot.ownerId,
        revision: snapshot.revision,
        mode: snapshot.mode,
        occurrenceMentionIds: {},
        choices: {
          dates: snapshot.dates,
          budget: snapshot.budget,
          interests: snapshot.interests,
          travellers: snapshot.travellers,
          origin: snapshot.origin,
          journeyEnd: snapshot.journeyEnd,
        },
      },
    },
  };
}

/** Resolve both current drafts and pre-#209 drafts at the Builder boundary. */
export function tripInterestsFromHomeDraft(
  draft: Pick<HomeTripDraft, "interests" | "interestsExplicit">,
  capturedInterests: readonly string[] = [],
) {
  const selected = normalizeTripInterests(draft.interests);
  if (draft.interestsExplicit === true || (draft.interestsExplicit === undefined && selected.length)) return selected;
  return normalizeTripInterests(capturedInterests);
}

export function homeTripDraftInterestsWereExplicit(
  draft: Pick<HomeTripDraft, "interests" | "interestsExplicit">,
) {
  return draft.interestsExplicit === true
    || (draft.interestsExplicit === undefined && normalizeTripInterests(draft.interests).length > 0);
}

export function routableHandoffMentions(mentions: ResolvedPlaceMention[]) {
  return mentions.filter((mention) => mention.role !== "excluded" && mention.role !== "fixed_end"
    && (mention.status === "resolved" || mention.status === "partially_resolved")
    && Boolean(mention.canonicalPlaceId)
    && mention.routability === "direct_destination");
}

/** Optional coordinate lookup for a known direct stop, or candidate lookup
 * for a named unresolved semantic destination. Broad areas remain Discovery
 * decisions and cannot become guessed route stops through this path. */
export function handoffLookupMentions(mentions: readonly ResolvedPlaceMention[]) {
  return mentions.filter((mention) => {
    if (mention.role === "excluded" || mention.role === "fixed_end" || mention.role === "anchor"
      || mention.requiresBaseSelection) return false;
    if (mention.status === "unresolved") return mention.placeType === "unknown"
      && (mention.role === "preferred" || mention.role === "required" || mention.role === "origin" || mention.role === "fixed_start")
      && Boolean(mention.sourceText.trim());
    return (mention.status === "resolved" || mention.status === "partially_resolved")
      && mention.routability === "direct_destination" && Boolean(mention.canonicalPlaceId)
      && !mention.coordinates;
  });
}

export function homeTripDraftTimingFlexibility(
  draft: Pick<HomeTripDraft, "datesExplicit">,
  fallback: "fixed" | "flexible",
) {
  return draft.datesExplicit === true ? "fixed" : draft.datesExplicit === false ? "flexible" : fallback;
}

export async function resolveHandoffBatch<T, R>(
  items: T[],
  resolveItem: (item: T, signal: AbortSignal) => Promise<R>,
  timeoutMs = 4_000,
): Promise<Array<{ item: T; value?: R; status: "resolved" | "failed" | "timeout" }>> {
  const boundedTimeout = Math.max(1, Math.min(timeoutMs, 10_000));
  return Promise.all(items.map(async (item) => {
    const controller = new AbortController();
    let timedOut = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      const value = await Promise.race([
        resolveItem(item, controller.signal),
        new Promise<never>((_, reject) => {
          timeout = setTimeout(() => {
            timedOut = true;
            controller.abort();
            reject(new Error("Place resolution timed out"));
          }, boundedTimeout);
        }),
      ]);
      return { item, value, status: "resolved" as const };
    } catch {
      return { item, status: timedOut ? "timeout" as const : "failed" as const };
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }));
}

export type HandoffOutcome<T, R> = { item: T; value?: R; status: "resolved" | "failed" | "timeout" };

/** Publish each occurrence independently. The caller owns generation and
 * canonical application; this queue owns only bounded lookup scheduling. */
export async function resolveHandoffIncrementally<T, R>(
  items: readonly T[],
  resolveItem: (item: T, signal: AbortSignal) => Promise<R>,
  options: {
    signal?: AbortSignal;
    concurrency?: number;
    timeoutMs?: number;
    onOutcome: (outcome: HandoffOutcome<T, R>) => void;
  },
): Promise<HandoffOutcome<T, R>[]> {
  const concurrency = Math.max(1, Math.min(3, Math.floor(options.concurrency ?? 3)));
  const timeoutMs = Math.max(1, Math.min(10_000, options.timeoutMs ?? 4_000));
  const outcomes: HandoffOutcome<T, R>[] = new Array(items.length);
  let nextIndex = 0;
  const worker = async () => {
    while (nextIndex < items.length && !options.signal?.aborted) {
      const index = nextIndex++;
      const item = items[index]!;
      const controller = new AbortController();
      let timedOut = false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      let onAbort: (() => void) | undefined;
      const interrupted = new Promise<never>((_, reject) => {
        onAbort = () => { controller.abort(); reject(new Error("Place resolution cancelled")); };
        options.signal?.addEventListener("abort", onAbort, { once: true });
        timer = setTimeout(() => {
          timedOut = true;
          controller.abort();
          reject(new Error("Place resolution timed out"));
        }, timeoutMs);
      });
      let outcome: HandoffOutcome<T, R>;
      try {
        const value = await Promise.race([resolveItem(item, controller.signal), interrupted]);
        outcome = { item, value, status: "resolved" };
      } catch {
        outcome = { item, status: timedOut ? "timeout" : "failed" };
      } finally {
        if (timer) clearTimeout(timer);
        if (onAbort) options.signal?.removeEventListener("abort", onAbort);
      }
      outcomes[index] = outcome;
      if (!options.signal?.aborted) options.onOutcome(outcome);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  return outcomes;
}

function draftMatchesStoredValue(draft: HomeTripDraft, stored: HomeTripDraft) {
  if (draft.handoffId) {
    if (stored.handoffId !== draft.handoffId) return false;
    if (!draft.homepage) return true;
    return stored.homepage?.version === draft.homepage.version
      && stored.homepage.ownerId === draft.homepage.ownerId
      && stored.homepage.revision === draft.homepage.revision;
  }
  return stored.brief === draft.brief && stored.parserVersion === draft.parserVersion;
}

/** Validate the versioned Homepage discriminator before the Builder observes
 * its reserved identity. Legacy drafts intentionally return null. */
export function homepageHandoffReceiptForOwner(
  draft: HomeTripDraft,
  ownerId: string | null,
): HomepageHandoffReceipt | null {
  const homepage = draft.homepage;
  const receipt = homepage?.receipt;
  if (!homepage || homepage.version !== 1 || homepage.ownerId !== ownerId || !receipt) return null;
  if (receipt.version !== 1
    || receipt.ownerId !== ownerId
    || receipt.handoffId !== draft.handoffId
    || receipt.inputFingerprint !== homepageSubmissionFingerprint(draft)
    || !receipt.tripId.trim()) return null;
  return receipt;
}

function journeyEndsMatch(expected: JourneyEndSelection | undefined, actual: JourneyEndSelection | undefined) {
  const expectedEnd = normalizeJourneyEnd(expected);
  const actualEnd = normalizeJourneyEnd(actual);
  if (expectedEnd.mode !== actualEnd.mode) return false;
  if (expectedEnd.mode !== "explicit" || actualEnd.mode !== "explicit") return true;
  return sameJourneyPlace(expectedEnd.place, actualEnd.place);
}

/** Compare the initially accepted versioned intake with its first canonical
 * Builder document. This is used only for durable acknowledgement; it does
 * not constrain subsequent edits to that document. */
export function homepageHandoffMatchesTrip(draft: HomeTripDraft, trip: EasyTTrip) {
  const handoffOwnerId = draft.homepage?.ownerId ?? null;
  const receipt = homepageHandoffReceiptForOwner(draft, handoffOwnerId);
  if (!receipt || receipt.tripId !== trip.id) return false;
  // Authenticated device recovery is owner-scoped before its first cloud
  // promotion, so the document itself may still be ownerless at this point.
  if (trip.ownerId !== null && trip.ownerId !== handoffOwnerId) return false;

  const handoffMentions = draft.structuredBrief?.placeMentions ?? draft.locationMentions ?? [];
  const initialStops = initialHandoffRouteStops(
    handoffMentions,
    draft.destinations?.length ? draft.destinations : draft.destination ? [draft.destination] : [],
    draft.journeyEnd,
  );
  const occurrenceByMentionId = new Map(Object.entries(draft.homepage?.occurrenceMentionIds ?? {})
    .map(([occurrenceId, mentionId]) => [mentionId, occurrenceId]));
  const selectedStopIdsByMention = new Map<string, string[]>();
  for (const selection of trip.brief.structuredBrief?.placeSelections ?? []) {
    if (!selection.routeStopId) continue;
    selectedStopIdsByMention.set(selection.mentionId, [
      ...(selectedStopIdsByMention.get(selection.mentionId) ?? []),
      selection.routeStopId,
    ]);
  }
  const directStopById = new Map(initialStops.map((stop) => [stop.id, stop]));
  const expectedStops: Array<{ id: string; direct?: HandoffRouteStop }> = handoffMentions.length
    ? [...handoffMentions].sort((left, right) => left.order - right.order).flatMap((mention) => {
      if (mention.role === "origin" || mention.role === "fixed_start" || mention.role === "fixed_end" || mention.role === "excluded") return [];
      const directId = occurrenceByMentionId.get(mention.mentionId) ?? handoffRouteStopId(mention);
      const direct = directStopById.get(directId);
      if (direct) return [{ id: direct.id, direct }];
      return (selectedStopIdsByMention.get(mention.mentionId) ?? []).map((id) => ({ id }));
    })
    : initialStops.map((direct) => ({ id: direct.id, direct }));
  if (expectedStops.length !== trip.stops.length) return false;
  if (!expectedStops.every((expected, index) => {
    const actual = trip.stops[index];
    if (!actual || actual.id !== expected.id) return false;
    if (!expected.direct) return true;
    return normalizePlacePhrase(actual.name) === normalizePlacePhrase(expected.direct.name)
      && (!expected.direct.canonicalPlaceId || actual.canonicalPlaceId === expected.direct.canonicalPlaceId)
      && (!expected.direct.country || normalizePlacePhrase(actual.country) === normalizePlacePhrase(expected.direct.country));
  })) return false;

  if (draft.origin !== undefined) {
    if (normalizePlacePhrase(trip.brief.origin) !== normalizePlacePhrase(draft.origin)) return false;
    if (draft.originCanonicalPlaceId && trip.brief.originCanonicalPlaceId !== draft.originCanonicalPlaceId) return false;
  } else if (draft.homepage?.choices.origin.state === "cleared" && trip.brief.origin.trim()) {
    return false;
  }
  if (!journeyEndsMatch(draft.journeyEnd, trip.brief.journeyEnd)) return false;
  if (draft.datesExplicit && (trip.startDate !== draft.startDate || trip.endDate !== draft.endDate)) return false;
  if (draft.travellersExplicit && trip.travellers !== draft.travellers) return false;
  if (homeTripDraftInterestsWereExplicit(draft)) {
    const expectedInterests = normalizeTripInterests(draft.interests);
    const actualInterests = normalizeTripInterests(trip.brief.intent?.preferences.interests);
    if (JSON.stringify(actualInterests) !== JSON.stringify(expectedInterests)) return false;
  }
  if (draft.brief !== undefined
    && trip.brief.capturedIntent?.originalBrief !== draft.brief
    && trip.brief.mustDo !== draft.brief) return false;
  if (draft.homepage?.mode === "stops" && draft.brief === undefined && trip.brief.mustDo !== "") return false;
  if (draft.sourceRouteKey !== undefined && trip.brief.sourceRouteKey !== draft.sourceRouteKey) return false;
  return true;
}

export function homeTripDraftIsDurable(draft: HomeTripDraft, trip: EasyTTrip, resolutionPending: boolean) {
  if (draft.homepage) return !resolutionPending && homepageHandoffMatchesTrip(draft, trip);
  if (resolutionPending || !draft.brief || trip.brief.capturedIntent?.originalBrief !== draft.brief) return false;
  const routeMentions = routableHandoffMentions(draft.structuredBrief?.placeMentions ?? draft.locationMentions ?? []);
  const stopNames = new Set(trip.stops.map((stop) => normalizePlacePhrase(stop.name)));
  const expectedEnd = normalizeJourneyEnd(draft.journeyEnd ?? { mode: "unknown" });
  const actualEnd = normalizeJourneyEnd(trip.brief.journeyEnd);
  const endpointOwnedMentionId = endpointOwnedRouteMentionId(routeMentions, expectedEnd);
  const routeDurable = routeMentions.every((mention) => {
    const expected = normalizePlacePhrase(mention.canonicalName);
    return mention.role === "origin" || mention.role === "fixed_start"
      ? normalizePlacePhrase(trip.brief.origin) === expected
      : mention.mentionId === endpointOwnedMentionId
        ? actualEnd.mode === "explicit" && sameJourneyPlace({
          name: mention.canonicalName,
          canonicalPlaceId: mention.canonicalPlaceId,
          country: mention.parentCountries.length === 1 ? mention.parentCountries[0] : undefined,
        }, actualEnd.place)
      : stopNames.has(expected);
  });
  if (!routeDurable) return false;
  if (expectedEnd.mode !== actualEnd.mode) return false;
  if (expectedEnd.mode !== "explicit" || actualEnd.mode !== "explicit") return true;
  return sameJourneyPlace(
    resolvedJourneyEndPlace(originPlaceFromBrief(trip.brief), expectedEnd),
    resolvedJourneyEndPlace(originPlaceFromBrief(trip.brief), actualEnd),
  );
}

export async function removeHomeTripDraftIfDurable(
  storage: Pick<Storage, "getItem" | "removeItem">,
  draft: HomeTripDraft | null,
  trip: EasyTTrip,
  recoveryStored: boolean,
  resolutionPending: boolean,
  lock?: <T>(key: string, run: () => Promise<T>) => Promise<T>,
): Promise<boolean> {
  if (!recoveryStored || !draft || !homeTripDraftIsDurable(draft, trip, resolutionPending)) return false;
  try {
    return await withHomepageReceiptLock(draft.homepage?.ownerId ?? null, lock, async () => {
      const stored = JSON.parse(storage.getItem(HOME_TRIP_DRAFT_KEY) ?? "null") as HomeTripDraft | null;
      if (!stored || !draftMatchesStoredValue(draft, stored)) return false;
      storage.removeItem(HOME_TRIP_DRAFT_KEY);
      return storage.getItem(HOME_TRIP_DRAFT_KEY) === null;
    });
  } catch {
    return false;
  }
}
