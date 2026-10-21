import type { ComposedItineraryActivity, ItineraryDayComposition } from "./itinerary-day-composition.ts";
import type { ItineraryDayPart, ItineraryIdea } from "./trip.ts";
import type { ItineraryPlanningPart } from "./itinerary-day-part-intent.ts";

export type ActivityDuration = NonNullable<NonNullable<ItineraryIdea["providerMetadata"]>["duration"]>;

const positive = (value: number | undefined) => Number.isFinite(value) && value! > 0 ? value : undefined;

export function activityDurationBounds(duration: ActivityDuration | undefined) {
  if (!duration) return null;
  const fixed = positive(duration.fixedMinutes);
  if (fixed !== undefined) return { minimumMinutes: fixed, maximumMinutes: fixed, exact: true };
  const from = positive(duration.fromMinutes);
  const to = positive(duration.toMinutes);
  if (from === undefined && to === undefined) return null;
  if (from !== undefined && to !== undefined && from > to) return null;
  return { minimumMinutes: from, maximumMinutes: to, exact: false };
}

function minutesLabel(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (!hours) return `${remainder}m`;
  return `${hours}h${remainder ? ` ${remainder}m` : ""}`;
}

/** Faithfully formats fixed, ranged and one-sided provider duration evidence. */
export function activityDurationLabel(duration: ActivityDuration | undefined) {
  const bounds = activityDurationBounds(duration);
  if (!bounds) return null;
  if (bounds.exact && bounds.minimumMinutes !== undefined) return minutesLabel(bounds.minimumMinutes);
  if (bounds.minimumMinutes !== undefined && bounds.maximumMinutes !== undefined) {
    return `${minutesLabel(bounds.minimumMinutes)}–${minutesLabel(bounds.maximumMinutes)}`;
  }
  if (bounds.minimumMinutes !== undefined) return `From ${minutesLabel(bounds.minimumMinutes)}`;
  return bounds.maximumMinutes !== undefined ? `Up to ${minutesLabel(bounds.maximumMinutes)}` : null;
}

/** Only a fixed or minimum provider duration of eight hours earns this label. */
export function isFullDayActivity(duration: ActivityDuration | undefined) {
  const bounds = activityDurationBounds(duration);
  return Boolean(bounds?.minimumMinutes !== undefined && bounds.minimumMinutes >= 8 * 60);
}

/**
 * Broad placement truth for the current four-part itinerary model. Unknown
 * provider duration stays unknown; sourced durations of eight hours or more
 * consume most of a day and must not be presented as a single day-part fit.
 */
export function activityDayPartFit(duration: ActivityDuration | undefined) {
  const bounds = activityDurationBounds(duration);
  if (!bounds) return "unknown" as const;
  if (isFullDayActivity(duration)) return "full-day" as const;
  if (bounds.exact && (bounds.minimumMinutes ?? 0) > 5 * 60) return "extended" as const;
  if (bounds.maximumMinutes !== undefined && bounds.maximumMinutes <= 5 * 60) return "slot" as const;
  return "unknown" as const;
}

/** Day-part writes are valid only when duration evidence does not say the
 * activity consumes most of the day. Unknown duration keeps the existing
 * traveller-controlled broad placement without claiming a precise fit. */
export function activityAllowsDayPart(
  duration: ActivityDuration | undefined,
  dayPart: ItineraryDayPart | null,
) {
  if (dayPart === null) return true;
  const fit = activityDayPartFit(duration);
  return fit !== "extended" && fit !== "full-day";
}

export type FullDayActivityTiming =
  | { kind: "untimed"; dayParts: []; continuesOvernight: false }
  | { kind: "timed"; startsAt: string; endsAt: string; dayParts: ItineraryPlanningPart[]; continuesOvernight: boolean };

const planningPartWindows: Array<{ part: ItineraryPlanningPart; start: number; end: number }> = [
  { part: "morning", start: 6 * 60, end: 12 * 60 },
  { part: "afternoon", start: 12 * 60, end: 17 * 60 },
  { part: "evening", start: 17 * 60, end: 24 * 60 },
];

