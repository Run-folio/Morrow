import { accommodationProgress, stayBookingForStop } from "./accommodation.ts";
import { cascadeTripSchedule } from "./cascade.ts";
import { reviewTrip, tripHealth } from "./review.ts";
import { mergeStructuredTripBrief } from "./structured-trip-brief.ts";
import { tripReadinessSummary } from "./trip-readiness-summary.ts";
import { reconcileAuthoredDayState } from "./trip-authored-day-state.ts";
import { tripIntentForTrip, type EasyTTrip } from "./trip.ts";

export const TRIP_COPILOT_PREVIEW_TTL_MS = 15 * 60_000;
export const TRIP_COPILOT_MAX_STOP_NIGHTS = 60;

export type ChangeStopNightsAction = {
  action: "change_stop_nights";
  stopId: string;
  nights: number;
};

export type SetTripPreferenceAction = {
  action: "set_trip_preference";
  preference: "pace" | "accommodation" | "budget";
  value:
    | "relaxed"
    | "balanced"
    | "packed"
    | "fewer_hotel_changes"
    | "flexible_hotel_changes"
    | "value"
    | "mid"
    | "high";
};

export type ChangeTransportPreferenceAction = {
  action: "change_transport_preference";
  preference:
    | "prefer_train"
    | "prefer_flight"
    | "prefer_drive"
    | "avoid_flight"
    | "avoid_drive";
};

export type TripCopilotAction =
  | ChangeStopNightsAction
  | SetTripPreferenceAction
  | ChangeTransportPreferenceAction;

export type ChangeStopNightsResolution =
  | { type: "preserve_trip_dates" }
  | { type: "extend_trip"; days: number }
  | { type: "shorten_trip"; days: number }
  | { type: "reduce_stop"; stopId: string; nights: number }
  | { type: "increase_stop"; stopId: string; nights: number };

export type ResolvedTripCopilotAction =
  | (ChangeStopNightsAction & { resolution: ChangeStopNightsResolution })
  | SetTripPreferenceAction
  | ChangeTransportPreferenceAction;

export type TripCopilotPreviewChange = {
  label: string;
  before: string | null;
  after: string | null;
};

export type TripCopilotPreviewImpacts = {
  dates: { before: string; after: string; changed: boolean };
  route: { changedStopCount: number; changedStops: string[] };
  transfers: { changed: boolean; warningCount: number };
  itinerary: { changedDayCount: number };
  health: { before: string; after: string; openIssuesBefore: number; openIssuesAfter: number };
  readiness: { before: number; after: number; readyBefore: boolean; readyAfter: boolean };
};

export type TripCopilotPreviewCandidate = {
  action: TripCopilotAction;
  resolvedAction: ResolvedTripCopilotAction;
  summary: string;
  changes: TripCopilotPreviewChange[];
  impacts: TripCopilotPreviewImpacts;
  warnings: string[];
  resultingTrip: EasyTTrip;
};

export type StoredTripCopilotPreview = Omit<TripCopilotPreviewCandidate, "resultingTrip" | "resolvedAction"> & {
  previewId: string;
  canApply: true;
  expiresAt: string;
};

export type TripCopilotMutationPreview = {
  action: TripCopilotAction;
  summary: string;
  canApply: boolean;
  preview: StoredTripCopilotPreview | null;
  alternatives: StoredTripCopilotPreview[];
  warnings: string[];
};

export type TripCopilotResponse = {
  answer: string;
  scope: "trip" | "stop" | "day" | "leg" | "general";
  proposedChange: { type: string; summary: string } | null;
  mutationPreview?: TripCopilotMutationPreview;
};

export class TripCopilotActionValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TripCopilotActionValidationError";
  }
}

const exactKeys = (row: Record<string, unknown>, keys: string[]) =>
  Object.keys(row).length === keys.length && Object.keys(row).every((key) => keys.includes(key));

const paceValues = new Set(["relaxed", "balanced", "packed"]);
const accommodationValues = new Set(["fewer_hotel_changes", "flexible_hotel_changes"]);
const budgetValues = new Set(["value", "mid", "high"]);
const transportValues = new Set(["prefer_train", "prefer_flight", "prefer_drive", "avoid_flight", "avoid_drive"]);

