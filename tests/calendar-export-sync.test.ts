import assert from 'node:assert/strict';
import test from 'node:test';
import { representativeTrip } from './calendar-export-fixture.ts';
import { previewCalendarExport, applyCalendarExport, googleEventId, CalendarExportError } from '../lib/easyt/calendar-export-sync.ts';
import type { LegacyItineraryIdea } from '../lib/easyt/trip.ts';
import type { BindingDocument, ExportStore, GoogleExportProvider, RemoteExportEvent } from '../lib/easyt/calendar-export-sync.ts';
function setup() {
    const trip = representativeTrip();
    let doc: BindingDocument = { ownerId: 'traveller', id: 'binding', tripId: trip.id, subject: 'google-sub', calendarId: 'cal', calendarLabel: 'Personal', namespace: 'opaque-namespace', items: {}, version: 0 };
    let leased = false;
    const remote = new Map<string, RemoteExportEvent>();
    let writes = 0, timeoutInsert = false, timeoutPatch = false;
    const store: ExportStore = { async lock(owner, id) {
            if (owner !== doc.ownerId || id !== doc.id)
                throw new CalendarExportError('NOT_FOUND');
            if (leased)
                throw new CalendarExportError('BUSY');
            leased = true;
            return { document: structuredClone(doc), fence: 'fence' };
        }, async save(d, f) { assert(leased && f === 'fence'); assert.equal(d.version, doc.version); d.version++; doc = structuredClone(d); }, async unlock() { leased = false; } };
    const provider: GoogleExportProvider = { async get(id) { return structuredClone(remote.get(id) ?? null); }, async insert(id, payload, marker) {
            writes++;
            if (remote.has(id))
                throw new CalendarExportError('PROVIDER_CONFLICT');
            const event = { id, etag: `etag-${writes}`, payload: structuredClone(payload), marker, status: 'confirmed' as const };
            remote.set(id, event);
            if (timeoutInsert) {
                timeoutInsert = false;
                throw new CalendarExportError('UNCERTAIN');
            }
            return structuredClone(event);
        }, async patch(id, payload, marker, etag) {
            writes++;
            const prev = remote.get(id)!;
            if (prev.etag !== etag)
                throw new CalendarExportError('GOOGLE_CHANGED');
            const e = { id, etag: `etag-${writes}`, payload: structuredClone(payload), marker, status: 'confirmed' as const };
            remote.set(id, e);
            if (timeoutPatch) {
                timeoutPatch = false;
                throw new CalendarExportError('UNCERTAIN');
            }
            return structuredClone(e);
        }, async remove(id, etag) {
            writes++;
            if (remote.get(id)?.etag !== etag)
                throw new CalendarExportError('GOOGLE_CHANGED');
            remote.delete(id);
        } };
    const deps = { store, provider, now: () => Date.parse('2026-10-28T12:00:00Z'), async currentRevision() { return trip.updatedAt; } };
    return { trip, deps, remote, get doc() { return doc; }, get writes() { return writes; }, timeoutInsert() { timeoutInsert = true; }, timeoutPatch() { timeoutPatch = true; } };
}
const preview = (s: ReturnType<typeof setup>) => previewCalendarExport({ ownerId: 'traveller', bindingId: 'binding', trip: s.trip }, s.deps);
const send = async (s: ReturnType<typeof setup>, r: Awaited<ReturnType<typeof preview>>, ids = r.operations.filter(o => o.action !== 'remove').map(o => o.id), key = 'run') => applyCalendarExport({ ownerId: 'traveller', bindingId: 'binding', reviewId: r.id, selectedOperationIds: ids, idempotencyKey: key }, s.deps);
test('stable event IDs exclude date/title and isolate binding namespaces', () => { assert.equal(googleEventId('ns', 'activity:a', 0), googleEventId('ns', 'activity:a', 0)); assert.match(googleEventId('ns', 'activity:a', 0), /^[a-f0-9]{64}$/); assert.notEqual(googleEventId('other', 'activity:a', 0), googleEventId('ns', 'activity:a', 0)); });
test('first send and later update change the same events without duplicates', async () => { const s = setup(), r = await preview(s); assert.equal(s.writes, 0); await send(s, r); const count = s.remote.size; (s.trip.brief.itineraryIdeas![0]! as LegacyItineraryIdea).title = 'Changed market'; s.trip.updatedAt = 'changed'; const u = await preview(s); assert.equal(u.operations.filter(o => o.action === 'update').length, 1); await send(s, u, undefined, 'update'); assert.equal(s.remote.size, count); assert([...s.remote.values()].some(x => x.payload.summary.startsWith('Changed market'))); });
test('uncertain insert and update reconcile a successful write before retrying', async () => { const s = setup(); s.timeoutInsert(); const r = await preview(s); const partial = await send(s, r); assert(partial.outcomes.some(o => o.status === 'uncertain')); const writes = s.writes; await send(s, r); assert.equal(s.writes, writes); (s.trip.brief.itineraryIdeas![0]! as LegacyItineraryIdea).title = 'Updated'; s.trip.updatedAt = 'updated'; const u = await preview(s); s.timeoutPatch(); await send(s, u, undefined, 'update'); const patched = s.writes; await send(s, u, undefined, 'update'); assert.equal(s.writes, patched); });
test('Google edits block overwrite and opt-in removal; skipped selections never imply deletion', async () => { const s = setup(); await send(s, await preview(s)); const entry = s.doc.items['activity:market']!; s.remote.get(entry.eventId)!.etag = 'edited-in-google'; (s.trip.brief.itineraryIdeas![0]! as LegacyItineraryIdea).title = 'Morro edit'; s.trip.updatedAt = 'changed'; const conflict = await preview(s); assert(conflict.issues.some(i => i.reason === 'GOOGLE_CHANGED')); assert(!conflict.operations.some(o => o.sourceKey === 'activity:market')); const count = s.remote.size; await send(s, conflict); assert.equal(s.remote.size, count); });
test('canonical removal is reviewed and only selected removals are deleted', async () => { const s = setup(); await send(s, await preview(s)); s.trip.brief.itineraryIdeas = s.trip.brief.itineraryIdeas!.filter(x => x.id !== 'market'); s.trip.updatedAt = 'removed'; let r = await preview(s); assert(r.operations.some(o => o.action === 'remove' && o.sourceKey === 'activity:market')); await send(s, r, [], 'keep'); assert(s.remote.has(s.doc.items['activity:market']!.eventId)); r = await preview(s); assert(!r.operations.some(o => o.action === 'remove' && o.sourceKey === 'activity:market')); });
test('ineligible but present, stale review, cross-owner and Google-deleted items fail safely', async () => { const s = setup(); await send(s, await preview(s)); s.trip.planItems.find(x => x.id === 'tokyo-day-2')!.date = ''; s.trip.updatedAt = 'undated'; const r = await preview(s); assert(!r.operations.some(o => o.sourceKey === 'activity:market')); s.trip.updatedAt = 'newer'; await assert.rejects(() => send(s, r), /STALE_REVIEW/); await assert.rejects(() => previewCalendarExport({ ownerId: 'attacker', bindingId: 'binding', trip: s.trip }, s.deps), /NOT_FOUND/); s.remote.delete(s.doc.items['activity:dinner']!.eventId); const missing = await preview(s); assert(missing.issues.some(x => x.sourceKey === 'activity:dinner' && x.reason === 'GOOGLE_REMOVED')); assert(!missing.operations.some(x => x.sourceKey === 'activity:dinner' && x.action === 'add')); });
test('a retry cannot change its reviewed selection or reuse an old replaced preview', async () => { const s = setup(), r = await preview(s); await send(s, r, [], 'selection'); await assert.rejects(() => send(s, r, [r.operations[0]!.id], 'selection'), /SELECTION_CHANGED/); const next = await preview(s); await assert.rejects(() => send(s, r), /STALE_REVIEW/); assert.notEqual(next.id, r.id); });
test('adding a booking to an exported transfer retains the calendar identity', async () => { const s = setup(), booking = s.trip.brief.bookings!.find(x => x.id === 'transport-tokyo-kyoto')!; s.trip.brief.bookings = s.trip.brief.bookings!.filter(x => x.id !== booking.id); await send(s, await preview(s)); const before = s.remote.size; s.trip.brief.bookings.push(booking); s.trip.updatedAt = 'booked'; const r = await preview(s); assert(!r.operations.some(o => o.action === 'add' && o.sourceKey === 'booking:transport-tokyo-kyoto')); await send(s, r, undefined, 'booked'); assert.equal(s.remote.size, before); });
test('a Google edit after preview blocks the conditional update without overwriting', async () => { const s = setup(); await send(s, await preview(s)); (s.trip.brief.itineraryIdeas![0]! as LegacyItineraryIdea).title = 'New title'; s.trip.updatedAt = 'new'; const r = await preview(s); const item = s.doc.items['activity:market']!; s.remote.get(item.eventId)!.etag = 'concurrent-google-edit'; const before = s.writes; const result = await send(s, r, undefined, 'change'); assert.equal(result.counts.conflict, 1); assert.equal(s.writes, before); });
import { prepareCalendarReadd } from '../lib/easyt/calendar-export-sync.ts';
test('Google-deleted events require explicit Add again review and a new identity generation', async () => { const s = setup(); await send(s, await preview(s)); const old = s.doc.items['activity:market']!.eventId; s.remote.delete(old); await prepareCalendarReadd({ ownerId: 'traveller', bindingId: 'binding', sourceKey: 'activity:market', trip: s.trip }, s.deps); const r = await preview(s); const add = r.operations.find(o => o.sourceKey === 'activity:market')!; assert.equal(add.action, 'add'); assert.notEqual(add.eventId, old); const before = s.remote.size; await send(s, r, undefined, 'readd'); assert.equal(s.remote.size, before + 1); });
test('a lost response followed by a trip edit can reconcile read-only and review the new changes', async () => { const s = setup(); s.timeoutInsert(); const old = await preview(s); await send(s, old); const before = s.writes; (s.trip.brief.itineraryIdeas![0]! as LegacyItineraryIdea).title = 'After interrupted send'; s.trip.updatedAt = 'newer'; const next = await preview(s); assert.equal(s.writes, before); assert(next.operations.some(o => o.action === 'update' && o.sourceKey === 'activity:market') || next.operations.some(o => o.action === 'add')); await send(s, next, undefined, 'after-edit'); assert.equal(s.remote.size, new Set(s.remote.keys()).size); assert([...s.remote.values()].some(x => x.payload.summary.startsWith('After interrupted send'))); });
test('unscheduling a canonical activity preserves membership and never proposes deletion', async () => { const s = setup(); await send(s, await preview(s)); s.trip.brief.itineraryIdeas![0]!.dayId = undefined; s.trip.updatedAt = 'unscheduled'; const r = await preview(s); assert(!r.operations.some(o => o.sourceKey === 'activity:market')); });
test('disconnect during a provider read blocks the subsequent unsent write', async () => {
    const s = setup();
    const r = await preview(s);
    let disconnected = false;
    const original = s.deps.provider.get;
    s.deps.provider.get = async (id) => { const value = await original(id); disconnected = true; return value; };
    s.deps.currentRevision = async () => {
        if (disconnected)
            throw new CalendarExportError('AUTH_REQUIRED');
        return s.trip.updatedAt;
    };
    const result = await send(s, r);
    assert.equal(result.counts.failed, 1);
    assert.equal(s.writes, 0);
});
test('two current sources cannot both update one historical aliased identity', async () => { const s = setup(); await send(s, await preview(s)); const entry = s.doc.items['booking:transport-tokyo-kyoto']!; assert(entry); const { document, fence } = await s.deps.store.lock('traveller', 'binding'); document.items['booking:transport-tokyo-kyoto']!.aliases = ['activity:market']; delete document.items['activity:market']; await s.deps.store.save(document, fence); await s.deps.store.unlock('traveller', 'binding', fence); s.trip.updatedAt = 'split'; const r = await preview(s); assert(r.issues.some(i => i.reason === 'IDENTITY_CONFLICT')); assert(!r.operations.some(o => o.eventId === entry.eventId)); });
test('long previews renew their fence between provider reads', async () => { const s = setup(); let elapsed = 0, deadline = 60; const save = s.deps.store.save, get = s.deps.provider.get; s.deps.store.save = async (d, f) => { assert(elapsed < deadline, 'lease expired before renewal'); await save(d, f); deadline = elapsed + 60; }; s.deps.provider.get = async (id) => { elapsed += 8; return get(id); }; const r = await preview(s); assert(r.operations.length > 0); assert(elapsed >= 60); });
test('Add again accepts the actionable issue identity after an unbooked transfer gains a canonical booking', async () => { const s = setup(), booking = s.trip.brief.bookings!.find(x => x.id === 'transport-tokyo-kyoto')!; s.trip.brief.bookings = s.trip.brief.bookings!.filter(x => x.id !== booking.id); await send(s, await preview(s)); s.trip.brief.bookings.push(booking); s.trip.updatedAt = 'linked'; await send(s, await preview(s), undefined, 'linked'); const ledger = s.doc.items['transfer:tokyo-kyoto']!; s.remote.delete(ledger.eventId); const r = await preview(s), issue = r.issues.find(i => i.reason === 'GOOGLE_REMOVED')!; assert(issue); await prepareCalendarReadd({ ownerId: 'traveller', bindingId: 'binding', sourceKey: issue.sourceKey, trip: s.trip }, s.deps); assert.equal(s.doc.items['transfer:tokyo-kyoto']!.generation, 1); });

