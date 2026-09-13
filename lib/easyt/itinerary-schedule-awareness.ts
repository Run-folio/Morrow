import type { ComposedItineraryActivity, ItineraryDayComposition } from "./itinerary-day-composition.ts";
import type { ItineraryIdea } from "./trip.ts";

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
      return bounds?.minimumMinutes !== undefined && bounds.minimumMinutes >= 60;
    }) || composition.transfers.some((transfer) => (transfer.durationMinutes ?? 0) >= 120);
    if (hasOtherSubstantialPlan) {
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
