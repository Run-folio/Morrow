import { createHash } from 'node:crypto';
import { itineraryCalendarDays } from './itinerary-calendar.ts';
import type { EasyTTrip, TripBooking } from './trip.ts';
export type CalendarExportPayload = {
    summary: string;
    description: string;
    location?: string;
    start: {
        date: string;
    };
    end: {
        date: string;
    };
    visibility: 'private';
    transparency: 'transparent';
    status: 'tentative' | 'confirmed';
};
export type CalendarExportItem = {
    sourceKey: string;
    aliases?: string[];
    payload: CalendarExportPayload;
    qualification: 'date-only' | 'planning-estimate';
};
export type CalendarExportIssue = {
    sourceKey: string;
    reason: string;
};
export type CalendarExportProjection = {
    items: CalendarExportItem[];
    excluded: CalendarExportIssue[];
    blocked: CalendarExportIssue[];
    membershipKeys: string[];
};
export function validCalendarDate(value: string | null | undefined): value is string {
    if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value))
        return false;
    const date = new Date(`${value}T00:00:00Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value && value >= '0001-01-01' && value < '9999-12-31';
}
function nextDate(value: string) { const d = new Date(`${value}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); }
function canonical(value: unknown): unknown {
    if (Array.isArray(value))
        return value.map(canonical);
    if (value && typeof value === 'object')
        return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, canonical(v)]));
    return value;
}
export function calendarExportPayloadHash(payload: CalendarExportPayload): string { return createHash('sha256').update(JSON.stringify(canonical(payload))).digest('hex'); }
const text = (value: string) => value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 500);
/** Read-only allowlist. The current trip model has no complete event-zone/end facts;
 * a local startsAt or a provider duration is never promoted into a timed event. */
