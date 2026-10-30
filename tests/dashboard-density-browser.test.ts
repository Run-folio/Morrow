import assert from 'node:assert/strict';
import { readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { renderBuilder, builderBrowserTestsEnabled } from './helpers/builder-render.ts';
import { canonicalRouteFixture } from './fixtures/batch14-route-documents.ts';
const opts = { skip: !builderBrowserTestsEnabled, timeout: 45000 };
const out = process.env.MORROVIA_DENSITY_EVIDENCE ?? '/tmp/dashboard-density';
mkdirSync(out, { recursive: true });
const frame = (p: any) => p.evaluate(() => new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
function trip(id: string, status: 'planned' | 'draft' | 'archived' = 'planned', country = 'Japan', custom: string | null = 'Custom ' + id) { const t = canonicalRouteFixture(); return { ...t, id, status, title: custom ?? 'Generated route', updatedAt: `2026-10-${id === 'featured' ? '25' : '20'}T12:00:00.000Z`, brief: { ...t.brief, customTitle: custom }, stops: t.stops.map(s => ({ ...s, country, countryCode: undefined })) }; }
const cards = (p: any) => p.locator('article').filter({ has: p.locator('h3') });
test('collection starts with controls and every saved trip, without intro/featured presentation', opts, async () => {
    const trips = [trip('featured'), trip('second'), trip('draft', 'draft'), trip('archive', 'archived')];
    const frozen = JSON.stringify(trips);
    const h = await renderBuilder({ path: '/journey/dashboard', ownerId: 'owner-a', dashboardTrips: () => trips, styled: true, offlineOnly: true });
    try {
        const p = h.page;
        for (const width of [1440, 1024, 430, 390, 320]) {
            await p.setViewportSize({ width, height: 900 });
            await p.evaluate(() => scrollTo(0, 0));
            assert.equal(await p.locator('#current-journey-title').count(), 0);
            assert.equal(await cards(p).count(), 4);
            assert.equal(await p.getByRole('heading', { name: 'Custom featured', exact: true }).count(), 1);
            const toolbar = p.getByRole('searchbox', { name: 'Search trips' }), image = cards(p).first().locator('[class*="cardMediaFrame"]');
            const t = (await toolbar.boundingBox())!, b = (await image.boundingBox())!;
            assert.ok(t.y < 150, `top controls ${width}: ${t.y}`);
            assert.ok(b.y < 350, `first card ${width}: ${b.y}`);
            assert.equal(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
            await p.screenshot({ path: `${out}/collection-${width}.png` });
        }
        assert.equal(JSON.stringify(trips), frozen);
        assert.deepEqual(h.errors, []);
    }
    finally {
        await h.close();
    }
    const page = readFileSync(new URL('../app/journey/dashboard/page.tsx', import.meta.url), 'utf8');
    assert.doesNotMatch(page, /Ready when you are\.|Your journeys\./);
});
test('cards use custom/country/fallback names, dates and pluralized stops with primary Continue trip links', opts, async () => {
    const japan = trip('japan', 'planned', 'Japan', null), korea = trip('korea', 'planned', 'South Korea', null), draft = trip('draft', 'draft', 'Japan', 'My summer plan'), archived = trip('archive', 'archived', 'Japan', 'Last winter');
    const unknown = trip('unknown', 'planned', 'Not a country', null);
    unknown.stops = unknown.stops.slice(0, 1);
    unknown.startDate = '';
    unknown.endDate = '';
    const long = trip('long', 'planned', 'Japan', 'A very long custom family trip name that remains exactly the travellers own name even on a narrow phone');
    const h = await renderBuilder({ path: '/journey/dashboard', ownerId: 'owner-a', dashboardTrips: () => [japan, korea, draft, archived, unknown, long], styled: true, offlineOnly: true });
    try {
        const p = h.page;
        await p.setViewportSize({ width: 320, height: 900 });
        const names = await cards(p).locator('h3').allTextContents();
        assert.ok(names.includes('Japan'));
        assert.ok(names.includes('South Korea'));
        assert.ok(names.includes('Your trip'));
        assert.ok(names.includes(long.brief.customTitle!));
        assert.equal(await p.locator('[class*="tripRoute"],[class*="readinessLine"]').count(), 0);
        assert.equal(await p.getByText(/stays sorted|Overnight stays to confirm/).count(), 0);
        const unnamed = cards(p).filter({ has: p.getByRole('heading', { name: 'Your trip', exact: true }) });
        assert.match(await unnamed.innerText(), /Dates to confirm/);
        assert.match(await unnamed.innerText(), /1 stop\b/);
        assert.doesNotMatch(await cards(p).first().innerText(), /nights/);
        for (const [title, href] of [['My summer plan', '/journey/new?trip=draft'], ['Last winter', '/journey/archive'], ['Japan', '/journey/japan']]) {
            const card = cards(p).filter({ has: p.getByRole('heading', { name: title, exact: true }) }), link = card.getByRole('link', { name: 'Continue trip', exact: true });
            assert.equal(await link.getAttribute('href'), href);
            assert.match(await link.getAttribute('class'), /primary/);
        }
        await p.getByRole('combobox', { name: 'Sort trips' }).selectOption('title');
        const sorted = await cards(p).locator('h3').allTextContents();
        const planned = sorted.filter((n: string) => n !== 'My summer plan' && n !== 'Last winter');
        assert.deepEqual(planned, [...planned].sort((a, b) => a.localeCompare(b)));
        assert.equal(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
        await p.screenshot({ path: `${out}/cards-320.png`, fullPage: true });
        assert.deepEqual(h.errors, []);
    }
    finally {
        await h.close();
    }
});
test('tabs, search, sort and menus remain operable with stable search focus', opts, async () => {
    const h = await renderBuilder({ path: '/journey/dashboard', ownerId: 'owner-a', dashboardTrips: () => [trip('featured'), trip('draft', 'draft'), trip('archive', 'archived')], styled: true, offlineOnly: true });
    try {
        const p = h.page;
        await p.setViewportSize({ width: 390, height: 900 });
        for (const [name, count] of [['Planned', 1], ['Active', 1], ['Archived', 1], ['All', 3]] as const) {
            await p.getByRole('button', { name: new RegExp(`^${name}`) }).click();
            assert.equal(await cards(p).count(), count);
        }
        const input = p.getByRole('searchbox', { name: 'Search trips' }), node = await input.elementHandle();
        await input.focus();
        const top = (await input.boundingBox())!.y;
        for (const q of ['featured', 'no match', '']) {
            await input.fill(q);
            await frame(p);
            assert.equal(await input.evaluate((el: any, old: any) => el === old && document.activeElement === el, node), true);
            assert.equal(await input.evaluate((el: any) => el.selectionStart), q.length);
            assert.ok(Math.abs((await input.boundingBox())!.y - top) < 2);
            if (q === 'no match')
                await p.getByText('No trips match that search.', { exact: true }).waitFor();
        }
        await p.getByRole('combobox', { name: 'Sort trips' }).selectOption('upcoming');
        assert.equal(await cards(p).count(), 3);
        const menu = cards(p).first().locator('summary');
        await menu.click();
        await p.getByRole('button', { name: 'Archive', exact: true }).waitFor();
        await p.keyboard.press('Escape');
        assert.equal(await p.getByRole('img', { name: 'Grid view', exact: true }).count(), 1);
        assert.deepEqual(h.errors, []);
    }
    finally {
        await h.close();
    }
});
test('recovery warnings retain retry and affected-trip review actions without the hero', opts, async () => {
    const path = fileURLToPath(new URL('../lib/easyt/storage.ts', import.meta.url));
    const raw = readFileSync(path, 'utf8');
    const mark = 'export async function listTripRecoveries(ownerId:string|null):Promise<TripRecoveryRecord[]> {';
    assert.ok(raw.includes(mark));
    const sourceOverrides = new Map([[path, raw.replace(mark, mark + `if(!localStorage.getItem('density-retry'))throw Error('Synthetic read refusal');`)]]);
    const t = trip('featured');
    const h = await renderBuilder({ path: '/journey/dashboard', ownerId: 'owner-a', dashboardTrips: () => [t], initialTrip: { ...t, title: 'Device edits', brief: { ...t.brief, customTitle: 'Device edits' } }, styled: true, offlineOnly: true, sourceOverrides });
    try {
        const p = h.page;
        await p.getByText('Device copies could not be checked', { exact: true }).waitFor();
        assert.equal(await cards(p).count(), 1);
        await p.evaluate(() => localStorage.setItem('density-retry', '1'));
        await p.getByRole('button', { name: 'Try again', exact: true }).click();
        await p.getByRole('link', { name: 'Review device copy', exact: true }).waitFor();
        assert.equal(await p.locator('#current-journey-title').count(), 0);
        assert.equal(await cards(p).getByRole('link', { name: 'Review device copy', exact: true }).count(), 1);
        assert.deepEqual(h.errors, []);
        await p.screenshot({ path: `${out}/recovery.png`, fullPage: true });
    }
    finally {
        await h.close();
    }
});
test('zero-trip collection resolves safely and session changes hide private cards', opts, async () => {
    const h = await renderBuilder({ path: '/journey/dashboard', ownerId: 'owner-a', dashboardTrips: () => [], styled: true, offlineOnly: true });
    try {
        const p = h.page;
        await p.getByText('No trips yet.', { exact: true }).waitFor();
        assert.equal(await cards(p).count(), 0);
        assert.equal(await p.getByRole('link', { name: 'Start a trip', exact: true }).count(), 1);
        assert.equal(await p.getByRole('searchbox', { name: 'Search trips' }).count(), 1);
        await p.getByRole('searchbox', { name: 'Search trips' }).fill('missing');
        await p.getByText('No trips match that search.', { exact: true }).waitFor();
        await p.getByRole('searchbox', { name: 'Search trips' }).fill('');
        await p.getByRole('button', { name: /^Archived/ }).click();
        assert.equal(await p.getByRole('link', { name: 'Start a trip', exact: true }).count(), 0);
        await p.screenshot({ path: `${out}/empty.png` });
        assert.deepEqual(h.errors, []);
    }
    finally {
        await h.close();
    }
    const t = trip('featured'), privateView = await renderBuilder({ path: '/journey/dashboard', ownerId: 'owner-a', dashboardTrips: () => [t], styled: true, offlineOnly: true });
    try {
        const p = privateView.page;
        await p.evaluate(() => { (window as any).__BUILDER_TEST_OWNER__ = undefined; window.dispatchEvent(new Event('builder-test-owner')); });
        await p.getByText('Your session ended', { exact: true }).waitFor();
        assert.equal(await cards(p).count(), 0);
        assert.equal(await p.getByRole('link', { name: 'Sign in again', exact: true }).count(), 1);
    }
    finally {
        await privateView.close();
    }
});
test('zero-trip recovery checking/unavailable states retain safety and expose retry', opts, async () => {
    const path = fileURLToPath(new URL('../lib/easyt/storage.ts', import.meta.url)), raw = readFileSync(path, 'utf8'), mark = 'export async function listTripRecoveries(ownerId:string|null):Promise<TripRecoveryRecord[]> {';
    const sourceOverrides = new Map([[path, raw.replace(mark, mark + `await new Promise<void>(r=>{(window as any).__densityReject=()=>r();});throw Error('Synthetic recovery refusal');`)]]);
    const h = await renderBuilder({ path: '/journey/dashboard', ownerId: 'owner-a', dashboardTrips: () => [], styled: true, offlineOnly: true, sourceOverrides });
    try {
        const p = h.page;
        await p.getByText('Checking for a saved trip on this device…', { exact: true }).waitFor();
        assert.equal(await p.getByRole('link', { name: 'Start a trip', exact: true }).count(), 0);
        assert.equal(await p.getByRole('link', { name: 'Start another trip', exact: true }).count(), 0);
        await p.evaluate(() => { (window as any).__densityReject(); });
        await p.getByText('Device copies could not be checked', { exact: true }).waitFor();
        assert.equal(await p.getByRole('link', { name: 'Start a trip', exact: true }).count(), 0);
        assert.equal(await p.getByRole('button', { name: 'Try again', exact: true }).count(), 1);
        assert.deepEqual(h.errors, []);
    }
    finally {
        await h.close();
    }
});
test('multi-country names and Spanish stop pluralization render without inventing missing geography', opts, async () => {
    const multi = trip('multi', 'planned', 'Japan', null);
    multi.stops = multi.stops.slice(0, 2);
    multi.stops[1]!.country = 'South Korea';
    const one = trip('one', 'planned', 'Japan', 'Una parada');
    one.stops = one.stops.slice(0, 1);
    const zero = trip('zero', 'planned', '', null);
    zero.stops = [];
    zero.startDate = '';
    zero.endDate = '';
    const h = await renderBuilder({ path: '/journey/dashboard', ownerId: 'owner-a', dashboardTrips: () => [multi, one, zero], styled: true, offlineOnly: true });
    try {
        const p = h.page;
        await p.setViewportSize({ width: 320, height: 900 });
        await p.getByRole('heading', { name: 'Japan & South Korea', exact: true }).waitFor();
        await p.getByRole('searchbox', { name: 'Search trips' }).fill('South Korea');
        assert.equal(await cards(p).count(), 1);
        await p.getByRole('searchbox', { name: 'Search trips' }).fill('');
        await p.evaluate(() => window.dispatchEvent(new CustomEvent('easyt-language-change', { detail: 'es' })));
        await p.getByRole('link', { name: 'Continuar viaje', exact: true }).first().waitFor();
        assert.match(await cards(p).filter({ has: p.getByRole('heading', { name: 'Una parada', exact: true }) }).innerText(), /1 parada\b/);
        assert.match(await cards(p).filter({ has: p.getByRole('heading', { name: 'Japan & South Korea', exact: true }) }).innerText(), /2 paradas/);
        const unnamed = cards(p).filter({ has: p.getByRole('heading', { name: 'Your trip', exact: true }) });
        assert.match(await unnamed.innerText(), /0 paradas/);
        assert.match(await unnamed.innerText(), /Fechas por confirmar/);
        assert.equal(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
        await p.screenshot({ path: `${out}/spanish-320.png`, fullPage: true });
        assert.deepEqual(h.errors, []);
    }
    finally {
        await h.close();
    }
});
