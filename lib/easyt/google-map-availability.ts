type GoogleAvailabilityProbeOptions = {
  request(signal: AbortSignal): Promise<{ ok: boolean }>;
  onResult(available: boolean): void;
  scheduleTimeout(callback: () => void, delayMs: number): unknown;
  clearTimeout(handle: unknown): void;
  timeoutMs: number;
};

/** Keep the unavailable fallback bounded to a request that has not settled. */
export function startGoogleMapAvailabilityProbe(options: GoogleAvailabilityProbeOptions): () => void {
  const controller = new AbortController();
  let active = true;
  const timeout = options.scheduleTimeout(() => {
    if (!active) return;
    active = false;
    options.onResult(false);
    controller.abort();
  }, options.timeoutMs);
  const settle = (available: boolean) => {
    if (!active) return;
    active = false;
    options.clearTimeout(timeout);
    options.onResult(available);
  };

  void options.request(controller.signal)
    .then((response) => settle(response.ok))
    .catch(() => settle(false));

  return () => {
    active = false;
    options.clearTimeout(timeout);
    controller.abort();
  };
}
