import { after, NextRequest, NextResponse } from "next/server";
import { captureJourneyBrief } from "@/lib/easyt/journey-capture";
import {
  runConfiguredOpenAISemanticIntentShadow,
  semanticIntentServerConfig,
} from "@/lib/easyt/openai-semantic-intent.server";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  let body: { brief?: unknown };
  try {
    body = await request.json() as { brief?: unknown };
  } catch {
    return NextResponse.json({ message: "Invalid trip brief." }, { status: 400 });
  }
  const brief = typeof body.brief === "string" ? body.brief.slice(0, 600) : "";
  if (!brief.trim()) return NextResponse.json({ message: "Add a trip brief first." }, { status: 400 });

  // Capture is a fast handoff, not a network validation gate. Curated and
  // canonical matches resolve synchronously; unresolved provider work remains
  // visible for the builder instead of delaying or blanking the transition.
  const deterministic = captureJourneyBrief(brief);

  // Development-only and off by default. `after` keeps model latency and every
  // model outcome outside the authoritative response and product handoff.
  const semanticConfig = semanticIntentServerConfig();
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

  return NextResponse.json(deterministic);
}
