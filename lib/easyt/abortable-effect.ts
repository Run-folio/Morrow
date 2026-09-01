export type AbortableEffectScope = {
  signal: AbortSignal;
  commit: (update: () => void) => void;
  dispose: () => void;
  isCancellation: (error: unknown) => boolean;
};

function abortError(message: string) {
  const error = new Error(message);
  error.name = "AbortError";
  return error;
}

export function isAbortError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { name?: unknown; code?: unknown };
  return candidate.name === "AbortError" || candidate.code === "ABORT_ERR";
}

/**
 * Couples network cancellation with a stale-result guard. Some providers do
 * not propagate AbortSignal reasons consistently, so callers must use both.
 */
export function createAbortableEffectScope(label: string): AbortableEffectScope {
  const controller = new AbortController();
  let disposed = false;

  return {
    signal: controller.signal,
    commit(update) {
      if (!disposed && !controller.signal.aborted) update();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (!controller.signal.aborted) controller.abort(abortError(`${label} cancelled`));
    },
    isCancellation(error) {
      return disposed || controller.signal.aborted || isAbortError(error);
    },
  };
}
