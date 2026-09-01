import { captureJourneyBrief, captureJourneyBriefFromSemanticIntent, type JourneyCaptureResult } from "../../lib/easyt/journey-capture.ts";
import type { CuratedRouteKnowledge } from "../../lib/easyt/curated-route-knowledge.ts";
import { mapRouteLegsFromTrip } from "../../lib/easyt/map-spatial-context.ts";
import { tripHealth } from "../../lib/easyt/review.ts";
import {
  SEMANTIC_TRIP_INTENT_RAW_PROMPT_VERSION,
  SEMANTIC_TRIP_INTENT_SCHEMA_VERSION,
  validateSemanticTripIntent,
  type SemanticIntentCostEstimate,
  type SemanticIntentUsage,
  type SemanticTripIntent,
} from "../../lib/easyt/semantic-trip-intent.ts";
import { buildTripCopilotProjection } from "../../lib/easyt/trip-copilot.ts";
import { canonicalLegIntegrityIssues, canonicalRouteEndpoints } from "../../lib/easyt/trip-legs.ts";
import { defaultTripIntent, tripFromBuilder, type EasyTTrip, type TripLeg } from "../../lib/easyt/trip.ts";
import type { PlaceIntelligenceProvider, PlaceProviderCandidate, ResolvedPlaceMention } from "../../lib/easyt/place-intelligence.ts";
import { GLOBAL_ROUTING_BENCHMARK_VERSION, GLOBAL_ROUTING_FIXTURES, type BenchmarkPlace, type GlobalRoutingFixture } from "./fixtures.ts";

export const GLOBAL_ROUTING_CAPABILITIES = [
  "semantic-understanding",
  "geographic-resolution",
  "route-integrity",
  "transfer-integrity",
  "product-truthfulness",
] as const;

export type GlobalRoutingCapability = typeof GLOBAL_ROUTING_CAPABILITIES[number];
export type GlobalRoutingOutcome = "PASS" | "PASS WITH EXPECTED UNCERTAINTY" | "WARNING" | "HARD FAILURE";
export type GlobalRoutingMode = "deterministic" | "live";

export type GlobalRoutingDiagnostic = {
  id: string;
  layer: GlobalRoutingCapability;
  severity: "warning" | "hard-failure";
  failure: string;
  expected: string;
  actual: string;
};

type CapabilityScore = { earned: number; possible: number; percent: number };
type Fact = { from: string; to: string; mode: TripLeg["mode"]; classification: TripLeg["classification"] | null; durationMinutes: number | null };

export type GlobalRoutingFixtureResult = {
  id: string;
  name: string;
  region: GlobalRoutingFixture["region"];
  p0: boolean;
  outcome: GlobalRoutingOutcome;
  scores: Record<GlobalRoutingCapability, CapabilityScore>;
  diagnostics: GlobalRoutingDiagnostic[];
  output: {
    mentionCoverage: JourneyCaptureResult["mentionCoverage"];
    retainedSources: string[];
    unresolvedPlaceCount: number;
    unknownTransferCount: number;
    routeEndpoints: string[];
    routeStopKeys: string[];
    crossSurfaceConsistent: boolean | null;
    healthReady: boolean | null;
  };
};

export type GlobalRoutingLiveTelemetry = {
  model: string;
  latencyMs: number;
  usage?: SemanticIntentUsage;
  cost?: SemanticIntentCostEstimate;
};

export type GlobalRoutingSummary = {
  version: typeof GLOBAL_ROUTING_BENCHMARK_VERSION;
  mode: GlobalRoutingMode;
  fixtureCount: number;
  outcomes: Record<GlobalRoutingOutcome, number>;
  scores: Record<GlobalRoutingCapability, CapabilityScore>;
  p0RegressionFailures: string[];
  unknownTransferCount: number;
  unresolvedPlaceCount: number;
  results: GlobalRoutingFixtureResult[];
  live: {
    calls: number;
    latencyMs: number;
    inputTokens: number | null;
    outputTokens: number | null;
    totalTokens: number | null;
    estimatedCostUsd: number | null;
  } | null;
};

export type GlobalRoutingIntentResult = {
  intent: SemanticTripIntent | null;
  telemetry?: GlobalRoutingLiveTelemetry;
  error?: string;
};

const RAW_PROMPT_CAPTURE_GATE_CASES = [
  { prompt: "Paris to Denver, Dallas, Puerto Vallarta, Oaxaca", origin: "Paris", destinations: ["Denver", "Dallas", "Puerto Vallarta", "Oaxaca"] },
  { prompt: "Madrid to Cusco, Rio, Buenos Aires, El Calafate, Santiago", origin: "Madrid", destinations: ["Cusco", "Rio", "Buenos Aires", "El Calafate", "Santiago"] },
  { prompt: "Porto to Paris, Rome, Madrid, Cairo", origin: "Porto", destinations: ["Paris", "Rome", "Madrid", "Cairo"] },
] as const;

