import type { EasyTTrip, ItineraryDayPart } from "./trip.ts";
import { reconcileItineraryIdeas } from "./itinerary-ideas.ts";

function authoredDayMapping(before: EasyTTrip, after: EasyTTrip) {
  const afterById = new Map(after.planItems.map((item) => [item.id, item]));
  const afterByStop = new Map(after.stops.map((stop) => [
    stop.id,
    after.planItems.filter((item) => item.stopId === stop.id).sort((left, right) => left.dayNumber - right.dayNumber),
  ]));
  return new Map(before.planItems.map((item) => {
    const sameItem = afterById.get(item.id);
    if (sameItem) return [item.dayNumber, sameItem.dayNumber] as const;
    const sameStop = afterByStop.get(item.stopId) ?? [];
    if (!after.stops.some((stop) => stop.id === item.stopId)) return [item.dayNumber, undefined] as const;
    const nearest = sameStop.reduce<(typeof sameStop)[number] | undefined>((best, candidate) => !best
      || Math.abs(candidate.dayNumber - item.dayNumber) < Math.abs(best.dayNumber - item.dayNumber)
      ? candidate
      : best, undefined);
    return [item.dayNumber, nearest?.dayNumber ?? item.dayNumber] as const;
  }));
}

function authoredDayIdMapping(before: EasyTTrip, after: EasyTTrip) {
  const afterById = new Map(after.planItems.map((item) => [item.id, item]));
  const afterByStop = new Map(after.stops.map((stop) => [
    stop.id,
    after.planItems.filter((item) => item.stopId === stop.id).sort((left, right) => left.dayNumber - right.dayNumber),
  ]));
  return new Map(before.planItems.map((item) => {
    const sameItem = afterById.get(item.id);
    if (sameItem) return [item.id, sameItem.id] as const;
    if (!after.stops.some((stop) => stop.id === item.stopId)) return [item.id, undefined] as const;
    const sameStop = afterByStop.get(item.stopId) ?? [];
    const nearest = sameStop.reduce<(typeof sameStop)[number] | undefined>((best, candidate) => !best
      || Math.abs(candidate.dayNumber - item.dayNumber) < Math.abs(best.dayNumber - item.dayNumber)
      ? candidate
      : best, undefined);
    return [item.id, nearest?.id] as const;
  }));
}

function remapAuthoredDays(record: Record<number, string[]> | undefined, dayMapping: Map<number, number | undefined>) {
  if (!record) return undefined;
  const remapped: Record<number, string[]> = {};
  for (const [sourceDay, values] of Object.entries(record)) {
    const numericSourceDay = Number(sourceDay);
    if (dayMapping.has(numericSourceDay) && dayMapping.get(numericSourceDay) === undefined) continue;
    const targetDay = dayMapping.get(numericSourceDay) ?? numericSourceDay;
    remapped[targetDay] = [...(remapped[targetDay] ?? []), ...values];
  }
  return remapped;
}

function normalized(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

function remappedDayPartQueues(before: EasyTTrip, dayMapping: Map<number, number | undefined>) {
  const queues = new Map<number, Map<string, ItineraryDayPart[]>>();
  for (const item of before.planItems) {
    const targetDay = dayMapping.get(item.dayNumber) ?? item.dayNumber;
    if (dayMapping.has(item.dayNumber) && dayMapping.get(item.dayNumber) === undefined) continue;
    item.notes.forEach((note, index) => {
      const dayPart = item.noteDayParts?.[index];
      if (!dayPart) return;
      const byTitle = queues.get(targetDay) ?? new Map<string, ItineraryDayPart[]>();
      const key = normalized(note);
      byTitle.set(key, [...(byTitle.get(key) ?? []), dayPart]);
      queues.set(targetDay, byTitle);
    });
  }
  return queues;
}

/**
 * Keep traveller-authored day state attached to the same surviving canonical
 * day container (or nearest surviving day at the same stop) after a cascade.
 */
export function reconcileAuthoredDayState(before: EasyTTrip, after: EasyTTrip): EasyTTrip {
  const dayMapping = authoredDayMapping(before, after);
  const dayIdMapping = authoredDayIdMapping(before, after);
  const customActivities = remapAuthoredDays(before.brief.customActivities, dayMapping);
  const dayNotes = remapAuthoredDays(before.brief.dayNotes, dayMapping);
  const mapPins = before.brief.mapPins?.flatMap((pin) => {
    if (dayMapping.has(pin.dayNumber) && dayMapping.get(pin.dayNumber) === undefined) return [];
    return [{ ...pin, dayNumber: dayMapping.get(pin.dayNumber) ?? pin.dayNumber }];
  });
  const itineraryIdeas = before.brief.itineraryIdeas?.map((idea) => {
    if (!idea.dayId || !dayIdMapping.has(idea.dayId)) return { ...idea };
    const targetDayId = dayIdMapping.get(idea.dayId);
    return targetDayId
      ? { ...idea, dayId: targetDayId }
      : { ...idea, dayId: undefined, dayPart: undefined };
  });
  const dayPartQueues = remappedDayPartQueues(before, dayMapping);
  const planItems = after.planItems.map((item) => {
    const notes = customActivities
      ? [...item.notes, ...(customActivities[item.dayNumber] ?? []).filter((activity) => !item.notes.includes(activity))]
      : [...item.notes];
    const byTitle = dayPartQueues.get(item.dayNumber);
    const noteDayParts = notes.map((note, index) => {
      const queue = byTitle?.get(normalized(note));
      const generatedPart = item.noteDayParts?.[index] ?? null;
      if (generatedPart) {
        queue?.shift();
        return generatedPart;
      }
      return queue?.shift() ?? null;
    });
    return {
      ...item,
      notes,
      ...(item.noteDayParts || noteDayParts.some(Boolean) ? { noteDayParts } : {}),
    };
  });
  return reconcileItineraryIdeas({
    ...after,
    planItems,
    brief: {
      ...after.brief,
      ...(customActivities ? { customActivities } : {}),
      ...(dayNotes ? { dayNotes } : {}),
      ...(mapPins ? { mapPins } : {}),
      ...(itineraryIdeas ? { itineraryIdeas } : {}),
    },
  });
}
