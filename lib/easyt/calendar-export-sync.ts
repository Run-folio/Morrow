import { createHash, randomUUID } from 'node:crypto';
import { projectCalendarExport, calendarExportPayloadHash } from './calendar-export.ts';
import type { CalendarExportPayload, CalendarExportProjection } from './calendar-export.ts';
import type { EasyTTrip } from './trip.ts';
export class CalendarExportError extends Error {
    code: string;
    constructor(code: string) { super(code); this.name = 'CalendarExportError'; this.code = code; }
}
export type RemoteExportEvent = {
    id: string;
    etag: string;
    marker: string | null;
    payload: CalendarExportPayload;
    status: 'confirmed' | 'cancelled';
    hasGuests?: boolean;
};
export type GoogleExportProvider = {
    get(id: string): Promise<RemoteExportEvent | null>;
    insert(id: string, payload: CalendarExportPayload, marker: string): Promise<RemoteExportEvent>;
    patch(id: string, payload: CalendarExportPayload, marker: string, etag: string): Promise<RemoteExportEvent>;
    remove(id: string, etag: string): Promise<void>;
};
export type ExportLedgerItem = {
    sourceKey: string;
    aliases?: string[];
    eventId: string;
    generation: number;
    marker: string;
    payload: CalendarExportPayload;
    etag: string | null;
    acknowledged: boolean;
    removed?: boolean;
    keepAbsent?: boolean;
};
export type ExportOperation = {
    id: string;
    sourceKey: string;
    eventId: string;
    marker: string;
    action: 'add' | 'update' | 'remove';
    payload: CalendarExportPayload;
    etag: string | null;
    status: 'pending' | 'acknowledged' | 'uncertain' | 'failed' | 'conflict' | 'skipped';
    error?: string;
};
export type CalendarExportReview = {
    id: string;
    revision: string;
    expiresAt: number;
    destination: string;
    operations: ExportOperation[];
    issues: {
        sourceKey: string;
        reason: string;
    }[];
    excluded: CalendarExportProjection['excluded'];
    blocked: CalendarExportProjection['blocked'];
    unchanged: number;
    cancelled?: boolean;
    connectionVersion?: number;
    idempotencyKey?: string;
    selection?: string[];
};
export type BindingDocument = {
    id: string;
    ownerId: string;
    tripId: string;
    subject: string;
    calendarId: string;
    calendarLabel: string;
    namespace: string;
    version: number;
    items: Record<string, ExportLedgerItem>;
    review?: CalendarExportReview;
};
export type ExportStore = {
    lock(ownerId: string, bindingId: string): Promise<{
        document: BindingDocument;
        fence: string;
    }>;
    save(document: BindingDocument, fence: string): Promise<void>;
    unlock(ownerId: string, bindingId: string, fence: string): Promise<void>;
};
export type ExportDependencies = {
    store: ExportStore;
    provider: GoogleExportProvider;
    now: () => number;
    connectionVersion?: number;
    applicationOrigin?: string;
    currentRevision(ownerId: string, tripId: string): Promise<string>;
};
export type CalendarExportRunResult = {
    reviewId: string;
    outcomes: {
        id: string;
        sourceKey: string;
        status: ExportOperation['status'];
        error?: string;
    }[];
    counts: Record<ExportOperation['status'], number>;
};
export function googleEventId(namespace: string, sourceKey: string, generation: number) { return createHash('sha256').update(JSON.stringify([namespace, sourceKey, generation])).digest('hex'); }
function own(remote: RemoteExportEvent | null, item: {
    marker: string;
}) { return remote && remote.marker === item.marker && !remote.hasGuests; }
function equal(remote: RemoteExportEvent | null, payload: CalendarExportPayload) { return remote && remote.status !== 'cancelled' && calendarExportPayloadHash(remote.payload) === calendarExportPayloadHash(payload); }
function assertBinding(doc: BindingDocument, ownerId: string, tripId?: string) {
    if (doc.ownerId !== ownerId || tripId && doc.tripId !== tripId)
        throw new CalendarExportError('NOT_FOUND');
}
function errorCode(e: unknown) { return e instanceof CalendarExportError ? e.code : 'UNCERTAIN'; }
async function reconcileUncertain(doc: BindingDocument, deps: ExportDependencies, fence: string) {
    for (const op of doc.review?.operations ?? []) {
        if (op.status !== 'uncertain')
            continue;
        const item = doc.items[op.sourceKey]!;
        const remote = await deps.provider.get(op.eventId);
        if (op.action === 'remove' && (!remote || remote.status === 'cancelled')) {
            item.removed = true;
            op.status = 'acknowledged';
            delete op.error;
        }
        else if (op.action !== 'remove' && own(remote, op) && equal(remote, op.payload)) {
            item.payload = op.payload;
            item.etag = remote!.etag;
            item.acknowledged = true;
            op.status = 'acknowledged';
            delete op.error;
        }
        else if (!remote || remote.status === 'cancelled' || own(remote, op) && remote.etag === item.etag && equal(remote, item.payload)) {
            op.status = 'failed';
            op.error = 'NOT_APPLIED';
        }
        else {
            op.status = 'conflict';
            op.error = 'GOOGLE_CHANGED';
        }
        await deps.store.save(doc, fence);
    }
}
export async function previewCalendarExport(input: {
    ownerId: string;
    bindingId: string;
    trip: EasyTTrip;
}, deps: ExportDependencies): Promise<CalendarExportReview> {
    const { document: doc, fence } = await deps.store.lock(input.ownerId, input.bindingId);
    try {
        assertBinding(doc, input.ownerId, input.trip.id);
        if (input.trip.ownerId !== input.ownerId)
            throw new CalendarExportError('NOT_FOUND');
        if (doc.review?.operations.some(o => o.status === 'uncertain'))
            await reconcileUncertain(doc, deps, fence);
        const projection = projectCalendarExport(input.trip, deps.applicationOrigin), members = new Set(projection.membershipKeys), current = new Map(projection.items.map(i => [i.sourceKey, i]));
        const review: CalendarExportReview = { id: randomUUID(), revision: input.trip.updatedAt, expiresAt: deps.now() + 10 * 60000, destination: doc.calendarLabel, connectionVersion: deps.connectionVersion, operations: [], issues: [], excluded: projection.excluded, blocked: projection.blocked, unchanged: 0 };
        const operation = (item: ExportLedgerItem, action: ExportOperation['action'], payload: CalendarExportPayload, etag: string | null) => review.operations.push({ id: randomUUID(), sourceKey: item.sourceKey, eventId: item.eventId, marker: item.marker, action, payload, etag, status: 'pending' });
        const matchItems = (keys: string[]) => Object.values(doc.items).filter(i => [i.sourceKey, ...(i.aliases ?? [])].some(k => keys.includes(k)));
        const claims = new Map<string, number>();
        for (const desired of current.values())
            for (const item of matchItems([desired.sourceKey, ...(desired.aliases ?? [])]))
                claims.set(item.sourceKey, (claims.get(item.sourceKey) ?? 0) + 1);
        for (const [key, desired] of current) {
            const identityKeys = [key, ...(desired.aliases ?? [])];
            const matches = Object.values(doc.items).filter(i => [i.sourceKey, ...(i.aliases ?? [])].some(k => identityKeys.includes(k)));
            if (matches.length > 1 || matches[0] && (claims.get(matches[0].sourceKey) ?? 0) > 1) {
                review.issues.push({ sourceKey: key, reason: 'IDENTITY_CONFLICT' });
                continue;
            }
            let item = matches[0];
            if (!item) {
                item = { sourceKey: key, eventId: googleEventId(doc.namespace, key, 0), generation: 0, marker: randomUUID(), payload: desired.payload, etag: null, acknowledged: false };
                doc.items[key] = item;
            }
            item.aliases = [...new Set([...(item.aliases ?? []), ...identityKeys])];
            if (item.removed) {
                review.issues.push({ sourceKey: item.sourceKey, reason: 'GOOGLE_REMOVED' });
                continue;
            }
            item.keepAbsent = false;
            if (!item.acknowledged) {
                await deps.store.save(doc, fence);
                const existing = await deps.provider.get(item.eventId);
                if (!existing || existing.status === 'cancelled') {
                    operation(item, 'add', desired.payload, null);
                    continue;
                }
                if (!own(existing, item) || !equal(existing, item.payload)) {
                    review.issues.push({ sourceKey: item.sourceKey, reason: 'GOOGLE_CHANGED' });
                    continue;
                }
                item.acknowledged = true;
                item.etag = existing.etag;
            }
            await deps.store.save(doc, fence);
            const remote = await deps.provider.get(item.eventId);
            if (!remote || remote.status === 'cancelled') {
                review.issues.push({ sourceKey: item.sourceKey, reason: 'GOOGLE_REMOVED' });
                continue;
            }
            if (!own(remote, item) || remote.etag !== item.etag) {
                review.issues.push({ sourceKey: item.sourceKey, reason: 'GOOGLE_CHANGED' });
                continue;
            }
            if (calendarExportPayloadHash(item.payload) !== calendarExportPayloadHash(desired.payload))
                operation(item, 'update', desired.payload, remote.etag);
            else
                review.unchanged++;
        }
        for (const item of Object.values(doc.items)) {
            if (!item.acknowledged || item.removed || [item.sourceKey, ...(item.aliases ?? [])].some(k => members.has(k)) || item.keepAbsent)
                continue;
            await deps.store.save(doc, fence);
            const remote = await deps.provider.get(item.eventId);
            if (!remote || remote.status === 'cancelled') {
                review.issues.push({ sourceKey: item.sourceKey, reason: 'GOOGLE_REMOVED' });
                continue;
            }
            if (!own(remote, item) || remote.etag !== item.etag) {
                review.issues.push({ sourceKey: item.sourceKey, reason: 'GOOGLE_CHANGED' });
                continue;
            }
            operation(item, 'remove', item.payload, remote.etag);
        }
        doc.review = review;
        await deps.store.save(doc, fence);
        return structuredClone(review);
    }
    finally {
        await deps.store.unlock(input.ownerId, input.bindingId, fence);
    }
}
export async function applyCalendarExport(input: {
    ownerId: string;
    bindingId: string;
    reviewId: string;
    selectedOperationIds: string[];
    idempotencyKey: string;
}, deps: ExportDependencies): Promise<CalendarExportRunResult> {
    const { document: doc, fence } = await deps.store.lock(input.ownerId, input.bindingId);
    try {
        assertBinding(doc, input.ownerId);
        const review = doc.review;
        if (!review || review.id !== input.reviewId || review.cancelled || review.connectionVersion !== deps.connectionVersion)
            throw new CalendarExportError('STALE_REVIEW');
        const selected = [...new Set(input.selectedOperationIds)].sort();
        if (selected.some(id => !review.operations.some(o => o.id === id)) || selected.length !== input.selectedOperationIds.length)
            throw new CalendarExportError('INVALID_SELECTION');
        if (review.idempotencyKey && (review.idempotencyKey !== input.idempotencyKey || JSON.stringify(review.selection) !== JSON.stringify(selected)))
            throw new CalendarExportError('SELECTION_CHANGED');
        if (review.expiresAt < deps.now() && !review.idempotencyKey)
            throw new CalendarExportError('STALE_REVIEW');
        if (await deps.currentRevision(input.ownerId, doc.tripId) !== review.revision) {
            await reconcileUncertain(doc, deps, fence);
            throw new CalendarExportError('STALE_REVIEW');
        }
        review.idempotencyKey = input.idempotencyKey;
        review.selection = selected;
        await deps.store.save(doc, fence);
        for (const op of review.operations) {
            const item = doc.items[op.sourceKey]!;
            if (op.status === 'acknowledged' || op.status === 'skipped' || op.status === 'conflict')
                continue;
            if (!selected.includes(op.id)) {
                op.status = 'skipped';
                if (op.action === 'remove')
                    item.keepAbsent = true;
                await deps.store.save(doc, fence);
                continue;
            }
            if (await deps.currentRevision(input.ownerId, doc.tripId) !== review.revision)
                throw new CalendarExportError('STALE_REVIEW');
            // Save/renew the fence before every external operation. Adapter requests are bounded.
            await deps.store.save(doc, fence);
            const wasUncertain = op.status === 'uncertain';
            let readCompleted = false;
            try {
                const remote = await deps.provider.get(op.eventId);
                readCompleted = true;
                if (op.action === 'remove' && (!remote || remote.status === 'cancelled')) {
                    if (!wasUncertain) {
                        op.status = 'conflict';
                        op.error = 'GOOGLE_REMOVED';
                    }
                    else {
                        op.status = 'acknowledged';
                        item.removed = true;
                    }
                }
                else if (remote && own(remote, op) && equal(remote, op.payload) && (op.action === 'add' || wasUncertain && op.action === 'update')) {
                    op.status = 'acknowledged';
                    item.acknowledged = true;
                    item.payload = op.payload;
                    item.etag = remote.etag;
                }
                else {
                    if (await deps.currentRevision(input.ownerId, doc.tripId) !== review.revision)
                        throw new CalendarExportError('STALE_REVIEW');
                    if (op.action === 'add' && remote || op.action !== 'add' && (!remote || !own(remote, op) || remote.etag !== op.etag))
                        throw new CalendarExportError('GOOGLE_CHANGED');
                    if (op.action === 'remove') {
                        op.status = 'uncertain';
                        await deps.store.save(doc, fence);
                        await deps.provider.remove(op.eventId, op.etag!);
                        item.removed = true;
                        op.status = 'acknowledged';
                    }
                    else {
                        // Durable uncertain intent precedes the write, including process loss after provider success.
                        op.status = 'uncertain';
                        await deps.store.save(doc, fence);
                        const written = op.action === 'add' ? await deps.provider.insert(op.eventId, op.payload, op.marker) : await deps.provider.patch(op.eventId, op.payload, op.marker, op.etag!);
                        if (!own(written, op) || !equal(written, op.payload))
                            throw new CalendarExportError('UNCERTAIN');
                        item.payload = op.payload;
                        item.etag = written.etag;
                        item.acknowledged = true;
                        op.status = 'acknowledged';
                    }
                }
                if (op.status === 'acknowledged')
                    delete op.error;
            }
            catch (e) {
                const code = errorCode(e);
                op.error = code;
                // A failed reconciliation read supplies no evidence about the
                // earlier write. Keep its durable intent for reconnect/retry.
                op.status = wasUncertain && !readCompleted ? 'uncertain' : ['GOOGLE_CHANGED', 'GOOGLE_REMOVED', 'PROVIDER_CONFLICT'].includes(code) ? 'conflict' : ['UNCERTAIN', 'TIMEOUT'].includes(code) ? 'uncertain' : 'failed';
            }
            await deps.store.save(doc, fence);
            if (op.error === 'AUTH_REQUIRED' || op.error === 'ACCESS_DENIED')
                break;
        }
        const counts = { pending: 0, acknowledged: 0, uncertain: 0, failed: 0, conflict: 0, skipped: 0 };
        for (const op of review.operations)
            counts[op.status]++;
        return { reviewId: review.id, counts, outcomes: review.operations.map(o => ({ id: o.id, sourceKey: o.sourceKey, status: o.status, ...(o.error ? { error: o.error } : {}) })) };
    }
    finally {
        await deps.store.unlock(input.ownerId, input.bindingId, fence);
    }
}
/** Explicit user intent reserves a new identity; it does not send an event. */
export async function prepareCalendarReadd(input: {
    ownerId: string;
    bindingId: string;
    sourceKey: string;
    trip: EasyTTrip;
}, deps: ExportDependencies) {
    const { document: doc, fence } = await deps.store.lock(input.ownerId, input.bindingId);
    try {
        assertBinding(doc, input.ownerId, input.trip.id);
        if (doc.review?.operations.some(o => o.status === 'uncertain'))
            throw new CalendarExportError('RETRY_REMAINING');
        if (await deps.currentRevision(input.ownerId, doc.tripId) !== input.trip.updatedAt)
            throw new CalendarExportError('STALE_REVIEW');
        const item = doc.items[input.sourceKey];
        if (!item || !item.acknowledged)
            throw new CalendarExportError('NOT_FOUND');
        const desired = projectCalendarExport(input.trip, deps.applicationOrigin).items.find(i => [i.sourceKey, ...(i.aliases ?? [])].some(k => [item.sourceKey, ...(item.aliases ?? [])].includes(k)));
        if (!desired)
            throw new CalendarExportError('NO_EVENTS');
        const remote = await deps.provider.get(item.eventId);
        if (remote && remote.status !== 'cancelled')
            throw new CalendarExportError('GOOGLE_CHANGED');
        item.generation++;
        item.eventId = googleEventId(doc.namespace, item.sourceKey, item.generation);
        item.marker = randomUUID();
        item.acknowledged = false;
        item.removed = false;
        item.etag = null;
        item.payload = desired.payload;
        delete doc.review;
        await deps.store.save(doc, fence);
    }
    finally {
        await deps.store.unlock(input.ownerId, input.bindingId, fence);
    }
}
