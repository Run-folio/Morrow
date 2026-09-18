import { captureJourneyBrief, type JourneyCaptureResult } from "./journey-capture.ts";
import { isOvernightBaseEligible, normalizePlacePhrase, placeResolutionIssuesForMentions, type CanonicalPlaceSuggestion, type GeographicBounds, type PlaceRoutability, type ResolvedPlaceMention } from "./place-intelligence.ts";
import type { EasyTTrip, JourneyEndSelection, JourneyEndpointPlace } from "./trip.ts";
import type { CuratedRouteKnowledge } from "./curated-route-knowledge.ts";
import { normalizeTripInterests, type TripInterest } from "./trip-interest.ts";
import { canonicalJourneyEndpointPlace, normalizeJourneyEnd, originPlaceFromBrief, resolvedJourneyEndPlace, sameJourneyPlace } from "./journey-endpoints.ts";
import { createPlanningConfidence } from "./planning-confidence.ts";
import { structuredTripBriefFromSavedSelections, validateStructuredTripBrief, type StructuredTripBrief, type TripBriefProvenance } from "./structured-trip-brief.ts";
import type { TravelProfile } from "./travel-profile.ts";

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

export type HomepageInputIssue = {
  field: "destinations" | "prompt" | "dates" | "travellers";
  code: "required" | "unresolved" | "invalid";
  entryId?: string;
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
  homepage?: {
    version: 1;
    ownerId: string | null;
    revision: number;
    mode: HomepageInputSnapshot["mode"];
    occurrenceMentionIds: Record<string, string>;
    choices: Pick<HomepageInputSnapshot, "dates" | "budget" | "interests" | "travellers" | "origin" | "journeyEnd">;
  };
  brief?: string;
  nightAllocations?: Record<string, number>;
  decisionSelections?: EasyTTrip["brief"]["decisionSelections"];
};

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
): HandoffRouteStop[] {
  if (!choice) return stops;
  const stopId = handoffRouteStopId(mention);
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
  const selection = entry.selection!;
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

function draftMatchesStoredValue(draft: HomeTripDraft, stored: HomeTripDraft) {
  if (draft.handoffId) return stored.handoffId === draft.handoffId;
  return stored.brief === draft.brief && stored.parserVersion === draft.parserVersion;
}

export function homeTripDraftIsDurable(draft: HomeTripDraft, trip: EasyTTrip, resolutionPending: boolean) {
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

export function removeHomeTripDraftIfDurable(
  storage: Pick<Storage, "getItem" | "removeItem">,
  draft: HomeTripDraft | null,
  trip: EasyTTrip,
  recoveryStored: boolean,
  resolutionPending: boolean,
) {
  if (!recoveryStored || !draft || !homeTripDraftIsDurable(draft, trip, resolutionPending)) return false;
  try {
    const stored = JSON.parse(storage.getItem(HOME_TRIP_DRAFT_KEY) ?? "null") as HomeTripDraft | null;
    if (!stored || !draftMatchesStoredValue(draft, stored)) return false;
    storage.removeItem(HOME_TRIP_DRAFT_KEY);
    return true;
  } catch {
    return false;
  }
}
