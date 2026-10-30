import { createAuthorizationURL } from '@better-auth/core/oauth2';
import { CalendarExportError } from './calendar-export-sync.ts';
export type CalendarConsentKind = 'existing-owned' | 'new-trip';
export const CALENDAR_SCOPE_PREFIX = 'https://www.googleapis.com/auth/';
export function calendarConsentScopes(kind: CalendarConsentKind) { return ['openid', 'email', `${CALENDAR_SCOPE_PREFIX}calendar.calendarlist.readonly`, `${CALENDAR_SCOPE_PREFIX}${kind === 'new-trip' ? 'calendar.app.created' : 'calendar.events.owned'}`]; }
export async function calendarConsentURL(input: {
    clientId: string;
    origin: string;
    state: string;
    verifier: string;
    kind: CalendarConsentKind;
}) {
    return createAuthorizationURL({ id: 'google-calendar-export', options: { clientId: input.clientId }, authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth', state: input.state, codeVerifier: input.verifier, redirectURI: new URL('/api/easyt/calendar-export/callback', input.origin).toString(), scopes: calendarConsentScopes(input.kind), prompt: 'select_account consent', accessType: 'online' });
}
export function validateCalendarGrant(grant: {
    accessToken: string;
    expiresAt: number;
    scopes: string[];
    subject: string;
    email: string;
}, kind: CalendarConsentKind) {
    if (!grant.accessToken || !Number.isFinite(grant.expiresAt) || grant.expiresAt <= Date.now())
        throw new CalendarExportError('AUTH_REQUIRED');
    if (!grant.subject || grant.subject.length > 255 || !grant.email || grant.email.length > 320)
        throw new CalendarExportError('INVALID_GOOGLE_IDENTITY');
    const required = calendarConsentScopes(kind).filter(x => x.startsWith(CALENDAR_SCOPE_PREFIX));
    if (required.some(x => !grant.scopes.includes(x)))
        throw new CalendarExportError('MISSING_SCOPES');
}
export function assertCalendarRequestOrigin(request: Request, origin: string) {
    if (request.headers.get('origin') !== origin || request.headers.get('sec-fetch-site') === 'cross-site')
        throw new CalendarExportError('INVALID_ORIGIN');
}
export type CalendarConsentState = {
    ownerId: string;
    tripId: string;
    kind: CalendarConsentKind;
    verifier: string;
    expiresAt: number;
};
export type CalendarGrant = {
    accessToken: string;
    expiresAt: number;
    scopes: string[];
    subject: string;
    email: string;
};
export async function completeCalendarConsent(input: {
    ownerId: string;
    state: string;
    code: string;
}, deps: {
    consume(state: string, ownerId: string): Promise<CalendarConsentState | null>;
    exchange(code: string, verifier: string, state: string): Promise<CalendarGrant>;
    save(ownerId: string, grant: CalendarGrant): Promise<void>;
}) {
    const state = await deps.consume(input.state, input.ownerId);
    if (!state || state.ownerId !== input.ownerId || state.expiresAt <= Date.now())
        throw new CalendarExportError('INVALID_STATE');
    const grant = await deps.exchange(input.code, state.verifier, input.state);
    validateCalendarGrant(grant, state.kind);
    await deps.save(input.ownerId, grant);
    return { tripId: state.tripId, kind: state.kind };
}
/** Input list must already be filtered to user-owned calendars by the provider. */
export function calendarDestinationsForGrant<T extends {
    id: string;
}>(owned: T[], scopes: string[], appCreatedIds: string[]): T[] {
    if (scopes.includes(`${CALENDAR_SCOPE_PREFIX}calendar.events.owned`))
        return owned;
    const created = new Set(appCreatedIds);
    return scopes.includes(`${CALENDAR_SCOPE_PREFIX}calendar.app.created`) ? owned.filter(c => created.has(c.id)) : [];
}
