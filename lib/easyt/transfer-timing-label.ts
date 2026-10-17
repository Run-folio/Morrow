import {formatTripDuration} from './trip-facts.ts';

type TimingInput = {
  mode?: string;
  segments?: Array<{mode: string}>;
  durationMinutes?: number | null;
  doorToDoorMinutes?: number | null;
  headlineMinutes?: number | null;
  routeMetadata?: Record<string, unknown>;
  transferImpact?: unknown;
};
const record = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
const minutes = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;

type DisplayTiming = {point: number; range?: {minimum: number; maximum: number}; exact: boolean};
function displayTiming(input: TimingInput, field: 'total' | 'headline'): DisplayTiming | null {
  const raw = record(input.transferImpact ?? input.routeMetadata?.transferImpact);
  // Equal numbers do not make a stale different-mode claim current evidence.
  const impactMode = input.mode === 'mixed'
    ? input.segments?.some(segment => segment.mode === 'flight') ? 'flight' : input.segments?.some(segment => segment.mode === 'train') ? 'train' : 'road'
    : input.mode === 'walk' ? 'road' : input.mode;
  const impact = raw?.version === 1 && raw.mode === impactMode ? raw : undefined;
  const fact = record(impact?.[field === 'total' ? 'doorToDoor' : 'headline']);
  if (fact?.status === 'unknown') return null;
  const estimate = fact?.status === 'known' ? record(fact.value) : undefined;
  const fallback = field === 'total' ? input.doorToDoorMinutes ?? input.durationMinutes : input.headlineMinutes;
  const current = estimate && minutes(estimate.planningMinutes)
    && (fallback == null || fallback === estimate.planningMinutes) ? estimate : undefined;
  const point = current?.planningMinutes ?? fallback;
  if (!minutes(point)) return null;
  const supplied = record(current?.rangeMinutes);
  const range = supplied && minutes(supplied.minimum) && minutes(supplied.maximum)
    && supplied.minimum <= point && supplied.maximum >= point && supplied.minimum < supplied.maximum
    ? {minimum: supplied.minimum, maximum: supplied.maximum} : undefined;
  return {point, ...(range ? {range} : {}), exact: current?.precision === 'verified-point' && fact?.confidence === 'verified'};
}
function label(timing: DisplayTiming): string {
  return timing.range && timing.range.minimum < timing.range.maximum ? `~${formatTripDuration(timing.range.minimum)}–${formatTripDuration(timing.range.maximum)}`
    : `${timing.exact ? '' : '~'}${formatTripDuration(timing.point)}`;
}

/** A planning total is never an airborne duration. Keep unknowns and supplied ranges visible. */
export function transferTimingLabel(input: TimingInput, field: 'total' | 'headline' = 'total', unknown = 'Timing to confirm'): string {
  const timing = displayTiming(input, field);
  return timing ? label(timing) : unknown;
}

/** Sum only known totals. A defensible aggregate range needs bounds for every leg. */
export function aggregateTransferTimingLabel(inputs: TimingInput[]): string {
  const timings = inputs.map(input => displayTiming(input, 'total'));
  if (!timings.length || timings.some(timing => timing === null)) return 'Timing to confirm';
  const known = timings as DisplayTiming[];
  if (known.length === 1) return label(known[0]!);
  const bounded = known.every(timing => timing.range || timing.exact);
  return label({point: known.reduce((sum, timing) => sum + timing.point, 0), exact: known.every(timing => timing.exact),
    ...(bounded ? {range: {minimum: known.reduce((sum, timing) => sum + (timing.range?.minimum ?? timing.point), 0), maximum: known.reduce((sum, timing) => sum + (timing.range?.maximum ?? timing.point), 0)}} : {})});
}
