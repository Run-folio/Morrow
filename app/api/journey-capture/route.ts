import { after, NextRequest, NextResponse } from "next/server";
import {
  captureJourneyBrief,
  captureJourneyBriefFromSemanticIntent,
  captureJourneyBriefWithProvider,
} from "@/lib/easyt/journey-capture";
import {
  createOpenAIPlanningModelProvider,
  createOpenAISemanticIntentProvider,
  runConfiguredOpenAISemanticIntentExtraction,
  runConfiguredOpenAISemanticIntentShadow,
  semanticIntentServerConfig,
} from "@/lib/easyt/openai-semantic-intent.server";
import { createOpenWorldPlaceProvider } from "@/lib/easyt/open-world-place.server";
import type { SemanticIntentStatus } from "@/lib/easyt/semantic-trip-intent";
import { routeTripCaptureModel } from "@/lib/easyt/model-task-router";
import { evaluatePlanningModel } from "@/lib/easyt/planning-model-runtime";
import { canonicalizePlanningSuggestions } from "@/lib/easyt/planning-suggestion-validation.server";
import { createHash } from "node:crypto";

export const runtime = "nodejs";
export const maxDuration = 60;

type RateWindow = { startedAt: number; count: number };
const rateWindows = new Map<string, RateWindow>();
const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = 8;
const inFlightPlanningRequests = new Map<string, { expiresAt: number; result: Promise<ReturnType<typeof evaluatePlanningModel> extends Promise<infer R> ? R : never> }>();

function deduplicatedPlanningRequest(brief: string, requireSuggestions: boolean, attempt = 1) {
  const now = Date.now();
  const key = `${createHash("sha256").update(brief).digest("hex")}:${requireSuggestions ? "suggest" : "assess"}:${attempt}`;
  const current = inFlightPlanningRequests.get(key);
  if (current && current.expiresAt > now) return current.result;
  const result = evaluatePlanningModel({
    rawPrompt: brief,
    provider: createOpenAIPlanningModelProvider({ tier: "escalation" }),
    timeoutMs: 15_000,
    requireSuggestions,
  });
  inFlightPlanningRequests.set(key, { expiresAt: now + 30_000, result });
  void result.finally(() => {
    setTimeout(() => {
      if (inFlightPlanningRequests.get(key)?.result === result) inFlightPlanningRequests.delete(key);
    }, 30_000);
  });
  return result;
}

function consumeCaptureRateLimit(key: string, now = Date.now()) {
  const current = rateWindows.get(key);
  if (!current || now - current.startedAt >= RATE_WINDOW_MS) {
    rateWindows.set(key, { startedAt: now, count: 1 });
    return true;
  }
  if (current.count >= RATE_LIMIT) return false;
  current.count += 1;
  return true;
}

