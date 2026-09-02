import { captureJourneyBriefFromSemanticIntent, developmentJourneyCaptureDiagnostics } from "../../lib/easyt/journey-capture.ts";
import { createHomeTripDraft, routableHandoffMentions } from "../../lib/easyt/home-trip-handoff.ts";
import { createOpenWorldPlaceProvider, type OpenWorldPlaceSource } from "../../lib/easyt/open-world-place.server.ts";
import { normalizePlacePhrase, placeMentionsNeedingReview } from "../../lib/easyt/place-intelligence.ts";
import {
  SEMANTIC_TRIP_INTENT_RAW_PROMPT_VERSION,
  SEMANTIC_TRIP_INTENT_SCHEMA_VERSION,
  type SemanticTripIntent,
} from "../../lib/easyt/semantic-trip-intent.ts";
import { OPEN_WORLD_ENGINE_GAUNTLET, type OpenWorldGauntletFixture } from "./fixtures.ts";

export type GauntletFailureCategory =
  | "provider-retrieval"
  | "provider-normalization"
  | "deduplication-equivalence"
  | "specificity-ranking"
  | "route-context-ranking"
  | "containment-parent-geography"
  | "attraction-base-relationship"
  | "confidence-margin"
  | "typo-fuzzy-retrieval"
  | "enrichment-ordering"
  | "schema-capture-loss"
  | "builder-handoff"
  | "incorrect-resolution";

export type GauntletMentionResult = {
  sourceText: string;
  providerCandidates: Array<{ id: string; name: string; country: string; type: string; score: number | null }>;
  selected: null | { id: string; name: string; country: string | null; type: string; confidence: string; status: string };
  routeContext: { countries: string[]; selectedPlaces: string[] };
  builderState: "resolved-stop" | "review" | "lost";
  confirmationRequired: boolean;
  correct: boolean;
  expectedReason: string;
  failureCategory?: GauntletFailureCategory;
};

export type GauntletFixtureResult = {
  id: string;
  cohort: string;
  prompt: string;
  mentions: GauntletMentionResult[];
  duplicateChecks: Array<{ phrase: string; actualCount: number; expectedCount: number; correct: boolean; reason: string }>;
  captureLosses: string[];
  correct: boolean;
};

export type GauntletSummary = {
  totalPrompts: number;
  totalPlaceMentions: number;
  automaticallyResolved: number;
  correctlyUnresolved: number;
  incorrectlyUnresolved: number;
  incorrectlyResolved: number;
  duplicateIdentitiesCollapsed: number;
  duplicateIdentityFailures: number;
  captureSchemaLosses: number;
  failuresByRootCause: Partial<Record<GauntletFailureCategory, number>>;
  results: GauntletFixtureResult[];
};

const key = (value: string) => normalizePlacePhrase(value).replace(/^the\s+/, "");

function semanticIntent(fixture: OpenWorldGauntletFixture): SemanticTripIntent {
  return {
    schemaVersion: SEMANTIC_TRIP_INTENT_SCHEMA_VERSION,
    rawPromptVersion: SEMANTIC_TRIP_INTENT_RAW_PROMPT_VERSION,
    origin: { sourceText: null, certainty: null },
    journeyEnd: { sourceText: null, interpretedText: null, mode: "unknown", certainty: null },
    duration: { sourceText: null, value: null, unit: null },
    explicitDateTexts: [],
    destinationCandidates: fixture.mentions
      .filter((mention): mention is typeof mention & { kind: "route-stop" | "planning-area" } => mention.kind !== "anchor")
      .map((mention) => ({
      sourceText: mention.sourceText,
      interpretedText: null,
      role: mention.kind,
      certainty: "explicit" as const,
    })),
    pointsOfInterest: fixture.mentions.filter((mention) => mention.kind === "anchor").map((mention) => ({
      sourceText: mention.sourceText,
      interpretedText: null,
      likelyDestinationSourceText: null,
      certainty: "explicit" as const,
    })),
    transport: { departure: { sourceText: null, mode: null }, interStop: { sourceText: null, modes: [] }, avoid: [] },
    pace: { sourceText: null, value: null },
    interests: [],
    constraints: [],
    ambiguities: [],
    unresolvedMeaningfulText: [],
  };
}

type LookupTrace = { phrase: string; countries: string[]; selectedPlaces: string[] };