function clockLabel(minutes: number) {
  const withinDay = minutes % (24 * 60);
  return `${String(Math.floor(withinDay / 60)).padStart(2, "0")}:${String(withinDay % 60).padStart(2, "0")}`;
}

/**
 * Projects a sourced full-day activity into only the periods its exact interval
 * overlaps. Ranged duration evidence stays untimed, and overnight spill never
 * fabricates a second-day item.
 */
export function fullDayActivityTiming(
  duration: ActivityDuration | undefined,
  startsAt: string | undefined,
): FullDayActivityTiming | null {
  if (!isFullDayActivity(duration)) return null;
  const bounds = activityDurationBounds(duration);
  const start = exactStartMinutes(startsAt);
  if (!bounds?.exact || bounds.minimumMinutes === undefined || start === null) {
    return { kind: "untimed", dayParts: [], continuesOvernight: false };
  }
  const end = start + bounds.minimumMinutes;
  const dayEnd = 24 * 60;
  const dayParts = planningPartWindows
    .filter(({ start: periodStart, end: periodEnd }) => start < periodEnd && Math.min(end, dayEnd) > periodStart)
    .map(({ part }) => part);
  return {
    kind: "timed",
    startsAt: clockLabel(start),
    endsAt: clockLabel(end),
    dayParts,
    continuesOvernight: end > dayEnd,
  };
}

function exactStartMinutes(value: string | undefined) {
  const match = value?.match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

export function activityStartTimeLabel(value: string | undefined) {
  return exactStartMinutes(value) === null ? null : value!;
}

function exactInterval(activity: ComposedItineraryActivity) {
  const start = exactStartMinutes(activity.startsAt);
  const duration = activityDurationBounds(activity.providerMetadata?.duration);
  if (start === null || !duration?.exact || duration.minimumMinutes === undefined) return null;
  return { start, end: start + duration.minimumMinutes };
}

export type ItineraryScheduleWarning = {
  activityIds: string[];
  kind: "exact-overlap" | "long-duration";
  message: string;
};

/** Deterministic, advisory-only warnings from canonical timing evidence. */
export function itineraryScheduleWarnings(composition: ItineraryDayComposition) {
  const activities = [...composition.unslotted, ...Object.values(composition.planned).flat()];
  const warnings: ItineraryScheduleWarning[] = [];
  for (let index = 0; index < activities.length; index += 1) {
    const left = activities[index]!;
    const leftInterval = exactInterval(left);
    if (leftInterval) {
      for (const right of activities.slice(index + 1)) {
        const rightInterval = exactInterval(right);
        if (rightInterval && leftInterval.start < rightInterval.end && rightInterval.start < leftInterval.end) {
          warnings.push({ activityIds: [left.id, right.id], kind: "exact-overlap", message: "These plans overlap." });
        }
      }
    }
    if (!isFullDayActivity(left.providerMetadata?.duration)) continue;
    const hasOtherSubstantialPlan = activities.some((candidate) => {
      if (candidate.id === left.id) return false;
      const bounds = activityDurationBounds(candidate.providerMetadata?.duration);
      if (bounds?.minimumMinutes === undefined || bounds.minimumMinutes < 60) return false;
      const rightInterval = exactInterval(candidate);
      if (leftInterval && rightInterval) {
        return leftInterval.start < rightInterval.end && rightInterval.start < leftInterval.end;
      }
      return true;
    }) || composition.transfers.some((transfer) => (transfer.durationMinutes ?? 0) >= 120);
    const exactOverlapAlreadyWarned = warnings.some((warning) => warning.kind === "exact-overlap" && warning.activityIds.includes(left.id));
    if (hasOtherSubstantialPlan && !exactOverlapAlreadyWarned) {
      const duration = activityDurationLabel(left.providerMetadata?.duration) ?? "long";
      warnings.push({
        activityIds: [left.id],
        kind: "long-duration",
        message: `This is a ${duration} experience and may overlap with your other plans.`,
      });
    }
  }
  return warnings;
}