test('reliability: lost PATCH stays uncertain when its reconciliation read fails, then reconnect reviews newer edits', async () => {
    const s = setup();
    await send(s, await preview(s));
    const id = s.doc.items['activity:market']!.eventId, count = s.remote.size;
    (s.trip.brief.itineraryIdeas![0]! as LegacyItineraryIdea).title = 'First explicit update';
    s.trip.updatedAt = 'first-update';
    const first = await preview(s);
    s.timeoutPatch();
    assert.equal((await send(s, first, undefined, 'lost-patch')).counts.uncertain, 1);
    const read = s.deps.provider.get;
    for (const code of ['AUTH_REQUIRED', 'ACCESS_DENIED', 'PROVIDER_UNAVAILABLE']) {
        s.deps.provider.get = async () => { throw new CalendarExportError(code); };
        const retry = await send(s, first, undefined, 'lost-patch');
        assert.equal(retry.counts.uncertain, 1, `${code} cannot prove an earlier PATCH failed`);
        assert.equal(retry.counts.failed, 0);
    }
    s.deps.provider.get = read;
    (s.trip.brief.itineraryIdeas![0]! as LegacyItineraryIdea).title = 'Latest saved update after reconnect';
    s.trip.updatedAt = 'latest-update';
    const writes = s.writes, next = await preview(s);
    assert.equal(s.writes, writes, 'reconciliation is read only');
    assert(!next.issues.some(i => i.sourceKey === 'activity:market'));
    assert.equal(next.operations.filter(o => o.sourceKey === 'activity:market' && o.action === 'update').length, 1);
    await send(s, next, undefined, 'latest');
    assert.equal(s.remote.size, count);
    assert.equal(s.doc.items['activity:market']!.eventId, id);
    assert(s.remote.get(id)!.payload.summary.startsWith('Latest saved update'));
});