/** Product-input preflight: runs before routing so downstream correctness can
 * never mask an origin or destination already lost during raw capture. */
export function runRawPromptCaptureGate(repetitions = 10) {
  const failures: string[] = [];
  for (let run = 0; run < repetitions; run += 1) for (const fixture of RAW_PROMPT_CAPTURE_GATE_CASES) {
    const capture = captureJourneyBrief(fixture.prompt);
    const retained = new Set(capture.mentions.flatMap((mention) => mention.sourceTexts.map(normalize)));
    const origin = capture.mentions.find((mention) => ["origin", "fixed_start"].includes(mention.role));
    const missing = fixture.destinations.filter((place) => !retained.has(normalize(place)));
    if (normalize(origin?.sourceText ?? "") !== normalize(fixture.origin) || missing.length || !capture.mentionCoverage.complete) {
      failures.push(`run ${run + 1}: ${fixture.prompt} (origin=${origin?.sourceText ?? "missing"}; missing=${missing.join(", ") || "none"})`);
    }
  }
  return { repetitions, cases: RAW_PROMPT_CAPTURE_GATE_CASES.length, failures, complete: failures.length === 0 };
}

type RunnerOptions = {
  mode?: GlobalRoutingMode;
  fixtures?: GlobalRoutingFixture[];
  extractIntent?: (fixture: GlobalRoutingFixture) => Promise<GlobalRoutingIntentResult>;
  placeProvider?: (fixture: GlobalRoutingFixture) => PlaceIntelligenceProvider;
};

const normalize = (value: string) => value.toLocaleLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
const legKey = (from: string, to: string) => `${normalize(from).replaceAll(" ", "-")}>${normalize(to).replaceAll(" ", "-")}`;

function recordedIntent(fixture: GlobalRoutingFixture): SemanticTripIntent {
  const destinations = fixture.destinations.filter((item) => item.semanticRole !== "anchor");
  const anchors = fixture.destinations.filter((item) => item.semanticRole === "anchor");
  const ambiguities = fixture.expectedAmbiguities.map((key) => {
    const place = fixture.destinations.find((item) => item.key === key);
    return { sourceText: place?.sourceText ?? key, kind: "destination" as const };
  });
  return {
    schemaVersion: SEMANTIC_TRIP_INTENT_SCHEMA_VERSION,
    rawPromptVersion: SEMANTIC_TRIP_INTENT_RAW_PROMPT_VERSION,
    origin: { sourceText: fixture.origin?.sourceText ?? null, certainty: fixture.origin ? "explicit" : null },
    duration: { sourceText: null, value: null, unit: null },
    explicitDateTexts: [],
    destinationCandidates: destinations.map((item) => ({
      sourceText: item.sourceText,
      interpretedText: item.interpretedText ?? (item.canonicalName !== item.sourceText ? item.canonicalName : null),
      role: item.semanticRole === "planning-area" ? "planning-area" : item.semanticRole === "ambiguous" || item.semanticRole === "unresolved" ? "unknown" : "route-stop",
      certainty: item.semanticRole === "ambiguous" || item.semanticRole === "unresolved" ? "ambiguous" : "explicit",
    })),
    pointsOfInterest: anchors.map((item) => ({
      sourceText: item.sourceText,
      interpretedText: item.interpretedText ?? (item.canonicalName !== item.sourceText ? item.canonicalName : null),
      likelyDestinationSourceText: fixture.anchorBaseRelationships.find((relationship) => relationship.anchorKey === item.key)?.baseKey
        ? fixture.destinations.find((candidate) => candidate.key === fixture.anchorBaseRelationships.find((relationship) => relationship.anchorKey === item.key)?.baseKey)?.sourceText ?? null
        : null,
      certainty: "explicit",
    })),
    transport: {
      departure: { sourceText: fixture.semantic.departure?.sourceText ?? null, mode: fixture.semantic.departure?.mode ?? null },
      interStop: { sourceText: fixture.semantic.interStop?.sourceText ?? null, modes: fixture.semantic.interStop?.modes ?? [] },
      avoid: fixture.semantic.avoid ?? [],
    },
    pace: { sourceText: fixture.semantic.pace?.sourceText ?? null, value: fixture.semantic.pace?.value ?? null },
    interests: fixture.semantic.interests ?? [],
    constraints: (fixture.semantic.avoid ?? []).map((item) => ({ sourceText: item.sourceText, kind: item.mode === "flight" ? "no-flying" as const : item.mode === "drive" ? "no-driving" as const : "other" as const, strength: "hard" as const })),
    ambiguities,
    unresolvedMeaningfulText: fixture.destinations.filter((item) => item.semanticRole === "unresolved").map((item) => item.sourceText),
  };
}

