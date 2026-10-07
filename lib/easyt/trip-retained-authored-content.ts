import type { EasyTTrip, RetainedAuthoredStopContent } from './trip.ts';
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const strings = (value: unknown) => Array.isArray(value) && value.every(item => typeof item === 'string');
/** Stable semantic comparison preserves full snapshots, including future authored fields. */
export function authoredContentKey(value: unknown): string {
    if (Array.isArray(value))
        return `[${value.map(authoredContentKey).join(',')}]`;
    if (object(value))
        return `{${Object.keys(value).filter(key => value[key] !== undefined).sort().map(key => `${JSON.stringify(key)}:${authoredContentKey(value[key])}`).join(',')}}`;
    return JSON.stringify(value);
}
export function validRetainedAuthoredContent(value: unknown): boolean {
    if (value === undefined)
        return true;
    if (!object(value) || value.version !== 1 || !Array.isArray(value.entries))
        return false;
    const ids = new Set<string>();
    return value.entries.every(entry => {
        if (!object(entry) || typeof entry.id !== 'string' || !entry.id || ids.has(entry.id) || !object(entry.sourceStop) || typeof entry.sourceStop.id !== 'string'
            || typeof entry.sourceStop.name !== 'string' || typeof entry.sourceStop.country !== 'string' || !strings(entry.sourceIntentIds) || !Array.isArray(entry.days) || !Array.isArray(entry.itineraryIdeas) || !Array.isArray(entry.mapPins))
            return false;
        ids.add(entry.id);
        const sourceStopId = entry.sourceStop.id;
        const dayIds = new Set<string>();
        return entry.days.every(day => {
            if (!object(day) || !object(day.sourceDay))
                return false;
            const item = day.sourceDay;
            if (typeof item.id !== 'string' || dayIds.has(item.id) || item.stopId !== sourceStopId || !Number.isInteger(item.dayNumber) || typeof item.date !== 'string' || typeof item.title !== 'string' || typeof item.reason !== 'string' || !strings(item.notes))
                return false;
            dayIds.add(item.id);
            return [item.startsAt, item.endsAt, item.bookingUrl, item.image, item.sourceUrl].every(v => v == null || typeof v === 'string')
                && [item.latitude, item.longitude].every(v => v == null || typeof v === 'number' && Number.isFinite(v))
                && (item.contextNotes === undefined || strings(item.contextNotes))
                && (item.noteDayParts === undefined || Array.isArray(item.noteDayParts) && item.noteDayParts.every(v => v === null || ['morning', 'midday', 'afternoon', 'evening'].includes(String(v))))
                && (day.dayNotes === undefined || strings(day.dayNotes)) && (day.customActivities === undefined || strings(day.customActivities));
        }) && entry.itineraryIdeas.every(idea => object(idea) && typeof idea.id === 'string' && idea.stopId === sourceStopId
            && (idea.source === 'google-place-reference' ? object(idea.providerReference) && idea.providerReference.provider === 'google' && typeof idea.providerReference.placeId === 'string' : typeof idea.title === 'string'))
            && entry.mapPins.every(pin => object(pin) && typeof pin.id === 'string' && typeof pin.title === 'string' && Number.isInteger(pin.dayNumber) && typeof pin.latitude === 'number' && typeof pin.longitude === 'number');
    });
}
/** Capture before any removed-stop filter. Historical bindings remain inside JSONB only. */
export function retainRemovedAuthoredContent(before: EasyTTrip, after: EasyTTrip): EasyTTrip {
    if (!validRetainedAuthoredContent(before.brief.retainedAuthoredContent) || !validRetainedAuthoredContent(after.brief.retainedAuthoredContent))
        throw new Error('invalid retained authored content');
    const restored = (entry: RetainedAuthoredStopContent) => after.stops.some(stop => authoredContentKey(stop) === authoredContentKey(entry.sourceStop))
        && entry.days.every(day => after.planItems.some(item => authoredContentKey(item) === authoredContentKey(day.sourceDay))
            && authoredContentKey(after.brief.dayNotes?.[day.sourceDay.dayNumber]) === authoredContentKey(day.dayNotes)
            && authoredContentKey(after.brief.customActivities?.[day.sourceDay.dayNumber]) === authoredContentKey(day.customActivities))
        && entry.itineraryIdeas.every(idea => after.brief.itineraryIdeas?.some(item => authoredContentKey(item) === authoredContentKey(idea)))
        && entry.mapPins.every(pin => after.brief.mapPins?.some(item => authoredContentKey(item) === authoredContentKey(pin)));
    const entries = structuredClone((before.brief.retainedAuthoredContent?.entries ?? []).filter(entry => !restored(entry)));
    for (const entry of after.brief.retainedAuthoredContent?.entries ?? []) {
        const old = entries.find(e => e.id === entry.id);
        if (old && authoredContentKey(old) !== authoredContentKey(entry))
            throw new Error('retained content conflict');
        if (!old)
            entries.push(structuredClone(entry));
    }
    const active = new Set(after.stops.map(s => s.id));
    for (const stop of before.stops.filter(s => !active.has(s.id))) {
        const days = before.planItems.filter(d => d.stopId === stop.id);
        const numbers = new Set(days.map(d => d.dayNumber));
        const entry: RetainedAuthoredStopContent = { id: `retained-stop:${stop.id}`, sourceStop: structuredClone(stop), sourceIntentIds: before.brief.intent?.route?.destinations.filter(i => i.stopIds.includes(stop.id)).map(i => i.id) ?? [],
            days: days.map(sourceDay => ({ sourceDay: structuredClone(sourceDay), ...(before.brief.dayNotes?.[sourceDay.dayNumber] !== undefined ? { dayNotes: structuredClone(before.brief.dayNotes[sourceDay.dayNumber]) } : {}), ...(before.brief.customActivities?.[sourceDay.dayNumber] !== undefined ? { customActivities: structuredClone(before.brief.customActivities[sourceDay.dayNumber]) } : {}) })),
            itineraryIdeas: structuredClone((before.brief.itineraryIdeas ?? []).filter(i => i.stopId === stop.id)), mapPins: structuredClone((before.brief.mapPins ?? []).filter(p => numbers.has(p.dayNumber))) };
        const old = entries.find(e => e.id === entry.id);
        if (old && authoredContentKey(old) !== authoredContentKey(entry))
            throw new Error('retained content conflict');
        if (!old)
            entries.push(entry);
    }
    return { ...after, brief: { ...after.brief, retainedAuthoredContent: entries.length ? { version: 1, entries } : undefined } };
}
export function retainedAuthoredContentForReview(trip: EasyTTrip) {
    return structuredClone(trip.brief.retainedAuthoredContent?.entries ?? []);
}
/** Deliberate structural inverse restores only exact occurrence snapshots. */
export function restoreRetainedAuthoredContent(trip: EasyTTrip, sourceStops: EasyTTrip["stops"]): EasyTTrip {
    const next = structuredClone(trip);
    const entries = next.brief.retainedAuthoredContent?.entries ?? [];
    const restoredIds = new Set<string>();
    for (const entry of entries) {
        if (!sourceStops.some(stop => authoredContentKey(stop) === authoredContentKey(entry.sourceStop)))
            continue;
        for (const day of entry.days) {
            const existing = next.planItems.find(item => item.id === day.sourceDay.id);
            if (existing && authoredContentKey(existing) !== authoredContentKey(day.sourceDay))
                throw new Error("inverse content conflict");
            if (!existing)
                next.planItems.push(structuredClone(day.sourceDay));
            if (day.dayNotes)
                (next.brief.dayNotes ??= {})[day.sourceDay.dayNumber] = structuredClone(day.dayNotes);
            if (day.customActivities)
                (next.brief.customActivities ??= {})[day.sourceDay.dayNumber] = structuredClone(day.customActivities);
        }
        for (const idea of entry.itineraryIdeas) {
            const existing = next.brief.itineraryIdeas?.find(item => item.id === idea.id);
            if (existing && authoredContentKey(existing) !== authoredContentKey(idea))
                throw new Error("inverse idea conflict");
            if (!existing)
                (next.brief.itineraryIdeas ??= []).push(structuredClone(idea));
        }
        for (const pin of entry.mapPins) {
            const existing = next.brief.mapPins?.find(item => item.id === pin.id);
            if (existing && authoredContentKey(existing) !== authoredContentKey(pin))
                throw new Error("inverse pin conflict");
            if (!existing)
                (next.brief.mapPins ??= []).push(structuredClone(pin));
        }
        restoredIds.add(entry.id);
    }
    next.planItems.sort((a, b) => a.dayNumber - b.dayNumber);
    next.brief.retainedAuthoredContent = entries.some(entry => !restoredIds.has(entry.id)) ? { version: 1, entries: entries.filter(entry => !restoredIds.has(entry.id)) } : undefined;
    return next;
}
export type RetainedContentSelection = {
    entryId: string;
    expectedContentKey: string;
    dayIds?: string[];
    ideaIds?: string[];
    pinIds?: string[];
};
export type RetainedContentConsumption = {
    version: 1;
    ownerId: string | null;
    tripId: string;
    sourceKey: string;
    candidateKey: string;
    selection: RetainedContentSelection;
    action: "remove" | "move";
    target?: {
        stopId: string;
        dayId: string;
    };
};
function consumptionFor(before: EasyTTrip, after: EasyTTrip, selection: RetainedContentSelection, action: "remove" | "move", target?: {
    stopId: string;
    dayId: string;
}): RetainedContentConsumption {
    return { version: 1, ownerId: before.ownerId, tripId: before.id, sourceKey: authoredContentKey(before), candidateKey: authoredContentKey(after), selection: structuredClone(selection), action, ...(target ? { target: structuredClone(target) } : {}) };
}
type RetainedActionResult = {
    ok: true;
    trip: EasyTTrip;
    consumption: RetainedContentConsumption;
} | {
    ok: false;
    reason: 'stale' | 'invalid-bindings' | 'protected-date';
};
function selectedEntry(trip: EasyTTrip, selection: RetainedContentSelection) {
    const entry = trip.brief.retainedAuthoredContent?.entries.find(item => item.id === selection.entryId);
    if (!entry || authoredContentKey(entry) !== selection.expectedContentKey)
        return null;
    if ((selection.dayIds ?? []).some(id => !entry.days.some(day => day.sourceDay.id === id)) || (selection.ideaIds ?? []).some(id => !entry.itineraryIdeas.some(idea => idea.id === id)) || (selection.pinIds ?? []).some(id => !entry.mapPins.some(pin => pin.id === id)))
        return null;
    return entry;
}
/** Explicit traveller removal is the only destructive consumption outside Undo/move. */
export function removeRetainedAuthoredContent(trip: EasyTTrip, selection: RetainedContentSelection): RetainedActionResult {
    if (!validRetainedAuthoredContent(trip.brief.retainedAuthoredContent))
        return { ok: false, reason: 'invalid-bindings' };
    const entry = selectedEntry(trip, selection);
    if (!entry)
        return { ok: false, reason: 'stale' };
    const next = structuredClone(trip);
    const entries = next.brief.retainedAuthoredContent!.entries;
    const index = entries.findIndex(item => item.id === entry.id);
    entries[index] = { ...entries[index], days: entry.days.filter(day => !selection.dayIds?.includes(day.sourceDay.id)), itineraryIdeas: entry.itineraryIdeas.filter(idea => !selection.ideaIds?.includes(idea.id)), mapPins: entry.mapPins.filter(pin => !selection.pinIds?.includes(pin.id)) };
    if (!entries[index].days.length && !entries[index].itineraryIdeas.length && !entries[index].mapPins.length)
        entries.splice(index, 1);
    if (!entries.length)
        next.brief.retainedAuthoredContent = undefined;
    return { ok: true, trip: next, consumption: consumptionFor(trip, next, selection, "remove") };
}
/** Move selected full values to a real day; incompatible fixed dates remain retained. */
export function moveRetainedAuthoredContent(trip: EasyTTrip, selection: RetainedContentSelection, target: {
    stopId: string;
    dayId: string;
}): RetainedActionResult {
    const entry = selectedEntry(trip, selection);
    if (!entry)
        return { ok: false, reason: 'stale' };
    const day = trip.planItems.find(item => item.id === target.dayId && item.stopId === target.stopId);
    if (!day || !trip.stops.some(stop => stop.id === target.stopId))
        return { ok: false, reason: 'invalid-bindings' };
    const sourceDays = entry.days.filter(item => selection.dayIds?.includes(item.sourceDay.id));
    if (sourceDays.length > 1)
        return { ok: false, reason: 'invalid-bindings' };
    if (sourceDays.some(item => item.sourceDay.date !== day.date && (item.sourceDay.startsAt || item.sourceDay.endsAt || item.sourceDay.bookingUrl)))
        return { ok: false, reason: 'protected-date' };
    if (sourceDays.length && (day.notes.length || day.startsAt || day.endsAt || day.bookingUrl || trip.brief.dayNotes?.[day.dayNumber]?.length || trip.brief.customActivities?.[day.dayNumber]?.length))
        return { ok: false, reason: 'invalid-bindings' };
    const consumed = removeRetainedAuthoredContent(trip, selection);
    if (!consumed.ok)
        return consumed;
    const next = consumed.trip;
    for (const item of sourceDays) {
        const index = next.planItems.findIndex(item => item.id === day.id);
        next.planItems[index] = { ...structuredClone(item.sourceDay), id: day.id, stopId: day.stopId, dayNumber: day.dayNumber, date: day.date };
        if (item.dayNotes)
            (next.brief.dayNotes ??= {})[day.dayNumber] = structuredClone(item.dayNotes);
        if (item.customActivities)
            (next.brief.customActivities ??= {})[day.dayNumber] = structuredClone(item.customActivities);
    }
    for (const idea of entry.itineraryIdeas.filter(item => selection.ideaIds?.includes(item.id))) {
        if (next.brief.itineraryIdeas?.some(item => item.id === idea.id))
            return { ok: false, reason: 'invalid-bindings' };
        (next.brief.itineraryIdeas ??= []).push({ ...structuredClone(idea), stopId: day.stopId, dayId: day.id });
    }
    for (const pin of entry.mapPins.filter(item => selection.pinIds?.includes(item.id))) {
        if (next.brief.mapPins?.some(item => item.id === pin.id))
            return { ok: false, reason: 'invalid-bindings' };
        (next.brief.mapPins ??= []).push({ ...structuredClone(pin), dayNumber: day.dayNumber });
    }
    return { ok: true, trip: next, consumption: consumptionFor(trip, next, selection, "move", target) };
}
/** Explicit ownership is transient: validate the exact action once before the first save. */
export function prepareRetainedContentPreservationSource(before: EasyTTrip, candidate: EasyTTrip, receipt: RetainedContentConsumption): EasyTTrip {
    if (!receipt || receipt.version !== 1 || receipt.ownerId !== before.ownerId || receipt.tripId !== before.id
        || receipt.sourceKey !== authoredContentKey(before) || receipt.candidateKey !== authoredContentKey(candidate))
        throw new Error("stale retained consumption");
    const reproduced = receipt.action === "remove" ? removeRetainedAuthoredContent(before, receipt.selection)
        : receipt.action === "move" && receipt.target ? moveRetainedAuthoredContent(before, receipt.selection, receipt.target) : null;
    if (!reproduced?.ok || authoredContentKey(reproduced.trip) !== receipt.candidateKey)
        throw new Error("invalid retained consumption");
    return structuredClone(reproduced.trip);
}