function sourcesForFixture(fixture: OpenWorldGauntletFixture, trace: LookupTrace[]): OpenWorldPlaceSource[] {
  return (["atlas", "mirror"] as const).map((sourceId) => ({
    id: sourceId,
    label: sourceId === "atlas" ? "Controlled atlas source" : "Controlled mirror source",
    async search(phrase, context) {
      if (sourceId === "atlas") trace.push({
        phrase,
        countries: [...(context.countryNames ?? [])],
        selectedPlaces: [...(context.selectedPlaces ?? [])].map((place) => place.canonicalName),
      });
      return (fixture.candidates[key(phrase)] ?? [])
        .filter((candidate) => candidate.source === sourceId)
        .map(({ source: _source, ...candidate }) => candidate);
    },
  }));
}

function classifyFailure(input: {
  expectedOutcome: "resolved" | "review";
  actualStatus: string | undefined;
  actualName: string | undefined;
  expectedName: string | undefined;
  candidates: GauntletMentionResult["providerCandidates"];
  captureLost: boolean;
  fixture: OpenWorldGauntletFixture;
}): GauntletFailureCategory | undefined {
  if (input.captureLost) return "schema-capture-loss";
  if (input.expectedOutcome === "review" && input.actualStatus === "resolved") return "incorrect-resolution";
  if (input.expectedOutcome === "resolved" && input.actualStatus !== "resolved") {
    if (!input.candidates.length) return "provider-retrieval";
    if (input.fixture.cohort === "provider-duplicates") return "deduplication-equivalence";
    if (input.fixture.cohort === "route-context" || input.fixture.cohort === "repeated-names") return "route-context-ranking";
    if (input.fixture.cohort === "typos-and-aliases") return "typo-fuzzy-retrieval";
    if (input.fixture.cohort === "locality-collisions") return "specificity-ranking";
    return "confidence-margin";
  }
  if (input.expectedOutcome === "resolved" && input.actualName !== input.expectedName) {
    return input.fixture.cohort === "route-context" || input.fixture.cohort === "repeated-names"
      ? "enrichment-ordering"
      : "incorrect-resolution";
  }
  return undefined;
}

