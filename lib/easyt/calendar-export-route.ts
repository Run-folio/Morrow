import { CalendarExportError } from './calendar-export-sync.ts';
import { assertCalendarRequestOrigin } from './calendar-export-auth.ts';
export function calendarRouteError(error: unknown) { const code = error instanceof CalendarExportError ? error.code : error instanceof Error && error.message === 'Unauthorized' ? 'UNAUTHORIZED' : 'UNAVAILABLE'; const status = code === 'UNAUTHORIZED' ? 401 : ['NOT_FOUND'].includes(code) ? 404 : ['INVALID_ORIGIN', 'ACCOUNT_CHANGED'].includes(code) ? 403 : ['INVALID_REQUEST', 'INVALID_SELECTION', 'NO_EVENTS'].includes(code) ? 400 : code === 'NOT_CONFIGURED' ? 503 : 409; return { code, status }; }
export async function calendarMutationBody(request: Request, origin: string) {
    assertCalendarRequestOrigin(request, origin);
    if (!request.headers.get('content-type')?.startsWith('application/json'))
        throw new CalendarExportError('INVALID_REQUEST');
    const raw = await request.text();
    if (raw.length > 16384)
        throw new CalendarExportError('INVALID_REQUEST');
    try {
        const body = JSON.parse(raw);
        if (!body || typeof body !== 'object' || Array.isArray(body))
            throw Error();
        return body as Record<string, unknown>;
    }
    catch {
        throw new CalendarExportError('INVALID_REQUEST');
    }
}
export function calendarString(value: unknown, max = 255): string {
    if (typeof value !== 'string' || !value || value.length > max || /[\u0000-\u001f]/.test(value))
        throw new CalendarExportError('INVALID_REQUEST');
    return value;
}
export function calendarUuid(value: unknown) {
    const id = calendarString(value);
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))
        throw new CalendarExportError('INVALID_REQUEST');
    return id;
}
export const calendarJsonHeaders = { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' };
export function assertCalendarExpectedOwner(request: Request, ownerId: string) {
    if (request.headers.get('x-morrovia-expected-owner') !== ownerId)
        throw new CalendarExportError('ACCOUNT_CHANGED');
}
