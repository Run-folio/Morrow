import { CalendarExportError } from './calendar-export-sync.ts';
import type { GoogleExportProvider, RemoteExportEvent } from './calendar-export-sync.ts';
import type { CalendarExportPayload } from './calendar-export.ts';
const base = 'https://www.googleapis.com/calendar/v3';
type Fetcher = typeof fetch;
export type CalendarDestination = {
    id: string;
    label: string;
    description: string;
    timeZone?: string;
};
async function request(token: string, path: string, init: RequestInit = {}, fetcher: Fetcher = fetch): Promise<any> {
    let response: Response;
    try {
        response = await fetcher(`${base}${path}`, { ...init, cache: 'no-store', redirect: 'error', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...Object.fromEntries(new Headers(init.headers)) }, signal: AbortSignal.timeout(8000) });
    }
    catch {
        throw new CalendarExportError(init.method && init.method !== 'GET' ? 'UNCERTAIN' : 'PROVIDER_UNAVAILABLE');
    }
    if (response.status === 404 || response.status === 410)
        throw new CalendarExportError('GOOGLE_REMOVED');
    if (response.status === 401)
        throw new CalendarExportError('AUTH_REQUIRED');
    if (response.status === 403)
        throw new CalendarExportError('ACCESS_DENIED');
    if (response.status === 409 || response.status === 412)
        throw new CalendarExportError('GOOGLE_CHANGED');
    if (!response.ok)
        throw new CalendarExportError(init.method && init.method !== 'GET' && response.status >= 500 ? 'UNCERTAIN' : 'PROVIDER_UNAVAILABLE');
    if (response.status === 204)
        return null;
    try {
        return await response.json();
    }
    catch {
        throw new CalendarExportError(init.method && init.method !== 'GET' ? 'UNCERTAIN' : 'PROVIDER_UNAVAILABLE');
    }
}
function event(raw: any): RemoteExportEvent {
    const p: CalendarExportPayload = { summary: typeof raw.summary === 'string' ? raw.summary : '', description: typeof raw.description === 'string' ? raw.description : '', ...(typeof raw.location === 'string' ? { location: raw.location } : {}), start: { date: raw.start?.date ?? '' }, end: { date: raw.end?.date ?? '' }, visibility: raw.visibility ?? 'default', transparency: raw.transparency ?? 'opaque', status: raw.status === 'tentative' ? 'tentative' : 'confirmed' };
    return { id: String(raw.id ?? ''), etag: String(raw.etag ?? ''), marker: raw.extendedProperties?.private?.morroExport ?? null, payload: p, status: raw.status === 'cancelled' ? 'cancelled' : 'confirmed', hasGuests: Array.isArray(raw.attendees) && raw.attendees.length > 0 };
}
export function createGoogleExportProvider(token: string, calendarId: string, fetcher: Fetcher = fetch): GoogleExportProvider {
    const path = `/calendars/${encodeURIComponent(calendarId)}/events`;
    const body = (payload: CalendarExportPayload, marker: string) => ({ ...payload, extendedProperties: { private: { morroExport: marker } } });
    return {
        async get(id) {
            try {
                return event(await request(token, `${path}/${encodeURIComponent(id)}`, {}, fetcher));
            }
            catch (e) {
                if (e instanceof CalendarExportError && e.code === 'GOOGLE_REMOVED')
                    return null;
                throw e;
            }
        },
        async insert(id, payload, marker) { return event(await request(token, path, { method: 'POST', body: JSON.stringify({ ...body(payload, marker), id }) }, fetcher)); },
        async patch(id, payload, marker, etag) { return event(await request(token, `${path}/${encodeURIComponent(id)}`, { method: 'PATCH', headers: { 'If-Match': etag }, body: JSON.stringify({ ...body(payload, marker), location: payload.location ?? null }) }, fetcher)); },
        async remove(id, etag) { await request(token, `${path}/${encodeURIComponent(id)}`, { method: 'DELETE', headers: { 'If-Match': etag } }, fetcher); },
    };
}
export async function ownedCalendarDestinations(token: string, fetcher: Fetcher = fetch): Promise<CalendarDestination[]> {
    const results: CalendarDestination[] = [];
    let page: string | undefined;
    let pages = 0;
    do {
        const raw = await request(token, `/users/me/calendarList?minAccessRole=owner&maxResults=250${page ? `&pageToken=${encodeURIComponent(page)}` : ''}`, {}, fetcher);
        for (const c of raw.items ?? [])
            if (c.accessRole === 'owner' && typeof c.id === 'string' && !c.deleted)
                results.push({ id: c.id, label: String(c.summaryOverride ?? c.summary ?? 'Calendar'), description: String(c.description ?? ''), ...(c.timeZone ? { timeZone: String(c.timeZone) } : {}) });
        page = raw.nextPageToken;
        if (++pages > 20)
            throw new CalendarExportError('TOO_MANY_CALENDARS');
    } while (page);
    return results;
}
export async function createTripCalendar(token: string, title: string, marker: string, fetcher: Fetcher = fetch): Promise<CalendarDestination> {
    try {
        const c = await request(token, '/calendars', { method: 'POST', body: JSON.stringify({ summary: title.slice(0, 150), description: `Morro export marker: ${marker}` }) }, fetcher);
        if (typeof c.id !== 'string')
            throw new CalendarExportError('UNCERTAIN');
        return { id: c.id, label: String(c.summary ?? title), description: String(c.description ?? '') };
    }
    catch (e) {
        if (e instanceof CalendarExportError && e.code === 'UNCERTAIN')
            throw new CalendarExportError('CALENDAR_CREATION_UNCERTAIN');
        throw e;
    }
}
