import 'server-only';
import { randomUUID } from 'node:crypto';
import { getEasyTDatabase } from './database';
import { calendarGrant, listCalendarGrants } from './calendar-export-auth.server';
import { calendarBinding, getCalendarBinding, listCalendarBindings, calendarExportStore } from './calendar-export-store.server';
import { createGoogleExportProvider, ownedCalendarDestinations, createTripCalendar } from './google-calendar-export.ts';
import { applyCalendarExport, previewCalendarExport, CalendarExportError } from './calendar-export-sync.ts';
import { projectCalendarExport } from './calendar-export.ts';
import { CALENDAR_SCOPE_PREFIX, calendarDestinationsForGrant } from './calendar-export-auth.ts';
import { getMorroviaAuthBaseURL } from './auth-environment';
import { getTripForOwner } from './repository';
import type { EasyTTrip } from './trip.ts';
async function tripFor(ownerId: string, tripId: string) {
    const trip = await getTripForOwner(ownerId, tripId);
    if (!trip)
        throw new CalendarExportError('NOT_FOUND');
    return trip;
}
export async function calendarExportStatus(ownerId: string, tripId: string) {
    const trip = await tripFor(ownerId, tripId), projection = projectCalendarExport(trip, getMorroviaAuthBaseURL()), grants = await listCalendarGrants(ownerId), bindings = await listCalendarBindings(ownerId, tripId);
    return { savedRevision: trip.updatedAt, eligibleCount: projection.items.length, events: projection.items, excluded: projection.excluded, blocked: projection.blocked, grants: grants.map(g => ({ id: g.id, label: g.account_label, connected: Boolean(g.token_cipher && g.expires_at && new Date(g.expires_at).getTime() > Date.now() + 15000), canExisting: g.scopes.includes(`${CALENDAR_SCOPE_PREFIX}calendar.events.owned`), canCreate: g.scopes.includes(`${CALENDAR_SCOPE_PREFIX}calendar.app.created`) })), bindings: bindings.map(b => ({ id: b.id, grantId: grants.find(g => g.subject === b.subject)?.id, calendarId: b.calendar_id, label: b.label })), hasPreviousSend: bindings.some(b => b.has_exports) };
}
export async function calendarDestinations(ownerId: string, grantId: string) {
    const grant = await calendarGrant(ownerId, grantId);
    const all = await ownedCalendarDestinations(grant.accessToken);
    if (grant.scopes.includes(`${CALENDAR_SCOPE_PREFIX}calendar.events.owned`))
        return all;
    const sql = getEasyTDatabase();
    const created = await sql `select calendar_id from morrovia_calendar_creation_intents where owner_id=${ownerId} and grant_id=${grantId}::uuid and status='created'` as {
        calendar_id: string;
    }[];
    const ids = new Set(created.map(c => c.calendar_id));
    return all.filter(c => ids.has(c.id) && grant.scopes.includes(`${CALENDAR_SCOPE_PREFIX}calendar.app.created`));
}
async function newTripDestination(ownerId: string, trip: EasyTTrip, grantId: string) {
    const grant = await calendarGrant(ownerId, grantId);
    if (!grant.scopes.includes(`${CALENDAR_SCOPE_PREFIX}calendar.app.created`))
        throw new CalendarExportError('CREATE_CONSENT_REQUIRED');
    const sql = getEasyTDatabase();
    type Intent = {
        marker: string;
        status: string;
        calendar_id: string | null;
        calendar_label: string | null;
    };
    const marker = randomUUID();
    const inserted = await sql `insert into morrovia_calendar_creation_intents(owner_id,trip_id,grant_id,marker,status) values (${ownerId},${trip.id},${grantId}::uuid,${marker}::uuid,'creating') on conflict do nothing returning marker,status,calendar_id,calendar_label` as Intent[];
    const rows = inserted.length ? inserted : await sql `select marker,status,calendar_id,calendar_label from morrovia_calendar_creation_intents where owner_id=${ownerId} and trip_id=${trip.id} and grant_id=${grantId}::uuid` as Intent[];
    const intent = rows[0];
    if (!intent)
        throw new CalendarExportError('CALENDAR_CREATION_UNCERTAIN');
    if (intent.status === 'created' && intent.calendar_id)
        return { id: intent.calendar_id, label: intent.calendar_label ?? trip.title };
    let mayCreate = inserted.length > 0;
    if (intent.status === 'rejected') {
        const claimed = await sql `update morrovia_calendar_creation_intents set status='creating' where owner_id=${ownerId} and trip_id=${trip.id} and grant_id=${grantId}::uuid and status='rejected' returning marker`;
        mayCreate = claimed.length > 0;
    }
    if (!mayCreate) {
        const candidates = (await ownedCalendarDestinations(grant.accessToken)).filter(c => c.description === `Morro export marker: ${intent.marker}`);
        if (candidates.length !== 1)
            throw new CalendarExportError('CALENDAR_CREATION_UNCERTAIN');
        const c = candidates[0]!;
        await sql `update morrovia_calendar_creation_intents set status='created',calendar_id=${c.id},calendar_label=${c.label} where owner_id=${ownerId} and trip_id=${trip.id} and grant_id=${grantId}::uuid`;
        return c;
    }
    try {
        const liveGrant = await calendarGrant(ownerId, grantId);
        if (liveGrant.generation !== grant.generation)
            throw new CalendarExportError('ACCOUNT_CHANGED');
        const c = await createTripCalendar(liveGrant.accessToken, trip.title, intent.marker);
        await sql `update morrovia_calendar_creation_intents set status='created',calendar_id=${c.id},calendar_label=${c.label} where owner_id=${ownerId} and trip_id=${trip.id} and grant_id=${grantId}::uuid`;
        return c;
    }
    catch (error) {
        const code = error instanceof CalendarExportError ? error.code : 'CALENDAR_CREATION_UNCERTAIN';
        const rejected = ['AUTH_REQUIRED', 'ACCESS_DENIED', 'ACCOUNT_CHANGED', 'PROVIDER_UNAVAILABLE', 'GOOGLE_CHANGED'].includes(code);
        await sql `update morrovia_calendar_creation_intents set status=${rejected ? 'rejected' : 'uncertain'} where owner_id=${ownerId} and trip_id=${trip.id} and grant_id=${grantId}::uuid`;
        throw new CalendarExportError(rejected ? code : 'CALENDAR_CREATION_UNCERTAIN');
    }
}
async function dependencies(ownerId: string, tripId: string, bindingId: string, grantId: string) {
    const binding = await getCalendarBinding(ownerId, bindingId, tripId), grant = await calendarGrant(ownerId, grantId);
    if (grant.subject !== binding.subject)
        throw new CalendarExportError('ACCOUNT_CHANGED');
    const owned = (await ownedCalendarDestinations(grant.accessToken)).find(c => c.id === binding.calendarId);
    if (!owned)
        throw new CalendarExportError('DESTINATION_UNAVAILABLE');
    const sql = getEasyTDatabase();
    const appCreated = await sql `select marker from morrovia_calendar_creation_intents where owner_id=${ownerId} and grant_id=${grantId}::uuid and calendar_id=${binding.calendarId} and status='created'` as {
        marker: string;
    }[];
    if (!grant.scopes.includes(`${CALENDAR_SCOPE_PREFIX}calendar.events.owned`) && !(appCreated.length && grant.scopes.includes(`${CALENDAR_SCOPE_PREFIX}calendar.app.created`)))
        throw new CalendarExportError('EXISTING_CONSENT_REQUIRED');
    return { store: calendarExportStore, provider: createGoogleExportProvider(grant.accessToken, binding.calendarId), now: Date.now, applicationOrigin: getMorroviaAuthBaseURL(), connectionVersion: grant.generation, async currentRevision(owner: string, trip: string) {
            const currentGrant = await calendarGrant(owner, grantId);
            if (currentGrant.generation !== grant.generation)
                throw new CalendarExportError('ACCOUNT_CHANGED');
            return (await tripFor(owner, trip)).updatedAt;
        } };
}
export async function reviewCalendarExport(input: {
    ownerId: string;
    tripId: string;
    expectedRevision: string;
    grantId: string;
    calendarId: string;
}) {
    const trip = await tripFor(input.ownerId, input.tripId);
    if (trip.updatedAt !== input.expectedRevision)
        throw new CalendarExportError('STALE_REVIEW');
    const grant = await calendarGrant(input.ownerId, input.grantId), dest = (await ownedCalendarDestinations(grant.accessToken)).find(c => c.id === input.calendarId);
    if (!dest)
        throw new CalendarExportError('DESTINATION_UNAVAILABLE');
    const binding = await calendarBinding(input.ownerId, trip.id, grant.subject, dest.id, dest.label);
    const deps = await dependencies(input.ownerId, trip.id, binding.id, input.grantId);
    // Retry an interrupted review instead of losing durable uncertain operation identities.
    if (!binding.review?.cancelled && binding.review?.connectionVersion === deps.connectionVersion && binding.review?.revision === trip.updatedAt && binding.review?.operations.some(o => o.status === 'uncertain'))
        return { bindingId: binding.id, review: binding.review, recovering: true };
    return { bindingId: binding.id, review: await previewCalendarExport({ ownerId: input.ownerId, bindingId: binding.id, trip }, deps), recovering: false };
}
export async function sendCalendarExport(input: {
    ownerId: string;
    tripId: string;
    grantId: string;
    bindingId: string;
    reviewId: string;
    selectedOperationIds: string[];
    idempotencyKey: string;
}) {
    const deps = await dependencies(input.ownerId, input.tripId, input.bindingId, input.grantId);
    return applyCalendarExport(input, deps);
}
export async function createAndReviewTripCalendar(input: {
    ownerId: string;
    tripId: string;
    expectedRevision: string;
    grantId: string;
}) {
    const trip = await tripFor(input.ownerId, input.tripId);
    if (trip.updatedAt !== input.expectedRevision)
        throw new CalendarExportError('STALE_REVIEW');
    if (projectCalendarExport(trip, getMorroviaAuthBaseURL()).items.length === 0)
        throw new CalendarExportError('NO_EVENTS');
    const destination = await newTripDestination(input.ownerId, trip, input.grantId);
    return reviewCalendarExport({ ...input, calendarId: destination.id });
}
export async function createAndSendTripCalendar(input: {
    ownerId: string;
    tripId: string;
    expectedRevision: string;
    grantId: string;
    selectedSourceKeys: string[];
    idempotencyKey: string;
}) {
    const trip = await tripFor(input.ownerId, input.tripId);
    if (trip.updatedAt !== input.expectedRevision)
        throw new CalendarExportError('STALE_REVIEW');
    const available = new Set(projectCalendarExport(trip, getMorroviaAuthBaseURL()).items.map(i => i.sourceKey));
    if (!input.selectedSourceKeys.length || new Set(input.selectedSourceKeys).size !== input.selectedSourceKeys.length || input.selectedSourceKeys.some(k => !available.has(k)))
        throw new CalendarExportError('INVALID_SELECTION');
    const destination = await newTripDestination(input.ownerId, trip, input.grantId), grant = await calendarGrant(input.ownerId, input.grantId);
    const binding = await calendarBinding(input.ownerId, trip.id, grant.subject, destination.id, destination.label);
    if (Object.values(binding.items).some(i => i.acknowledged) && binding.review?.idempotencyKey !== input.idempotencyKey)
        throw new CalendarExportError('EXISTING_CALENDAR_REVIEW_REQUIRED');
    const deps = await dependencies(input.ownerId, trip.id, binding.id, input.grantId);
    const review = binding.review?.idempotencyKey === input.idempotencyKey ? binding.review : await previewCalendarExport({ ownerId: input.ownerId, bindingId: binding.id, trip }, deps);
    if (review.operations.some(o => o.action !== 'add'))
        throw new CalendarExportError('EXISTING_CALENDAR_REVIEW_REQUIRED');
    return applyCalendarExport({ ownerId: input.ownerId, bindingId: binding.id, reviewId: review.id, selectedOperationIds: review.operations.filter(o => input.selectedSourceKeys.includes(o.sourceKey)).map(o => o.id), idempotencyKey: input.idempotencyKey }, deps);
}
export async function readdCalendarExport(input: {
    ownerId: string;
    tripId: string;
    grantId: string;
    bindingId: string;
    sourceKey: string;
    expectedRevision: string;
}) {
    const trip = await tripFor(input.ownerId, input.tripId);
    if (trip.updatedAt !== input.expectedRevision)
        throw new CalendarExportError('STALE_REVIEW');
    const deps = await dependencies(input.ownerId, trip.id, input.bindingId, input.grantId);
    const { prepareCalendarReadd } = await import('./calendar-export-sync');
    await prepareCalendarReadd({ ...input, trip }, deps);
    return { bindingId: input.bindingId, review: await previewCalendarExport({ ownerId: input.ownerId, bindingId: input.bindingId, trip }, deps) };
}
