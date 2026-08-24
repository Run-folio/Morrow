import { captureJourneyBrief } from "../../lib/easyt/journey-capture.ts";
import { assessRouteIntelligence } from "../../lib/easyt/planner.ts";
import { mergeStructuredTripBrief, routeConstraintsFromStructuredTripBrief, routeScoringPreferencesFromStructuredBrief } from "../../lib/easyt/structured-trip-brief.ts";
import { PROMPT_ENGINE_CASES, PROMPT_ENGINE_DIMENSIONS, type PromptEngineCase, type PromptEngineDimension } from "./fixtures.ts";

export type PromptEngineResult = {
  id: string;
  name: string;
  score: number;
  dimensions: Record<PromptEngineDimension, number>;
  deterministicFailures: string[];
  expectedWarnings: string[];
  reviewNotes: string[];
};

export type PromptEngineSummary = {
  total: number;
  maxTotal: number;
  dimensions: Record<PromptEngineDimension, number>;
  results: PromptEngineResult[];
};

const has = <T>(values: readonly T[], value: T) => values.includes(value);
const score = (ok: boolean) => ok ? 2 : 0;

function routeAssessment(scenario: PromptEngineCase, brief: ReturnType<typeof captureJourneyBrief>["structuredBrief"]) {
  if (!scenario.recordedPlan) return undefined;
  const idsByName = new Map(scenario.recordedPlan.stops.map((stop) => [stop.name.toLocaleLowerCase(), stop.id]));
  const operationalBrief = mergeStructuredTripBrief(brief, {
    destinations: brief.destinations.flatMap((destination) => {
      const id = idsByName.get(destination.name.toLocaleLowerCase());
      return id ? [{ ...destination, id }] : [];
    }),
  });
  return assessRouteIntelligence({
    origin: scenario.recordedPlan.origin,
    stops: scenario.recordedPlan.stops,
    picks: {},
    availableDays: operationalBrief.duration ? operationalBrief.duration.value + (operationalBrief.duration.unit === "nights" ? 1 : 0) : 0,
    constraints: routeConstraintsFromStructuredTripBrief(operationalBrief),
    scoringPreferences: routeScoringPreferencesFromStructuredBrief(operationalBrief),
  });
}

export function evaluatePromptEngineCase(scenario: PromptEngineCase): PromptEngineResult {
  const capture = captureJourneyBrief(scenario.rawPrompt);
  const brief = capture.structuredBrief;
  const assessment = routeAssessment(scenario, brief);
  const expected = scenario.expectedHardFacts;
  const actualIds = brief.placeMentions?.flatMap((mention) => mention.canonicalPlaceId ?? []) ?? [];
  const actualConstraints = brief.hardConstraints.map((constraint) => constraint.type);
  const actualIssues = [...(brief.placeIssues ?? []).map((issue) => issue.code), ...brief.issues.map((issue) => issue.code)];
  const failures: string[] = [];
  const warningChecks = scenario.expectedWarningsOrConflicts.map((warning) => {
    if (warning === "shortfall") return Boolean(assessment?.shortfallDays);
    if (warning === "required-stops-exceed-maximum") return Boolean(assessment?.route.constraintIssues?.some((issue) => issue.code === warning));
    return has(actualIssues, warning as never);
  });
  const intentOk = (expected.durationDays === undefined || brief.duration?.value === expected.durationDays)
    && (expected.durationUnit === undefined || brief.duration?.unit === expected.durationUnit)
    && (expected.pace === undefined || brief.pace?.value === expected.pace)
    && (expected.interests ?? []).every((interest) => brief.interests.some((item) => item.value === interest));
  if (!intentOk) failures.push("intent facts changed");
  const constraintsOk = (expected.hardConstraints ?? []).every((constraint) => has(actualConstraints, constraint));
  if (!constraintsOk) failures.push("hard constraint changed");
  const identitiesOk = (expected.canonicalPlaceIds ?? []).every((id) => has(actualIds, id));
  if (!identitiesOk) failures.push("canonical place identity changed");
  const unknownOk = (expected.unknownFields ?? []).every((field) => brief[field] === undefined);
  if (!unknownOk) failures.push("unknown input was invented");
  const expectedWarningsOk = warningChecks.every(Boolean);
  if (!expectedWarningsOk) failures.push("expected warning or conflict missing");
  const planGated = !scenario.recordedPlan && (brief.placeIssues ?? []).some((issue) => issue.blocksRoute);
  const routeOk = assessment
    ? assessment.route.state !== "insufficient-data" || scenario.expectedWarningsOrConflicts.includes("required-stops-exceed-maximum")
    : planGated || !brief.destinations.some((destination) => destination.routability === "direct_destination");
  if (!routeOk) failures.push("route state is not appropriate for the captured intent");
  const timeOk = expected.durationDays === undefined || (assessment ? assessment.shortfallDays > 0 === scenario.expectedWarningsOrConflicts.includes("shortfall") : true);
  if (!timeOk) failures.push("time realism warning changed");
  const explanationOk = assessment ? Boolean(assessment.route.summary) : Boolean((brief.placeIssues ?? []).length || brief.source.rawPrompt);
  if (!explanationOk) failures.push("no explanation boundary available");
  const dimensions: Record<PromptEngineDimension, number> = {
    intent: score(intentOk),
    constraints: score(constraintsOk),
    route: score(routeOk),
    "time-realism": score(timeOk),
    "state-preservation": score(identitiesOk && unknownOk),
    uncertainty: score(expectedWarningsOk && unknownOk),
    explanation: score(explanationOk),
  };
  return { id: scenario.id, name: scenario.name, score: Object.values(dimensions).reduce((total, value) => total + value, 0), dimensions, deterministicFailures: failures, expectedWarnings: scenario.expectedWarningsOrConflicts, reviewNotes: scenario.reviewNotes };
}

export function runPromptEngineHarness(cases = PROMPT_ENGINE_CASES): PromptEngineSummary {
  const results = cases.map(evaluatePromptEngineCase);
  return {
    total: results.reduce((total, result) => total + result.score, 0),
    maxTotal: results.length * PROMPT_ENGINE_DIMENSIONS.length * 2,
    dimensions: Object.fromEntries(PROMPT_ENGINE_DIMENSIONS.map((dimension) => [dimension, results.reduce((total, result) => total + result.dimensions[dimension], 0)])) as Record<PromptEngineDimension, number>,
    results,
  };
}

export function comparablePromptEngineSnapshot(summary: PromptEngineSummary) {
  return { total: summary.total, maxTotal: summary.maxTotal, dimensions: summary.dimensions, cases: summary.results.map((result) => ({ id: result.id, score: result.score, dimensions: result.dimensions, deterministicFailures: result.deterministicFailures })) };
}
