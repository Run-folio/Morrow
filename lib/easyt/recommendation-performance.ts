export type RecommendationLaneRequest<Lane extends string, Value> = {
  lane: Lane;
  request: () => Promise<Value>;
};

export type RecommendationLaneSettlement<Lane extends string, Value> =
  | { lane: Lane; status: "ready"; value: Value }
  | { lane: Lane; status: "failed"; error: unknown };

/**
 * Starts every lane immediately and reports each one as soon as it settles.
 * Consumers deliberately do not wait for the returned aggregate promise before
 * publishing a successful lane.
 */
export async function streamIndependentRecommendationLanes<Lane extends string, Value>(
  lanes: readonly RecommendationLaneRequest<Lane, Value>[],
  onSettlement: (settlement: RecommendationLaneSettlement<Lane, Value>) => void,
) {
  await Promise.all(lanes.map(async ({ lane, request }) => {
    try {
      onSettlement({ lane, status: "ready", value: await request() });
    } catch (error) {
      onSettlement({ lane, status: "failed", error });
    }
  }));
}

/**
 * Resolves when the first provider produces at least one useful result. Empty
 * and failed providers remain local failures; an unresolved slower provider
 * cannot hold a successful provider hostage.
 */
export function firstUsefulRecommendationResults<Result>(
  requests: readonly (() => Promise<readonly Result[]>)[],
): Promise<Result[]> {
  if (!requests.length) return Promise.resolve([]);
  return new Promise((resolve) => {
    let pending = requests.length;
    let resolved = false;
    const settleEmpty = () => {
      pending -= 1;
      if (!resolved && pending === 0) {
        resolved = true;
        resolve([]);
      }
    };
    for (const request of requests) {
      Promise.resolve()
        .then(request)
        .then((results) => {
          if (resolved) return;
          if (results.length) {
            resolved = true;
            resolve([...results]);
            return;
          }
          settleEmpty();
        })
        .catch(settleEmpty);
    }
  });
}

export const recommendationFallbackHedgeMs = 1_000;

/**
 * Races equivalent primary sources immediately, then starts one bounded
 * fallback when either every primary has already failed/returned empty or the
 * hedge budget expires. A useful primary that arrives inside the budget avoids
 * the fallback request entirely. Once the fallback is needed, it can publish
 * without accumulating every primary timeout first.
 */
export function firstUsefulRecommendationResultsWithFallback<Result>(
  primaryRequests: readonly (() => Promise<readonly Result[]>)[],
  fallbackRequest: () => Promise<readonly Result[]>,
  waitBeforeFallback: () => Promise<void> = () => new Promise((resolve) => {
    setTimeout(resolve, recommendationFallbackHedgeMs);
  }),
): Promise<Result[]> {
  return new Promise((resolve) => {
    let resolved = false;
    let pendingPrimary = primaryRequests.length;
    let fallbackStarted = false;
    let fallbackSettled = false;

    const resolveUseful = (results: readonly Result[]) => {
      if (resolved || !results.length) return false;
      resolved = true;
      resolve([...results]);
      return true;
    };
    const resolveEmptyWhenComplete = () => {
      if (!resolved && pendingPrimary === 0 && fallbackSettled) {
        resolved = true;
        resolve([]);
      }
    };
    const startFallback = () => {
      if (resolved || fallbackStarted) return;
      fallbackStarted = true;
      Promise.resolve()
        .then(fallbackRequest)
        .then((results) => {
          if (resolveUseful(results)) return;
          fallbackSettled = true;
          resolveEmptyWhenComplete();
        })
        .catch(() => {
          fallbackSettled = true;
          resolveEmptyWhenComplete();
        });
    };
    const settlePrimaryEmpty = () => {
      pendingPrimary -= 1;
      if (pendingPrimary === 0) startFallback();
      resolveEmptyWhenComplete();
    };

    if (!primaryRequests.length) startFallback();
    for (const request of primaryRequests) {
      Promise.resolve()
        .then(request)
        .then((results) => {
          if (resolveUseful(results)) return;
          settlePrimaryEmpty();
        })
        .catch(settlePrimaryEmpty);
    }
    Promise.resolve()
      .then(waitBeforeFallback)
      .then(startFallback)
      .catch(startFallback);
  });
}

/** Coarse, bounded durations keep recommendation telemetry useful and private. */
export function recommendationDurationMs(startedAt: number, endedAt: number) {
  const elapsed = Number.isFinite(startedAt) && Number.isFinite(endedAt)
    ? Math.max(0, endedAt - startedAt)
    : 0;
  return Math.min(60_000, Math.round(elapsed / 25) * 25);
}