test('reliability: lost DELETE reconciles after a newer trip edit without deleting twice', async () => {
    const s = setup();
    await send(s, await preview(s));
    const id = s.doc.items['activity:market']!.eventId;
    s.trip.brief.itineraryIdeas = s.trip.brief.itineraryIdeas!.filter(i => i.id !== 'market');
    s.trip.updatedAt = 'remove-market';
    const review = await preview(s), remove = s.deps.provider.remove;
    let attempts = 0;
    s.deps.provider.remove = async (...args) => { attempts++; await remove(...args); throw new CalendarExportError('UNCERTAIN'); };
    const result = await send(s, review, review.operations.map(o => o.id), 'lost-delete');
    assert.equal(result.counts.uncertain, 1);
    assert(!s.remote.has(id));
    (s.trip.brief.itineraryIdeas!.find(i => i.id === 'dinner')! as LegacyItineraryIdea).title = 'Later dinner edit';
    s.trip.updatedAt = 'newer-edit';
    const writes = s.writes, next = await preview(s);
    assert.equal(s.writes, writes);
    assert.equal(s.doc.items['activity:market']!.removed, true);
    await send(s, next, undefined, 'after-delete');
    assert.equal(attempts, 1);
});

test('reliability: wrong ownership marker and guests block mapped-ID collisions without touching unrelated events', async () => {
    for (const guests of [false, true]) {
        const s = setup(), review = await preview(s), op = review.operations[0]!;
        const foreign = { id: op.eventId, etag: 'foreign-etag', marker: guests ? op.marker : 'other-app', payload: structuredClone(op.payload), status: 'confirmed' as const, hasGuests: guests };
        const unrelated = { ...structuredClone(foreign), id: 'unrelated-event', marker: 'unrelated-app' };
        s.remote.set(op.eventId, foreign); s.remote.set(unrelated.id, unrelated);
        const before = structuredClone([...s.remote]);
        const result = await send(s, review, [op.id]);
        assert.equal(result.counts.conflict, 1);
        assert.equal(s.writes, 0);
        assert.deepEqual([...s.remote], before);
    }
});