export function parseTripCopilotAction(toolName: string, value: unknown, trip: EasyTTrip): TripCopilotAction {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TripCopilotActionValidationError("The requested trip change was not valid.");
  }
  const row = value as Record<string, unknown>;
  if (toolName === "change_stop_nights") {
    if (!exactKeys(row, ["stopName", "nights"]) || typeof row.stopName !== "string" || typeof row.nights !== "number") {
      throw new TripCopilotActionValidationError("The stop and night count are required.");
    }
    const stopName = row.stopName.trim().toLocaleLowerCase();
    const matches = trip.stops.filter((stop) => stop.name.trim().toLocaleLowerCase() === stopName);
    if (matches.length !== 1) throw new TripCopilotActionValidationError("Morrovia could not identify one saved stop for that change.");
    if (!Number.isInteger(row.nights) || row.nights < 1 || row.nights > TRIP_COPILOT_MAX_STOP_NIGHTS) {
      throw new TripCopilotActionValidationError(`A stop must be between 1 and ${TRIP_COPILOT_MAX_STOP_NIGHTS} nights.`);
    }
    return { action: "change_stop_nights", stopId: matches[0].id, nights: row.nights };
  }
  if (toolName === "set_trip_preference") {
    if (!exactKeys(row, ["preference", "value"]) || typeof row.preference !== "string" || typeof row.value !== "string") {
      throw new TripCopilotActionValidationError("The trip preference was not valid.");
    }
    const valid = row.preference === "pace" ? paceValues.has(row.value)
      : row.preference === "accommodation" ? accommodationValues.has(row.value)
        : row.preference === "budget" ? budgetValues.has(row.value)
          : false;
    if (!valid) throw new TripCopilotActionValidationError("That preference value is not supported.");
    return {
      action: "set_trip_preference",
      preference: row.preference as SetTripPreferenceAction["preference"],
      value: row.value as SetTripPreferenceAction["value"],
    };
  }
  if (toolName === "change_transport_preference") {
    if (!exactKeys(row, ["preference"]) || typeof row.preference !== "string" || !transportValues.has(row.preference)) {
      throw new TripCopilotActionValidationError("That transport preference is not supported.");
    }
    return { action: "change_transport_preference", preference: row.preference as ChangeTransportPreferenceAction["preference"] };
  }
  throw new TripCopilotActionValidationError("That trip change is not supported.");
}

