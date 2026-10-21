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
 * publishing a result. An optional deadline belongs to the shared attempt,
 * including body parsing, and settles even if transport ignores its signal.
 */
export function loadLocalFinderBaseResult<Result>(
  key: string,
  request: (signal?: AbortSignal) => Promise<Result>,
  options: {
    now?: () => number;
    ttlMs?: number;
    shouldCache?: (value: Result) => boolean;
    timeoutMs?: number;
  } = {},
): Promise<Result> {
  const now = options.now ?? Date.now;
  const cached = readCachedResult<Result>(key, now());
  if (cached !== null) return Promise.resolve(cached);

  const activeRequest = inFlightRequests.get(key);
  if (activeRequest) return activeRequest as Promise<Result>;

  const controller = options.timeoutMs === undefined ? undefined : new AbortController();
  const deadline = options.timeoutMs === undefined ? undefined : now() + options.timeoutMs;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let expired = false;
  let rejectDeadline: ((error: unknown) => void) | undefined;
  const timeoutError = () => {
    const error = new DOMException("Local recommendations timed out", "TimeoutError");
    expired = true;
    rejectDeadline?.(error);
    controller?.abort(error);
    return error;
  };
  const pending = Promise.resolve().then(() => request(controller?.signal));
  const bounded = options.timeoutMs === undefined ? pending : Promise.race([
    pending,
    new Promise<never>((_resolve, reject) => {
      rejectDeadline = reject;
      timer = setTimeout(timeoutError, options.timeoutMs);
    }),
  ]);
  const promise = bounded
    .then((value) => {
      // Also reject a late response when the event loop has not run its timer
      // yet. Expired raw transport work never reaches this cache or publisher.
      if (expired || (deadline !== undefined && now() >= deadline)) throw timeoutError();
      if (inFlightRequests.get(key) === promise && (options.shouldCache?.(value) ?? true)) {
        storeCachedResult(key, value, now() + (options.ttlMs ?? localFinderBaseCacheTtlMs));
      }
      return value;
    })
    .finally(() => {
      if (timer !== undefined) clearTimeout(timer);
      if (inFlightRequests.get(key) === promise) inFlightRequests.delete(key);
    });
  inFlightRequests.set(key, promise);
  return promise;
}

export function clearLocalFinderBaseCacheForTests() {
  resultCache.clear();
  inFlightRequests.clear();
}