test('reliability: a successful reconciliation read can prove a lost write was not applied', async () => {
    const s = setup(); await send(s, await preview(s));
    const id = s.doc.items['activity:market']!.eventId, original = structuredClone(s.remote.get(id)!);
    (s.trip.brief.itineraryIdeas![0]! as LegacyItineraryIdea).title = 'Pending update'; s.trip.updatedAt = 'pending-update';
    const review = await preview(s); s.timeoutPatch(); await send(s, review, undefined, 'update');
    // The provider's later successful GET establishes the original baseline.
    s.remote.set(id, original);
    s.deps.provider.patch = async () => { throw new CalendarExportError('AUTH_REQUIRED'); };
    const retry = await send(s, review, undefined, 'update');
    assert.equal(retry.counts.failed, 1);
    assert.equal(retry.counts.uncertain, 0);
    assert.deepEqual(s.remote.get(id), original);
});

test('reliability: a Google edit, replaced marker or added guest after removal preview prevents deletion', async () => {
    for (const change of ['etag', 'marker', 'guests']) {
        const s = setup(); await send(s, await preview(s));
        const id = s.doc.items['activity:market']!.eventId;
        s.trip.brief.itineraryIdeas = s.trip.brief.itineraryIdeas!.filter(i => i.id !== 'market');
        s.trip.updatedAt = 'removed'; const review = await preview(s), event = s.remote.get(id)!;
        if (change === 'etag') event.etag = 'changed-in-google';
        if (change === 'marker') event.marker = 'other-owner';
        if (change === 'guests') event.hasGuests = true;
        const before = structuredClone(event), writes = s.writes;
        const result = await send(s, review, review.operations.map(o => o.id), 'remove');
        assert.equal(result.counts.conflict, 1, change);
        assert.equal(s.writes, writes);
        assert.deepEqual(s.remote.get(id), before);
    }
});
