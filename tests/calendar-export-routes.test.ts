import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
async function route() {
    const calls: {
        name: string;
        input: any;
    }[] = [];
    let configured = true;
    (globalThis as any).__calendarRouteTest = { get configured() { return configured; }, calls };
    const r = await build({ entryPoints: ['app/api/easyt/trips/[tripId]/calendar-export/route.ts'], bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external', plugins: [{ name: 'route-boundaries', setup(b) {
                    b.onLoad({ filter: /easyt\/owner\.ts$/ }, () => ({ loader: 'js', contents: "export async function requireEasyTOwner(){return {id:'owner'}}" }));
                    b.onLoad({ filter: /auth-environment\.ts$/ }, () => ({ loader: 'js', contents: "export function getMorroviaAuthBaseURL(){return 'https://morrovia.com'}" }));
                    b.onLoad({ filter: /calendar-export-auth\.server\.ts$/ }, () => ({ loader: 'js', contents: "export const calendarExportConfigured=()=>globalThis.__calendarRouteTest.configured;export function requireCalendarExportConfigured(){if(!calendarExportConfigured())throw Object.assign(new Error('NOT_CONFIGURED'),{name:'CalendarExportError'});}" }));
                    b.onLoad({ filter: /calendar-export-service\.server\.ts$/ }, () => ({ loader: 'js', contents: ['calendarExportStatus', 'reviewCalendarExport', 'sendCalendarExport', 'createAndReviewTripCalendar', 'createAndSendTripCalendar', 'readdCalendarExport'].map(name => `export async function ${name}(input){globalThis.__calendarRouteTest.calls.push({name:'${name}',input});return {ok:true};}`).join('\n') }));
                } }] });
    const m = { exports: {} as any };
    new Function('require', 'module', 'exports', r.outputFiles[0]!.text)(createRequire(import.meta.url), m, m.exports);
    return { handlers: m.exports, calls, disable() { configured = false; } };
}
const uuid = '123e4567-e89b-42d3-a456-426614174000';
const request = (body: unknown, owner = 'owner', origin = 'https://morrovia.com') => new Request('https://morrovia.com/api/easyt/trips/trip/calendar-export', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin, 'x-morrovia-expected-owner': owner }, body: JSON.stringify(body) });
const context = { params: Promise.resolve({ tripId: 'trip' }) };
test('actual route preview does not send and uses server trip/owner and saved revision', async () => { const r = await route(); const response = await r.handlers.POST(request({ action: 'preview', grantId: uuid, calendarId: 'chosen', expectedRevision: 'saved', ownerId: 'attacker', payload: { summary: 'forged' } }), context); assert.equal(response.status, 200); assert.deepEqual(r.calls, [{ name: 'reviewCalendarExport', input: { ownerId: 'owner', tripId: 'trip', grantId: uuid, calendarId: 'chosen', expectedRevision: 'saved' } }]); });
test('actual route rejects stale account and cross origin before service operations', async () => {
    const r = await route();
    for (const req of [request({ action: 'preview', grantId: uuid }, 'other'), request({ action: 'preview', grantId: uuid }, 'owner', 'https://evil.com')]) {
        const result = await r.handlers.POST(req, context);
        assert.equal(result.status, 403);
    }
    assert.equal(r.calls.length, 0);
});
test('actual route validates send selection and does not accept arbitrary Google event writes', async () => { const r = await route(); const bad = await r.handlers.POST(request({ action: 'send', grantId: uuid, selectedOperationIds: 'not-array' }), context); assert.equal(bad.status, 400); assert.equal(r.calls.length, 0); const ok = await r.handlers.POST(request({ action: 'send', grantId: uuid, bindingId: uuid, reviewId: uuid, idempotencyKey: uuid, selectedOperationIds: [uuid], payload: { summary: 'untrusted' } }), context); assert.equal(ok.status, 200); assert.equal(r.calls[0]!.name, 'sendCalendarExport'); assert(!('payload' in r.calls[0]!.input)); });