function allFixturePlaces(fixture: GlobalRoutingFixture) {
  return [...(fixture.origin ? [fixture.origin] : []), ...fixture.destinations];
}

function fixtureProvider(fixture: GlobalRoutingFixture): PlaceIntelligenceProvider {
  const places = allFixturePlaces(fixture);
  return {
    id: "global-routing-fixture",
    label: "Controlled global routing fixture",
    timeoutMs: 100,
    async lookup(phrase) {
      const match = places.find((item) => [item.sourceText, item.canonicalName, item.interpretedText]
        .some((label) => label && normalize(label) === normalize(phrase)));
      if (!match || match.semanticRole === "unresolved") return [];
      if (match.ambiguityCandidates?.length) return match.ambiguityCandidates.map((candidate, index): PlaceProviderCandidate => ({
        providerId: `${match.key}-candidate-${index + 1}`,
        canonicalName: candidate.canonicalName,
        parentCountries: [candidate.country],
        coordinates: candidate.coordinates,
        placeType: candidate.placeType,
        routability: candidate.routability,
      }));
      return [{
        providerId: match.key,
        canonicalName: match.canonicalName,
        parentCountries: match.country ? [match.country] : [],
        coordinates: match.coordinates,
        placeType: match.placeType,
        routability: match.routability,
      }];
    },
  };
}

function matchMention(place: BenchmarkPlace, mentions: ResolvedPlaceMention[]) {
  const target = normalize(place.sourceText);
  const sources = (mention: ResolvedPlaceMention) => [...mention.sourceTexts, mention.sourceText].map(normalize);
  return mentions.find((mention) => sources(mention).includes(target))
    ?? mentions.find((mention) => sources(mention).some((candidate) => candidate.endsWith(` ${target}`)));
}

function buildTrip(fixture: GlobalRoutingFixture, capture: JourneyCaptureResult): EasyTTrip | null {
  if (!fixture.origin || !fixture.origin.coordinates || !fixture.routeOrder.length) return null;
  const stopPlaces = fixture.routeOrder.map((key) => fixture.destinations.find((item) => item.key === key)).filter((item): item is BenchmarkPlace => Boolean(item));
  if (stopPlaces.length !== fixture.routeOrder.length || stopPlaces.some((item) => !item.coordinates)) return null;
  const totalNights = Math.max(1, stopPlaces.length * 2);
  const end = new Date(Date.UTC(2027, 3, 1 + totalNights)).toISOString().slice(0, 10);
  const nightAllocations = Object.fromEntries(stopPlaces.map((item) => [item.key, 2]));
  const sourceId = `benchmark:${fixture.id}:controlled-fact`;
  const curatedRoute: CuratedRouteKnowledge | undefined = fixture.recordedConnections?.length ? {
    version: 1,
    routeKey: `benchmark-${fixture.id}`,
    routeTitle: fixture.name,
    confidence: "needs-review",
    reviewedAt: "2026-08-27",
    freshness: "reviewed",
    sources: [{ id: sourceId, label: "Controlled benchmark transport fact", url: "https://www.morrovia.com/", covers: "Deterministic benchmark-only transport evidence." }],
    canonicalStopIds: stopPlaces.map((item) => item.key),
    stops: stopPlaces.map((item) => ({ stopId: item.key, name: item.canonicalName, country: item.country, canonicalPlaceId: `fixture:${item.key}`, minimumNights: 1, recommendedNights: 2, reason: "Controlled benchmark stop.", sourceIds: [sourceId] })),
    connections: fixture.recordedConnections.map((connection) => ({
      fromStopId: connection.fromKey,
      toStopId: connection.toKey,
      mode: connection.mode,
      planningMinutes: connection.planningMinutes,
      note: "Controlled benchmark fact; verify live schedules before booking.",
      confidence: connection.mode === "unknown" ? "unknown" : "needs-review",
      sourceIds: [sourceId],
    })),
    coverage: { state: "fully-supported", reason: "The deterministic fixture follows its controlled route order." },
  } : undefined;
  return tripFromBuilder({
    id: `benchmark-${fixture.id}`,
    origin: fixture.origin.canonicalName,
    originCanonicalPlaceId: `fixture:${fixture.origin.key}`,
    originCountry: fixture.origin.country,
    originProviderId: `fixture:${fixture.origin.key}`,
    originCoordinates: fixture.origin.coordinates,
    stops: stopPlaces.map((item) => ({
      id: item.key,
      name: item.canonicalName,
      country: item.country,
      canonicalPlaceId: `fixture:${item.key}`,
      providerId: `fixture:${item.key}`,
      coordinates: item.coordinates,
      intent: item.semanticRole === "anchor" ? "landmark" : "place",
    })),
    startDate: "2027-04-01",
    endDate: end,
    picks: {},
    mustDo: fixture.anchorBaseRelationships.map((relationship) => fixture.destinations.find((item) => item.key === relationship.anchorKey)?.canonicalName).filter(Boolean).join(", "),
    pace: fixture.semantic.pace?.value === "packed" ? "full" : "slow",
    hotels: "few",
    budget: "mid",
    dayAllocations: Object.fromEntries(stopPlaces.map((item) => [item.key, 3])),
    nightAllocations,
    draft: [],
    structuredBrief: capture.structuredBrief,
    sourceRouteKey: curatedRoute?.routeKey,
    curatedRoute,
    intent: defaultTripIntent({ durationDays: totalNights + 1, stopIds: fixture.routeOrder, pace: fixture.semantic.pace?.value ?? "balanced" }),
  });
}

