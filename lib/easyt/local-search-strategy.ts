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

/** Only an explicit collection is evidence of a valid empty provider search. */
export function providerResults<Result>(payload: unknown, key: string): Result[] {
  if (!payload || typeof payload !== "object" || !Array.isArray((payload as Record<string, unknown>)[key])) {
    throw new SyntaxError("Local venue provider returned an invalid response");
  }
  return (payload as Record<string, Result[]>)[key];
}

/** The mapped Trip Map and Stay finder cannot request Google Places facts for MapLibre. */
export function localSearchPrimaryLanes<Result>(
  mapPresentation: "maplibre" | "none",
  google: () => Promise<LocalSearchProviderOutcome<Result>>,
  openStreetMap: () => Promise<LocalSearchProviderOutcome<Result>>,
): readonly (() => Promise<LocalSearchProviderOutcome<Result>>)[] {
  return mapPresentation === "maplibre" ? [openStreetMap] : [google, openStreetMap];
}

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

export type LocalSearchProviderId = "google" | "osm" | "photon";
export type LocalSearchProviderDiagnostic = {
  provider: LocalSearchProviderId;
  outcome: "ready" | "empty" | "timeout" | "aborted" | "http_error" | "malformed" | "configuration" | "unavailable";
  durationMs: number;
  status?: number;
};

export class LocalSearchProviderFailure extends Error {
  readonly outcome: "http_error" | "configuration";
  readonly status?: number;
  constructor(outcome: "http_error" | "configuration", status?: number) {
    super("Local venue provider failed");
    this.outcome = outcome;
    this.status = status;
  }
}

/** Keep HTTP status without retaining the URL, headers or response body. */
export async function localSearchProviderJson(response: Pick<Response, "ok" | "status" | "json">): Promise<unknown> {
  if (!response.ok) throw new LocalSearchProviderFailure("http_error", response.status);
  return response.json();
}

const validHttpStatus = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value) && value >= 100 && value <= 599;

/** Fixed, low-cardinality fields only; never copy exception text or provider data. */
export function localSearchDiagnosticServerTiming(records: readonly LocalSearchProviderDiagnostic[]): string {
  const providers = { google: "local-google", osm: "local-osm", photon: "local-photon" };
  const outcomes = new Set(["ready", "empty", "timeout", "aborted", "http_error", "malformed", "configuration", "unavailable"]);
  return records.flatMap(record => {
    const provider = Object.hasOwn(providers, record.provider) ? providers[record.provider] : null;
    if (!provider || !outcomes.has(record.outcome) || !Number.isFinite(record.durationMs) || record.durationMs < 0) return [];
    const status = validHttpStatus(record.status) ? `:${record.status}` : "";
    return [`${provider};dur=${Math.round(record.durationMs)};desc="${record.outcome}${status}"`];
  }).join(", ");
}

export async function localSearchProviderOutcome<Result>(
  request: () => Promise<readonly Result[]>,
  diagnostic?: { provider: LocalSearchProviderId; record: (value: LocalSearchProviderDiagnostic) => void; now?: () => number },
): Promise<LocalSearchProviderOutcome<Result>> {
  const now = () => {
    try { const value = diagnostic?.now ? diagnostic.now() : performance.now(); return Number.isFinite(value) ? value : 0; }
    catch { return 0; }
  };
  const startedAt = diagnostic ? now() : 0;
  const record = (outcome: LocalSearchProviderDiagnostic["outcome"], status?: number) => {
    if (!diagnostic) return;
    try {
      const elapsed = now() - startedAt;
      diagnostic.record({ provider: diagnostic.provider, outcome, durationMs: Number.isFinite(elapsed) ? Math.max(0, Math.round(elapsed)) : 0,
        ...(validHttpStatus(status) ? { status } : {}) });
    } catch { /* Diagnostics cannot change the provider result or trigger more work. */ }
  };
  try {
    const places = await request();
    record(places.length ? "ready" : "empty");
    return places.length
      ? { state: "ready", places }
      : { state: "empty", places: [] };
  } catch (error) {
    const outcome = error instanceof LocalSearchProviderFailure ? error.outcome
      : error instanceof Error && error.name === "TimeoutError" ? "timeout"
        : error instanceof Error && error.name === "AbortError" ? "aborted"
          : error instanceof Error && error.name === "SyntaxError" ? "malformed" : "unavailable";
    record(outcome, error instanceof LocalSearchProviderFailure ? error.status : undefined);
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
