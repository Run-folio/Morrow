import { resolvePlaceMentions } from "../../lib/easyt/place-intelligence.ts";
import { extractStructuredTripBrief, type StructuredTripBrief } from "../../lib/easyt/structured-trip-brief.ts";
import { PLACE_INTELLIGENCE_FIXTURES, type ExpectedPlaceMention, type PlaceIntelligenceFixture } from "./fixtures.ts";

export type PlaceBenchmarkDimension =
  | "place-mention-recall"
  | "phrase-boundary-accuracy"
  | "place-type-accuracy"
  | "alias-canonicalization"
  | "role-negation-accuracy"
  | "ambiguity-honesty"
  | "region-preservation"
  | "no-false-city-collapse"
  | "structured-brief-projection"
  | "exact-place-regression"
  | "unsupported-claim-avoidance";

export type PlaceBenchmarkStatus = "pass" | "warning" | "fail";

export type PlaceBenchmarkFinding = {
  id: string;
  dimension: PlaceBenchmarkDimension;
  status: PlaceBenchmarkStatus;
  message: string;
};

type ResolvedOutput = ReturnType<typeof resolvePlaceMentions>;
type ResolvedMention = ResolvedOutput["mentions"][number];

export type ComparableMention = {
  sourceText: string;
  sourceTexts: string[];
  canonicalPlaceId: string | null;
  canonicalName: string;
  placeType: string;
  status: string;
  routability: string;
  role: string;
  parentCountries: string[];
  order: number;
};

export type PlaceBenchmarkResult = {
  id: string;
  name: string;
  cohort: PlaceIntelligenceFixture["cohort"];
  prompt: string;
  parserVersion: string;
  output: {
    sequenceKind: string;
    mentions: ComparableMention[];
    issueCodes: string[];
    projectedDestinationIds: string[];
    projectedDestinationNames: string[];
    projectedRegionNames: string[];
    projectedPlaceIds: string[];
    projectedIssueCodes: string[];
  };
  findings: PlaceBenchmarkFinding[];
  unacceptableFailures: string[];
  acceptableVariations: string[];
  qualitativeReview: string;
};

export type PlaceBenchmarkSummary = {
  generatedBy: "current-deterministic-place-intelligence";
  fixtureCount: number;
  results: PlaceBenchmarkResult[];
  totals: Record<PlaceBenchmarkStatus, number>;
  dimensions: Record<PlaceBenchmarkDimension, Record<PlaceBenchmarkStatus, number>>;
};

type ProjectedBrief = StructuredTripBrief & {
  placeMentions?: ResolvedMention[];
  placeIssues?: ResolvedOutput["issues"];
};

type ProjectedDestination = StructuredTripBrief["destinations"][number] & {
  canonicalPlaceId?: string;
};