function fact(leg: TripLeg): Fact {
  return {
    from: leg.fromEndpoint?.name ?? leg.fromStopId,
    to: leg.toEndpoint?.name ?? leg.toStopId,
    mode: leg.mode,
    classification: leg.classification ?? null,
    durationMinutes: leg.doorToDoorMinutes ?? leg.durationMinutes,
  };
}

function crossSurfaceConsistent(trip: EasyTTrip) {
  const canonical = trip.legs.map(fact);
  const map = mapRouteLegsFromTrip(trip).map((leg): Fact => ({ from: leg.fromName, to: leg.toName, mode: leg.mode, classification: leg.classification, durationMinutes: leg.doorToDoorMinutes }));
  const luna = buildTripCopilotProjection(trip).trip.route.transfers.map((leg): Fact => ({ from: leg.from, to: leg.to, mode: leg.mode, classification: leg.classification, durationMinutes: leg.doorToDoorMinutes }));
  // Builder, Overview, Itinerary and Shape the day consume TripDocument.legs
  // directly. Map and Luna are the two actual projections checked here.
  return JSON.stringify(canonical) === JSON.stringify(map) && JSON.stringify(canonical) === JSON.stringify(luna);
}

function capabilityScores() {
  return Object.fromEntries(GLOBAL_ROUTING_CAPABILITIES.map((capability) => [capability, { earned: 0, possible: 0, percent: 0 }])) as Record<GlobalRoutingCapability, CapabilityScore>;
}

function finalizeScores(scores: Record<GlobalRoutingCapability, CapabilityScore>) {
  GLOBAL_ROUTING_CAPABILITIES.forEach((capability) => {
    const score = scores[capability];
    score.percent = score.possible ? Math.round((score.earned / score.possible) * 1000) / 10 : 100;
  });
  return scores;
}