export function projectCalendarExport(trip: EasyTTrip, applicationOrigin?: string): CalendarExportProjection {
    const tripLink = applicationOrigin && new URL(applicationOrigin).origin === applicationOrigin && /^https?:/.test(applicationOrigin) ? `${applicationOrigin}/journey/${encodeURIComponent(trip.id)}/itinerary` : '';
    const result: CalendarExportProjection = { items: [], excluded: [], blocked: [], membershipKeys: [] };
    const members = new Set<string>(), emitted = new Set<string>(), representedBookings = new Set<string>();
    const issue = (key: string, reason: string, blocked = false) => {
        const list = blocked ? result.blocked : result.excluded;
        if (!list.some(x => x.sourceKey === key))
            list.push({ sourceKey: key, reason });
    };
    const add = (key: string, title: string, date: string | null | undefined, end?: string | null, kind: 'normal' | 'stay' | 'estimate' = 'normal', location?: string | null, fullDay = false, aliases: string[] = []) => {
        members.add(key);
        aliases.forEach(a => members.add(a));
        if (emitted.has(key)) {
            const previous = result.items.find(i => i.sourceKey === key);
            if (previous)
                previous.aliases = [...new Set([...(previous.aliases ?? []), ...aliases])];
            return;
        }
        emitted.add(key);
        if (!text(title)) {
            issue(key, 'Event title missing');
            return;
        }
        if (!validCalendarDate(date)) {
            issue(key, 'Date not set or invalid');
            return;
        }
        if (kind === 'stay' && !validCalendarDate(end)) {
            issue(key, 'Checkout date not set or invalid');
            return;
        }
        if (end && (!validCalendarDate(end) || end <= date)) {
            issue(key, 'End date conflicts with start date', true);
            return;
        }
        const estimate = kind === 'estimate';
        const qualification = estimate ? 'Planning estimate' : kind === 'stay' || fullDay ? 'Date only' : 'Time not set';
        result.items.push({ sourceKey: key, aliases, qualification: estimate ? 'planning-estimate' : 'date-only', payload: {
                summary: text(`${text(title)}${kind === 'stay' || fullDay ? '' : ` — ${qualification}`}`),
                description: `${qualification}. Manage this trip in Morro.${tripLink ? '\n' + tripLink : ''}`,
                ...(location ? { location: text(location) } : {}), start: { date }, end: { date: end || nextDate(date) },
                visibility: 'private', transparency: 'transparent', status: kind === 'stay' || fullDay ? 'confirmed' : 'tentative',
            } });
    };
    // Membership is independent of renderability, preventing accidental remote deletions.
    for (const idea of trip.brief.itineraryIdeas ?? []) {
        members.add(`activity:${idea.id}`);
    }
    for (const leg of trip.legs)
        members.add(`transfer:${leg.id}`);
    for (const booking of trip.brief.bookings ?? [])
        members.add(`booking:${booking.id}`);
    const addBooking = (booking: TripBooking, aliases: string[] = []) => add(`booking:${booking.id}`, booking.title, booking.date, booking.endDate, booking.type === 'stay' ? 'stay' : 'normal', booking.location, false, aliases);
    const days = itineraryCalendarDays(trip);
    const ambiguousBookings = new Set<string>();
    for (const day of days)
        for (const item of day.items)
            if (item.kind === 'activity' && item.activity.booking?.date === day.day.date) {
                ambiguousBookings.add(item.activity.booking.id);
                issue(`activity:${item.activity.id}`, 'Activity and booking association needs confirmation', true);
                issue(`booking:${item.activity.booking.id}`, 'Activity and booking association needs confirmation', true);
            }
    for (const day of days)
        for (const item of day.items) {
            if (item.kind === 'transfer') {
                const candidate = item.agenda.booking, leg = item.agenda.leg;
                const bound = candidate && candidate.travellerMarkedBooked !== false && (candidate.id === leg.id || candidate.id === `transport-${leg.id}` || leg.routeMetadata.importedBookingId === candidate.id || candidate.transportLegBinding?.legId === leg.id && candidate.transportLegBinding.fromEndpointId === item.agenda.from.id && candidate.transportLegBinding.toEndpointId === item.agenda.to.id && candidate.transportLegBinding.mode === leg.mode);
                if (bound && item.agenda.booking) {
                    representedBookings.add(item.agenda.booking.id);
                    addBooking(item.agenda.booking, [`transfer:${item.agenda.leg.id}`]);
                }
                else
                    add(`transfer:${item.agenda.leg.id}`, `${item.agenda.from.name} → ${item.agenda.to.name}`, item.agenda.date, undefined, item.agenda.leg.provenance === 'planning_estimate' ? 'estimate' : 'normal');
            }
            else if (item.kind === 'activity') {
                if (item.activity.booking && ambiguousBookings.has(item.activity.booking.id)) {
                    representedBookings.add(item.activity.booking.id);
                    continue;
                }
                if (item.activity.source === 'itinerary-idea')
                    add(`activity:${item.activity.id}`, item.activity.title, day.day.date, undefined, 'normal', item.activity.area, item.schedule.kind === 'full-day');
                else if (item.activity.source === 'google-place-reference')
                    issue(`activity:${item.activity.id}`, 'Place details need confirming');
                else
                    issue(`legacy:${day.id}:${item.activity.noteIndex}`, 'Legacy activity has no stable saved identity');
            }
            else if (!ambiguousBookings.has(item.booking.id)) {
                representedBookings.add(item.booking.id);
                addBooking(item.booking);
            }
        }
    // Include real dated bookings even if the itinerary render doesn't assign a day.
    for (const b of trip.brief.bookings ?? [])
        if (!representedBookings.has(b.id) && !ambiguousBookings.has(b.id))
            addBooking(b);
    for (const idea of trip.brief.itineraryIdeas ?? [])
        if (idea.dayId && !emitted.has(`activity:${idea.id}`))
            issue(`activity:${idea.id}`, 'Scheduled day or place details unavailable');
    for (const leg of trip.legs)
        if (!emitted.has(`transfer:${leg.id}`)) {
            const represented = days.some(d => d.items.some(i => i.kind === 'transfer' && i.agenda.leg.id === leg.id && Boolean(i.agenda.booking)));
            if (!represented)
                issue(`transfer:${leg.id}`, 'Transfer date or endpoints unavailable');
        }
    result.membershipKeys = [...members].sort();
    return result;
}
