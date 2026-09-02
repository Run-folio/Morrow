import type { JourneyCaptureResult } from "./journey-capture.ts";
import { normalizePlacePhrase, type GeographicBounds, type PlaceRoutability, type ResolvedPlaceMention } from "./place-intelligence.ts";
import type { EasyTTrip, JourneyEndSelection, JourneyEndpointPlace } from "./trip.ts";
import type { CuratedRouteKnowledge } from "./curated-route-knowledge.ts";
import { normalizeTripInterests, type TripInterest } from "./trip-interest.ts";
import { canonicalJourneyEndpointPlace, normalizeJourneyEnd, originPlaceFromBrief, resolvedJourneyEndPlace, sameJourneyPlace } from "./journey-endpoints.ts";

export const HOME_TRIP_DRAFT_KEY = "easyt-home-trip-draft";

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
  kind?: string;
  locality?: string;
};

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
  const routeDurable = routeMentions.every((mention) => {
    const expected = normalizePlacePhrase(mention.canonicalName);
    return mention.role === "origin" || mention.role === "fixed_start"
      ? normalizePlacePhrase(trip.brief.origin) === expected
      : stopNames.has(expected);
  });
  if (!routeDurable) return false;
  const expectedEnd = normalizeJourneyEnd(draft.journeyEnd ?? { mode: "unknown" });
  const actualEnd = normalizeJourneyEnd(trip.brief.journeyEnd);
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
