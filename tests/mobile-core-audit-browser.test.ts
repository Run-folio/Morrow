import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';
import { renderBuilder, builderBrowserTestsEnabled } from './helpers/builder-render.ts';
import { canonicalRouteFixture } from './fixtures/batch14-route-documents.ts';
const opts = { skip: !builderBrowserTestsEnabled, timeout: 60000 };
const evidence = process.env.MORROVIA_MOBILE_AUDIT_EVIDENCE ?? '/tmp/mobile-core-audit';
mkdirSync(evidence, { recursive: true });
const frame = (p: any) => p.evaluate(() => new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
test('mobile search retains DOM node, focus, caret and position through result reflow', opts, async () => {
    const trip = { ...canonicalRouteFixture(), title: 'Japan synthetic', status: 'planned' as const };
    const h = await renderBuilder({ path: '/journey/dashboard', ownerId: 'owner-a', dashboardTrips: () => [trip], styled: true, offlineOnly: true });
    try {
        const p = h.page;
        for (const width of [320, 390, 430]) {
            await p.setViewportSize({ width, height: 400 });
            const input = p.getByRole('searchbox', { name: 'Search trips' });
            await input.scrollIntoViewIfNeeded();
            await input.focus();
            const node = await input.elementHandle(), before = (await input.boundingBox())!.y;
            for (const query of ['Japan', 'no matching synthetic trip', '']) {
                await input.fill(query);
                await frame(p);
                assert.equal(await input.evaluate((el: any) => document.activeElement === el), true);
                assert.equal(await input.evaluate((el: any) => el.selectionStart), query.length);
                assert.equal(await input.evaluate((el: any, old: any) => el === old, node), true);
                const box = (await input.boundingBox())!;
                assert.ok(box.y >= 0 && box.y + box.height <= 400, `visible ${width}: ${box.y}`);
                assert.ok(Math.abs(box.y - before) <= 2, `stable ${width}: ${before}->${box.y}`);
            }
            for (const name of ['Archived', 'All']) {
                await p.getByRole('button', { name: new RegExp(`^${name}`) }).click();
                await input.focus();
                await frame(p);
                assert.equal(await input.evaluate((el: any, old: any) => el === old, node), true);
            }
            await p.screenshot({ path: `${evidence}/search-${width}.png` });
        }
        assert.deepEqual(h.errors, []);
    }
    finally {
        await h.close();
    }
});
test('date title and Close remain visible at manual entry in short views', opts, async () => {
    const h = await renderBuilder({ path: '/', styled: true, offlineOnly: true });
    try {
        const p = h.page;
        for (const [width, height] of [[320, 640], [390, 400], [390, 600], [844, 390]]) {
            await p.setViewportSize({ width, height });
            const trigger = p.getByRole('button', { name: /Travel dates/ }).first();
            await trigger.click();
            const dialog = p.getByRole('dialog'), close = dialog.getByRole('button', { name: 'Close calendar', exact: true });
            await dialog.getByRole('textbox', { name: 'Date (YYYY-MM-DD)', exact: true }).focus();
            await frame(p);
            const b = (await close.boundingBox())!;
            assert.ok(b.y >= 0 && b.y + b.height <= height, `Close ${width}x${height}: ${b.y}`);
            const d = (await dialog.boundingBox())!;
            assert.ok(d.y >= 0 && d.y + d.height <= height + 1, `bounded ${JSON.stringify(d)}`);
            await p.screenshot({ path: `${evidence}/dates-${width}x${height}.png` });
            await p.keyboard.press('Escape');
            await frame(p);
            assert.equal(await trigger.evaluate((el: any) => document.activeElement === el), true);
            await trigger.click();
            await dialog.getByRole('button', { name: 'Close calendar', exact: true }).click();
            await frame(p);
            assert.equal(await trigger.evaluate((el: any) => document.activeElement === el), true);
        }
        assert.deepEqual(h.errors, []);
    }
    finally {
        await h.close();
    }
});
test('entry tabs fit with full labels and retain keyboard selection', opts, async () => {
    for (const language of ['en', 'es'] as const) {
        // The beta app deliberately renders English. Qualify Spanish through
        // the real shared capture's explicit language prop, as Storybook does.
        const sourceOverrides = new Map([[fileURLToPath(new URL('../app/journey/home/home-trip-starter.tsx', import.meta.url)), `
          import {useState} from 'react';
          import {MorroviaTripCapture} from '@/components/easyt/morrovia-trip-capture';
          export default function Fixture(){
            const [mode,onModeChange]=useState('stops'),[value,onValueChange]=useState('Synthetic draft');
            const [dates,onDatesChange]=useState({start:'2027-06-01',end:'2027-06-10'});
            return <div id="start-building" style={{padding:24}}><MorroviaTripCapture
              language="${language}" value={value} onValueChange={onValueChange}
              startDate={dates.start} endDate={dates.end} onDatesChange={onDatesChange}
              travellers={2} onTravellersChange={()=>{}} interests={[]} onInterestsChange={()=>{}} onSubmit={()=>{}}
              homepageEntry={{mode,onModeChange,destinationEntry:'Synthetic stops',budget:null,onBudgetChange:()=>{},datesChosen:true,onDatesClear:()=>{}}}
            /></div>;
          }
        `]]);
        const h = await renderBuilder({ path: '/', styled: true, offlineOnly: true, sourceOverrides });
        try {
            const p = h.page;
            for (const width of [320, 390, 430]) {
                await p.setViewportSize({ width, height: 844 });
                const tabs = p.getByRole('tablist').first().getByRole('tab');
                assert.equal(await tabs.nth(0).innerText(), language === 'es' ? 'Planificar con paradas' : 'Plan with stops');
                for (const scale of [1, 2]) {
                    await tabs.evaluateAll((els: any[], s: number) => els.forEach(el => el.style.fontSize = `${12 * s}px`), scale);
                    const fits = await tabs.evaluateAll((els: any[]) => els.map(el => { const b = el.getBoundingClientRect(), r = document.createRange(); r.selectNodeContents(el); return { height: b.height, fit: el.scrollWidth <= el.clientWidth + 1, content: [...r.getClientRects()].every(c => c.left >= b.left - 1 && c.right <= b.right + 1) }; }));
                    assert.ok(fits.every((x: any) => x.height >= 44 && x.fit && x.content), `${language} ${width} ${scale}: ${JSON.stringify(fits)}`);
                }
                await tabs.nth(0).focus();
                await p.keyboard.press('ArrowRight');
                assert.equal(await tabs.nth(1).getAttribute('aria-selected'), 'true');
                await p.keyboard.press('ArrowLeft');
                assert.equal(await tabs.nth(0).getAttribute('aria-selected'), 'true');
                await p.screenshot({ path: `${evidence}/tabs-${language}-${width}.png` });
            }
            assert.deepEqual(h.errors, []);
        }
        finally {
            await h.close();
        }
    }
});
test('import corrections and skipped details precede route and Create in DOM order', opts, async () => {
    const h = await renderBuilder({ path: '/journey/new/import', styled: true, offlineOnly: true });
    try {
        const p = h.page;
        await p.setViewportSize({ width: 390, height: 844 });
        await p.getByText('Paste table', { exact: true }).click();
        await p.getByRole('textbox', { name: 'Spreadsheet rows' }).fill('Destination,Country,Arrival date,Departure date,Date\nManila,Philippines,2026-12-11,2026-12-13,2026-12-12');
        await p.getByRole('button', { name: 'Review pasted table' }).click();
        await p.getByRole('region', { name: 'Your route', exact: true }).waitFor();
        assert.equal(await p.locator('#attention-title').evaluate((el: any) => Boolean(el.compareDocumentPosition(document.getElementById('route-review-title')) & Node.DOCUMENT_POSITION_FOLLOWING)), true);
        const details = p.locator('details').filter({ has: p.getByText('Import details', { exact: true }) });
        assert.equal(await details.evaluate((el: any) => Boolean(el.compareDocumentPosition([...document.querySelectorAll('button')].find(b => b.textContent === 'Create trip')!) & Node.DOCUMENT_POSITION_FOLLOWING)), true);
        await p.screenshot({ path: `${evidence}/import-attention.png` });
        assert.deepEqual(h.errors, []);
    }
    finally {
        await h.close();
    }
});
test('interactive import corrections preserve other entries and route dates; last correction hands focus to route', opts, async () => {
    const h = await renderBuilder({ path: '/journey/new/import', styled: true, offlineOnly: true });
    try {
        const p = h.page;
        await p.setViewportSize({ width: 390, height: 844 });
        const candidate = (name: string, country: string) => ({ name, country, canonicalPlaceId: `fixture:${name}`, providerId: `fixture:${name}`, coordinates: name === 'London' ? [-.12, 51.5] : [139, 35], placeType: 'city', routability: 'direct_destination' });
        let originRelease: () => void = () => { }, originStarted: () => void = () => { };
        const originReady = new Promise<void>(r => { originStarted = r; });
        await p.route('**/api/journey-geocode?**', async (route: any) => {
            const url = new URL(route.request().url()), name = url.searchParams.get('place') ?? '';
            let candidates: any[] = [];
            if (name.startsWith('London')) {
                await new Promise<void>(r => { originRelease = r; originStarted(); });
                candidates = [candidate('London', 'United Kingdom')];
            }
            else if (url.searchParams.get('mode') === 'resolve')
                candidates = [candidate(name.startsWith('Tokyo') ? 'Tokyo' : 'Kyoto', 'Japan')];
            await route.fulfill({ json: { candidates } });
        });
        await p.getByText('Paste table', { exact: true }).click();
        await p.getByRole('textbox', { name: 'Spreadsheet rows' }).fill('Destination,Country,Arrival date,Departure date,Date\nTokyo,Japan,2027-04-02,2027-04-06,2027-04-03\nKyoto,Japan,2027-04-06,2027-04-10,2027-04-08');
        await p.getByRole('button', { name: 'Review pasted table' }).click();
        const origin = p.getByRole('textbox', { name: 'Starting city or airport', exact: true });
        await origin.fill('London');
        const route = p.getByRole('region', { name: 'Your route', exact: true }), before = await route.innerText();
        const mapping = p.locator('[aria-labelledby="attention-title"]').getByRole('combobox', { name: 'Meaning of Date', exact: true });
        await mapping.selectOption('ignore');
        await frame(p);
        assert.equal(await origin.inputValue(), 'London');
        assert.equal(await route.innerText(), before);
        for (const name of ['Tokyo', 'Kyoto']) {
            const item = p.getByRole('heading', { name: `Which ${name} do you mean?`, exact: true }).locator('..').locator('..');
            await item.getByRole('button', { name: 'Search places', exact: true }).click();
            const select = item.getByRole('combobox', { name: `Search results for ${name}`, exact: true });
            await select.focus();
            await select.selectOption('0');
            await p.getByRole('heading', { name: `Which ${name} do you mean?`, exact: true }).waitFor({ state: 'detached' });
            assert.equal(await origin.inputValue(), 'London');
        }
        assert.match(await route.innerText(), /2–6 Apr 2027 · 4 nights/);
        assert.match(await route.innerText(), /6–10 Apr 2027 · 4 nights/);
        assert.ok((await route.innerText()).indexOf('Tokyo') < (await route.innerText()).indexOf('Kyoto'));
        assert.equal(await p.getByRole('button', { name: 'Create trip', exact: true }).isEnabled(), false);
        await p.getByRole('button', { name: 'Check place', exact: true }).click();
        await originReady;
        await origin.focus();
        originRelease();
        await p.waitForFunction(() => [...document.querySelectorAll('button')].some(button => button.textContent?.trim() === 'Create trip' && !button.disabled));
        await frame(p);
        assert.equal(await p.locator('#route-review-title').evaluate((el: any) => document.activeElement === el), true);
        assert.equal(await p.getByRole('button', { name: 'Create trip', exact: true }).isEnabled(), true);
        await p.locator('summary').filter({ hasText: 'Import details' }).click();
        assert.equal(await p.getByRole('combobox', { name: 'Meaning of Date', exact: true }).inputValue(), 'ignore');
        const detailMapping = p.getByRole('combobox', { name: 'Meaning of Date', exact: true });
        await detailMapping.focus();
        await detailMapping.selectOption('activityDate');
        await frame(p);
        assert.equal(await detailMapping.evaluate((el: any) => document.activeElement === el), true, 'mapping focus survives keyed review remount');
        assert.equal(await p.locator('details').filter({ has: p.getByText('Import details', { exact: true }) }).getAttribute('open') !== null, true);
        await p.screenshot({ path: `${evidence}/import-corrected.png`, fullPage: true });
        assert.deepEqual(h.errors, []);
    }
    finally {
        await h.close();
    }
});
test('rapid Create activation prepares one synthetic import and retains one recovery', opts, async () => {
    let preparations = 0, release: () => void = () => { }, started: () => void = () => { };
    const ready = new Promise<void>(r => { started = r; });
    const h = await renderBuilder({ path: '/journey/new/import', styled: true, offlineOnly: true, transferRequest: async () => { preparations++; await new Promise<void>(r => { release = r; started(); }); return { status: 200, body: { legs: [] } }; } });
    try {
        const p = h.page;
        let accountWrites = 0;
        await p.route('**/api/easyt/trips**', (route: any) => {
            if (!['GET', 'HEAD'].includes(route.request().method()))
                accountWrites++;
            return route.abort();
        });
        await p.route('**/api/journey-geocode?**', (route: any) => { const q = new URL(route.request().url()).searchParams.get('place') ?? '', name = q.startsWith('London') ? 'London' : q.startsWith('Tokyo') ? 'Tokyo' : 'Kyoto', country = name === 'London' ? 'United Kingdom' : 'Japan'; return route.fulfill({ json: { candidates: [{ name, country, canonicalPlaceId: `fixture:${name}`, providerId: `fixture:${name}`, coordinates: name === 'London' ? [-.12, 51.5] : name === 'Tokyo' ? [139.7, 35.7] : [135.8, 35], placeType: 'city', routability: 'direct_destination' }] } }); });
        await p.getByText('Paste table', { exact: true }).click();
        await p.getByRole('textbox', { name: 'Spreadsheet rows' }).fill('Trip origin,Destination,Country,Arrival date,Departure date\nLondon,Tokyo,Japan,2027-04-02,2027-04-06\nLondon,Kyoto,Japan,2027-04-06,2027-04-10');
        await p.getByRole('button', { name: 'Review pasted table' }).click();
        await p.waitForFunction(() => [...document.querySelectorAll('button')].some(button => button.textContent?.trim() === 'Create trip' && !button.disabled));
        await p.getByRole('button', { name: 'Create trip', exact: true }).evaluate((button: any) => { button.click(); button.click(); });
        await ready;
        assert.equal(preparations, 1);
        release();
        await p.waitForURL(/\/journey\/trip-[^/]+/);
        assert.equal(await p.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('easyt:trip-recovery:v2:')).length), 1);
        assert.equal(accountWrites, 0);
        assert.deepEqual(h.errors, []);
    }
    finally {
        release();
        await h.close();
    }
});
test('stale manual-origin completion cannot move focus into a replacement review', opts, async () => {
    const h = await renderBuilder({ path: '/journey/new/import', styled: true, offlineOnly: true });
    let release: () => void = () => { }, signal: () => void = () => { };
    const started = new Promise<void>(r => { signal = r; });
    try {
        const p = h.page;
        await p.route('**/api/journey-geocode?**', async (route: any) => {
            const q = new URL(route.request().url()).searchParams.get('place') ?? '';
            if (q.startsWith('London')) {
                await new Promise<void>(r => { release = r; signal(); });
                await route.fulfill({ json: { candidates: [{ name: 'London', country: 'United Kingdom', canonicalPlaceId: 'fixture:London', providerId: 'fixture:London', coordinates: [-.12, 51.5], placeType: 'city', routability: 'direct_destination' }] } });
            }
            else
                await route.fulfill({ json: { candidates: [] } });
        });
        const paste = async (name: string) => { await p.getByText('Paste table', { exact: true }).click(); await p.getByRole('textbox', { name: 'Spreadsheet rows' }).fill(`Destination,Country,Arrival date,Departure date\n${name},Japan,2027-04-02,2027-04-06`); await p.getByRole('button', { name: 'Review pasted table' }).click(); };
        await paste('Tokyo');
        await p.getByRole('textbox', { name: 'Starting city or airport', exact: true }).fill('London');
        await p.getByRole('button', { name: 'Check place', exact: true }).click();
        await started;
        await p.getByRole('button', { name: 'Change source', exact: true }).click();
        await paste('Kyoto');
        await p.getByRole('heading', { name: 'Which Kyoto do you mean?', exact: true }).waitFor();
        await p.evaluate(() => { (document.activeElement as HTMLElement)?.blur(); });
        assert.equal(await p.evaluate(() => document.activeElement === document.body), true);
        const response = p.waitForResponse((r: any) => r.url().includes('journey-geocode') && r.url().includes('London'));
        release();
        await response;
        await frame(p);
        await frame(p);
        assert.equal(await p.evaluate(() => document.activeElement === document.body), true, 'stale correction must not focus replacement controls');
        assert.equal(await p.getByRole('textbox', { name: 'Starting city or airport', exact: true }).inputValue(), '');
        assert.deepEqual(h.errors, []);
    }
    finally {
        release();
        await h.close();
    }
});
test('first/last calendar days, keyboard navigation and typed ranges remain operable in short views', opts, async () => {
    const h = await renderBuilder({ path: '/', styled: true, offlineOnly: true });
    try {
        const p = h.page;
        for (const [width, height] of [[320, 640], [390, 400], [390, 600], [844, 390]]) {
            await p.setViewportSize({ width, height });
            const trigger = p.getByRole('button', { name: /Travel dates/ }).first();
            await trigger.click();
            const dialog = p.getByRole('dialog');
            const first = dialog.locator('button[data-date]:not(:disabled)').first(), firstDate = await first.getAttribute('data-date');
            await first.click();
            const last = dialog.locator('button[data-date]:not(:disabled)').last(), lastDate = await last.getAttribute('data-date');
            await last.click();
            await dialog.waitFor({ state: 'hidden' });
            await trigger.click();
            assert.equal(await dialog.locator(`[data-date="${firstDate}"]`).getAttribute('aria-selected'), 'true');
            assert.equal(await dialog.locator(`[data-date="${lastDate}"]`).getAttribute('aria-selected'), 'true');
            const active = dialog.locator('button[data-date]:not(:disabled)').first();
            await active.focus();
            await p.keyboard.press('ArrowRight');
            await frame(p);
            assert.notEqual(await p.evaluate(() => document.activeElement?.getAttribute('data-date')), firstDate);
            const typed = dialog.getByRole('textbox', { name: 'Date (YYYY-MM-DD)', exact: true });
            await typed.fill('2027-06-01');
            await typed.press('Enter');
            await typed.fill('2027-06-10');
            await typed.press('Enter');
            await dialog.waitFor({ state: 'hidden' });
            await trigger.click();
            assert.equal(await dialog.locator('[data-date="2027-06-01"]').getAttribute('aria-selected'), 'true');
            assert.equal(await dialog.locator('[data-date="2027-06-10"]').getAttribute('aria-selected'), 'true');
            await typed.focus();
            await frame(p);
            const close = (await dialog.getByRole('button', { name: 'Close calendar', exact: true }).boundingBox())!;
            assert.ok(close.y >= 0 && close.y + close.height <= height);
            await p.keyboard.press('Escape');
            await frame(p);
            assert.equal(await trigger.evaluate((el: any) => el === document.activeElement), true);
        }
        assert.deepEqual(h.errors, []);
    }
    finally {
        await h.close();
    }
});
test('zero, one and multiple skipped rows keep count, reasons and row references before Create', opts, async () => {
    const h = await renderBuilder({ path: '/journey/new/import', styled: true, offlineOnly: true });
    try {
        const p = h.page;
        await p.setViewportSize({ width: 390, height: 844 });
        for (const skipped of [0, 1, 3]) {
            await p.getByText('Paste table', { exact: true }).click();
            const head = 'Destination,Country,Arrival date,Departure date,Hotel,Booking reference', row = 'Rome,Italy,2027-06-01,2027-06-04,Hotel Artemide,ROM-42';
            await p.getByRole('textbox', { name: 'Spreadsheet rows' }).fill([head, ...Array.from({ length: skipped === 3 ? 3 : skipped + 1 }, () => row), ...(skipped === 3 ? ['Rome,Italy,2027-06-01,2027-06-04,Incomplete Hotel,'] : [])].join('\n'));
            await p.getByRole('button', { name: 'Review pasted table' }).click();
            const details = p.locator('details').filter({ has: p.getByText('Import details', { exact: true }) });
            await details.locator('summary').click();
            if (skipped === 0)
                await p.getByText('No source rows were skipped.', { exact: true }).first().waitFor();
            else {
                assert.match(await details.locator('summary').innerText(), new RegExp(`${skipped} row${skipped === 1 ? '' : 's'} skipped`));
                for (let i = 3; i <= skipped + 2; i++)
                    assert.match(await details.innerText(), new RegExp(`Row ${i}\\.`));
                assert.match(await details.innerText(), /Repeated booking row ignored/);
                if (skipped === 3)
                    assert.match(await details.innerText(), /Incomplete Hotel not imported as booked/);
            }
            assert.equal(await details.evaluate((el: any) => Boolean(el.compareDocumentPosition([...document.querySelectorAll('button')].find(b => b.textContent === 'Create trip')!) & Node.DOCUMENT_POSITION_FOLLOWING)), true);
            await p.screenshot({ path: `${evidence}/skipped-${skipped}.png`, fullPage: true });
            await p.getByRole('button', { name: 'Change source', exact: true }).click();
        }
        assert.deepEqual(h.errors, []);
    }
    finally {
        await h.close();
    }
});
test('desktop dashboard now starts with library controls in keyboard order', opts, async () => {
    const trip = { ...canonicalRouteFixture(), title: 'Japan synthetic', status: 'planned' as const };
    const h = await renderBuilder({ path: '/journey/dashboard', ownerId: 'owner-a', dashboardTrips: () => [trip], styled: true, offlineOnly: true });
    try {
        const p = h.page;
        await p.setViewportSize({ width: 1440, height: 1000 });
        const continueTrip = p.getByRole('link', { name: 'Continue trip', exact: true });
        await continueTrip.waitFor();
        await p.keyboard.press('Tab');
        assert.equal(await p.getByRole('button', { name: /^All/ }).evaluate((el: any) => document.activeElement === el), true);
        const search = p.getByRole('searchbox', { name: 'Search trips' });
        assert.equal(await continueTrip.evaluate((el: any, searchEl: any) => Boolean(el.compareDocumentPosition(searchEl) & Node.DOCUMENT_POSITION_PRECEDING), await search.elementHandle()), true);
        assert.deepEqual(h.errors, []);
    }
    finally {
        await h.close();
    }
});
test('automatic destination resolution leaves a separately focused origin draft untouched', opts, async () => {
    const h = await renderBuilder({ path: '/journey/new/import', styled: true, offlineOnly: true });
    let release: () => void = () => { }, signal: () => void = () => { };
    const started = new Promise<void>(r => { signal = r; });
    try {
        const p = h.page;
        await p.route('**/api/journey-geocode?**', async (route: any) => { await new Promise<void>(r => { release = r; signal(); }); await route.fulfill({ json: { candidates: [{ name: 'Tokyo', country: 'Japan', canonicalPlaceId: 'fixture:Tokyo', providerId: 'fixture:Tokyo', coordinates: [139.7, 35.7], placeType: 'city', routability: 'direct_destination' }] } }); });
        await p.getByText('Paste table', { exact: true }).click();
        await p.getByRole('textbox', { name: 'Spreadsheet rows' }).fill('Destination,Country,Arrival date,Departure date\nTokyo,Japan,2027-04-02,2027-04-06');
        await p.getByRole('button', { name: 'Review pasted table' }).click();
        await started;
        const origin = p.getByRole('textbox', { name: 'Starting city or airport', exact: true });
        await origin.fill('Lon partial');
        const node = await origin.elementHandle();
        release();
        await p.getByText('1 detail needs checking', { exact: true }).waitFor();
        await frame(p);
        assert.equal(await origin.evaluate((el: any, old: any) => el === old && document.activeElement === el, node), true);
        assert.equal(await origin.inputValue(), 'Lon partial');
        assert.deepEqual(h.errors, []);
    }
    finally {
        release();
        await h.close();
    }
});
test('actual fresh Builder entry tabs fit narrow containers and preserve the description draft', opts, async () => {
    const h = await renderBuilder({ path: '/journey/new', styled: true, offlineOnly: true });
    try {
        const p = h.page;
        for (const width of [320, 390, 430]) {
            await p.setViewportSize({ width, height: 844 });
            const tabs = p.getByRole('tablist').first().getByRole('tab');
            for (const scale of [1, 2]) {
                await tabs.evaluateAll((els: any[], s: number) => els.forEach(el => el.style.fontSize = `${12 * s}px`), scale);
                const fits = await tabs.evaluateAll((els: any[]) => els.map(el => { const b = el.getBoundingClientRect(), r = document.createRange(); r.selectNodeContents(el); return b.height >= 44 && el.scrollWidth <= el.clientWidth + 1 && [...r.getClientRects()].every(c => c.left >= b.left - 1 && c.right <= b.right + 1); }));
                assert.ok(fits.every(Boolean), `Builder tabs ${width} ${scale}`);
            }
            await tabs.nth(0).focus();
            await p.keyboard.press('ArrowRight');
            assert.equal(await tabs.nth(1).getAttribute('aria-selected'), 'true');
            const prompt = p.locator('textarea').first();
            await prompt.fill('Synthetic Tokyo then Kyoto draft');
            await tabs.nth(0).click();
            await tabs.nth(1).click();
            assert.equal(await prompt.inputValue(), 'Synthetic Tokyo then Kyoto draft');
            await tabs.nth(0).click();
            await p.screenshot({ path: `${evidence}/builder-tabs-${width}.png` });
        }
        assert.deepEqual(h.errors, []);
    }
    finally {
        await h.close();
    }
});