export async function POST(request: NextRequest) {
  let body: { brief?: unknown };
  try {
    body = await request.json() as { brief?: unknown };
  } catch {
    return NextResponse.json({ message: "Invalid trip brief." }, { status: 400 });
  }
  const brief = typeof body.brief === "string" ? body.brief.slice(0, 600) : "";
  if (!brief.trim()) return NextResponse.json({ message: "Add a trip brief first." }, { status: 400 });

  // Preserve every named intent deterministically, then enrich those mentions
  // through the same bounded open-world resolver used by Builder Search.
  const deterministic = captureJourneyBrief(brief);
  const openWorldProvider = createOpenWorldPlaceProvider();
  const routing = routeTripCaptureModel({ rawPrompt: brief, deterministic });
  const providerFallback = async (model?: string, status?: SemanticIntentStatus, callCount = 0, fallbackModel?: string) => {
    const capture = await captureJourneyBriefWithProvider(brief, openWorldProvider);
    return model && status ? {
      ...capture,
      semanticExtraction: {
        model,
        status,
        fallbackUsed: true,
        task: routing.task,
        complexity: routing.complexity,
        fallbackModel,
        callCount,
      },
    } : capture;
  };

  // Active mode projects only a validated semantic candidate through the
  // deterministic place and brief boundaries. Shadow mode remains available
  // for observational evaluation without changing the product response.
  const semanticConfig = semanticIntentServerConfig();
  if (semanticConfig.mode === "active") {
    const requester = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
      ?? request.headers.get("x-real-ip")?.trim()
      ?? "guest";
    if (!consumeCaptureRateLimit(requester)) {
      return NextResponse.json(await providerFallback(routing.selectedModel ?? semanticConfig.primary.model, "unavailable"));
    }
    if (routing.routingClass === "high-value-planning") {
      const requirePlanningSuggestions = routing.task === "planning_destination_expansion";
      let terra = await deduplicatedPlanningRequest(brief, requirePlanningSuggestions);
      let terraCallCount = 1;
      if (terra.status === "empty-result" || terra.status === "invalid-response") {
        terra = await deduplicatedPlanningRequest(brief, requirePlanningSuggestions, 2);
        terraCallCount = 2;
      }
      const terraAggregate = {
        task: routing.task,
        complexity: routing.complexity,
        selectedModel: routing.selectedModel,
        routingReason: routing.reason,
        status: terra.status,
        latencyMs: terra.latencyMs,
        usage: terra.usage,
        cost: terra.cost,
        modelCalls: terraCallCount,
        fallback: terra.status === "completed" ? "none" : semanticConfig.primary.model,
        validationIssueCodes: terra.validationIssues?.map((issue) => issue.split(":")[0]),
      };
      if (process.env.NODE_ENV !== "production") console.info("[planning-model]", terraAggregate);
      if (terra.status === "completed" && terra.output) {
        const capture = await captureJourneyBriefFromSemanticIntent(
          brief,
          terra.output.intent,
          openWorldProvider,
          {},
          { model: routing.selectedModel!, status: "completed", task: routing.task, complexity: routing.complexity, callCount: terraCallCount },
        );
        const planningSuggestions = await canonicalizePlanningSuggestions({
          suggestions: terra.output.suggestions,
          capture,
          provider: openWorldProvider,
        });
        const suggestionsRequired = terra.output.suggestions.length > 0;
        if ((!suggestionsRequired || planningSuggestions.length > 0) && capture.mentionCoverage.complete) {
          return NextResponse.json({
            ...capture,
            ...(planningSuggestions.length ? { planningSuggestions } : {}),
            planningAssessment: terra.output.assessment,
          });
        }
        if (process.env.NODE_ENV !== "production") console.info("[planning-model]", {
          task: routing.task,
          selectedModel: routing.selectedModel,
          status: planningSuggestions.length ? "incomplete-capture" : "canonical-validation-failure",
          fallback: semanticConfig.primary.model,
        });
      }
      const lunaProvider = createOpenAISemanticIntentProvider({ tier: "primary" });
      const luna = await import("@/lib/easyt/semantic-trip-intent").then(({ evaluateSemanticIntentShadow }) => evaluateSemanticIntentShadow(brief, {
        mode: "active",
        provider: lunaProvider,
        timeoutMs: 5_000,
      }));
      if (luna.status === "completed" && luna.intent) {
        const capture = await captureJourneyBriefFromSemanticIntent(
          brief,
          luna.intent,
          openWorldProvider,
          {},
          { model: lunaProvider.model, status: luna.status, task: routing.task, complexity: routing.complexity, fallbackModel: lunaProvider.model, callCount: terraCallCount + 1 },
        );
        if (capture.mentionCoverage.complete) return NextResponse.json({
          ...capture,
          semanticExtraction: { ...capture.semanticExtraction!, fallbackUsed: true },
        });
      }
      const terraStatus: SemanticIntentStatus = terra.status === "empty-result" ? "invalid-response" : terra.status;
      return NextResponse.json(await providerFallback(routing.selectedModel!, terraStatus, terraCallCount + 1, semanticConfig.primary.model));
    }
    const extraction = await runConfiguredOpenAISemanticIntentExtraction({ rawPrompt: brief, timeoutMs: 5_000 });
    const aggregate = {
      model: semanticConfig.primary.model,
      task: routing.task,
      complexity: routing.complexity,
      routingReason: routing.reason,
      status: extraction.status,
      latencyMs: extraction.latencyMs,
      usage: extraction.usage,
      cost: extraction.cost,
      validationIssueCodes: extraction.validationIssues
        ? [...new Set(extraction.validationIssues.map((issue) => issue.code))]
        : undefined,
      validationIssuePaths: extraction.validationIssues
        ? [...new Set(extraction.validationIssues.map((issue) => issue.path))]
        : undefined,
      destinationCandidateCount: extraction.intent?.destinationCandidates.length ?? 0,
      poiCandidateCount: extraction.intent?.pointsOfInterest.length ?? 0,
    };
    if (process.env.NODE_ENV !== "production") console.info("[semantic-intent]", aggregate);
    if (extraction.status === "completed" && extraction.intent) {
      const capture = await captureJourneyBriefFromSemanticIntent(
        brief,
        extraction.intent,
        openWorldProvider,
        {},
        { model: semanticConfig.primary.model, status: extraction.status, task: routing.task, complexity: routing.complexity, callCount: 1 },
      );
      if (process.env.NODE_ENV !== "production" && process.env.MORROVIA_CAPTURE_DIAGNOSTICS === "1") {
        console.info("[journey-capture-diagnostic]", {
          kind: "journey-capture-aggregate-diagnostic-v1",
          coverage: capture.mentionCoverage,
          semanticMentionCount: Number(Boolean(extraction.intent.origin.sourceText))
            + extraction.intent.destinationCandidates.length
            + extraction.intent.pointsOfInterest.length,
          resolvedMentionCount: capture.mentions.filter((mention) => mention.status === "resolved").length,
        });
      }
      if (capture.mentionCoverage.complete) return NextResponse.json(capture);
    }
    return NextResponse.json(await providerFallback(semanticConfig.primary.model, extraction.status, 1));
  }
  if (semanticConfig.mode === "shadow") {
    after(async () => {
      const result = await runConfiguredOpenAISemanticIntentShadow({ rawPrompt: brief, deterministic });
      console.info("[semantic-intent-shadow]", {
        model: semanticConfig.primary.model,
        status: result.comparison.status,
        latencyMs: result.comparison.latencyMs,
        usage: result.comparison.usage,
        cost: result.comparison.cost,
        agreement: result.comparison.agreement,
        destinationCandidateCount: result.comparison.semantic?.destinationCandidates.length ?? 0,
        poiCandidateCount: result.comparison.semantic?.poiCandidates.length ?? 0,
        falseGeographyCount: result.comparison.safety.falseGeography.length,
        inventedFactCount: result.comparison.safety.inventedFacts,
        meaningfulUnexplainedCount: result.comparison.safety.meaningfulUnexplainedText.length,
        escalationReasonCodes: result.escalation.reasons.map((reason) => reason.code),
      });
    });
  }

  return NextResponse.json(await providerFallback());
}
