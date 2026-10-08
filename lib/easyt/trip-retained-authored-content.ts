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
        if (entry.sourceKind !== undefined && !['removed_stop', 'retired_day'].includes(String(entry.sourceKind))) return false;
        if (entry.sourceKind === 'retired_day' && entry.days.length > 1) return false;
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
export function retainedSnapshotIsLive(after: EasyTTrip, entry: RetainedAuthoredStopContent) {
    return after.stops.some(stop => authoredContentKey(stop) === authoredContentKey(entry.sourceStop))
        && entry.days.every(day => after.planItems.some(item => authoredContentKey(item) === authoredContentKey(day.sourceDay))
            && authoredContentKey(after.brief.dayNotes?.[day.sourceDay.dayNumber]) === authoredContentKey(day.dayNotes)
            && authoredContentKey(after.brief.customActivities?.[day.sourceDay.dayNumber]) === authoredContentKey(day.customActivities))
        && entry.itineraryIdeas.every(idea => after.brief.itineraryIdeas?.some(item => authoredContentKey(item) === authoredContentKey(idea)))
        && entry.mapPins.every(pin => after.brief.mapPins?.some(item => authoredContentKey(item) === authoredContentKey(pin)));
}
/** Capture before any removed-stop filter. Historical bindings remain inside JSONB only. */
export function retainRemovedAuthoredContent(before: EasyTTrip, after: EasyTTrip): EasyTTrip {
    if (!validRetainedAuthoredContent(before.brief.retainedAuthoredContent) || !validRetainedAuthoredContent(after.brief.retainedAuthoredContent))
        throw new Error('invalid retained authored content');
    const entries = structuredClone((before.brief.retainedAuthoredContent?.entries ?? []).filter(entry => !retainedSnapshotIsLive(after, entry)));
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
    // Missing canonical day IDs at a surviving occurrence are historical snapshots,
    // never candidates for nearest-day reassignment or automatic grow restoration.
    if (after.schemaVersion === 2) for (const day of before.planItems.filter(day => active.has(day.stopId) && !after.planItems.some(item => item.id === day.id))) {
        const sourceStop = before.stops.find(stop => stop.id === day.stopId)!;
        const payload = { sourceKind: 'retired_day' as const, sourceStop: structuredClone(sourceStop),
            sourceIntentIds: before.brief.intent?.route?.destinations.filter(intent => intent.stopIds.includes(day.stopId)).map(intent => intent.id) ?? [],
            days: [{ sourceDay: structuredClone(day),
                ...(before.brief.dayNotes?.[day.dayNumber] !== undefined ? { dayNotes: structuredClone(before.brief.dayNotes[day.dayNumber]) } : {}),
                ...(before.brief.customActivities?.[day.dayNumber] !== undefined ? { customActivities: structuredClone(before.brief.customActivities[day.dayNumber]) } : {}) }],
            itineraryIdeas: structuredClone((before.brief.itineraryIdeas ?? []).filter(idea => idea.dayId === day.id)),
            mapPins: structuredClone((before.brief.mapPins ?? []).filter(pin => pin.dayNumber === day.dayNumber)) };
        if (entries.some(({id: _id, ...entry}) => authoredContentKey(entry) === authoredContentKey(payload))) continue;
        const stem = `retained-day:${encodeURIComponent(day.stopId)}:${encodeURIComponent(day.id)}:`;
        let generation = 0;
        while (entries.some(entry => entry.id === `${stem}${generation}`)) generation++;
        entries.push({id: `${stem}${generation}`, ...payload});
    }
    return { ...after, brief: { ...after.brief, retainedAuthoredContent: entries.length ? { version: 1, entries } : undefined } };
}
export function retainedAuthoredContentForReview(trip: EasyTTrip) {
    // Suppress only known blank calendar scaffolding; retain all recovery bytes
    // and treat any unknown/authored field as reviewable.
    const blankDay=(entry:RetainedAuthoredStopContent,day:RetainedAuthoredStopContent['days'][number])=>{
      const expected={id:day.sourceDay.id,stopId:entry.sourceStop.id,dayNumber:day.sourceDay.dayNumber,date:day.sourceDay.date,type:'open',title:`Flexible day in ${entry.sourceStop.name}`,reason:'Plan this day around your preferences.',notes:[],startsAt:null,endsAt:null,bookingUrl:null,latitude:null,longitude:null};
      return day.sourceDay.id.startsWith(`${trip.id}-calendar:`)&&authoredContentKey(day.sourceDay)===authoredContentKey(expected)
        && !(day.dayNotes?.length||day.customActivities?.length)
        && Object.keys(day).every(key=>['sourceDay','dayNotes','customActivities'].includes(key));
    };
    return structuredClone((trip.brief.retainedAuthoredContent?.entries ?? []).filter(entry=>entry.sourceKind!=='retired_day'
      ||Object.keys(entry).some(key=>!['id','sourceKind','sourceStop','sourceIntentIds','days','itineraryIdeas','mapPins'].includes(key))||entry.itineraryIdeas.length||entry.mapPins.length
      ||!entry.days.length||entry.days.some(day=>!blankDay(entry,day))));
}
/** Deliberate structural inverse restores only exact occurrence snapshots. */
export function restoreRetainedAuthoredContent(trip: EasyTTrip, sourceStops: EasyTTrip["stops"]): EasyTTrip {
    const next = structuredClone(trip);
    const entries = next.brief.retainedAuthoredContent?.entries ?? [];
    const restoredIds = new Set<string>();
    for (const entry of entries) {
        if (entry.sourceKind === "retired_day" || !sourceStops.some(stop => authoredContentKey(stop) === authoredContentKey(entry.sourceStop)))
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

/** In-memory inverse owns calendar identity, not the whole document. */
export type BuilderCalendarSnapshot = {
    planItems: EasyTTrip['planItems'];
    dayNotes: EasyTTrip['brief']['dayNotes'];
    customActivities: EasyTTrip['brief']['customActivities'];
    itineraryIdeas: EasyTTrip['brief']['itineraryIdeas'];
    mapPins: EasyTTrip['brief']['mapPins'];
    retainedAuthoredContent: EasyTTrip['brief']['retainedAuthoredContent'];
};
export function captureBuilderCalendarSnapshot(trip: EasyTTrip): BuilderCalendarSnapshot {
    return structuredClone({planItems: trip.planItems, dayNotes: trip.brief.dayNotes,
        customActivities: trip.brief.customActivities, itineraryIdeas: trip.brief.itineraryIdeas,
        mapPins: trip.brief.mapPins, retainedAuthoredContent: trip.brief.retainedAuthoredContent});
}
/** Restore exact missing sources, retaining later values on surviving IDs. */
export function restoreBuilderCalendarSnapshot(trip: EasyTTrip, snapshot: BuilderCalendarSnapshot, sourceStops: EasyTTrip['stops']): EasyTTrip {
    const next = structuredClone(trip);
    const entries = next.brief.retainedAuthoredContent?.entries ?? [];
    const oldEntryIds = new Set(snapshot.retainedAuthoredContent?.entries.map(entry => entry.id));
    const targetIds = new Set(snapshot.planItems.map(day => day.id));
    const currentById = new Map(trip.planItems.map(day => [day.id, day]));
    const currentByNumber = new Map(trip.planItems.map(day => [day.dayNumber, day]));
    const restored = new Set<string>();
    const consumed = new Set<string>();
    for (const day of trip.planItems.filter(day => !targetIds.has(day.id) && sourceStops.some(stop => stop.id === day.stopId))) {
        const {id, stopId, date: _date, dayNumber: _number, contextNotes: _generated, ...content} = day;
        const stop = trip.stops.find(stop => stop.id === stopId)!;
        const blank = {type: 'open', title: `Flexible day in ${stop.name}`, reason: 'Plan this day around your preferences.', notes: [], startsAt: null, endsAt: null, bookingUrl: null, latitude: null, longitude: null};
        if (!id.startsWith(`${trip.id}-calendar:`) || authoredContentKey(content) !== authoredContentKey(blank)
            || trip.brief.dayNotes?.[day.dayNumber]?.length || trip.brief.customActivities?.[day.dayNumber]?.length
            || trip.brief.itineraryIdeas?.some(idea => idea.dayId === id) || trip.brief.mapPins?.some(pin => pin.dayNumber === day.dayNumber))
            throw new Error('inverse calendar content conflict');
    }
    next.planItems = snapshot.planItems.map(source => {
        const current = currentById.get(source.id);
        if (current) {
            if (current.date !== source.date && (current.startsAt || current.endsAt || current.bookingUrl
                || trip.brief.itineraryIdeas?.some(idea => idea.dayId === current.id && 'startsAt' in idea && idea.startsAt)))
                throw new Error('inverse protected date conflict');
            return {...current, dayNumber: source.dayNumber, date: source.date};
        }
        const entry = entries.find(entry => !oldEntryIds.has(entry.id)
            && sourceStops.some(stop => authoredContentKey(stop) === authoredContentKey(entry.sourceStop))
            && entry.days.some(day => authoredContentKey(day.sourceDay) === authoredContentKey(source)
                && authoredContentKey(day.dayNotes) === authoredContentKey(snapshot.dayNotes?.[source.dayNumber])
                && authoredContentKey(day.customActivities) === authoredContentKey(snapshot.customActivities?.[source.dayNumber])));
        if (!entry) throw new Error('inverse calendar source conflict');
        // All values in a consumed entry must belong to this exact captured calendar.
        if (entry.days.some(day => !snapshot.planItems.some(item => authoredContentKey(item) === authoredContentKey(day.sourceDay)))
            || entry.itineraryIdeas.some(idea => !snapshot.itineraryIdeas?.some(item => authoredContentKey(item) === authoredContentKey(idea)))
            || entry.mapPins.some(pin => !snapshot.mapPins?.some(item => authoredContentKey(item) === authoredContentKey(pin))))
            throw new Error('inverse retained snapshot conflict');
        consumed.add(entry.id); restored.add(source.id);
        return structuredClone(source);
    });
    const targetById = new Map(next.planItems.map(day => [day.id, day]));
    const remapRecord = (record: Record<number, string[]> | undefined, captured: Record<number, string[]> | undefined) => {
        const result: Record<number, string[]> = {};
        for (const [number, values] of Object.entries(record ?? {})) {
            const source = currentByNumber.get(Number(number));
            const target = source ? targetById.get(source.id) : undefined;
            if (target) result[target.dayNumber] = structuredClone(values);
            else if (!source) result[Number(number)] = structuredClone(values);
        }
        for (const day of next.planItems.filter(day => restored.has(day.id))) if (captured?.[day.dayNumber] !== undefined)
            result[day.dayNumber] = structuredClone(captured[day.dayNumber]);
        return record !== undefined || Object.keys(result).length ? result : undefined;
    };
    next.brief.dayNotes = remapRecord(trip.brief.dayNotes, snapshot.dayNotes);
    next.brief.customActivities = remapRecord(trip.brief.customActivities, snapshot.customActivities);
    next.brief.mapPins = trip.brief.mapPins?.flatMap(pin => {
        const source = currentByNumber.get(pin.dayNumber), target = source ? targetById.get(source.id) : undefined;
        return target ? [{...pin, dayNumber: target.dayNumber}] : source ? [] : [pin];
    });
    for (const entry of entries.filter(entry => consumed.has(entry.id))) {
        for (const idea of entry.itineraryIdeas) {
            const current = next.brief.itineraryIdeas?.find(item => item.id === idea.id);
            if (current && authoredContentKey(current) !== authoredContentKey(idea)) throw new Error('inverse idea conflict');
            if (!current) (next.brief.itineraryIdeas ??= []).push(structuredClone(idea));
        }
        for (const pin of entry.mapPins) {
            const current = next.brief.mapPins?.find(item => item.id === pin.id);
            if (current && authoredContentKey(current) !== authoredContentKey(pin)) throw new Error('inverse pin conflict');
            if (!current) (next.brief.mapPins ??= []).push(structuredClone(pin));
        }
    }
    const order = new Map(snapshot.itineraryIdeas?.map((idea, index) => [idea.id, index]));
    next.brief.itineraryIdeas?.sort((a, b) => (order.get(a.id) ?? Infinity) - (order.get(b.id) ?? Infinity));
    next.brief.retainedAuthoredContent = entries.some(entry => !consumed.has(entry.id)) ? {version: 1, entries: entries.filter(entry => !consumed.has(entry.id))} : undefined;
    return next;
}

/** Prefix reconciliation must keep values restored by an exact structural inverse. */
export function restoreRetiredDayBindings(trip: EasyTTrip, entries: RetainedAuthoredStopContent[], accepted: EasyTTrip): EasyTTrip {
    const next = structuredClone(trip);
    for (const entry of entries) for (const source of entry.days) {
        const day = next.planItems.find(day => day.id === source.sourceDay.id && day.stopId === source.sourceDay.stopId);
        if (!day) continue; // An incompatible dated source was retained again, not moved.
        if (source.dayNotes) (next.brief.dayNotes ??= {})[day.dayNumber] = structuredClone(source.dayNotes);
        if (source.customActivities) (next.brief.customActivities ??= {})[day.dayNumber] = structuredClone(source.customActivities);
        for (const idea of entry.itineraryIdeas) {
            const current = next.brief.itineraryIdeas?.find(item => item.id === idea.id);
            if (current && authoredContentKey(current) !== authoredContentKey(idea)) throw new Error('inverse idea conflict');
            if (!current) (next.brief.itineraryIdeas ??= []).push(structuredClone(idea));
        }
        for (const pin of entry.mapPins) {
            const restored = {...pin, dayNumber: day.dayNumber};
            const current = next.brief.mapPins?.find(item => item.id === pin.id);
            if (current && authoredContentKey(current) !== authoredContentKey(restored)) throw new Error('inverse pin conflict');
            if (!current) (next.brief.mapPins ??= []).push(structuredClone(restored));
        }
    }
    const order = new Map(accepted.brief.itineraryIdeas?.map((idea, index) => [idea.id, index]));
    next.brief.itineraryIdeas?.sort((a, b) => (order.get(a.id) ?? Infinity) - (order.get(b.id) ?? Infinity));
    return next;
}
