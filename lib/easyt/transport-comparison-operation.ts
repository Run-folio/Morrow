import {compareCanonicalTransferJourney,type TransferEvidenceProvider} from './multimodal-transfer-resolution.ts';
import type {RoadRoutingProvider} from './road-routing.ts';
import type {TripLeg} from './trip.ts';

export const TRANSPORT_COMPARISON_TIMEOUT_MS = 15_000;

/** Request-owned budget: cancellation settles even an uncooperative dependency.
 * A late result is ignored; each downstream dispatch must still check this signal. */
export async function withTransportComparisonDeadline<T>(
  request: (signal: AbortSignal) => Promise<T>,
  options: {signal?: AbortSignal; timeoutMs?: number} = {},
): Promise<T> {
  const controller = new AbortController();
  const cancel = () => controller.abort(options.signal?.reason);
  if (options.signal?.aborted) cancel();
  else options.signal?.addEventListener('abort', cancel, {once: true});
  const timeout = new DOMException('Connection check timed out.', 'TimeoutError');
  const timer = setTimeout(() => controller.abort(timeout), Math.max(1, Math.min(TRANSPORT_COMPARISON_TIMEOUT_MS, options.timeoutMs ?? TRANSPORT_COMPARISON_TIMEOUT_MS)));
  let rejectAbort: (() => void) | undefined;
  const aborted = new Promise<never>((_, reject) => {
    rejectAbort = () => reject(controller.signal.reason);
    controller.signal.addEventListener('abort', rejectAbort, {once: true});
  });
  try {
    controller.signal.throwIfAborted();
    return await Promise.race([request(controller.signal), aborted]);
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', cancel);
    if (rejectAbort) controller.signal.removeEventListener('abort', rejectAbort);
  }
}

export function runTransportComparison(leg: TripLeg, options: {
  provider?: RoadRoutingProvider;
  createProvider?: (signal: AbortSignal) => RoadRoutingProvider | undefined;
  knowledge?: TransferEvidenceProvider;
  signal?: AbortSignal;
  timeoutMs?: number;
} = {}) {
  return withTransportComparisonDeadline(async signal => {
    const source = options.createProvider?.(signal) ?? options.provider;
    const provider: RoadRoutingProvider | undefined = source ? {
      provider: source.provider,
      async route(input) {signal.throwIfAborted(); const result = await source.route(input); signal.throwIfAborted(); return result;},
      ...(source.routeWithDiagnostics ? {async routeWithDiagnostics(input: Parameters<RoadRoutingProvider['route']>[0]) {
        signal.throwIfAborted(); const result = await source.routeWithDiagnostics!(input); signal.throwIfAborted(); return result;
      }} : {}),
    } : undefined;
    const result = await compareCanonicalTransferJourney(leg, {provider, knowledge: options.knowledge});
    signal.throwIfAborted();
    return result;
  }, options);
}
