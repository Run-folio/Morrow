/**
 * Bounds one provider request even when the provider ignores cancellation.
 * The owned timer is always cleared and the signal lets cooperative clients
 * stop their underlying network work as soon as the boundary expires.
 */
export async function withProviderTimeout<T>(options: {
  label: string;
  timeoutMs: number;
  request: (signal: AbortSignal) => Promise<T>;
}): Promise<T> {
  const controller = new AbortController();
  const timeoutError = new Error(`${options.label} timed out.`);
  timeoutError.name = "TimeoutError";
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timeoutBoundary = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => {
      controller.abort(timeoutError);
      reject(timeoutError);
    }, options.timeoutMs);
  });
  try {
    return await Promise.race([options.request(controller.signal), timeoutBoundary]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}
