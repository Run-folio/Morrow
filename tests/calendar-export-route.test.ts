import assert from 'node:assert/strict';
import test from 'node:test';
import { calendarMutationBody, calendarUuid, calendarRouteError } from '../lib/easyt/calendar-export-route.ts';
import { CalendarExportError } from '../lib/easyt/calendar-export-sync.ts';
test('mutation envelope rejects cross origin, non JSON, oversized and non object input', async () => {
    const req = (body: string, type = 'application/json', origin = 'https://morrovia.com') => new Request('https://morrovia.com/api', { method: 'POST', headers: { origin, 'Content-Type': type }, body });
    await assert.rejects(() => calendarMutationBody(req('{}', 'application/json', 'https://evil.com'), 'https://morrovia.com'), /INVALID_ORIGIN/);
    for (const r of [req('[]'), req('null'), req('x'.repeat(16385)), req('{}', 'text/plain')])
        await assert.rejects(() => calendarMutationBody(r, 'https://morrovia.com'), /INVALID_REQUEST/);
    assert.deepEqual(await calendarMutationBody(req('{"action":"preview"}'), 'https://morrovia.com'), { action: 'preview' });
});
test('IDs reject SQL-shaped and malformed values and provider exception details stay private', () => {
    for (const id of [null, "'); drop table x; --", 'not-a-uuid'])
        assert.throws(() => calendarUuid(id), /INVALID_REQUEST/);
    assert.equal(calendarUuid('123e4567-e89b-42d3-a456-426614174000'), '123e4567-e89b-42d3-a456-426614174000');
    assert.deepEqual(calendarRouteError(Error('token SECRET')), { code: 'UNAVAILABLE', status: 409 });
    assert.equal(calendarRouteError(new CalendarExportError('NOT_FOUND')).status, 404);
});
