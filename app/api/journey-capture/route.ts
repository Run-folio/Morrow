import { after, NextRequest, NextResponse } from "next/server";
import {
  captureJourneyBrief,
  captureJourneyBriefFromSemanticIntent,
  captureJourneyBriefWithProvider,
} from "@/lib/easyt/journey-capture";
import {
  runConfiguredOpenAISemanticIntentExtraction,
  runConfiguredOpenAISemanticIntentShadow,
  semanticIntentServerConfig,
} from "@/lib/easyt/openai-semantic-intent.server";
import { createOpenWorldPlaceProvider } from "@/lib/easyt/open-world-place.server";
import type { SemanticIntentStatus } from "@/lib/easyt/semantic-trip-intent";

export const runtime = "nodejs";
export const maxDuration = 60;

type RateWindow = { startedAt: number; count: number };
const rateWindows = new Map<string, RateWindow>();
const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = 8;

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
  const providerFallback = async (model?: string, status?: SemanticIntentStatus) => {
    const capture = await captureJourneyBriefWithProvider(brief, openWorldProvider);
    return model && status ? { ...capture, semanticExtraction: { model, status, fallbackUsed: true } } : capture;
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
      return NextResponse.json(await providerFallback(semanticConfig.primary.model, "unavailable"));
    }
    const extraction = await runConfiguredOpenAISemanticIntentExtraction({ rawPrompt: brief, timeoutMs: 5_000 });
    const aggregate = {
      model: semanticConfig.primary.model,
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
        { model: semanticConfig.primary.model, status: extraction.status },
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
    return NextResponse.json(await providerFallback(semanticConfig.primary.model, extraction.status));
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
