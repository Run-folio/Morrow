/** Fixed performance target; functional completion retains its separate bound. */
export const ACCEPTANCE_TARGET_MS = 2500;
export const ACCEPTANCE_COMPLETION_TIMEOUT_MS = 15000;

export type AcceptancePerformanceReport = {
  area: string;
  scope: 'multi-area-discovery-acceptance';
  width: number;
  type: string;
  elapsedMs: number;
  driverMs: number;
  thresholdMs: number;
  thresholdPassed: boolean;
  functionalTimeoutMs: number;
  functionalStatus: 'pending' | 'passed';
};

/** Branch-independent evidence: a performance miss cannot complete or skip recovery checks. */
export function createAcceptancePerformanceReport(area: string, width: number, type: string,
  elapsedMs: number, driverMs: number): AcceptancePerformanceReport {
  if (!['South Korea', 'Africa'].includes(area)
    || !((width === 1440 && type === 'return_to_start') || (width === 390 && type === 'one_way'))) {
    throw new Error('Invalid acceptance context');
  }
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0 || elapsedMs >= ACCEPTANCE_COMPLETION_TIMEOUT_MS
    || !Number.isFinite(driverMs) || driverMs < 0) {
    throw new Error('Invalid acceptance timing or bounded completion');
  }
  return { area, scope: 'multi-area-discovery-acceptance', width, type, elapsedMs, driverMs,
    thresholdMs: ACCEPTANCE_TARGET_MS, thresholdPassed: elapsedMs < ACCEPTANCE_TARGET_MS,
    functionalTimeoutMs: ACCEPTANCE_COMPLETION_TIMEOUT_MS, functionalStatus: 'pending' };
}