async function evaluateFixture(fixture: GlobalRoutingFixture, options: RunnerOptions): Promise<{ result: GlobalRoutingFixtureResult; telemetry?: GlobalRoutingLiveTelemetry }> {
  const scores = capabilityScores();
  const diagnostics: GlobalRoutingDiagnostic[] = [];
  const check = (layer: GlobalRoutingCapability, ok: boolean, detail: Omit<GlobalRoutingDiagnostic, "layer" | "severity">, severity: GlobalRoutingDiagnostic["severity"] = "hard-failure") => {
    scores[layer].possible += 1;
    if (ok) scores[layer].earned += 1;
    else diagnostics.push({ ...detail, layer, severity });
  };

  const intentResult = options.mode === "live"
    ? await options.extractIntent?.(fixture) ?? { intent: null, error: "No live semantic extractor was supplied." }
    : { intent: recordedIntent(fixture) };
  const intent = intentResult.intent;
  const validation = intent ? validateSemanticTripIntent(intent, fixture.prompt) : null;
  check("semantic-understanding", Boolean(validation?.valid), {
    id: "validated-semantic-intent", failure: "Semantic intent was unavailable or invalid.", expected: "A source-grounded SemanticTripIntent.", actual: intentResult.error ?? (validation && !validation.valid ? validation.issues.map((item) => `${item.code}:${item.path}`).join(", ") : "missing"),
  });

  if (!intent || !validation?.valid) {
    const emptyCoverage = { expectedPlaceMentions: 0, resolvedPlaceMentions: 0, routeIntentMentions: 0, missingFromResolution: [], missingFromStructuredBrief: [], complete: false };
    return {
      result: {
        id: fixture.id, name: fixture.name, region: fixture.region, p0: Boolean(fixture.p0), outcome: "HARD FAILURE", scores: finalizeScores(scores), diagnostics,
        output: { mentionCoverage: emptyCoverage, retainedSources: [], unresolvedPlaceCount: 0, unknownTransferCount: 0, routeEndpoints: [], routeStopKeys: [], crossSurfaceConsistent: null, healthReady: null },
      },
      telemetry: intentResult.telemetry,
    };
  }

  const provider = options.placeProvider?.(fixture) ?? fixtureProvider(fixture);
  const capture = await captureJourneyBriefFromSemanticIntent(fixture.prompt, intent, provider, {
    countryNames: allFixturePlaces(fixture).map((item) => item.country).filter(Boolean),
  }, options.mode === "live" && intentResult.telemetry ? { model: intentResult.telemetry.model, status: "completed" } : undefined);
  const places = allFixturePlaces(fixture);
  const missingPlaces = places.filter((place) => !matchMention(place, capture.mentions));
  check("semantic-understanding", capture.mentionCoverage.complete && missingPlaces.length === 0, {
    id: "mention-coverage", failure: "Requested geography did not survive capture.", expected: `${places.length} retained origin/destination mentions with complete coverage.`, actual: `coverage=${JSON.stringify(capture.mentionCoverage)}; missing=${missingPlaces.map((item) => item.sourceText).join(", ") || "none"}`,
  });

  const destinationSources = new Set(capture.mentions.map((mention) => normalize(mention.sourceText)));
  const falseGeography = fixture.semantic.forbiddenGeographyTerms.filter((term) => destinationSources.has(normalize(term)));
  check("semantic-understanding", falseGeography.length === 0, {
    id: "preference-not-geography", failure: "A non-geographic preference was classified as a place.", expected: "Transport, pace and interest language stays outside destination intent.", actual: falseGeography.join(", ") || "none",
  });

  const roleMisses = fixture.destinations.filter((place) => {
    const mention = matchMention(place, capture.mentions);
    if (!mention) return true;
    if (place.semanticRole === "anchor") return mention.role !== "anchor"
      && !["anchor_or_poi", "needs_base_selection", "planning_area"].includes(mention.routability);
    if (place.semanticRole === "planning-area") return !["planning_area", "needs_base_selection"].includes(mention.routability);
    if (place.semanticRole === "ambiguous") return mention.status !== "ambiguous";
    if (place.semanticRole === "unresolved") return mention.status !== "unresolved";
    return mention.routability !== "direct_destination";
  });
  check("semantic-understanding", roleMisses.length === 0, {
    id: "role-classification", failure: "A place role changed across semantic capture.", expected: "Stops, planning areas, anchors and ambiguity remain distinct.", actual: roleMisses.map((item) => item.sourceText).join(", ") || "none",
  });

  const geographicMisses = fixture.destinations.filter((place) => {
    const mention = matchMention(place, capture.mentions);
    if (!mention || place.semanticRole === "ambiguous" || place.semanticRole === "unresolved") return !mention;
    const anchorTypes = place.semanticRole === "anchor" && ["landmark", "natural_area", "mountain_range", "valley"].includes(mention.placeType);
    return normalize(mention.canonicalName) !== normalize(place.canonicalName)
      || (!anchorTypes && mention.placeType !== place.placeType)
      || (place.country && !mention.parentCountries.some((country) => normalize(country) === normalize(place.country)));
  });
  check("geographic-resolution", geographicMisses.length === 0, {
    id: "entity-and-type", failure: "A resolved entity, type or country differed from the fixture evidence.", expected: "Correct compact provider identity and taxonomy.", actual: geographicMisses.map((item) => item.sourceText).join(", ") || "none",
  });

  const coordinateMisses = fixture.destinations
    .filter((place) => place.semanticRole === "anchor" || place.routability === "direct_destination")
    .filter((place) => options.mode === "live"
      ? !matchMention(place, capture.mentions)?.coordinates
      : !place.coordinates || !place.coordinates.every(Number.isFinite));
  check("geographic-resolution", coordinateMisses.length === 0, {
    id: "validated-coordinates", failure: "A resolved routable entity lost controlled coordinates.", expected: "Finite coordinates at the place-resolution boundary.", actual: coordinateMisses.map((item) => item.sourceText).join(", ") || "none",
  }, options.mode === "live" ? "warning" : "hard-failure");

  const relationshipMisses = fixture.anchorBaseRelationships.filter((relationship) => {
    const anchorPlace = fixture.destinations.find((item) => item.key === relationship.anchorKey);
    const basePlace = relationship.baseKey ? fixture.destinations.find((item) => item.key === relationship.baseKey) : undefined;
    const anchorMention = anchorPlace ? matchMention(anchorPlace, capture.mentions) : undefined;
    const baseMention = basePlace ? matchMention(basePlace, capture.mentions) : undefined;
    return !anchorMention || (basePlace && (!baseMention || !fixture.routeOrder.includes(basePlace.key)));
  });
  check("geographic-resolution", relationshipMisses.length === 0, {
    id: "anchor-base-separation", failure: "An anchor or its separately selected base disappeared.", expected: "Anchor intent remains alongside, not replaced by, any overnight base.", actual: relationshipMisses.map((item) => item.anchorKey).join(", ") || "none",
  });

  const trip = buildTrip(fixture, capture);
  const routeEndpoints = trip ? canonicalRouteEndpoints(trip).map((endpoint) => endpoint.name) : [];
  const expectedEndpoints = fixture.origin ? [fixture.origin.canonicalName, ...fixture.routeOrder.map((key) => fixture.destinations.find((item) => item.key === key)?.canonicalName ?? key)] : [];
  const shouldBuildRoute = Boolean(fixture.origin && fixture.routeOrder.length);
  check("route-integrity", shouldBuildRoute ? Boolean(trip) && JSON.stringify(routeEndpoints) === JSON.stringify(expectedEndpoints) : trip === null, {
    id: "canonical-route-sequence", failure: "Canonical origin/stop order did not match the validated fixture.", expected: expectedEndpoints.length ? expectedEndpoints.join(" → ") : "No canonical route until an origin is supplied.", actual: routeEndpoints.length ? routeEndpoints.join(" → ") : "no route",
  });
  check("route-integrity", !trip || trip.stops.length === fixture.routeOrder.length, {
    id: "no-inserted-or-dropped-stops", failure: "The canonical stop set changed.", expected: fixture.routeOrder.join(", ") || "no operational stops", actual: trip?.stops.map((stop) => stop.id).join(", ") ?? "no route",
  });
  check("route-integrity", !trip || trip.legs.length === trip.stops.length, {
    id: "origin-participation", failure: "The route omitted its origin-inclusive first leg.", expected: "One arrival leg plus one leg between each overnight stop.", actual: trip ? `${trip.legs.length} legs for ${trip.stops.length} stops` : "route gated",
  });
  if (fixture.originAlsoOvernight) {
    const firstStop = trip?.stops[0];
    check("route-integrity", Boolean(firstStop && fixture.origin && normalize(firstStop.name) === normalize(fixture.origin.canonicalName) && (firstStop.nights ?? 0) > 0), {
      id: "origin-overnight-role", failure: "An explicitly requested stay at the journey origin was collapsed into a transfer-only origin.", expected: `${fixture.origin?.canonicalName ?? "Origin"} remains both the journey origin and first overnight stop.`, actual: firstStop ? `${firstStop.name}, ${firstStop.nights} nights` : "no overnight stop",
    });
  }

  const integrityIssues = trip ? canonicalLegIntegrityIssues(trip) : [];
  const invalidKnownLegIssues = trip ? integrityIssues.filter((issue) => {
    const leg = issue.legId ? trip.legs.find((item) => item.id === issue.legId) : undefined;
    return !leg || leg.mode !== "unknown";
  }) : [];
  check("transfer-integrity", invalidKnownLegIssues.length === 0, {
    id: "physical-plausibility", failure: "A known transfer failed canonical integrity validation.", expected: "Implausible facts are invalidated to unknown.", actual: invalidKnownLegIssues.map((item) => item.message).join(" | ") || "none",
  });

  const unknownLegs = trip?.legs.filter((leg) => leg.mode === "unknown" || leg.durationMinutes === null) ?? [];
  const falsePrecision = unknownLegs.filter((leg) => leg.durationMinutes !== null || leg.doorToDoorMinutes !== null || leg.usableDayLoss !== null);
  check("transfer-integrity", falsePrecision.length === 0, {
    id: "unknown-state-correctness", failure: "Unknown transport retained precise timing or usable-day loss.", expected: "Unknown mode/timing stays null and requires checking.", actual: falsePrecision.map((leg) => leg.id).join(", ") || "none",
  });

  const requiredUnknownMisses = (fixture.requiredUnknownLegs ?? []).filter((expected) => !unknownLegs.some((leg) => legKey(leg.fromEndpoint?.name ?? "", leg.toEndpoint?.name ?? "") === expected));
  check("transfer-integrity", requiredUnknownMisses.length === 0, {
    id: "required-uncertainty", failure: "A fixture-required unknown transfer became a supported claim.", expected: (fixture.requiredUnknownLegs ?? []).join(", ") || "none", actual: requiredUnknownMisses.join(", ") || "all remained unknown",
  });

  const forbiddenModeHits = trip?.legs.flatMap((leg) => {
    const key = legKey(leg.fromEndpoint?.name ?? "", leg.toEndpoint?.name ?? "");
    return fixture.forbiddenModesByLeg?.[key]?.includes(leg.mode) ? [`${key}:${leg.mode}`] : [];
  }) ?? [];
  check("transfer-integrity", forbiddenModeHits.length === 0, {
    id: "mode-validity", failure: "A physically or evidentially unsupported transport mode was accepted.", expected: "Forbidden leg/mode pairs never become canonical.", actual: forbiddenModeHits.join(", ") || "none",
  });

  const provenanceMisses = trip?.legs.filter((leg) => !leg.provenance || !leg.confidence || typeof leg.scheduleNeedsChecking !== "boolean") ?? [];
  check("transfer-integrity", provenanceMisses.length === 0, {
    id: "provenance-confidence", failure: "A canonical leg omitted provenance, confidence or schedule-check state.", expected: "Every leg carries the canonical evidence contract.", actual: provenanceMisses.map((leg) => leg.id).join(", ") || "none",
  });

  const unresolvedPlaceCount = capture.mentions.filter((mention) => mention.status !== "resolved" || mention.routability !== "direct_destination").length;
  const health = trip ? tripHealth(trip) : null;
  check("product-truthfulness", unresolvedPlaceCount === 0 || !health?.isReady, {
    id: "unresolved-route-gating", failure: "Trip Health reported ready while required geography remained unresolved.", expected: "Unresolved or base-required geography blocks readiness.", actual: `unresolved=${unresolvedPlaceCount}; ready=${health?.isReady ?? false}`,
  });

  const consistent = trip && fixture.crossSurface ? crossSurfaceConsistent(trip) : null;
  check("product-truthfulness", consistent !== false, {
    id: "cross-surface-canonical-legs", failure: "Map or Luna projected transfer facts that differ from TripDocument.legs.", expected: "Builder, Overview, Map, Itinerary, Shape the day and Luna share canonical legs.", actual: "projection mismatch",
  });

  if (fixture.p0 && trip) {
    const first = trip.legs[0];
    const tulumMexico = trip.legs.find((leg) => normalize(leg.fromEndpoint?.name ?? "") === "tulum" && normalize(leg.toEndpoint?.name ?? "") === "mexico city");
    check("route-integrity", first?.fromEndpoint?.kind === "origin" && first.fromEndpoint.name === "London" && first.toEndpoint?.name === "Cancún", {
      id: "p0-first-leg", failure: "London did not participate in the first canonical route leg.", expected: "London → Cancún arrival leg.", actual: first ? `${first.fromEndpoint?.name} → ${first.toEndpoint?.name}` : "missing",
    });
    check("route-integrity", !routeEndpoints.some((name) => normalize(name) === "guatemala city"), {
      id: "p0-no-substitute", failure: "An unrelated substitute city was introduced.", expected: "No Guatemala City.", actual: routeEndpoints.join(" → "),
    });
    check("transfer-integrity", tulumMexico?.mode !== "road", {
      id: "p0-tulum-mexico-city", failure: "Tulum → Mexico City was accepted as a road transfer.", expected: "Flight or explicitly unknown; never a 2h30 road claim.", actual: tulumMexico?.mode ?? "missing",
    });
    check("semantic-understanding", capture.mentionCoverage.expectedPlaceMentions === 8 && capture.mentionCoverage.complete, {
      id: "p0-eight-of-eight", failure: "The P0 mention-coverage invariant regressed.", expected: "8 expected, 8 retained, 0 missing.", actual: JSON.stringify(capture.mentionCoverage),
    });
  }

  const hardFailures = diagnostics.filter((item) => item.severity === "hard-failure");
  const warnings = diagnostics.filter((item) => item.severity === "warning");
  const expectedUncertainty = !trip || unresolvedPlaceCount > 0 || unknownLegs.length > 0;
  const outcome: GlobalRoutingOutcome = hardFailures.length ? "HARD FAILURE" : warnings.length ? "WARNING" : expectedUncertainty ? "PASS WITH EXPECTED UNCERTAINTY" : "PASS";
  return {
    result: {
      id: fixture.id,
      name: fixture.name,
      region: fixture.region,
      p0: Boolean(fixture.p0),
      outcome,
      scores: finalizeScores(scores),
      diagnostics,
      output: {
        mentionCoverage: capture.mentionCoverage,
        retainedSources: capture.mentions.map((mention) => mention.sourceText),
        unresolvedPlaceCount,
        unknownTransferCount: unknownLegs.length,
        routeEndpoints,
        routeStopKeys: trip?.stops.map((stop) => stop.id) ?? [],
        crossSurfaceConsistent: consistent,
        healthReady: health?.isReady ?? null,
      },
    },
    telemetry: intentResult.telemetry,
  };
}

