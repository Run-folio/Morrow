export const localFinderBaseCacheTtlMs = 15 * 60 * 1_000;
const localFinderBaseCacheMaxEntries = 40;

type CacheEntry = {
  value: unknown;
  expiresAt: number;
};

const resultCache = new Map<string, CacheEntry>();
const inFlightRequests = new Map<string, Promise<unknown>>();

function readCachedResult<Result>(key: string, now: number): Result | null {
  const cached = resultCache.get(key);
  if (!cached) return null;
  if (cached.expiresAt <= now) {
    resultCache.delete(key);
    return null;
  }
  return cached.value as Result;
}

function storeCachedResult(key: string, value: unknown, expiresAt: number) {
  resultCache.delete(key);
  while (resultCache.size >= localFinderBaseCacheMaxEntries) {
    const oldestKey = resultCache.keys().next().value;
    if (typeof oldestKey !== "string") break;
    resultCache.delete(oldestKey);
  }
  resultCache.set(key, { value, expiresAt });
}

/** Safe synchronous access used only to retain mapped base identity on remount. */
export function peekLocalFinderBaseResult<Result>(key: string, now = Date.now()): Result | null {
  return readCachedResult<Result>(key, now);
}

/**
 * Shares identical mapped-place work and keeps a short-lived successful base
 * result for return visits. Date-specific commercial inventory never enters
 * this cache. The caller remains responsible for active-context checks before
 * publishing a result.
 */
export function loadLocalFinderBaseResult<Result>(
  key: string,
  request: () => Promise<Result>,
  options: {
    now?: () => number;
    ttlMs?: number;
    shouldCache?: (value: Result) => boolean;
  } = {},
): Promise<Result> {
  const now = options.now ?? Date.now;
  const cached = readCachedResult<Result>(key, now());
  if (cached !== null) return Promise.resolve(cached);

  const activeRequest = inFlightRequests.get(key);
  if (activeRequest) return activeRequest as Promise<Result>;

  const promise = Promise.resolve()
    .then(request)
    .then((value) => {
      if (options.shouldCache?.(value) ?? true) {
        storeCachedResult(key, value, now() + (options.ttlMs ?? localFinderBaseCacheTtlMs));
      }
      return value;
    })
    .finally(() => {
      if (inFlightRequests.get(key) === promise) inFlightRequests.delete(key);
    });
  inFlightRequests.set(key, promise);
  return promise;
}

export function clearLocalFinderBaseCacheForTests() {
  resultCache.clear();
  inFlightRequests.clear();
}
