import { cascadeTripSchedule } from './cascade.ts';
import { calendarDayAllocationsFromNights } from './night-allocation.ts';
import { retainRemovedAuthoredContent } from './trip-retained-authored-content.ts';
import type { EasyTTrip, PlanItem } from './trip.ts';

const DAY = 86_400_000;
const time = (date: string) => Date.parse(`${date}T00:00:00Z`);

/** One deterministic calendar projection, used before saving and by the worker. */
export function projectBuilderCalendar(before: EasyTTrip, input: EasyTTrip) {
    const schedule = cascadeTripSchedule(input);
    const trip = schedule.trip;
    const counts = calendarDayAllocationsFromNights(trip.stops.map(stop => stop.id),
        Object.fromEntries(trip.stops.map(stop => [stop.id, Math.max(0, stop.nights ?? 0)])));
    let nextGeneration = input.brief.builderCalendarGeneration ?? 0;
    if (!Number.isSafeInteger(nextGeneration) || nextGeneration < 0) throw new Error('invalid calendar generation');
    const used = new Set([...before.planItems, ...input.planItems].map(day => day.id));
    for (const entry of [...before.brief.retainedAuthoredContent?.entries ?? [], ...input.brief.retainedAuthoredContent?.entries ?? []]) {
        for (const day of entry.days) used.add(day.sourceDay.id);
        for (const idea of entry.itineraryIdeas) if (idea.dayId) used.add(idea.dayId);
    }
    const planItems: PlanItem[] = [];
    for (const stop of trip.stops) {
        const prior = input.planItems.filter(day => day.stopId === stop.id).sort((a, b) => a.dayNumber - b.dayNumber);
        for (let offset = 0; offset < counts[stop.id]; offset++) {
            const date = new Date(time(stop.arrivalDate ?? trip.startDate) + offset * DAY).toISOString().slice(0, 10);
            const dayNumber = Math.round((time(date) - time(trip.startDate)) / DAY) + 1;
            const old = prior[offset];
            const timedReference = old && input.brief.itineraryIdeas?.some(idea => idea.dayId === old.id && 'startsAt' in idea && idea.startsAt);
            if (old && (old.date === date || !(old.startsAt || old.endsAt || old.bookingUrl || timedReference))) {
                planItems.push({ ...old, date, dayNumber });
                continue;
            }
            const stem = `${trip.id}-calendar:${encodeURIComponent(stop.id)}:${offset}:`;
            let generation = nextGeneration;
            while (used.has(`${stem}${generation}`)) generation++;
            if (!Number.isSafeInteger(generation + 1)) throw new Error('calendar generation exhausted');
            nextGeneration = generation + 1;
            const id = `${stem}${generation}`;
            used.add(id);
            planItems.push({ id, stopId: stop.id, date, dayNumber, type: 'open', title: `Flexible day in ${stop.name}`,
                reason: 'Plan this day around your preferences.', notes: [], startsAt: null, endsAt: null, bookingUrl: null,
                latitude: null, longitude: null });
        }
    }
    let projected = retainRemovedAuthoredContent(before, { ...trip, planItems,
        brief: { ...trip.brief, ...(nextGeneration !== input.brief.builderCalendarGeneration && nextGeneration > 0
            ? { builderCalendarGeneration: nextGeneration } : {}) } });
    // An inverse can supply a restored source absent from the current live list.
    // If a newer fixed date makes it incompatible, retain that full source too.
    const restoredSources = input.planItems.filter(day => !before.planItems.some(item => item.id === day.id));
    if (restoredSources.length) projected = retainRemovedAuthoredContent({ ...input, planItems: restoredSources }, projected);
    return { trip: projected, status: projected.brief.cascadeStatus! };
}