export function assertValidResolvedTripCopilotAction(value: unknown, trip: EasyTTrip): asserts value is ResolvedTripCopilotAction {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TripCopilotActionValidationError("The saved preview action is invalid.");
  const row = value as Record<string, unknown>;
  if (row.action === "set_trip_preference") {
    parseTripCopilotAction("set_trip_preference", { preference: row.preference, value: row.value }, trip);
    if (!exactKeys(row, ["action", "preference", "value"])) throw new TripCopilotActionValidationError("The saved preference preview is invalid.");
    return;
  }
  if (row.action === "change_transport_preference") {
    parseTripCopilotAction("change_transport_preference", { preference: row.preference }, trip);
    if (!exactKeys(row, ["action", "preference"])) throw new TripCopilotActionValidationError("The saved transport preview is invalid.");
    return;
  }
  if (row.action !== "change_stop_nights" || !exactKeys(row, ["action", "stopId", "nights", "resolution"])) {
    throw new TripCopilotActionValidationError("The saved night preview is invalid.");
  }
  if (typeof row.stopId !== "string" || typeof row.nights !== "number" || !Number.isInteger(row.nights) || row.nights < 1 || row.nights > TRIP_COPILOT_MAX_STOP_NIGHTS) {
    throw new TripCopilotActionValidationError("The saved night preview is invalid.");
  }
  const stop = trip.stops.find((item) => item.id === row.stopId);
  if (!stop || stop.nights === null) throw new TripCopilotActionValidationError("The saved stop is no longer available.");
  const delta = row.nights - stop.nights;
  if (!row.resolution || typeof row.resolution !== "object" || Array.isArray(row.resolution)) throw new TripCopilotActionValidationError("The saved night resolution is invalid.");
  const resolution = row.resolution as Record<string, unknown>;
  if (resolution.type === "preserve_trip_dates") {
    if (!exactKeys(resolution, ["type"])) throw new TripCopilotActionValidationError("The saved night resolution is invalid.");
    return;
  }
  if (resolution.type === "extend_trip") {
    if (!exactKeys(resolution, ["type", "days"]) || typeof resolution.days !== "number" || !Number.isInteger(resolution.days) || resolution.days <= 0 || resolution.days !== delta) {
      throw new TripCopilotActionValidationError("The saved trip extension is invalid.");
    }
    return;
  }
  if (resolution.type === "shorten_trip") {
    if (!exactKeys(resolution, ["type", "days"]) || typeof resolution.days !== "number" || !Number.isInteger(resolution.days) || resolution.days <= 0 || resolution.days !== -delta) {
      throw new TripCopilotActionValidationError("The saved trip reduction is invalid.");
    }
    return;
  }
  if (resolution.type === "reduce_stop") {
    if (!exactKeys(resolution, ["type", "stopId", "nights"]) || typeof resolution.stopId !== "string" || typeof resolution.nights !== "number" || !Number.isInteger(resolution.nights)) {
      throw new TripCopilotActionValidationError("The saved night redistribution is invalid.");
    }
    const reduced = trip.stops.find((item) => item.id === resolution.stopId && item.id !== stop.id);
    if (!reduced || reduced.nights === null || resolution.nights < 1 || reduced.nights - resolution.nights !== delta) {
      throw new TripCopilotActionValidationError("The saved night redistribution is no longer valid.");
    }
    return;
  }
  if (resolution.type === "increase_stop") {
    if (!exactKeys(resolution, ["type", "stopId", "nights"]) || typeof resolution.stopId !== "string" || typeof resolution.nights !== "number" || !Number.isInteger(resolution.nights)) {
      throw new TripCopilotActionValidationError("The saved night redistribution is invalid.");
    }
    const increased = trip.stops.find((item) => item.id === resolution.stopId && item.id !== stop.id);
    if (!increased || increased.nights === null || resolution.nights < 1 || resolution.nights - increased.nights !== -delta) {
      throw new TripCopilotActionValidationError("The saved night redistribution is no longer valid.");
    }
    return;
  }
  throw new TripCopilotActionValidationError("The saved night resolution is invalid.");
}

function cloneTrip(trip: EasyTTrip): EasyTTrip {
  return structuredClone(trip);
}

