import type { PlaceTypeLiteral } from "./place-catalog.ts";

export type LocalSearchKind = "restaurant" | "stay";
export type LocalSearchProviderOutcome<Result> =
  | { state: "ready"; places: readonly Result[] }
  | { state: "empty"; places: readonly Result[] }
  | { state: "failed"; places: readonly Result[] };

export type LocalSearchOutcome<Result> = {
  state: "ready" | "empty" | "failed";
  places: Result[];
};

export const localSearchFallbackHedgeMs = 1_000;

export function localSearchScope(kind: LocalSearchKind, placeType?: PlaceTypeLiteral) {
  const compactDestination = placeType === "town" || placeType === "island" || placeType === "archipelago";
  const primaryRadiusKm = kind === "stay" ? 7.5 : 5;
  return {
    primaryRadiusKm,
    // One bounded expansion protects compact islands from mainland leakage
    // while giving a city-scale destination enough room for imperfect centres.
    fallbackRadiusKm: compactDestination
      ? kind === "stay" ? 8.5 : 6
      : kind === "stay" ? 10 : 8,
  };
}

export async function localSearchProviderOutcome<Result>(
  request: () => Promise<readonly Result[]>,
): Promise<LocalSearchProviderOutcome<Result>> {
  try {
    const places = await request();
    return places.length
      ? { state: "ready", places }
      : { state: "empty", places: [] };
  } catch {
    return { state: "failed", places: [] };
  }
}

/**
 * Starts the primary mapped-place lanes together and starts exactly one
 * bounded fallback when they are all non-useful or the hedge expires. The
 * final empty/failure distinction is based on whether any lane completed a
 * valid search, never on whether the response happened to contain an array.
 */
export function firstUsefulLocalSearchWithFallback<Result>(
  primaryRequests: readonly (() => Promise<LocalSearchProviderOutcome<Result>>)[],
  fallbackRequest: () => Promise<LocalSearchProviderOutcome<Result>>,
  waitBeforeFallback: () => Promise<void> = () => new Promise((resolve) => {
    setTimeout(resolve, localSearchFallbackHedgeMs);
  }),
): Promise<LocalSearchOutcome<Result>> {
  return new Promise((resolve) => {
    let resolved = false;
    let pendingPrimary = primaryRequests.length;
    let fallbackStarted = false;
    let fallbackOutcome: LocalSearchProviderOutcome<Result> | null = null;
    const primaryOutcomes: LocalSearchProviderOutcome<Result>[] = [];

    const resolveUseful = (outcome: LocalSearchProviderOutcome<Result>) => {
      if (resolved || outcome.state !== "ready" || !outcome.places.length) return false;
      resolved = true;
      resolve({ state: "ready", places: [...outcome.places] });
      return true;
    };
    const resolveNonUsefulWhenComplete = () => {
      if (resolved || pendingPrimary > 0 || !fallbackOutcome) return;
      resolved = true;
      const completedValidSearch = [...primaryOutcomes, fallbackOutcome]
        .some((outcome) => outcome.state === "empty");
      resolve({ state: completedValidSearch ? "empty" : "failed", places: [] });
    };
    const startFallback = () => {
      if (resolved || fallbackStarted) return;
      fallbackStarted = true;
      Promise.resolve()
        .then(fallbackRequest)
        .then((outcome) => {
          if (resolveUseful(outcome)) return;
          fallbackOutcome = outcome;
          resolveNonUsefulWhenComplete();
        })
        .catch(() => {
          fallbackOutcome = { state: "failed", places: [] };
          resolveNonUsefulWhenComplete();
        });
    };

    if (!primaryRequests.length) startFallback();
    for (const request of primaryRequests) {
      Promise.resolve()
        .then(request)
        .catch(() => ({ state: "failed", places: [] } as LocalSearchProviderOutcome<Result>))
        .then((outcome) => {
          if (resolveUseful(outcome)) return;
          primaryOutcomes.push(outcome);
          pendingPrimary -= 1;
          if (pendingPrimary === 0) startFallback();
          resolveNonUsefulWhenComplete();
        });
    }
    Promise.resolve()
      .then(waitBeforeFallback)
      .then(startFallback)
      .catch(startFallback);
  });
}
