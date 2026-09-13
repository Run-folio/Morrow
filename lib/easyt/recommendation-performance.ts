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

/** Coarse, bounded durations keep recommendation telemetry useful and private. */
export function recommendationDurationMs(startedAt: number, endedAt: number) {
  const elapsed = Number.isFinite(startedAt) && Number.isFinite(endedAt)
    ? Math.max(0, endedAt - startedAt)
    : 0;
  return Math.min(60_000, Math.round(elapsed / 25) * 25);
}
