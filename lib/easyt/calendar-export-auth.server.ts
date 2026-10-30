import 'server-only';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { symmetricEncrypt, symmetricDecrypt } from 'better-auth/crypto';
import { authorizationCodeRequest, getOAuth2Tokens, validateToken } from '@better-auth/core/oauth2';
import { getEasyTDatabase } from './database';
import { getEasyTAuthSecret, getMorroviaAuthBaseURL } from './auth-environment.ts';
import { CalendarExportError } from './calendar-export-sync.ts';
import { calendarConsentURL, completeCalendarConsent } from './calendar-export-auth.ts';
import type { CalendarConsentKind, CalendarConsentState, CalendarGrant } from './calendar-export-auth.ts';
const hash = (s: string) => createHash('sha256').update(s).digest('hex');
const key = () => {
    const s = getEasyTAuthSecret();
    if (!s)
        throw new CalendarExportError('NOT_CONFIGURED');
    return s;
};
export const calendarExportConfigured = () => process.env.MORROVIA_CALENDAR_EXPORT_ENABLED === 'true' && Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.DATABASE_URL && getEasyTAuthSecret());
export function requireCalendarExportConfigured() {
    if (!calendarExportConfigured())
        throw new CalendarExportError('NOT_CONFIGURED');
}
export async function beginCalendarExportConsent(ownerId: string, tripId: string, kind: CalendarConsentKind) {
    requireCalendarExportConfigured();
    const sql = getEasyTDatabase(), state = randomBytes(32).toString('base64url'), verifier = randomBytes(48).toString('base64url');
    const cipher = await symmetricEncrypt({ key: key(), data: verifier });
    await sql `delete from morrovia_calendar_oauth_states where owner_id=${ownerId} and expires_at<now()`;
    await sql `insert into morrovia_calendar_oauth_states(state_hash,owner_id,trip_id,verifier_cipher,consent_kind,expires_at) values (${hash(state)},${ownerId},${tripId},${cipher},${kind},now()+interval '10 minutes')`;
    const url = await calendarConsentURL({ clientId: process.env.GOOGLE_CLIENT_ID!, origin: getMorroviaAuthBaseURL(), state, verifier, kind });
    url.searchParams.set('nonce', hash(state));
    return url.toString();
}
export async function finishCalendarExportConsent(ownerId: string, stateValue: string, code: string) {
    requireCalendarExportConfigured();
    const sql = getEasyTDatabase();
    let grantId = '';
    const result = await completeCalendarConsent({ ownerId, state: stateValue, code }, {
        async consume(state, owner) {
            const rows = await sql `delete from morrovia_calendar_oauth_states where state_hash=${hash(state)} and owner_id=${owner} returning owner_id,trip_id,consent_kind,verifier_cipher,expires_at` as {
                owner_id: string;
                trip_id: string;
                consent_kind: CalendarConsentKind;
                verifier_cipher: string;
                expires_at: string;
            }[];
            const r = rows[0];
            if (!r)
                return null;
            return { ownerId: r.owner_id, tripId: r.trip_id, kind: r.consent_kind, expiresAt: new Date(r.expires_at).getTime(), verifier: await symmetricDecrypt({ key: key(), data: r.verifier_cipher }) } satisfies CalendarConsentState;
        },
        async exchange(authCode, verifier, state) {
            const clientId = process.env.GOOGLE_CLIENT_ID!, redirectURI = new URL('/api/easyt/calendar-export/callback', getMorroviaAuthBaseURL()).toString();
            const request = await authorizationCodeRequest({ code: authCode, codeVerifier: verifier, redirectURI, options: { clientId, clientSecret: process.env.GOOGLE_CLIENT_SECRET! }, authentication: 'post' });
            const response = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', ...request, cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(8000) });
            if (!response.ok)
                throw new CalendarExportError('AUTH_REQUIRED');
            const raw = await response.json();
            const tokens = getOAuth2Tokens(raw);
            if (!tokens.idToken || raw.token_type?.toLowerCase() !== 'bearer')
                throw new CalendarExportError('INVALID_GOOGLE_IDENTITY');
            const verified = await validateToken(tokens.idToken, 'https://www.googleapis.com/oauth2/v3/certs', { audience: clientId, issuer: 'https://accounts.google.com' });
            if (verified.payload.nonce !== hash(state) || verified.payload.azp && verified.payload.azp !== clientId || verified.payload.email_verified !== true)
                throw new CalendarExportError('INVALID_GOOGLE_IDENTITY');
            return { accessToken: tokens.accessToken ?? '', expiresAt: tokens.accessTokenExpiresAt?.getTime() ?? 0, scopes: tokens.scopes ?? [], subject: String(verified.payload.sub ?? ''), email: String(verified.payload.email ?? '') };
        },
        async save(owner, grant) {
            const cipher = await symmetricEncrypt({ key: key(), data: grant.accessToken });
            const saved = await sql `insert into morrovia_calendar_grants(id,owner_id,subject,account_label,token_cipher,expires_at,scopes) values (${randomUUID()}::uuid,${owner},${grant.subject},${grant.email},${cipher},${new Date(grant.expiresAt).toISOString()}::timestamptz,${JSON.stringify(grant.scopes)}::jsonb) on conflict(owner_id,subject) do update set account_label=excluded.account_label,token_cipher=excluded.token_cipher,expires_at=excluded.expires_at,scopes=excluded.scopes,generation=morrovia_calendar_grants.generation+1 returning id` as {
                id: string;
            }[];
            grantId = saved[0]!.id;
        },
    });
    return { ...result, grantId };
}
export type CalendarGrantRow = {
    id: string;
    subject: string;
    account_label: string;
    token_cipher: string | null;
    expires_at: string | null;
    scopes: string[];
    generation: number;
};
export async function listCalendarGrants(ownerId: string) { const sql = getEasyTDatabase(); await sql `update morrovia_calendar_grants set token_cipher=null where owner_id=${ownerId} and expires_at<=now() and token_cipher is not null`; return await sql `select id,subject,account_label,token_cipher,expires_at,scopes,generation from morrovia_calendar_grants where owner_id=${ownerId}` as CalendarGrantRow[]; }
export async function calendarGrant(ownerId: string, grantId: string): Promise<CalendarGrantRow & {
    accessToken: string;
}> {
    const rows = await listCalendarGrants(ownerId), r = rows.find(x => x.id === grantId);
    if (!r || !r.token_cipher || !r.expires_at || new Date(r.expires_at).getTime() <= Date.now() + 15000)
        throw new CalendarExportError('AUTH_REQUIRED');
    return { ...r, accessToken: await symmetricDecrypt({ key: key(), data: r.token_cipher }) };
}
export async function disconnectCalendarGrant(ownerId: string, grantId: string) { const sql = getEasyTDatabase(); await sql `with revoked as (update morrovia_calendar_grants set token_cipher=null,expires_at=null,generation=generation+1 where owner_id=${ownerId} and id=${grantId}::uuid returning subject) update morrovia_calendar_bindings set document=case when document ? 'review' then jsonb_set(document,'{review,cancelled}','true'::jsonb) else document end,version=version+1,lease_token=null,lease_until=null where owner_id=${ownerId} and subject in (select subject from revoked)`; await sql `delete from morrovia_calendar_oauth_states where owner_id=${ownerId}`; }
