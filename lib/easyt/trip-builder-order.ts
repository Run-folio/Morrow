export type BuilderStopOrderRejection =
  | "same-order"
  | "length-mismatch"
  | "duplicate-id"
  | "unknown-id"
  | "missing-id"
  | "stale-source"
  | "fixed-order"
  | "locked-stop";

export type BuilderStopOrderResult<T> =
  | { ok: true; ids: string[]; stops: T[] }
  | { ok: false; reason: BuilderStopOrderRejection };

export function builderStopOrderFingerprint(items: readonly ({ id: string } | string)[]) {
  return items.map((item) => typeof item === "string" ? item : item.id).join("\u001f");
}

export function validateBuilderStopOrder<T extends { id: string }>(
  current: readonly T[],
  proposedIds: readonly string[],
  options: { expectedFingerprint?: string; lockedStopIds?: readonly string[]; fixedOrder?: boolean } = {},
): BuilderStopOrderResult<T> {
  if (options.expectedFingerprint !== undefined && options.expectedFingerprint !== builderStopOrderFingerprint(current)) {
    return { ok: false, reason: "stale-source" };
  }
  if (proposedIds.length !== current.length) return { ok: false, reason: "length-mismatch" };
  if (new Set(proposedIds).size !== proposedIds.length) return { ok: false, reason: "duplicate-id" };
  const currentById = new Map(current.map((item) => [item.id, item]));
  if (proposedIds.some((id) => !currentById.has(id))) return { ok: false, reason: "unknown-id" };
  if (current.some((item) => !proposedIds.includes(item.id))) return { ok: false, reason: "missing-id" };
  if (proposedIds.every((id, index) => id === current[index]?.id)) return { ok: false, reason: "same-order" };
  if (options.fixedOrder) return { ok: false, reason: "fixed-order" };
  const locked = new Set(options.lockedStopIds ?? []);
  if (current.some((item, index) => locked.has(item.id) && proposedIds[index] !== item.id)) {
    return { ok: false, reason: "locked-stop" };
  }
  const ids = [...proposedIds];
  return { ok: true, ids, stops: ids.map((id) => currentById.get(id)!) };
}
