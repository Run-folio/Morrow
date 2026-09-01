import "server-only";

import type OpenAI from "openai";
import { getOpenAIClient } from "./openai.server";
import {
  buildTripCopilotOpenAIRequest,
  buildTripCopilotProjection,
  parseTripCopilotAnswer,
  type TripCopilotAnswer,
  type TripCopilotProjection,
  type TripCopilotSelection,
} from "./trip-copilot.ts";
import { parseTripCopilotAction, type TripCopilotAction } from "./trip-copilot-actions.ts";
import type { EasyTTrip } from "./trip.ts";
import { withProviderTimeout } from "./provider-timeout.ts";

type RateWindow = { startedAt: number; count: number };
const rateWindows = new Map<string, RateWindow>();
const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = 12;
export const TRIP_COPILOT_PROVIDER_TIMEOUT_MS = 12_000;

export function consumeTripCopilotRateLimit(ownerId: string, now = Date.now()) {
  const current = rateWindows.get(ownerId);
  if (!current || now - current.startedAt >= RATE_WINDOW_MS) {
    rateWindows.set(ownerId, { startedAt: now, count: 1 });
    return { allowed: true, retryAfterSeconds: 0 } as const;
  }
  if (current.count >= RATE_LIMIT) {
    return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((RATE_WINDOW_MS - (now - current.startedAt)) / 1000)) } as const;
  }
  current.count += 1;
  return { allowed: true, retryAfterSeconds: 0 } as const;
}

export class TripCopilotResponseError extends Error {
  constructor() {
    super("The co-pilot returned an unusable response.");
    this.name = "TripCopilotResponseError";
  }
}

export type TripCopilotUsage = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
};

export type TripCopilotResult = {
  interpretation:
    | { kind: "answer"; answer: TripCopilotAnswer }
    | { kind: "action"; action: TripCopilotAction };
  projection: TripCopilotProjection;
  model: string;
  usage: TripCopilotUsage | null;
};

type ResponsesClient = Pick<OpenAI, "responses">;

/** Read-only model boundary. It receives an EasyTTrip but exposes only the projection. */
export async function answerTripCopilotQuestion(options: {
  trip: EasyTTrip;
  message: string;
  selection?: TripCopilotSelection;
  client?: ResponsesClient;
  timeoutMs?: number;
}): Promise<TripCopilotResult> {
  const projection = buildTripCopilotProjection(options.trip, options.selection);
  const client = options.client ?? getOpenAIClient();
  const response = await withProviderTimeout({
    label: "Trip co-pilot provider",
    timeoutMs: options.timeoutMs ?? TRIP_COPILOT_PROVIDER_TIMEOUT_MS,
    request: (signal) => client.responses.create(buildTripCopilotOpenAIRequest(projection, options.message), { signal }),
  });
  const functionCalls = (response.output as unknown[]).filter((item): item is { type: "function_call"; name: string; arguments: string } => {
    if (!item || typeof item !== "object") return false;
    const row = item as { type?: unknown; name?: unknown; arguments?: unknown };
    return row.type === "function_call" && typeof row.name === "string" && typeof row.arguments === "string";
  });
  if (functionCalls.length > 1) throw new TripCopilotResponseError();
  let interpretation: TripCopilotResult["interpretation"];
  if (functionCalls.length === 1) {
    let argumentsValue: unknown;
    try { argumentsValue = JSON.parse(functionCalls[0].arguments); }
    catch { throw new TripCopilotResponseError(); }
    interpretation = { kind: "action", action: parseTripCopilotAction(functionCalls[0].name, argumentsValue, options.trip) };
  } else {
    const answer = parseTripCopilotAnswer(response.output_text);
    if (!answer) throw new TripCopilotResponseError();
    interpretation = { kind: "answer", answer };
  }
  return {
    interpretation,
    projection,
    model: response.model,
    usage: response.usage ? {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      totalTokens: response.usage.total_tokens,
    } : null,
  };
}
