import { createHash } from "node:crypto";

import type { EasyTTrip } from "./trip.ts";

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, stableValue(item)]),
  );
}

/** Full canonical revision fingerprint used to invalidate previews. */
export function tripCopilotStateHash(trip: EasyTTrip) {
  return createHash("sha256").update(JSON.stringify(stableValue(trip))).digest("hex");
}

/** Result fingerprint ignores only the repository-issued compare-and-swap timestamp. */
export function tripCopilotMutationHash(trip: EasyTTrip) {
  const { updatedAt: _updatedAt, ...document } = trip;
  const deterministic = {
    ...document,
    recommendations: document.recommendations.map(({ checkedAt: _checkedAt, ...recommendation }) => recommendation),
  };
  return createHash("sha256").update(JSON.stringify(stableValue(deterministic))).digest("hex");
}