function aggregateScores(results: GlobalRoutingFixtureResult[]) {
  const scores = capabilityScores();
  results.forEach((result) => GLOBAL_ROUTING_CAPABILITIES.forEach((capability) => {
    scores[capability].earned += result.scores[capability].earned;
    scores[capability].possible += result.scores[capability].possible;
  }));
  return finalizeScores(scores);
}

export async function runGlobalRoutingBenchmark(options: RunnerOptions = {}): Promise<GlobalRoutingSummary> {
  const rawCaptureGate = runRawPromptCaptureGate();
  if (!rawCaptureGate.complete) throw new Error(`Raw-prompt capture gate failed before routing: ${rawCaptureGate.failures.join(" | ")}`);
  const mode = options.mode ?? "deterministic";
  const fixtures = options.fixtures ?? GLOBAL_ROUTING_FIXTURES;
  const evaluated = [] as Array<{ result: GlobalRoutingFixtureResult; telemetry?: GlobalRoutingLiveTelemetry }>;
  for (const fixture of fixtures) evaluated.push(await evaluateFixture(fixture, { ...options, mode }));
  const results = evaluated.map((item) => item.result);
  const telemetry = evaluated.flatMap((item) => item.telemetry ?? []);
  const tokensKnown = telemetry.every((item) => item.usage && [item.usage.inputTokens, item.usage.outputTokens, item.usage.totalTokens].every((value) => typeof value === "number"));
  const costsKnown = telemetry.every((item) => typeof item.cost?.approximateUsd === "number");
  return {
    version: GLOBAL_ROUTING_BENCHMARK_VERSION,
    mode,
    fixtureCount: fixtures.length,
    outcomes: Object.fromEntries((["PASS", "PASS WITH EXPECTED UNCERTAINTY", "WARNING", "HARD FAILURE"] as GlobalRoutingOutcome[]).map((outcome) => [outcome, results.filter((result) => result.outcome === outcome).length])) as Record<GlobalRoutingOutcome, number>,
    scores: aggregateScores(results),
    p0RegressionFailures: results.filter((result) => result.p0 && result.outcome === "HARD FAILURE").map((result) => result.id),
    unknownTransferCount: results.reduce((total, result) => total + result.output.unknownTransferCount, 0),
    unresolvedPlaceCount: results.reduce((total, result) => total + result.output.unresolvedPlaceCount, 0),
    results,
    live: mode === "live" ? {
      calls: telemetry.length,
      latencyMs: telemetry.reduce((total, item) => total + item.latencyMs, 0),
      inputTokens: tokensKnown ? telemetry.reduce((total, item) => total + (item.usage?.inputTokens ?? 0), 0) : null,
      outputTokens: tokensKnown ? telemetry.reduce((total, item) => total + (item.usage?.outputTokens ?? 0), 0) : null,
      totalTokens: tokensKnown ? telemetry.reduce((total, item) => total + (item.usage?.totalTokens ?? 0), 0) : null,
      estimatedCostUsd: costsKnown ? Number(telemetry.reduce((total, item) => total + (item.cost?.approximateUsd ?? 0), 0).toFixed(6)) : null,
    } : null,
  };
}