const DAY = 86_400_000;
const addDays = (value: string, days: number) => new Date(Date.parse(`${value}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10);

function assertStopNightsCanChange(trip: EasyTTrip, stopId: string) {
  const stop = trip.stops.find((item) => item.id === stopId);
  if (!stop) throw new TripCopilotActionValidationError("That stop is no longer part of this trip.");
  if (trip.brief.scheduleLocks?.stopIds.includes(stopId)) {
    throw new TripCopilotActionValidationError(`${stop.name} is protected by a schedule lock. Change that lock before changing its nights.`);
  }
  if (stayBookingForStop(trip, stop)) {
    throw new TripCopilotActionValidationError(`${stop.name} has saved accommodation. Review that stay before changing its nights.`);
  }
}

function updateNightAllocation(trip: EasyTTrip, stopId: string, nights: number): EasyTTrip {
  const nightAllocation = trip.brief.nightAllocation?.allocations
    ? {
        ...trip.brief.nightAllocation,
        allocations: { ...trip.brief.nightAllocation.allocations, [stopId]: nights },
        stops: trip.brief.nightAllocation.stops.map((stop) => stop.stopId === stopId ? { ...stop, nights } : stop),
        totalAllocatedNights: Object.entries({ ...trip.brief.nightAllocation.allocations, [stopId]: nights }).reduce((sum, [, value]) => sum + value, 0),
      }
    : trip.brief.nightAllocation;
  return {
    ...trip,
    brief: {
      ...trip.brief,
      manualNightStopIds: [...new Set([...(trip.brief.manualNightStopIds ?? []), stopId])],
      ...(trip.brief.nightAllocations ? { nightAllocations: { ...trip.brief.nightAllocations, [stopId]: nights } } : {}),
      ...(trip.brief.dayAllocations ? { dayAllocations: { ...trip.brief.dayAllocations, [stopId]: trip.brief.nightAllocations || trip.brief.nightAllocation?.allocations ? nights : nights + 1 } } : {}),
      ...(nightAllocation ? { nightAllocation } : {}),
    },
    stops: trip.stops.map((stop) => stop.id === stopId ? { ...stop, nights } : stop),
  };
}

function reconcilePlanCoverage(trip: EasyTTrip): EasyTTrip {
  const orderedStops = [...trip.stops].sort((left, right) => left.order - right.order);
  const existingByStop = new Map(orderedStops.map((stop) => [
    stop.id,
    trip.planItems.filter((item) => item.stopId === stop.id).sort((left, right) => left.dayNumber - right.dayNumber),
  ]));
  const planItems: EasyTTrip["planItems"] = [];
  const finalDay = Math.max(1, Math.round((Date.parse(`${trip.endDate}T00:00:00Z`) - Date.parse(`${trip.startDate}T00:00:00Z`)) / DAY) + 1);

  for (let dayNumber = 1; dayNumber <= finalDay; dayNumber += 1) {
    const date = addDays(trip.startDate, dayNumber - 1);
    const stop = orderedStops.find((item, index) => {
      if (!item.arrivalDate || !item.departureDate) return false;
      const isLast = index === orderedStops.length - 1;
      return date >= item.arrivalDate && (date < item.departureDate || (isLast && date === trip.endDate));
    });
    if (!stop) continue;
    const queue = existingByStop.get(stop.id) ?? [];
    const existing = queue.shift();
    if (existing) {
      planItems.push({ ...existing, dayNumber, date });
    } else {
      planItems.push({
        id: `${trip.id}-replan-${stop.id}-${date}`,
        stopId: stop.id,
        dayNumber,
        date,
        type: "open",
        title: `Open day in ${stop.name}`,
        reason: "Added to keep the revised trip calendar complete.",
        notes: [],
        startsAt: null,
        endsAt: null,
        bookingUrl: null,
        latitude: null,
        longitude: null,
      });
    }
  }
  return { ...trip, planItems };
}

function finalizeMutation(trip: EasyTTrip, options: { cascadeSchedule?: boolean } = {}): EasyTTrip {
  const cascaded = options.cascadeSchedule === false ? trip : reconcilePlanCoverage(cascadeTripSchedule(trip).trip);
  const withIntent = {
    ...cascaded,
    brief: { ...cascaded.brief, intent: tripIntentForTrip(cascaded) },
  };
  return { ...withIntent, recommendations: reviewTrip(withIntent) };
}

export function applyResolvedTripCopilotAction(trip: EasyTTrip, action: ResolvedTripCopilotAction): EasyTTrip {
  const source = cloneTrip(trip);
  if (action.action === "change_stop_nights") {
    assertStopNightsCanChange(source, action.stopId);
    if (action.resolution.type === "reduce_stop" || action.resolution.type === "increase_stop") {
      assertStopNightsCanChange(source, action.resolution.stopId);
    }
    let next = updateNightAllocation(source, action.stopId, action.nights);
    if (action.resolution.type === "extend_trip") next = { ...next, endDate: addDays(next.endDate, action.resolution.days) };
    if (action.resolution.type === "shorten_trip") next = { ...next, endDate: addDays(next.endDate, -action.resolution.days) };
    if (action.resolution.type === "reduce_stop") next = updateNightAllocation(next, action.resolution.stopId, action.resolution.nights);
    if (action.resolution.type === "increase_stop") next = updateNightAllocation(next, action.resolution.stopId, action.resolution.nights);
    return reconcileAuthoredDayState(source, finalizeMutation(next));
  }

  if (action.action === "set_trip_preference") {
    const structured = source.brief.structuredBrief;
    let brief = { ...source.brief };
    if (action.preference === "pace") {
      const pace = action.value as "relaxed" | "balanced" | "packed";
      brief = {
        ...brief,
        pace: pace === "packed" ? "full" : "slow",
        ...(structured ? { structuredBrief: mergeStructuredTripBrief(structured, { pace }) } : {}),
      };
    } else if (action.preference === "accommodation") {
      const fewer = action.value === "fewer_hotel_changes";
      brief = {
        ...brief,
        hotelChanges: fewer ? "few" : "some",
        ...(structured ? { structuredBrief: mergeStructuredTripBrief(structured, { accommodationPreferences: fewer ? ["fewer-hotel-changes"] : [] }) } : {}),
      };
    } else {
      const budget = action.value as "value" | "mid" | "high";
      brief = {
        ...brief,
        budgetBand: budget,
        ...(structured ? { structuredBrief: mergeStructuredTripBrief(structured, { budget }) } : {}),
      };
    }
    const next = { ...source, brief };
    const intent = tripIntentForTrip(next);
    const updatedIntent = action.preference === "pace"
      ? { ...intent, preferences: { ...intent.preferences, pace: action.value as "relaxed" | "balanced" | "packed" } }
      : action.preference === "budget"
        ? { ...intent, preferences: { ...intent.preferences, budgetSensitivity: action.value as "value" | "mid" | "high" } }
        : {
            ...intent,
            preferences: {
              ...intent.preferences,
              dislikes: action.value === "fewer_hotel_changes"
                ? [...new Set([...intent.preferences.dislikes.filter((item) => item !== "flexible hotel changes"), "frequent hotel changes"])]
                : intent.preferences.dislikes.filter((item) => item !== "frequent hotel changes"),
            },
          };
    return finalizeMutation({ ...next, brief: { ...next.brief, intent: updatedIntent } }, { cascadeSchedule: false });
  }

  const structured = source.brief.structuredBrief;
  const preferences = action.preference === "prefer_train" ? { transportPreferences: ["train" as const], avoidFlying: false, avoidDriving: false }
    : action.preference === "prefer_flight" ? { transportPreferences: ["flight" as const], avoidFlying: false, avoidDriving: false }
      : action.preference === "prefer_drive" ? { transportPreferences: ["drive" as const], avoidFlying: false, avoidDriving: false }
        : action.preference === "avoid_flight" ? { transportPreferences: ["train" as const, "drive" as const], avoidFlying: true, avoidDriving: false }
          : { transportPreferences: ["train" as const, "flight" as const], avoidFlying: false, avoidDriving: true };
  const next = {
    ...source,
    brief: {
      ...source.brief,
      ...(structured ? { structuredBrief: mergeStructuredTripBrief(structured, preferences) } : {}),
    },
  };
  const intent = tripIntentForTrip(next);
  const transportModes = action.preference === "prefer_train" ? ["train" as const]
    : action.preference === "prefer_flight" ? ["flight" as const]
      : action.preference === "prefer_drive" ? ["drive" as const]
        : action.preference === "avoid_flight" ? ["train" as const, "drive" as const]
          : ["train" as const, "flight" as const];
  const updatedIntent = {
    ...intent,
    hardConstraints: { ...intent.hardConstraints, avoidDriving: action.preference === "avoid_drive" },
    preferences: { ...intent.preferences, transportModes },
  };
  return finalizeMutation({ ...next, brief: { ...next.brief, intent: updatedIntent } }, { cascadeSchedule: false });
}

function formatDateRange(trip: EasyTTrip) {
  return `${trip.startDate} → ${trip.endDate}`;
}

function impacts(before: EasyTTrip, after: EasyTTrip): TripCopilotPreviewImpacts {
  const beforeHealth = tripHealth(before);
  const afterHealth = tripHealth(after);
  const beforeReadiness = tripReadinessSummary(before);
  const afterReadiness = tripReadinessSummary(after);
  const changedStops = after.stops.filter((stop) => {
    const prior = before.stops.find((item) => item.id === stop.id);
    return !prior || prior.nights !== stop.nights || prior.arrivalDate !== stop.arrivalDate || prior.departureDate !== stop.departureDate;
  }).map((stop) => stop.name);
  const changedDayCount = after.planItems.filter((item) => {
    const prior = before.planItems.find((candidate) => candidate.id === item.id);
    return !prior || prior.date !== item.date || prior.dayNumber !== item.dayNumber || prior.stopId !== item.stopId;
  }).length;
  const transferWarningCount = afterHealth.issues.filter((issue) => ["missing-transport-decision", "missing-logistics", "connection-confidence", "travel-day-impact"].includes(issue.rule)).length;
  return {
    dates: { before: formatDateRange(before), after: formatDateRange(after), changed: before.startDate !== after.startDate || before.endDate !== after.endDate },
    route: { changedStopCount: changedStops.length, changedStops },
    transfers: { changed: JSON.stringify(before.legs) !== JSON.stringify(after.legs), warningCount: transferWarningCount },
    itinerary: { changedDayCount },
    health: { before: beforeHealth.status, after: afterHealth.status, openIssuesBefore: beforeHealth.openIssueCount, openIssuesAfter: afterHealth.openIssueCount },
    readiness: { before: beforeReadiness.completeCount, after: afterReadiness.completeCount, readyBefore: beforeReadiness.isReady, readyAfter: afterReadiness.isReady },
  };
}

function candidate(before: EasyTTrip, action: TripCopilotAction, resolvedAction: ResolvedTripCopilotAction, summary: string, changes: TripCopilotPreviewChange[], warnings: string[]): TripCopilotPreviewCandidate {
  const resultingTrip = applyResolvedTripCopilotAction(before, resolvedAction);
  const cascadeWarnings = resultingTrip.brief.cascadeStatus?.conflicts ?? [];
  return {
    action,
    resolvedAction,
    summary,
    changes,
    impacts: impacts(before, resultingTrip),
    warnings: [...new Set([...warnings, ...cascadeWarnings])],
    resultingTrip,
  };
}

const preferenceLabel = (action: SetTripPreferenceAction) => action.preference === "pace"
  ? `Trip pace: ${action.value.replaceAll("_", " ")}`
  : action.preference === "accommodation"
    ? action.value === "fewer_hotel_changes" ? "Prefer fewer hotel changes" : "Allow flexible hotel changes"
    : `Budget preference: ${action.value}`;

const transportLabel = (preference: ChangeTransportPreferenceAction["preference"]) => ({
  prefer_train: "Prefer trains where practical",
  prefer_flight: "Prefer flights where practical",
  prefer_drive: "Prefer driving where practical",
  avoid_flight: "Avoid flights where practical",
  avoid_drive: "Avoid driving where practical",
})[preference];

export function buildTripCopilotPreviewCandidates(trip: EasyTTrip, action: TripCopilotAction, now = new Date()): TripCopilotPreviewCandidate[] {
  if (trip.status === "archived" || Date.parse(`${trip.endDate}T23:59:59Z`) < now.getTime()) {
    throw new TripCopilotActionValidationError("Past or archived trips cannot be changed by the co-pilot.");
  }
  if (action.action === "set_trip_preference") {
    const before = action.preference === "pace" ? trip.brief.structuredBrief?.pace?.value ?? tripIntentForTrip(trip).preferences.pace
      : action.preference === "accommodation" ? trip.brief.hotelChanges === "few" ? "fewer_hotel_changes" : "flexible_hotel_changes"
        : trip.brief.budgetBand;
    const label = preferenceLabel(action);
    return [candidate(trip, action, action, label, [{ label: "Travel preference", before, after: action.value }], ["This guides future Morrovia planning and does not rewrite confirmed transport or bookings."])];
  }
  if (action.action === "change_transport_preference") {
    const before = tripIntentForTrip(trip).preferences.transportModes.join(", ") || null;
    const label = transportLabel(action.preference);
    return [candidate(trip, action, action, label, [{ label: "Transport preference", before, after: label }], ["Existing transport legs and confirmed bookings will not be changed."])];
  }

  const stop = trip.stops.find((item) => item.id === action.stopId);
  if (!stop) throw new TripCopilotActionValidationError("That stop is no longer part of this trip.");
  const currentNights = stop.nights;
  if (currentNights === null) throw new TripCopilotActionValidationError(`${stop.name}'s current stay length is unknown, so Morrovia cannot safely change it.`);
  if (currentNights === action.nights) throw new TripCopilotActionValidationError(`${stop.name} is already set to ${action.nights} nights.`);
  const delta = action.nights - currentNights;
  const directResolution: ChangeStopNightsResolution = { type: "preserve_trip_dates" };
  const direct = candidate(trip, action, { ...action, resolution: directResolution }, `Change ${stop.name} to ${action.nights} nights`, [{ label: stop.name, before: `${currentNights} nights`, after: `${action.nights} nights` }], []);
  const exceedsTripEnd = direct.warnings.some((warning) => warning.includes("beyond the trip end"));
  if (delta === 0 || (delta > 0 && !exceedsTripEnd)) return [direct];

  const alternatives: TripCopilotPreviewCandidate[] = [];
  if (delta < 0) {
    const released = -delta;
    alternatives.push(candidate(
      trip,
      action,
      { ...action, resolution: { type: "shorten_trip", days: released } },
      `Shorten the trip by ${released} ${released === 1 ? "day" : "days"}`,
      [
        { label: stop.name, before: `${currentNights} nights`, after: `${action.nights} nights` },
        { label: "Trip end", before: trip.endDate, after: addDays(trip.endDate, -released) },
      ],
      [],
    ));
    const locked = new Set(trip.brief.scheduleLocks?.stopIds ?? []);
    for (const other of trip.stops.filter((item) => item.id !== stop.id && !locked.has(item.id) && !stayBookingForStop(trip, item) && item.nights !== null).slice(0, 3)) {
      const nights = (other.nights ?? 0) + released;
      alternatives.push(candidate(
        trip,
        action,
        { ...action, resolution: { type: "increase_stop", stopId: other.id, nights } },
        `Move ${released} ${released === 1 ? "night" : "nights"} from ${stop.name} to ${other.name}`,
        [
          { label: stop.name, before: `${currentNights} nights`, after: `${action.nights} nights` },
          { label: other.name, before: `${other.nights} ${other.nights === 1 ? "night" : "nights"}`, after: `${nights} ${nights === 1 ? "night" : "nights"}` },
        ],
        [],
      ));
    }
    return alternatives;
  }

  const extendResolution: ChangeStopNightsResolution = { type: "extend_trip", days: delta };
  alternatives.push(candidate(
    trip,
    action,
    { ...action, resolution: extendResolution },
    `Add ${delta} ${delta === 1 ? "day" : "days"} to the trip`,
    [
      { label: stop.name, before: `${currentNights} nights`, after: `${action.nights} nights` },
      { label: "Trip end", before: trip.endDate, after: addDays(trip.endDate, delta) },
    ],
    [],
  ));

  const locked = new Set(trip.brief.scheduleLocks?.stopIds ?? []);
  const reducible = trip.stops
    .filter((other) => other.id !== stop.id && !locked.has(other.id) && !stayBookingForStop(trip, other) && (other.nights ?? 0) - delta >= 1)
    .slice(0, 3);
  for (const other of reducible) {
    const nextOtherNights = (other.nights ?? 0) - delta;
    const resolution: ChangeStopNightsResolution = { type: "reduce_stop", stopId: other.id, nights: nextOtherNights };
    alternatives.push(candidate(
      trip,
      action,
      { ...action, resolution },
      `Move ${delta} ${delta === 1 ? "night" : "nights"} from ${other.name} to ${stop.name}`,
      [
        { label: stop.name, before: `${currentNights} nights`, after: `${action.nights} nights` },
        { label: other.name, before: `${other.nights} ${other.nights === 1 ? "night" : "nights"}`, after: `${nextOtherNights} ${nextOtherNights === 1 ? "night" : "nights"}` },
      ],
      [],
    ));
  }
  return alternatives;
}

export function accommodationImpactSummary(trip: EasyTTrip) {
  const accommodation = accommodationProgress(trip);
  return `${accommodation.sortedCount} of ${accommodation.stops.length} stays sorted`;
}
