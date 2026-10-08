import { normalizePlacePhrase } from "./place-intelligence.ts";

export type FixedCommitmentType = "fixed-date" | "booking";

export type FixedCommitmentPlace = {
  name: string;
  canonicalPlaceId?: string;
  country?: string;
  coordinates?: [number, number];
};

export type FixedCommitmentConstraint = {
  label: string;
  date?: string;
  commitmentType?: FixedCommitmentType;
  place?: FixedCommitmentPlace;
  stopId?: string;
  /** Captured occurrence identity, distinct from the selected geographic place. */
  sourceMentionId?: string;
  fixedNights?: number;
};

type CommitmentRouteStop = {
  id: string;
  name: string;
  canonicalPlaceId?: string;
};

/** Attach durable fixed-place intent to an existing operational route stop.
 * Captured requests require their exact source binding. Legacy geographic
 * compatibility is allowed only when one operational occurrence matches. */
export function projectFixedCommitmentsToStops<T extends FixedCommitmentConstraint>(
  commitments: readonly T[],
  stops: readonly CommitmentRouteStop[],
  sourceBindings?: readonly { id: string; stopIds: readonly string[] }[],
): Array<T & { stopId?: string }> {
  const stopIds = new Set(stops.map((stop) => stop.id));
  return commitments.map((commitment) => {
    if (commitment.sourceMentionId && sourceBindings) {
      const sources = sourceBindings.filter(source => source.id === commitment.sourceMentionId);
      const id = sources.length === 1 && sources[0]!.stopIds.length === 1 ? sources[0]!.stopIds[0] : undefined;
      const valid = id && stopIds.has(id) && (!commitment.stopId || commitment.stopId === id);
      return { ...commitment, stopId: valid ? id : undefined };
    }
    if (commitment.stopId && stopIds.has(commitment.stopId)) return { ...commitment };
    if (commitment.sourceMentionId || !commitment.place?.name) return { ...commitment, stopId: undefined };
    const canonical = commitment.place.canonicalPlaceId
      ? stops.filter(stop => stop.canonicalPlaceId === commitment.place!.canonicalPlaceId) : [];
    const matching = canonical.length ? canonical
      : stops.filter(stop => normalizePlacePhrase(stop.name) === normalizePlacePhrase(commitment.place!.name));
    return { ...commitment, stopId: matching.length === 1 ? matching[0]!.id : undefined };
  });
}

export function fixedCommitmentDisplayLabel(commitment: FixedCommitmentConstraint) {
  const place = commitment.place?.name || commitment.label;
  if (!commitment.date || !/^\d{4}-\d{2}-\d{2}$/.test(commitment.date)) return place;
  const formatted = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${commitment.date}T00:00:00Z`));
  return `${place} · ${formatted}`;
}
