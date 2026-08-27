import { NextResponse } from "next/server";
import {
  getOpenAIClient,
  MORROVIA_OPENAI_MODEL,
  safeOpenAIError,
} from "@/lib/easyt/openai.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

const expectedMessage = "Morrovia Luna connected";
const noStoreHeaders = { "Cache-Control": "no-store" };

/** Development-only connectivity probe. It accepts no user or trip content. */
export async function POST() {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ ok: false, message: "Not found." }, { status: 404, headers: noStoreHeaders });
  }

  try {
    const response = await getOpenAIClient().responses.create({
      model: MORROVIA_OPENAI_MODEL,
      reasoning: { effort: "low" },
      input: `Reply with exactly: ${expectedMessage}`,
      max_output_tokens: 128,
      store: false,
    });
    const message = response.output_text.trim();
    const correctModel = response.model === MORROVIA_OPENAI_MODEL || response.model.startsWith(`${MORROVIA_OPENAI_MODEL}-`);

    if (process.env.NODE_ENV === "development") {
      const usage = response.usage;
      const estimatedCostUsd = usage
        ? ((usage.input_tokens * 0.20) + (usage.output_tokens * 1.20)) / 1_000_000
        : undefined;
      console.info("[openai-smoke] completed", {
        model: response.model,
        inputTokens: usage?.input_tokens,
        outputTokens: usage?.output_tokens,
        totalTokens: usage?.total_tokens,
        estimatedCostUsd,
      });
    }

    if (!correctModel || message !== expectedMessage) {
      console.warn("[openai-smoke] unexpected response", {
        requestedModel: MORROVIA_OPENAI_MODEL,
        returnedModel: response.model,
        exactOutput: message === expectedMessage,
      });
      return NextResponse.json(
        { ok: false, message: "OpenAI responded, but the connectivity check did not match the expected result." },
        { status: 502, headers: noStoreHeaders },
      );
    }

    return NextResponse.json(
      { ok: true, message, model: response.model },
      { headers: noStoreHeaders },
    );
  } catch (error) {
    const safeError = safeOpenAIError(error);
    console.error("[openai-smoke] failed", safeError);
    const status = safeError.category === "configuration" ? 503 : 502;
    const message = safeError.category === "configuration"
      ? "OpenAI is not configured on this server."
      : "OpenAI connection test failed.";
    return NextResponse.json(
      { ok: false, message, category: safeError.category },
      { status, headers: noStoreHeaders },
    );
  }
}