export async function evaluateOpenWorldFixture(fixture: OpenWorldGauntletFixture): Promise<GauntletFixtureResult> {
  const lookupTrace: LookupTrace[] = [];
  const provider = createOpenWorldPlaceProvider({ sources: sourcesForFixture(fixture, lookupTrace), cache: new Map() });
  const capture = await captureJourneyBriefFromSemanticIntent(fixture.prompt, semanticIntent(fixture), provider);
  const draft = createHomeTripDraft({
    capture,
    handoffId: `open-world-gauntlet:${fixture.id}`,
    datesExplicit: false,
    startDate: "",
    endDate: "",
    travellers: 2,
    travellersExplicit: false,
    interests: [],
  });
  const reviewMentions = placeMentionsNeedingReview(draft.locationMentions ?? [], capture.structuredBrief.placeIssues ?? []);
  const reviewIds = new Set(reviewMentions.map((mention) => mention.mentionId));
  const routeIds = new Set(routableHandoffMentions(draft.locationMentions ?? []).map((mention) => mention.mentionId));
  const diagnostics = developmentJourneyCaptureDiagnostics(semanticIntent(fixture), capture);
  const captureLosses = [
    ...capture.mentionCoverage.missingFromResolution,
    ...capture.mentionCoverage.missingFromStructuredBrief,
  ].filter((value, index, all) => all.indexOf(value) === index);
  const mentions = fixture.expected.map((expected): GauntletMentionResult => {
    const mention = capture.mentions.find((item) => key(item.sourceText) === key(expected.sourceText));
    const diagnostic = diagnostics.mentions.find((item) => key(item.sourceText) === key(expected.sourceText));
    const providerCandidates = (diagnostic?.resolverCandidates ?? []).map((candidate) => ({
      id: `${candidate.canonicalName}:${candidate.parentCountries.join("|")}:${candidate.rankScore ?? ""}`,
      name: candidate.canonicalName,
      country: candidate.parentCountries[0] ?? "",
      type: candidate.placeType,
      score: typeof candidate.rankScore === "number" ? candidate.rankScore : null,
    }));
    const confirmationRequired = mention ? reviewIds.has(mention.mentionId) : true;
    const selected = mention?.canonicalPlaceId ? {
      id: mention.canonicalPlaceId,
      name: mention.canonicalName,
      country: mention.parentCountries[0] ?? null,
      type: mention.placeType,
      confidence: `${mention.confidence.state}/${mention.confidence.level}`,
      status: mention.status,
    } : null;
    const identityCorrect = expected.outcome === "review"
      ? confirmationRequired && (expected.canonicalName
        ? mention?.canonicalName === expected.canonicalName
          && mention.parentCountries[0] === expected.country
          && mention.placeType === expected.placeType
          && mention.routability !== "direct_destination"
        : !mention?.canonicalPlaceId && (mention?.status === "ambiguous" || mention?.status === "unresolved"))
      : !confirmationRequired
        && mention?.status === "resolved"
        && mention.canonicalName === expected.canonicalName
        && mention.parentCountries[0] === expected.country
        && mention.placeType === expected.placeType;
    const captureLost = !mention || captureLosses.some((item) => key(item) === key(expected.sourceText));
    const contexts = lookupTrace.filter((entry) => key(entry.phrase) === key(expected.sourceText)
      || (mention && key(entry.phrase) === key(mention.canonicalName)));
    const latestContext = contexts.at(-1);
    const failureCategory = identityCorrect ? undefined : classifyFailure({
      expectedOutcome: expected.outcome,
      actualStatus: mention?.status,
      actualName: mention?.canonicalName,
      expectedName: expected.canonicalName,
      candidates: providerCandidates,
      captureLost,
      fixture,
    });
    return {
      sourceText: expected.sourceText,
      providerCandidates,
      selected,
      routeContext: {
        countries: latestContext?.countries ?? [],
        selectedPlaces: latestContext?.selectedPlaces ?? [],
      },
      builderState: !mention ? "lost" : routeIds.has(mention.mentionId) ? "resolved-stop" : "review",
      confirmationRequired,
      correct: identityCorrect,
      expectedReason: expected.reason,
      ...(failureCategory ? { failureCategory } : {}),
    };
  });
  const duplicateChecks = await Promise.all((fixture.duplicateGroups ?? []).map(async (group) => {
    const candidates = await provider.lookup(group.phrase, { travelIntent: fixture.mentions.find((mention) => key(mention.sourceText) === key(group.phrase))?.kind ?? "route-stop" });
    return { phrase: group.phrase, actualCount: candidates.length, expectedCount: group.expectedCount, correct: candidates.length === group.expectedCount, reason: group.reason };
  }));
  return {
    id: fixture.id,
    cohort: fixture.cohort,
    prompt: fixture.prompt,
    mentions,
    duplicateChecks,
    captureLosses,
    correct: mentions.every((mention) => mention.correct) && duplicateChecks.every((check) => check.correct) && captureLosses.length === 0,
  };
}

export async function runOpenWorldEngineGauntlet(): Promise<GauntletSummary> {
  const results = await Promise.all(OPEN_WORLD_ENGINE_GAUNTLET.map(evaluateOpenWorldFixture));
  const mentions = results.flatMap((result) => result.mentions);
  const failures = mentions.flatMap((mention) => mention.failureCategory ? [mention.failureCategory] : []);
  const duplicateChecks = results.flatMap((result) => result.duplicateChecks);
  return {
    totalPrompts: results.length,
    totalPlaceMentions: mentions.length,
    automaticallyResolved: mentions.filter((mention) => mention.correct && mention.builderState === "resolved-stop").length,
    correctlyUnresolved: mentions.filter((mention) => mention.correct && mention.confirmationRequired).length,
    incorrectlyUnresolved: mentions.filter((mention) => !mention.correct && mention.confirmationRequired).length,
    incorrectlyResolved: mentions.filter((mention) => !mention.correct && !mention.confirmationRequired).length,
    duplicateIdentitiesCollapsed: duplicateChecks.filter((check) => check.correct).length,
    duplicateIdentityFailures: duplicateChecks.filter((check) => !check.correct).length,
    captureSchemaLosses: results.reduce((total, result) => total + result.captureLosses.length, 0),
    failuresByRootCause: Object.fromEntries([...new Set(failures)].map((category) => [category, failures.filter((value) => value === category).length])),
    results,
  };
}
