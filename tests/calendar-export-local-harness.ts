import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { symmetricEncrypt } from 'better-auth/crypto';
import { representativeTrip } from './calendar-export-fixture.ts';
import { calendarConsentScopes } from '../lib/easyt/calendar-export-auth.ts';
import type { CalendarConsentKind } from '../lib/easyt/calendar-export-auth.ts';
import type { CalendarExportPayload } from '../lib/easyt/calendar-export.ts';
import type { RemoteExportEvent } from '../lib/easyt/calendar-export-sync.ts';
const require = createRequire(import.meta.url);
const secret = 'synthetic-calendar-fixture-secret-32-characters';
let clientBundle: Promise<{
    js: string;
    css: string;
}>;
async function client() {
    clientBundle ??= build({ stdin: { contents: `import React,{useState}from'react';import{createRoot}from'react-dom/client';import{CalendarExportAction}from'./components/easyt/calendar-export-dialog';function App(){const[revision,setRevision]=useState(window.__initialRevision);const[settled,setSettled]=useState(true);window.__calendarMount={setRevision,setSettled};return <main><h1>Itinerary</h1><CalendarExportAction tripId="calendar-trip" ownerId="traveller" savedRevision={revision} settled={settled}/><button id="outside">Outside fixture control</button></main>}createRoot(document.getElementById('root')).render(<App/>);`, resolveDir: process.cwd(), loader: 'tsx' }, bundle: true, write: false, outfile: 'fixture.js', platform: 'browser', format: 'iife', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"test"' }, plugins: [{ name: 'unused-next-link', setup(b) { b.onResolve({ filter: /^next\/link$/ }, () => ({ path: 'link', namespace: 'fixture-link' })); b.onLoad({ filter: /.*/, namespace: 'fixture-link' }, () => ({ loader: 'js', resolveDir: process.cwd(), contents: "import React from 'react';export default function Link({href,children,...rest}){return React.createElement('a',{href,...rest},children)}" })); } }] }).then(r => ({ js: r.outputFiles.find(f => f.path.endsWith('.js'))!.text, css: r.outputFiles.find(f => f.path.endsWith('.css'))?.text ?? '' }));
    return clientBundle;
}
export async function localCalendarHarness() {
    const bundle = await client();
    const schema = 'cal_' + randomUUID().replaceAll('-', ''), connection = JSON.parse(readFileSync('output/calendar-pg/connection.json', 'utf8'));
    if (typeof connection.host !== 'string' || !connection.host.startsWith('/tmp/morro-calendar-pg.') || connection.database !== 'postgres')
        throw Error('Disposable database connection is not the task-owned Unix socket');
    const admin = new Pool({ ...connection, max: 1 });
    await admin.query(`create schema ${schema}`);
    await admin.end();
    const pool = new Pool({ ...connection, max: 4, options: `-c search_path=${schema}` });
    await pool.query('create table easyt_users(id text primary key)');
    await pool.query("insert into easyt_users(id) values ('traveller'),('other-owner')");
    await pool.query(readFileSync('db/migrations/0018_morrovia_calendar_exports.sql', 'utf8'));
    const fixture: any = { trip: representativeTrip(), pool, schema, origin: '', sqlCalls: [], providerCalls: [], connectCalls: [], calendars: [{ id: 'personal', label: 'Personal', description: '' }, { id: 'other', label: 'Other owned', description: '' }], events: new Map<string, Map<string, RemoteExportEvent>>(), failNextInsert: false, uncertainNextInsert: false, uncertainNextPatch: false, uncertainNextRemove: false, revoked: false, afterProviderWrite: null, nextSubject: undefined, nextEmail: undefined, failNextCreate: false, uncertainNextCreate: false, afterIntentReservation: null, heldPreview: null, Error: Error };
    fixture.sql = async (strings: TemplateStringsArray, ...values: unknown[]) => { const text = strings.map((s, i) => s + (i < values.length ? `$${i + 1}` : '')).join(''); fixture.sqlCalls.push(text); const result = await pool.query(text, values); if (fixture.afterIntentReservation && text.startsWith('insert into morrovia_calendar_creation_intents')) {
        const hook = fixture.afterIntentReservation;
        fixture.afterIntentReservation = null;
        await hook();
    } return result.rows; };
    fixture.providerFor = (calendarId: string) => {
        if (!fixture.events.has(calendarId))
            fixture.events.set(calendarId, new Map());
        const events: Map<string, RemoteExportEvent> = fixture.events.get(calendarId);
        const copy = <T,>(x: T): T => structuredClone(x);
        return {
            async get(id: string) { fixture.providerCalls.push({ action: 'get', calendarId, id }); if (fixture.revoked) throw new fixture.Error('AUTH_REQUIRED'); return copy(events.get(id) ?? null); },
            async insert(id: string, payload: CalendarExportPayload, marker: string) { fixture.providerCalls.push({ action: 'insert', calendarId, id }); if (fixture.failNextInsert) {
                fixture.failNextInsert = false;
                throw new fixture.Error('ACCESS_DENIED');
            } if (events.has(id))
                throw new fixture.Error('GOOGLE_CHANGED'); const event = { id, etag: randomUUID(), marker, payload: copy(payload), status: 'confirmed' as const }; events.set(id, event); await fixture.afterProviderWrite?.('insert', id); if (fixture.uncertainNextInsert) {
                fixture.uncertainNextInsert = false;
                throw new fixture.Error('UNCERTAIN');
            } return copy(event); },
            async patch(id: string, payload: CalendarExportPayload, marker: string, etag: string) { fixture.providerCalls.push({ action: 'patch', calendarId, id }); const old = events.get(id); if (!old || old.etag !== etag)
                throw new fixture.Error('GOOGLE_CHANGED'); const event = { id, etag: randomUUID(), marker, payload: copy(payload), status: 'confirmed' as const }; events.set(id, event); await fixture.afterProviderWrite?.('patch', id); if (fixture.uncertainNextPatch) { fixture.uncertainNextPatch = false; throw new fixture.Error('UNCERTAIN'); } return copy(event); },
            async remove(id: string, etag: string) { fixture.providerCalls.push({ action: 'remove', calendarId, id }); if (events.get(id)?.etag !== etag)
                throw new fixture.Error('GOOGLE_CHANGED'); events.delete(id); await fixture.afterProviderWrite?.('remove', id); if (fixture.uncertainNextRemove) { fixture.uncertainNextRemove = false; throw new fixture.Error('UNCERTAIN'); } },
        };
    };
    fixture.create = async (_token: string, title: string, marker: string) => { fixture.providerCalls.push({ action: 'create-calendar', marker }); if (fixture.failNextCreate) {
        fixture.failNextCreate = false;
        throw new fixture.Error('ACCESS_DENIED');
    } const c = { id: 'trip-' + randomUUID(), label: title, description: `Morro export marker: ${marker}` }; fixture.calendars.push(c); if (fixture.uncertainNextCreate) {
        fixture.uncertainNextCreate = false;
        throw new fixture.Error('CALENDAR_CREATION_UNCERTAIN');
    } return c; };
    (globalThis as any).__calendarHarness = fixture;
    const serverBundle = await build({ stdin: { contents: `export * from './lib/easyt/calendar-export-service.server';export * from './lib/easyt/calendar-export-store.server';export{disconnectCalendarGrant,calendarGrant,listCalendarGrants}from'./lib/easyt/calendar-export-auth.server';export{CalendarExportError}from'./lib/easyt/calendar-export-sync';`, resolveDir: process.cwd(), loader: 'ts' }, bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external', plugins: [{ name: 'local-boundaries', setup(b) {
                    b.onResolve({ filter: /^server-only$/ }, () => ({ path: 'server-only', namespace: 'empty' }));
                    b.onLoad({ filter: /.*/, namespace: 'empty' }, () => ({ contents: '', loader: 'js' }));
                    b.onLoad({ filter: /easyt\/database\.ts$/ }, () => ({ loader: 'js', contents: 'export const getEasyTDatabase=()=>globalThis.__calendarHarness.sql;' }));
                    b.onLoad({ filter: /easyt\/repository\.ts$/ }, () => ({ loader: 'js', contents: "export async function getTripForOwner(owner,id){const t=globalThis.__calendarHarness.trip;return t.ownerId===owner&&t.id===id?structuredClone(t):null}" }));
                    b.onLoad({ filter: /auth-environment\.ts$/ }, () => ({ loader: 'js', contents: `export const getEasyTAuthSecret=()=>${JSON.stringify(secret)};export const getMorroviaAuthBaseURL=()=>globalThis.__calendarHarness.origin;` }));
                    b.onLoad({ filter: /google-calendar-export\.ts$/ }, () => ({ loader: 'js', contents: 'export const createGoogleExportProvider=(_token,id)=>globalThis.__calendarHarness.providerFor(id);export const ownedCalendarDestinations=async()=>structuredClone(globalThis.__calendarHarness.calendars);export const createTripCalendar=(...args)=>globalThis.__calendarHarness.create(...args);' }));
                } }] });
    const module = { exports: {} as any };
    new Function('require', 'module', 'exports', serverBundle.outputFiles[0]!.text)(require, module, module.exports);
    fixture.api = module.exports;
    fixture.Error = fixture.api.CalendarExportError;
    fixture.connect = async (kind: CalendarConsentKind, subject = fixture.nextSubject ?? 'synthetic-subject', email = fixture.nextEmail ?? 'synthetic@example.invalid') => { fixture.revoked = false; const cipher = await symmetricEncrypt({ key: secret, data: 'synthetic-access-token' }); const existing = await pool.query("select id from morrovia_calendar_grants where owner_id='traveller' and subject=$1", [subject]); const id = existing.rows[0]?.id ?? randomUUID(); await pool.query("insert into morrovia_calendar_grants(id,owner_id,subject,account_label,token_cipher,expires_at,scopes) values($1,'traveller',$4,$5,$2,now()+interval '1 hour',$3::jsonb) on conflict(owner_id,subject) do update set token_cipher=excluded.token_cipher,expires_at=excluded.expires_at,scopes=excluded.scopes,generation=morrovia_calendar_grants.generation+1", [id, cipher, JSON.stringify(calendarConsentScopes(kind)), subject, email]); fixture.grantId = id; return id; };
    const journeyCss = readFileSync('app/journey/journey-design.css', 'utf8');
    const server = createServer(async (req, res) => {
        try {
            const url = new URL(req.url ?? '/', fixture.origin || 'http://127.0.0.1');
            const json = (data: unknown, status = 200) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)); };
            if (url.pathname === '/fixture.js') {
                res.writeHead(200, { 'Content-Type': 'application/javascript' });
                res.end(bundle.js);
                return;
            }
            if (url.pathname === '/fixture.css') {
                res.writeHead(200, { 'Content-Type': 'text/css' });
                res.end(journeyCss + '\n' + bundle.css);
                return;
            }
            if (url.pathname === '/oauth') {
                res.writeHead(200, { 'Content-Type': 'text/html' });
                const kind = url.searchParams.get('kind');
                res.end(`<h1>Synthetic Google permission screen</h1><a href="/oauth-cancel">Cancel Google</a><a href="/oauth-complete?kind=${kind}">Continue synthetic Google</a>`);
                return;
            }
            if (url.pathname === '/oauth-cancel') {
                res.writeHead(302, { Location: '/journey/calendar-trip/itinerary' });
                res.end();
                return;
            }
            if (url.pathname === '/oauth-complete') {
                const id = await fixture.connect(url.searchParams.get('kind') === 'new-trip' ? 'new-trip' : 'existing-owned');
                res.writeHead(302, { Location: `/journey/calendar-trip/itinerary?itineraryView=calendar&calendarExport=connected&calendarExportGrant=${id}` });
                res.end();
                return;
            }
            if (url.pathname.startsWith('/api/')) {
                if (req.headers['x-morrovia-expected-owner'] !== 'traveller') {
                    json({ code: 'ACCOUNT_CHANGED' }, 403);
                    return;
                }
                const chunks: Buffer[] = [];
                for await (const chunk of req)
                    chunks.push(Buffer.from(chunk));
                const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {};
                if (req.method === 'POST' && req.headers.origin !== fixture.origin) {
                    json({ code: 'INVALID_ORIGIN' }, 403);
                    return;
                }
                if (url.pathname.endsWith('/connect')) {
                    fixture.connectCalls.push(body.kind);
                    json({ url: `${fixture.origin}/oauth?kind=${body.kind}` });
                    return;
                }
                if (url.pathname.endsWith('/disconnect')) {
                    await fixture.api.disconnectCalendarGrant('traveller', body.grantId);
                    json({ disconnected: true });
                    return;
                }
                if (url.pathname.endsWith('/destinations')) {
                    json({ destinations: await fixture.api.calendarDestinations('traveller', url.searchParams.get('grantId')) });
                    return;
                }
                if (req.method === 'GET') {
                    json({ configured: true, ...await fixture.api.calendarExportStatus('traveller', fixture.trip.id) });
                    return;
                }
                const input = { ownerId: 'traveller', tripId: fixture.trip.id, ...body };
                if (body.action === 'preview') {
                    if (fixture.heldPreview) {
                        fixture.onHeldPreview?.();
                        await fixture.heldPreview;
                    }
                    json(await fixture.api.reviewCalendarExport(input));
                    return;
                }
                if (body.action === 'send') {
                    json(await fixture.api.sendCalendarExport(input));
                    return;
                }
                if (body.action === 'create-and-send') {
                    json(await fixture.api.createAndSendTripCalendar(input));
                    return;
                }
                if (body.action === 'readd-preview') {
                    json(await fixture.api.readdCalendarExport(input));
                    return;
                }
                json({ code: 'INVALID_REQUEST' }, 400);
                return;
            }
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"></head><body><div id="root"></div><script>window.__initialRevision=${JSON.stringify(fixture.trip.updatedAt)}</script><script src="/fixture.js"></script></body></html>`);
        }
        catch (e) {
            res.writeHead(409, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ code: e instanceof Error ? e.message : 'UNAVAILABLE' }));
        }
    });
    await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
    fixture.origin = `http://127.0.0.1:${(server.address() as any).port}`;
    fixture.changeRevision = () => { fixture.trip.updatedAt = new Date(Date.now()).toISOString(); };
    fixture.writeCount = () => fixture.providerCalls.filter((c: any) => ['insert', 'patch', 'remove', 'create-calendar'].includes(c.action)).length;
    fixture.close = async () => { await new Promise<void>(r => server.close(() => r())); await pool.end(); delete (globalThis as any).__calendarHarness; };
    return fixture;
}