const normalizeText = (value: string) => value
  .toLocaleLowerCase()
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/[’']/g, "'")
  .replace(/\s+/g, " ")
  .trim();

const finding = (
  id: string,
  dimension: PlaceBenchmarkDimension,
  status: PlaceBenchmarkStatus,
  message: string,
): PlaceBenchmarkFinding => ({ id, dimension, status, message });

const mentionSourceTexts = (mention: ResolvedMention) => {
  const values = [mention.sourceText, ...((mention as ResolvedMention & { sourceTexts?: string[] }).sourceTexts ?? [])];
  return values.filter((value, index, all) => Boolean(value) && all.findIndex((other) => normalizeText(other) === normalizeText(value)) === index);
};

const comparableMention = (mention: ResolvedMention): ComparableMention => ({
  sourceText: mention.sourceText,
  sourceTexts: mentionSourceTexts(mention),
  canonicalPlaceId: mention.canonicalPlaceId ?? null,
  canonicalName: mention.canonicalName,
  placeType: mention.placeType,
  status: mention.status,
  routability: mention.routability,
  role: mention.role,
  parentCountries: [...mention.parentCountries].sort((a, b) => a.localeCompare(b)),
  order: mention.order,
});

function exactSourceMatch(expected: ExpectedPlaceMention, actual: ResolvedMention) {
  const actualSources = mentionSourceTexts(actual).map(normalizeText);
  const expectedSources = (expected.sourceTexts ?? [expected.sourceText]).map(normalizeText);
  return expectedSources.every((source) => actualSources.includes(source));
}

function identityMatch(expected: ExpectedPlaceMention, actual: ResolvedMention) {
  if (expected.canonicalPlaceId && actual.canonicalPlaceId === expected.canonicalPlaceId) return true;
  if (expected.canonicalName && normalizeText(actual.canonicalName) === normalizeText(expected.canonicalName)) return true;
  return mentionSourceTexts(actual).some((source) => normalizeText(source) === normalizeText(expected.sourceText));
}

function matchExpectedMentions(fixture: PlaceIntelligenceFixture, actual: ResolvedMention[]) {
  const used = new Set<number>();
  return fixture.expectedMentions.map((expected) => {
    const exact = actual.findIndex((mention, index) => !used.has(index) && exactSourceMatch(expected, mention));
    const index = exact >= 0 ? exact : actual.findIndex((mention, candidateIndex) => !used.has(candidateIndex) && identityMatch(expected, mention));
    if (index >= 0) used.add(index);
    return { expected, actual: index >= 0 ? actual[index] : undefined, exactSource: exact >= 0 };
  });
}

const projectedMentions = (brief: ProjectedBrief) => brief.placeMentions ?? [];
const projectedIssues = (brief: ProjectedBrief) => brief.placeIssues ?? [];

function projectionFindings(
  fixture: PlaceIntelligenceFixture,
  brief: ProjectedBrief,
): PlaceBenchmarkFinding[] {
  const projected = projectedMentions(brief);
  const matches = matchExpectedMentions(fixture, projected);
  const missing = matches.filter((match) => !match.actual).map((match) => match.expected.sourceText);
  const findings = [finding(
    "all-place-intent-projected",
    "structured-brief-projection",
    missing.length ? "fail" : "pass",
    missing.length ? `StructuredTripBrief lost: ${missing.join(", ")}.` : "Every expected place mention survives in StructuredTripBrief place metadata.",
  )];

  const positiveDirect = fixture.expectedMentions.filter((mention) =>
    mention.statuses.includes("resolved")
    && mention.routabilities.includes("direct_destination")
    && !mention.roles.includes("excluded"),
  );
  const destinationMisses = positiveDirect.filter((expected) => !brief.destinations.some((destination) =>
    (expected.canonicalPlaceId && (destination as ProjectedDestination).canonicalPlaceId === expected.canonicalPlaceId)
    || normalizeText(destination.name) === normalizeText(expected.canonicalName ?? expected.sourceText),
  ));
  if (positiveDirect.length) findings.push(finding(
    "direct-destinations-projected",
    "structured-brief-projection",
    destinationMisses.length ? "fail" : "pass",
    destinationMisses.length
      ? `Direct destination projection missed: ${destinationMisses.map((item) => item.sourceText).join(", ")}.`
      : "Resolved direct destinations project into the canonical destination list.",
  ));

  const excluded = fixture.expectedMentions.filter((expected) => expected.roles.includes("excluded"))
    .filter((expected) => brief.destinations.some((destination) =>
    (expected.canonicalPlaceId && (destination as ProjectedDestination).canonicalPlaceId === expected.canonicalPlaceId)
    || normalizeText(destination.name) === normalizeText(expected.canonicalName ?? expected.sourceText),
  ));
  if (excluded.length) findings.push(finding(
    "excluded-destinations-not-projected",
    "structured-brief-projection",
    "fail",
    `Excluded mentions became destinations: ${excluded.map((item) => item.sourceText).join(", ")}.`,
  ));

  const unresolvedMadeOperational = fixture.expectedMentions.filter((expected) =>
    expected.statuses.includes("unresolved") || expected.statuses.includes("ambiguous"),
  ).filter((expected) => brief.destinations.some((destination) => (
    ((expected.canonicalPlaceId && (destination as ProjectedDestination).canonicalPlaceId === expected.canonicalPlaceId)
      || normalizeText(destination.name) === normalizeText(expected.canonicalName ?? expected.sourceText))
    && (Boolean(destination.id) || destination.resolutionStatus === "resolved")
  )));
  if (unresolvedMadeOperational.length) findings.push(finding(
    "unresolved-destinations-remain-non-operational",
    "structured-brief-projection",
    "fail",
    `Unresolved mentions became operational route stops: ${unresolvedMadeOperational.map((item) => item.sourceText).join(", ")}.`,
  ));

  return findings;
}

export function evaluatePlaceFixture(fixture: PlaceIntelligenceFixture): PlaceBenchmarkResult {
  const resolution = resolvePlaceMentions(fixture.prompt);
  const brief = extractStructuredTripBrief(fixture.prompt) as ProjectedBrief;
  const matches = matchExpectedMentions(fixture, resolution.mentions);
  const findings: PlaceBenchmarkFinding[] = [];
  const missing = matches.filter((match) => !match.actual).map((match) => match.expected.sourceText);
  const unexpected = resolution.mentions.filter((mention) => !matches.some((match) => match.actual === mention));

  findings.push(finding(
    "expected-place-mention-recall",
    "place-mention-recall",
    missing.length ? "fail" : "pass",
    missing.length ? `Missing expected phrases: ${missing.join(", ")}.` : "Every expected place phrase was retained.",
  ));
  findings.push(finding(
    "no-spurious-place-mentions",
    "unsupported-claim-avoidance",
    unexpected.length ? "fail" : "pass",
    unexpected.length ? `Unexpected place claims: ${unexpected.map((item) => item.sourceText).join(", ")}.` : "No extra place claim was invented.",
  ));

  const boundaryMisses = matches.filter((match) => match.actual && !match.exactSource).map((match) => match.expected.sourceText);
  findings.push(finding(
    "exact-phrase-boundaries",
    "phrase-boundary-accuracy",
    boundaryMisses.length ? "fail" : "pass",
    boundaryMisses.length ? `Original phrase boundaries were not preserved for: ${boundaryMisses.join(", ")}.` : "Original multi-word phrase boundaries were preserved.",
  ));

  const typeMisses = matches.filter((match) => match.actual && !match.expected.placeTypes.includes(match.actual.placeType)).map((match) => `${match.expected.sourceText}→${match.actual!.placeType}`);
  findings.push(finding(
    "expected-place-types",
    "place-type-accuracy",
    typeMisses.length ? "fail" : "pass",
    typeMisses.length ? `Unexpected place types: ${typeMisses.join(", ")}.` : "Resolved place types match the fixture contract.",
  ));

  const statusMisses = matches.filter((match) => match.actual && !match.expected.statuses.includes(match.actual.status)).map((match) => `${match.expected.sourceText}→${match.actual!.status}`);
  findings.push(finding(
    "resolution-status-honesty",
    "ambiguity-honesty",
    statusMisses.length ? "fail" : "pass",
    statusMisses.length ? `Unexpected resolution states: ${statusMisses.join(", ")}.` : "Resolved, ambiguous and unresolved states match the evidence available to the fixture.",
  ));

  const routabilityMisses = matches.filter((match) => match.actual && !match.expected.routabilities.includes(match.actual.routability)).map((match) => `${match.expected.sourceText}→${match.actual!.routability}`);
  findings.push(finding(
    "expected-routability",
    "unsupported-claim-avoidance",
    routabilityMisses.length ? "fail" : "pass",
    routabilityMisses.length ? `Unsupported routability: ${routabilityMisses.join(", ")}.` : "Routability stays within the expected evidence boundary.",
  ));
  const uncertainClaims = matches.filter((match) => match.actual
    && (match.expected.statuses.includes("ambiguous") || match.expected.statuses.includes("unresolved"))
    && Boolean(match.actual.canonicalPlaceId)).map((match) => `${match.expected.sourceText}→${match.actual!.canonicalPlaceId}`);
  if (fixture.expectedMentions.some((item) => item.statuses.includes("ambiguous") || item.statuses.includes("unresolved"))) findings.push(finding(
    "uncertain-mentions-have-no-false-identity",
    "unsupported-claim-avoidance",
    uncertainClaims.length ? "fail" : "pass",
    uncertainClaims.length ? `Uncertain phrases received unsupported canonical identities: ${uncertainClaims.join(", ")}.` : "Ambiguous and unresolved phrases carry no fabricated canonical identity.",
  ));

  const roleRelevant = fixture.cohort === "roles-and-negation" || fixture.expectedMentions.some((item) => item.roles.some((role) => role !== "preferred"));
  if (roleRelevant) {
    const roleMisses = matches.filter((match) => match.actual && !match.expected.roles.includes(match.actual.role)).map((match) => `${match.expected.sourceText}→${match.actual!.role}`);
    findings.push(finding(
      "expected-place-roles",
      "role-negation-accuracy",
      roleMisses.length ? "fail" : "pass",
      roleMisses.length ? `Unexpected roles: ${roleMisses.join(", ")}.` : "Required, optional, gateway and excluded roles remain distinct.",
    ));
  }

  const aliasRelevant = fixture.cohort === "aliases-and-multilingual-names" || fixture.expectedMentions.some((item) => item.sourceTexts && item.sourceTexts.length > 1);
  if (aliasRelevant) {
    const identityMisses = matches.filter((match) => match.actual && match.expected.canonicalPlaceId && match.actual.canonicalPlaceId !== match.expected.canonicalPlaceId).map((match) => `${match.expected.sourceText}→${match.actual!.canonicalPlaceId ?? "none"}`);
    const expectedIds = fixture.expectedMentions.flatMap((item) => item.canonicalPlaceId ?? []);
    const duplicateIds = resolution.mentions.filter((mention, index, all) => mention.canonicalPlaceId && all.findIndex((other) => other.canonicalPlaceId === mention.canonicalPlaceId) !== index).map((mention) => mention.canonicalPlaceId!);
    findings.push(finding(
      "alias-canonical-identity",
      "alias-canonicalization",
      identityMisses.length || duplicateIds.some((id) => expectedIds.includes(id)) ? "fail" : "pass",
      identityMisses.length
        ? `Alias identity mismatch: ${identityMisses.join(", ")}.`
        : duplicateIds.length ? `Duplicate canonical identities: ${duplicateIds.join(", ")}.` : "Aliases share stable canonical identities without duplicate route mentions.",
    ));
  }

  const regional = matches.filter((match) => match.expected.routabilities.some((value) => value === "planning_area" || value === "needs_base_selection"));
  if (regional.length) {
    const lost = regional.filter((match) => !match.actual || match.actual.routability === "direct_destination").map((match) => match.expected.sourceText);
    findings.push(finding(
      "planning-areas-preserved",
      "region-preservation",
      lost.length ? "fail" : "pass",
      lost.length ? `Planning areas were lost or made directly routable: ${lost.join(", ")}.` : "Broad planning areas remain explicit and non-city-like.",
    ));
    const collapses = regional.filter((match) => match.actual && (
      match.actual.placeType === "city"
      || match.expected.forbiddenCanonicalNames?.some((name) => normalizeText(name) === normalizeText(match.actual!.canonicalName))
    )).map((match) => `${match.expected.sourceText}→${match.actual!.canonicalName}`);
    findings.push(finding(
      "no-false-city-collapse",
      "no-false-city-collapse",
      collapses.length ? "fail" : "pass",
      collapses.length ? `Broad intent collapsed to a city/base: ${collapses.join(", ")}.` : "No planning area was rewritten to an arbitrary city or base.",
    ));
  }

  const containmentMisses = matches.filter((match) => match.actual && match.expected.parentCountries.length && JSON.stringify([...match.expected.parentCountries].sort()) !== JSON.stringify([...match.actual.parentCountries].sort())).map((match) => match.expected.sourceText);
  if (fixture.expectedMentions.some((item) => item.parentCountries.length)) findings.push(finding(
    "stable-country-containment",
    "place-type-accuracy",
    containmentMisses.length ? "fail" : "pass",
    containmentMisses.length ? `Stable country containment missing for: ${containmentMisses.join(", ")}.` : "Known parent-country containment is retained.",
  ));

  const expectedIssueCodes = fixture.expectedIssueCodes ?? [];
  const actualIssueCodes = resolution.issues.map((issue) => issue.code);
  const malformedIssues = resolution.issues.filter((issue) => !["info", "warning", "error"].includes(issue.severity) || typeof issue.blocksRoute !== "boolean");
  findings.push(finding(
    "structured-issue-contract",
    "ambiguity-honesty",
    malformedIssues.length ? "fail" : "pass",
    malformedIssues.length ? `Malformed issue contract: ${malformedIssues.map((issue) => issue.code).join(", ")}.` : "Every issue carries an exact severity and route-blocking decision.",
  ));
  const missingIssues = expectedIssueCodes.filter((code) => !actualIssueCodes.includes(code));
  if (expectedIssueCodes.length) findings.push(finding(
    "expected-resolution-issues",
    "ambiguity-honesty",
    missingIssues.length ? "fail" : "pass",
    missingIssues.length ? `Missing structured issues: ${missingIssues.join(", ")}.` : "Expected clarification and resolution issues are structured.",
  ));

  if (fixture.expectedSequenceKind) findings.push(finding(
    "sequence-kind",
    "place-mention-recall",
    resolution.sequenceKind === fixture.expectedSequenceKind ? "pass" : "fail",
    `Expected ${fixture.expectedSequenceKind}; resolver returned ${resolution.sequenceKind}.`,
  ));

  if (fixture.cohort === "exact-place-regression") {
    const unresolvedExact = matches.filter((match) => !match.actual || !match.expected.statuses.includes(match.actual.status)).map((match) => match.expected.sourceText);
    findings.push(finding(
      "existing-exact-place-regression",
      "exact-place-regression",
      unresolvedExact.length ? "fail" : "pass",
      unresolvedExact.length ? `Existing exact behaviour regressed for: ${unresolvedExact.join(", ")}.` : "Existing exact-place behaviour remains resolved and typed.",
    ));
  }

  findings.push(...projectionFindings(fixture, brief));

  return {
    id: fixture.id,
    name: fixture.name,
    cohort: fixture.cohort,
    prompt: fixture.prompt,
    parserVersion: resolution.parserVersion,
    output: {
      sequenceKind: resolution.sequenceKind,
      mentions: resolution.mentions.map(comparableMention),
      issueCodes: resolution.issues.map((issue) => issue.code).sort(),
      projectedDestinationIds: brief.destinations.flatMap((destination) => (destination as ProjectedDestination).canonicalPlaceId ?? []).sort(),
      projectedDestinationNames: brief.destinations.map((destination) => destination.name),
      projectedRegionNames: brief.preferredRegions.map((region) => region.value),
      projectedPlaceIds: projectedMentions(brief).flatMap((mention) => mention.canonicalPlaceId ?? []).sort(),
      projectedIssueCodes: projectedIssues(brief).map((issue) => issue.code).sort(),
    },
    findings,
    unacceptableFailures: fixture.unacceptableFailures,
    acceptableVariations: fixture.acceptableVariations,
    qualitativeReview: fixture.qualitativeReview,
  };
}

const dimensions = (): PlaceBenchmarkSummary["dimensions"] => ({
  "place-mention-recall": { pass: 0, warning: 0, fail: 0 },
  "phrase-boundary-accuracy": { pass: 0, warning: 0, fail: 0 },
  "place-type-accuracy": { pass: 0, warning: 0, fail: 0 },
  "alias-canonicalization": { pass: 0, warning: 0, fail: 0 },
  "role-negation-accuracy": { pass: 0, warning: 0, fail: 0 },
  "ambiguity-honesty": { pass: 0, warning: 0, fail: 0 },
  "region-preservation": { pass: 0, warning: 0, fail: 0 },
  "no-false-city-collapse": { pass: 0, warning: 0, fail: 0 },
  "structured-brief-projection": { pass: 0, warning: 0, fail: 0 },
  "exact-place-regression": { pass: 0, warning: 0, fail: 0 },
  "unsupported-claim-avoidance": { pass: 0, warning: 0, fail: 0 },
});

export function runPlaceIntelligenceBenchmarks(fixtures = PLACE_INTELLIGENCE_FIXTURES): PlaceBenchmarkSummary {
  const results = fixtures.map(evaluatePlaceFixture);
  const totals = { pass: 0, warning: 0, fail: 0 };
  const byDimension = dimensions();
  results.forEach((result) => result.findings.forEach((item) => {
    totals[item.status] += 1;
    byDimension[item.dimension][item.status] += 1;
  }));
  return {
    generatedBy: "current-deterministic-place-intelligence",
    fixtureCount: fixtures.length,
    results,
    totals,
    dimensions: byDimension,
  };
}

export function comparablePlaceSnapshot(summary: PlaceBenchmarkSummary) {
  return {
    generatedBy: summary.generatedBy,
    fixtureCount: summary.fixtureCount,
    totals: summary.totals,
    dimensions: summary.dimensions,
    results: summary.results.map((result) => ({
      id: result.id,
      parserVersion: result.parserVersion,
      output: result.output,
      findings: result.findings.map(({ id, dimension, status }) => ({ id, dimension, status })),
    })),
  };
}

export type ComparablePlaceSnapshot = ReturnType<typeof comparablePlaceSnapshot>;

export function comparePlaceSnapshots(expected: ComparablePlaceSnapshot, actual: ComparablePlaceSnapshot) {
  const changes: string[] = [];
  if (expected.fixtureCount !== actual.fixtureCount) changes.push(`fixture count changed: ${expected.fixtureCount} → ${actual.fixtureCount}`);
  if (JSON.stringify(expected.totals) !== JSON.stringify(actual.totals)) changes.push(`totals changed: ${JSON.stringify(expected.totals)} → ${JSON.stringify(actual.totals)}`);
  Object.keys(actual.dimensions).forEach((dimension) => {
    const key = dimension as keyof ComparablePlaceSnapshot["dimensions"];
    if (JSON.stringify(expected.dimensions[key]) !== JSON.stringify(actual.dimensions[key])) {
      changes.push(`${dimension} changed: ${JSON.stringify(expected.dimensions[key])} → ${JSON.stringify(actual.dimensions[key])}`);
    }
  });
  const expectedById = new Map(expected.results.map((result) => [result.id, result]));
  const actualById = new Map(actual.results.map((result) => [result.id, result]));
  expected.results.forEach((result) => {
    const current = actualById.get(result.id);
    if (!current) changes.push(`${result.id}: fixture removed`);
    else if (JSON.stringify(result) !== JSON.stringify(current)) changes.push(`${result.id}: output or findings changed`);
  });
  actual.results.forEach((result) => {
    if (!expectedById.has(result.id)) changes.push(`${result.id}: fixture added`);
  });
  return changes;
}
