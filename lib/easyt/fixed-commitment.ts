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
  fixedNights?: number;
};

type CommitmentRouteStop = {
  id: string;
  name: string;
  canonicalPlaceId?: string;
};

/** Attach durable fixed-place intent to an existing operational route stop.
 * Geographic identity wins; the display name is the compatibility fallback. */
export function projectFixedCommitmentsToStops<T extends FixedCommitmentConstraint>(
  commitments: readonly T[],
  stops: readonly CommitmentRouteStop[],
): Array<T & { stopId?: string }> {
  const stopIds = new Set(stops.map((stop) => stop.id));
  return commitments.map((commitment) => {
    if (commitment.stopId && stopIds.has(commitment.stopId)) return { ...commitment };
    if (!commitment.place?.name) return { ...commitment, stopId: undefined };
    const matching = stops.find((stop) => Boolean(commitment.place?.canonicalPlaceId)
      && stop.canonicalPlaceId === commitment.place?.canonicalPlaceId)
      ?? stops.find((stop) => normalizePlacePhrase(stop.name) === normalizePlacePhrase(commitment.place!.name));
    return { ...commitment, stopId: matching?.id };
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
