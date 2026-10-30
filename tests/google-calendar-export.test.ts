import assert from 'node:assert/strict';
import test from 'node:test';
import { createGoogleExportProvider, ownedCalendarDestinations, createTripCalendar } from '../lib/easyt/google-calendar-export.ts';
import { projectCalendarExport } from '../lib/easyt/calendar-export.ts';
import { representativeTrip } from './calendar-export-fixture.ts';
const payload = projectCalendarExport(representativeTrip()).items[0]!.payload;
test('adapter writes exact chosen calendar with private ownership marker and conditional changes', async () => {
    const requests: {
        url: string;
        init: RequestInit;
    }[] = [];
    const fetcher = async (url: string | URL | Request, init: RequestInit = {}) => { requests.push({ url: String(url), init }); const body = JSON.parse(String(init.body ?? '{}')); return Response.json({ id: 'id', etag: 'etag', ...body }); };
    const p = createGoogleExportProvider('token', 'calendar/+id', fetcher as typeof fetch);
    await p.insert('id', payload, 'marker');
    assert.match(requests[0]!.url, /calendars\/calendar%2F%2Bid\/events/);
    let body = JSON.parse(String(requests[0]!.init.body));
    assert.equal(body.extendedProperties.private.morroExport, 'marker');
    assert(!body.attendees);
    await p.patch('id', payload, 'marker', 'old-etag');
    assert.equal(new Headers(requests[1]!.init.headers).get('If-Match'), 'old-etag');
    await p.remove('id', 'current-etag');
    assert.equal(new Headers(requests[2]!.init.headers).get('If-Match'), 'current-etag');
});
test('adapter bounds uncertain writes, sanitizes errors and distinguishes missing events', async () => {
    let calls = 0;
    const p = createGoogleExportProvider('SECRET', 'cal', async () => { calls++; throw new Error('SECRET private provider details'); });
    await assert.rejects(() => p.insert('id', payload, 'marker'), e => e instanceof Error && e.message === 'UNCERTAIN');
    assert.equal(calls, 1);
    const missing = createGoogleExportProvider('t', 'cal', async () => new Response(null, { status: 404 }));
    assert.equal(await missing.get('id'), null);
    const denied = createGoogleExportProvider('t', 'cal', async () => new Response('private', { status: 403 }));
    await assert.rejects(() => denied.get('id'), /ACCESS_DENIED/);
});
test('destination list paginates and excludes shared writer calendars', async () => {
    let calls = 0;
    const result = await ownedCalendarDestinations('t', async () => Response.json(++calls === 1 ? { items: [{ id: 'owned', summary: 'Personal', accessRole: 'owner' }, { id: 'shared', summary: 'Team', accessRole: 'writer' }], nextPageToken: 'next' } : { items: [{ id: 'other', summary: 'Other', accessRole: 'owner' }] }));
    assert.deepEqual(result.map(x => x.id), ['owned', 'other']);
    assert.equal(calls, 2);
});
test('new calendar creation carries an opaque recovery marker and never retries a POST', async () => {
    let calls = 0;
    await assert.rejects(() => createTripCalendar('t', 'Trip', 'marker', async (_url, init) => { calls++; assert.equal(JSON.parse(String(init?.body)).description, 'Morro export marker: marker'); throw Error('lost response'); }), /CALENDAR_CREATION_UNCERTAIN/);
    assert.equal(calls, 1);
});
test('patch clears removed source location explicitly rather than preserving Google PATCH state', async () => { let body: any; const p = createGoogleExportProvider('t', 'cal', async (_url, init) => { body = JSON.parse(String(init?.body)); return Response.json({ id: 'id', etag: 'new', ...body }); }); await p.patch('id', payload, 'marker', 'etag'); assert.equal(body.location, null); });
