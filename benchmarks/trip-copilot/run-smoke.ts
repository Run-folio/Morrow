import { createHash } from "node:crypto";
import OpenAI from "openai";

import {
  buildTripCopilotOpenAIRequest,
  buildTripCopilotProjection,
  parseTripCopilotAnswer,
} from "../../lib/easyt/trip-copilot.ts";
import {
  buildTripCopilotPreviewCandidates,
  parseTripCopilotAction,
  TripCopilotActionValidationError,
  type TripCopilotAction,
} from "../../lib/easyt/trip-copilot-actions.ts";
import { tripCopilotFixture } from "../../tests/fixtures/trip-copilot-trip.ts";

const trip = tripCopilotFixture();
const client = new OpenAI();
const digest = () => createHash("sha256").update(JSON.stringify(trip)).digest("hex");
const before = digest();
const cases = [
  { id: "read-only", message: "Does this itinerary feel rushed?", expected: "answer" },
  { id: "night-change", message: "Change Kyoto to 4 nights.", expected: "action", selection: { stopId: "kyoto" } },
  { id: "ambiguous-night", message: "I'd like another night in Kyoto.", expected: "action", selection: { stopId: "kyoto" } },
  { id: "transport-preference", message: "I'd rather take trains than fly.", expected: "action" },
  { id: "rejected-night", message: "Make Kyoto 500 nights.", expected: "rejected", selection: { stopId: "kyoto" } },
  { id: "unsupported-booking", message: "Book the Tokyo train for me.", expected: "answer", selection: { legId: "tokyo-kyoto" } },
] as const;

function functionCalls(output: unknown[]) {
  return output.filter((item): item is { type: "function_call"; name: string; arguments: string } => {
    if (!item || typeof item !== "object") return false;
    const row = item as { type?: unknown; name?: unknown; arguments?: unknown };
    return row.type === "function_call" && typeof row.name === "string" && typeof row.arguments === "string";
  });
}

const results = [];
for (const item of cases) {
  const projection = buildTripCopilotProjection(trip, "selection" in item ? item.selection : undefined);
  const response = await client.responses.create(buildTripCopilotOpenAIRequest(projection, item.message));
  const calls = functionCalls(response.output as unknown[]);
  let kind: "answer" | "action" | "rejected";
  let answer = null;
  let action: TripCopilotAction | null = null;
  let rejection: string | null = null;
  let previews: ReturnType<typeof buildTripCopilotPreviewCandidates> = [];
  if (calls.length === 1) {
    try {
      action = parseTripCopilotAction(calls[0].name, JSON.parse(calls[0].arguments), trip);
      previews = buildTripCopilotPreviewCandidates(trip, action);
      kind = "action";
    } catch (error) {
      if (!(error instanceof TripCopilotActionValidationError)) throw error;
      kind = "rejected";
      rejection = error.message;
    }
  } else {
    answer = parseTripCopilotAnswer(response.output_text);
    if (!answer) throw new Error(`Trip co-pilot smoke response was malformed for ${item.id}.`);
    kind = item.expected === "rejected" ? "rejected" : "answer";
    if (kind === "rejected") rejection = answer.answer;
  }
  if (item.expected === "action" && kind !== "action") throw new Error(`Expected an action for ${item.id}, received ${kind}.`);
  if (item.id === "unsupported-booking" && kind !== "answer") throw new Error("Unsupported booking request became a mutation.");
  results.push({
    id: item.id,
    message: item.message,
    kind,
    answer,
    action,
    rejection,
    previews: previews.map((preview) => ({
      summary: preview.summary,
      changes: preview.changes,
      impacts: preview.impacts,
      warnings: preview.warnings,
      confirmedDelta: {
        endDate: preview.resultingTrip.endDate,
        stopNights: Object.fromEntries(preview.resultingTrip.stops.map((stop) => [stop.name, stop.nights])),
        transportModes: preview.resultingTrip.brief.intent?.preferences.transportModes ?? [],
      },
    })),
    model: response.model,
    usage: response.usage ? { inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens, totalTokens: response.usage.total_tokens } : null,
  });
}
const after = digest();
const usage = results.reduce((total, item) => ({
  inputTokens: total.inputTokens + (item.usage?.inputTokens ?? 0),
  outputTokens: total.outputTokens + (item.usage?.outputTokens ?? 0),
  totalTokens: total.totalTokens + (item.usage?.totalTokens ?? 0),
}), { inputTokens: 0, outputTokens: 0, totalTokens: 0 });
const estimatedCostUsd = usage.inputTokens * 0.20 / 1_000_000 + usage.outputTokens * 1.20 / 1_000_000;

console.log(JSON.stringify({ kind: "morrovia-trip-copilot-smoke/v2", model: "gpt-5.6-luna", canonicalTripUnchangedByInterpretationAndPreview: before === after, beforeDigest: before, afterDigest: after, usage, estimatedCostUsd, cases: results }, null, 2));
if (before !== after) process.exitCode = 1;