export function comparableGlobalRoutingSnapshot(summary: GlobalRoutingSummary) {
  return {
    version: summary.version,
    fixtureCount: summary.fixtureCount,
    outcomes: summary.outcomes,
    scores: summary.scores,
    p0RegressionFailures: summary.p0RegressionFailures,
    unknownTransferCount: summary.unknownTransferCount,
    unresolvedPlaceCount: summary.unresolvedPlaceCount,
    results: summary.results.map((result) => ({
      id: result.id,
      outcome: result.outcome,
      scores: result.scores,
      hardFailures: result.diagnostics.filter((item) => item.severity === "hard-failure").map((item) => item.id),
      warnings: result.diagnostics.filter((item) => item.severity === "warning").map((item) => item.id),
      unknownTransferCount: result.output.unknownTransferCount,
      unresolvedPlaceCount: result.output.unresolvedPlaceCount,
      routeEndpoints: result.output.routeEndpoints,
      crossSurfaceConsistent: result.output.crossSurfaceConsistent,
    })),
  };
}

export type ComparableGlobalRoutingSnapshot = ReturnType<typeof comparableGlobalRoutingSnapshot>;

export function compareGlobalRoutingSnapshots(baseline: ComparableGlobalRoutingSnapshot, current: ComparableGlobalRoutingSnapshot) {
  const changes: string[] = [];
  if (baseline.fixtureCount !== current.fixtureCount) changes.push(`fixture count changed: ${baseline.fixtureCount} → ${current.fixtureCount}`);
  GLOBAL_ROUTING_CAPABILITIES.forEach((capability) => {
    if (JSON.stringify(baseline.scores[capability]) !== JSON.stringify(current.scores[capability])) changes.push(`${capability} score changed: ${JSON.stringify(baseline.scores[capability])} → ${JSON.stringify(current.scores[capability])}`);
  });
  const before = new Map(baseline.results.map((result) => [result.id, result]));
  current.results.forEach((result) => {
    const previous = before.get(result.id);
    if (!previous) changes.push(`${result.id}: new fixture`);
    else if (JSON.stringify(previous) !== JSON.stringify(result)) changes.push(`${result.id}: outcome or canonical facts changed`);
  });
  baseline.results.forEach((result) => { if (!current.results.some((item) => item.id === result.id)) changes.push(`${result.id}: fixture removed`); });
  return changes;
}
