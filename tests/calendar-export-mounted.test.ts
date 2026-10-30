import assert from 'node:assert/strict';
import test from 'node:test';
import { chromium, webkit } from 'playwright';
import type { Page, Browser } from 'playwright';
import { localCalendarHarness } from './calendar-export-local-harness.ts';
import { writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
const enabled = process.env.MORROVIA_CALENDAR_MOUNTED_TESTS === '1';
async function view(name: 'chromium' | 'webkit', connected = true, mobile = false) {
    const fixture = await localCalendarHarness();
    if (connected)
        await fixture.connect('existing-owned');
    let browser: Browser | undefined;
    try {
        browser = await (name === 'webkit' ? webkit : chromium).launch({ headless: true, timeout: 8000 });
        const context = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 900 } });
        const external: string[] = [], errors: string[] = [];
        await context.route('**/*', route => { if (new URL(route.request().url()).origin !== fixture.origin) {
            external.push(route.request().url());
            return route.abort();
        } return route.continue(); });
        const page = await context.newPage();
        page.setDefaultTimeout(8000);
        page.on('pageerror', e => errors.push(e.message));
        await page.goto(fixture.origin + '/journey/calendar-trip/itinerary');
        await page.getByRole('button', { name: 'Add to calendar', exact: true }).waitFor();
        return { fixture, page, external, errors, async close() { try {
                writeFileSync(`output/playwright/${name}-${fixture.schema}.json`, JSON.stringify({ url: page.url(), body: await page.locator('body').innerText(), errors, external }, null, 2));
                await page.screenshot({ path: `output/playwright/${name}-${fixture.schema}.png`, fullPage: true });
            }
            catch { } await browser!.close(); await fixture.close(); } };
    }
    catch (e) {
        await browser?.close();
        await fixture.close();
        throw e;
    }
}
async function open(page: Page) { await page.getByRole('button', { name: /^(Add to calendar|Send changes)$/ }).click(); await page.getByRole('dialog').waitFor(); await page.getByRole('button', { name: 'Preview events', exact: true }).waitFor(); await page.getByRole('button', { name: 'Preview events', exact: true }).isEnabled(); await page.waitForFunction(() => !document.querySelector('[role="status"]')?.textContent?.includes('Checking calendar')); }
async function preview(page: Page) { await page.getByRole('button', { name: 'Preview events', exact: true }).click(); await page.getByRole('heading', { name: 'Date only — times not set' }).waitFor(); }
async function send(page: Page, name = 'Add events') { await page.getByRole('dialog').getByRole('button', { name, exact: true }).click(); await page.getByRole('status').filter({ hasText: /changes confirmed/ }).waitFor(); }
async function changed(page: Page, fixture: any) { fixture.changeRevision(); await page.evaluate((revision: string) => (window as any).__calendarMount.setRevision(revision), fixture.trip.updatedAt); await page.getByRole('button', { name: 'Preview events', exact: true }).waitFor(); }
function singleEvent(fixture: any) { fixture.trip.legs = []; fixture.trip.brief.bookings = []; fixture.trip.brief.itineraryIdeas = [fixture.trip.brief.itineraryIdeas[0]]; }
async function reconnect(page: Page) { await page.getByRole('button', { name: 'Choose another Google account', exact: true }).click(); await page.getByRole('link', { name: 'Continue synthetic Google' }).click(); await page.getByRole('button', { name: 'Preview events', exact: true }).waitFor(); }
for (const name of ['chromium', 'webkit'] as const) {
    test(`reliability mounted expiry after preview reconnects without replaying stale authority (${name})`, { skip: !enabled, timeout: 30000 }, async () => {
        const v = await view(name);
        try {
            singleEvent(v.fixture);
            await open(v.page); await preview(v.page);
            const old = (await v.fixture.pool.query('select id,document from morrovia_calendar_bindings')).rows[0];
            const eventId = old.document.review.operations[0].eventId;
            await v.fixture.pool.query("update morrovia_calendar_grants set expires_at=now()-interval '1 second'");
            await v.page.getByRole('button', { name: 'Add events', exact: true }).click();
            await v.page.getByRole('alert').filter({ hasText: /Reconnect Google/ }).waitFor();
            assert.equal(v.fixture.writeCount(), 0);
            assert.equal((await v.fixture.pool.query('select token_cipher from morrovia_calendar_grants')).rows[0].token_cipher, null);
            await reconnect(v.page);
            assert.equal(v.fixture.writeCount(), 0);
            await assert.rejects(() => v.fixture.api.sendCalendarExport({ ownerId: 'traveller', tripId: v.fixture.trip.id, grantId: v.fixture.grantId, bindingId: old.id, reviewId: old.document.review.id, idempotencyKey: randomUUID(), selectedOperationIds: old.document.review.operations.map((o: any) => o.id) }), /STALE_REVIEW/);
            await preview(v.page); await send(v.page);
            assert.deepEqual([...v.fixture.events.get('personal').keys()], [eventId]);
            assert.deepEqual(v.external, []); assert.deepEqual(v.errors, []);
        } finally { await v.close(); }
    });
    test(`reliability mounted revoked access requires explicit reconnect and never sends automatically (${name})`, { skip: !enabled, timeout: 30000 }, async () => {
        const v = await view(name);
        try {
            singleEvent(v.fixture); await open(v.page); await preview(v.page); await send(v.page);
            await v.page.getByRole('button', { name: 'Done', exact: true }).click();
            const writes = v.fixture.writeCount(), ids = [...v.fixture.events.get('personal').keys()];
            v.fixture.revoked = true; await open(v.page);
            await v.page.getByRole('button', { name: 'Preview events', exact: true }).click();
            await v.page.getByRole('alert').filter({ hasText: /Reconnect Google/ }).waitFor();
            assert.equal(v.fixture.writeCount(), writes);
            await reconnect(v.page);
            assert.equal(v.fixture.writeCount(), writes);
            await v.page.getByRole('button', { name: 'Preview events', exact: true }).click();
            await v.page.getByText('1 unchanged events', { exact: true }).waitFor();
            assert.deepEqual([...v.fixture.events.get('personal').keys()], ids);
            assert.equal(v.fixture.writeCount(), writes);
            assert.deepEqual(v.external, []); assert.deepEqual(v.errors, []);
        } finally { await v.close(); }
    });
    test(`reliability mounted lost response survives trip edit and destination switch (${name})`, { skip: !enabled, timeout: 30000 }, async () => {
        const v = await view(name);
        try {
            singleEvent(v.fixture); await open(v.page); await preview(v.page);
            v.fixture.uncertainNextInsert = true; await send(v.page);
            const originalId = [...v.fixture.events.get('personal').keys()][0];
            v.fixture.trip.brief.itineraryIdeas[0].title = 'New title after interrupted send';
            await changed(v.page, v.fixture);
            const writes = v.fixture.writeCount();
            await v.page.getByRole('combobox', { name: /^Calendar$/i }).selectOption('other');
            await preview(v.page); assert.equal(v.fixture.writeCount(), writes);
            await send(v.page, 'Send changes');
            const otherId = [...v.fixture.events.get('other').keys()][0];
            assert.notEqual(otherId, originalId);
            await v.page.getByRole('button', { name: 'Done', exact: true }).click(); await open(v.page);
            await v.page.getByRole('combobox', { name: /^Calendar$/i }).selectOption('personal');
            const before = v.fixture.writeCount(); await preview(v.page);
            assert.equal(v.fixture.writeCount(), before, 'returning to the old destination only reconciles reads');
            await send(v.page, 'Send changes');
            assert.equal(v.fixture.events.get('personal').size, 1); assert.equal(v.fixture.events.get('other').size, 1);
            assert.equal(v.fixture.events.get('personal').get(originalId).payload.summary.startsWith('New title after interrupted send'), true);
            assert.equal(v.fixture.providerCalls.filter((c: any) => c.action === 'insert' && c.calendarId === 'personal').length, 1);
            assert.deepEqual(v.external, []); assert.deepEqual(v.errors, []);
        } finally { await v.close(); }
    });
    test(`reliability mounted lost PATCH and DELETE survive revoked reconciliation and reconnect (${name})`, { skip: !enabled, timeout: 30000 }, async () => {
        const v = await view(name);
        try {
            singleEvent(v.fixture); await open(v.page); await preview(v.page); await send(v.page);
            const id = [...v.fixture.events.get('personal').keys()][0];
            await v.page.getByRole('button', { name: 'Done', exact: true }).click();
            v.fixture.trip.brief.itineraryIdeas[0].title = 'First changed title'; v.fixture.changeRevision();
            await v.page.evaluate((r: string) => (window as any).__calendarMount.setRevision(r), v.fixture.trip.updatedAt);
            await open(v.page); await preview(v.page); v.fixture.uncertainNextPatch = true; await send(v.page, 'Send changes');
            v.fixture.revoked = true;
            await v.page.getByRole('button', { name: 'Retry remaining', exact: true }).click();
            await v.page.getByText('Reconnect Google to continue. Your previous exports are remembered.', { exact: true }).waitFor();
            assert.equal((await v.fixture.pool.query('select document from morrovia_calendar_bindings')).rows[0].document.review.operations[0].status, 'uncertain');
            v.fixture.trip.brief.itineraryIdeas[0].title = 'Latest title after reconnect'; v.fixture.changeRevision();
            await reconnect(v.page); await preview(v.page); await send(v.page, 'Send changes');
            assert.equal(v.fixture.events.get('personal').size, 1);
            assert(v.fixture.events.get('personal').get(id).payload.summary.startsWith('Latest title after reconnect'));
            assert.equal(v.fixture.providerCalls.filter((c: any) => c.action === 'patch').length, 2);
            await v.page.getByRole('button', { name: 'Done', exact: true }).click();
            v.fixture.trip.brief.itineraryIdeas = []; v.fixture.changeRevision();
            await v.page.evaluate((r: string) => (window as any).__calendarMount.setRevision(r), v.fixture.trip.updatedAt);
            await open(v.page); await v.page.getByRole('button', { name: 'Preview events', exact: true }).click();
            await v.page.getByRole('heading', { name: 'Remove from Google', exact: true }).waitFor();
            await v.page.getByRole('checkbox').check(); v.fixture.uncertainNextRemove = true; await send(v.page, 'Send changes');
            assert.equal(v.fixture.events.get('personal').size, 0);
            v.fixture.revoked = true; await v.page.getByRole('button', { name: 'Retry remaining', exact: true }).click();
            await v.page.getByText('Reconnect Google to continue. Your previous exports are remembered.', { exact: true }).waitFor();
            assert.equal((await v.fixture.pool.query('select document from morrovia_calendar_bindings')).rows[0].document.review.operations[0].status, 'uncertain');
            await reconnect(v.page); await v.page.getByRole('button', { name: 'Preview events', exact: true }).click();
            await v.page.getByRole('button', { name: 'Review current changes again', exact: true }).waitFor();
            assert.equal(v.fixture.providerCalls.filter((c: any) => c.action === 'remove').length, 1);
            assert.equal((await v.fixture.pool.query('select document from morrovia_calendar_bindings')).rows[0].document.items['activity:market'].removed, true);
            assert.deepEqual(v.external, []); assert.deepEqual(v.errors, []);
        } finally { await v.close(); }
    });
    test(`reliability mounted Google deletion needs explicit re-add and preserves unrelated events (${name})`, { skip: !enabled, timeout: 30000 }, async () => {
        const v = await view(name);
        try {
            singleEvent(v.fixture); await open(v.page); await preview(v.page); await send(v.page);
            const events = v.fixture.events.get('personal'), original = [...events.values()][0] as any;
            const unrelated = { ...structuredClone(original), id: 'unrelated-event', marker: 'other-app', payload: { ...original.payload, summary: 'Unrelated event' } };
            events.set(unrelated.id, unrelated); events.delete(original.id);
            const writes = v.fixture.writeCount();
            await v.page.getByRole('button', { name: 'Done', exact: true }).click(); await open(v.page);
            await v.page.getByRole('button', { name: 'Preview events', exact: true }).click();
            await v.page.getByText('Removed in Google — left unchanged.', { exact: true }).waitFor();
            assert.equal(v.fixture.writeCount(), writes);
            await v.page.getByRole('button', { name: 'Review adding again', exact: true }).click();
            await v.page.getByRole('heading', { name: 'Date only — times not set' }).waitFor();
            assert.equal(v.fixture.writeCount(), writes, 're-add review itself never writes');
            await send(v.page, 'Send changes');
            assert.equal(events.size, 2); assert(!events.has(original.id)); assert.deepEqual(events.get(unrelated.id), unrelated);
            assert.equal(v.fixture.providerCalls.some((c: any) => c.id === unrelated.id), false);
            assert.deepEqual(v.external, []); assert.deepEqual(v.errors, []);
        } finally { await v.close(); }
    });

    test(`mounted connect cancellation/reconnect sends nothing (${name})`, { skip: !enabled, timeout: 30000 }, async () => { const v = await view(name, false); try {
        await v.page.getByRole('button', { name: 'Add to calendar', exact: true }).click();
        await v.page.getByRole('button', { name: 'Connect Google', exact: true }).click();
        await v.page.getByRole('heading', { name: 'Synthetic Google permission screen' }).waitFor();
        await v.page.getByRole('link', { name: 'Cancel Google' }).click();
        await v.page.getByRole('button', { name: 'Add to calendar', exact: true }).click();
        await v.page.getByRole('button', { name: 'Connect Google', exact: true }).click();
        await v.page.getByRole('link', { name: 'Continue synthetic Google' }).click();
        await v.page.getByRole('button', { name: 'Preview events', exact: true }).waitFor();
        assert.equal(v.fixture.writeCount(), 0);
        await v.page.getByRole('button', { name: 'Disconnect Google', exact: true }).click();
        await v.page.getByRole('button', { name: 'Connect Google', exact: true }).waitFor();
        await v.page.getByRole('button', { name: 'Connect Google', exact: true }).click();
        await v.page.getByRole('link', { name: 'Continue synthetic Google' }).click();
        await v.page.getByRole('button', { name: 'Preview events', exact: true }).waitFor();
        assert.equal(v.fixture.writeCount(), 0);
        assert.deepEqual(v.external, []);
        assert.deepEqual(v.errors, []);
    }
    finally {
        await v.close();
    } });
    test(`mounted explicit send/update and destination choice (${name})`, { skip: !enabled, timeout: 30000 }, async () => { const v = await view(name); try {
        await open(v.page);
        await v.page.getByRole('combobox', { name: /^Calendar$/i }).selectOption('other');
        await preview(v.page);
        assert.equal(v.fixture.writeCount(), 0);
        await send(v.page);
        const size = v.fixture.events.get('other').size;
        assert(size > 0);
        assert.equal(v.fixture.events.get('personal')?.size ?? 0, 0);
        await v.page.getByRole('button', { name: 'Done', exact: true }).click();
        v.fixture.trip.brief.itineraryIdeas[0].title = 'Changed visit';
        await v.page.getByRole('button', { name: 'Send changes', exact: true }).click();
        await changed(v.page, v.fixture);
        await preview(v.page);
        await send(v.page, 'Send changes');
        assert.equal(v.fixture.events.get('other').size, size);
        assert([...v.fixture.events.get('other').values()].some((e: any) => e.payload.summary.startsWith('Changed visit')));
        assert.deepEqual(v.external, []);
        assert.deepEqual(v.errors, []);
    }
    finally {
        await v.close();
    } });
    test(`mounted partial and uncertain retry preserves event identity (${name})`, { skip: !enabled, timeout: 30000 }, async () => { const v = await view(name); try {
        await open(v.page);
        await preview(v.page);
        v.fixture.failNextInsert = true;
        await send(v.page);
        await v.page.getByRole('button', { name: 'Retry remaining', exact: true }).click();
        await v.page.getByRole('button', { name: 'Done', exact: true }).waitFor();
        const size = v.fixture.events.get('personal').size;
        assert(size > 0);
        await v.page.getByRole('button', { name: 'Done', exact: true }).click();
        v.fixture.trip.brief.itineraryIdeas.push({ ...v.fixture.trip.brief.itineraryIdeas[0], id: 'new-visit', title: 'New visit' });
        v.fixture.changeRevision();
        await v.page.evaluate((r: string) => (window as any).__calendarMount.setRevision(r), v.fixture.trip.updatedAt);
        await open(v.page);
        await preview(v.page);
        v.fixture.uncertainNextInsert = true;
        await send(v.page, 'Send changes');
        const attempts = v.fixture.providerCalls.filter((c: any) => c.action === 'insert').length;
        await v.page.getByRole('button', { name: 'Retry remaining', exact: true }).click();
        await v.page.getByRole('button', { name: 'Done', exact: true }).waitFor();
        assert.equal(v.fixture.providerCalls.filter((c: any) => c.action === 'insert').length, attempts);
        assert.equal(v.fixture.events.get('personal').size, size + 1);
        assert.deepEqual(v.errors, []);
    }
    finally {
        await v.close();
    } });
    test(`mounted stale edit, last-event removal and Google conflict (${name})`, { skip: !enabled, timeout: 30000 }, async () => { const v = await view(name); try {
        v.fixture.trip.legs = [];
        v.fixture.trip.brief.bookings = [];
        v.fixture.trip.brief.itineraryIdeas = [v.fixture.trip.brief.itineraryIdeas[0]];
        await open(v.page);
        await preview(v.page);
        const before = v.fixture.writeCount();
        v.fixture.trip.brief.itineraryIdeas[0].title = 'New saved name';
        await changed(v.page, v.fixture);
        assert.equal(v.fixture.writeCount(), before);
        await preview(v.page);
        await send(v.page);
        await v.page.getByRole('button', { name: 'Done', exact: true }).click();
        const event = [...v.fixture.events.get('personal').values()][0] as any;
        event.etag = 'google-edited';
        v.fixture.trip.brief.itineraryIdeas[0].title = 'Morro edit';
        v.fixture.changeRevision();
        await v.page.evaluate((r: string) => (window as any).__calendarMount.setRevision(r), v.fixture.trip.updatedAt);
        await open(v.page);
        await v.page.getByRole('button', { name: 'Preview events', exact: true }).click();
        await v.page.getByText('Changed in Google — left unchanged.', { exact: true }).waitFor();
        assert.equal(v.fixture.events.get('personal').size, 1);
        await v.page.getByRole('button', { name: 'Close', exact: true }).click();
        event.etag = (await v.fixture.pool.query("select document from morrovia_calendar_bindings")).rows[0].document.items['activity:market'].etag;
        v.fixture.trip.brief.itineraryIdeas = [];
        v.fixture.changeRevision();
        await v.page.evaluate((r: string) => (window as any).__calendarMount.setRevision(r), v.fixture.trip.updatedAt);
        await open(v.page);
        await v.page.getByRole('button', { name: 'Preview events', exact: true }).click();
        await v.page.getByRole('heading', { name: 'Remove from Google', exact: true }).waitFor();
        assert.equal(await v.page.getByRole('checkbox').isChecked(), false);
        await v.page.getByRole('checkbox').check();
        await send(v.page, 'Send changes');
        assert.equal(v.fixture.events.get('personal').size, 0);
        assert.deepEqual(v.errors, []);
    }
    finally {
        await v.close();
    } });
    test(`mounted new trip calendar and later app-created-only update (${name})`, { skip: !enabled, timeout: 30000 }, async () => { const v = await view(name, false); try {
        await v.page.getByRole('button', { name: 'Add to calendar', exact: true }).click();
        await v.page.getByRole('button', { name: 'Connect for a new trip calendar', exact: true }).click();
        await v.page.getByRole('link', { name: 'Continue synthetic Google' }).click();
        await v.page.getByRole('combobox', { name: /^Calendar$/i }).selectOption('__new__');
        await preview(v.page);
        assert.equal(v.fixture.writeCount(), 0);
        await send(v.page, 'Create calendar and add events');
        const calendar = v.fixture.calendars.find((c: any) => c.id.startsWith('trip-'));
        assert(calendar);
        const count = v.fixture.events.get(calendar.id).size;
        await v.page.getByRole('button', { name: 'Done', exact: true }).click();
        v.fixture.trip.brief.itineraryIdeas[0].title = 'Updated new-calendar visit';
        v.fixture.changeRevision();
        await v.page.evaluate((r: string) => (window as any).__calendarMount.setRevision(r), v.fixture.trip.updatedAt);
        await open(v.page);
        await v.page.getByRole('combobox', { name: /^Calendar$/i }).selectOption(calendar.id);
        await preview(v.page);
        await send(v.page, 'Send changes');
        assert.equal(v.fixture.events.get(calendar.id).size, count);
        assert.equal(v.fixture.providerCalls.filter((c: any) => c.action === 'create-calendar').length, 1);
        assert.deepEqual(v.errors, []);
    }
    finally {
        await v.close();
    } });
    test(`mounted delayed stale preview and uncertain new-calendar recovery (${name})`, { skip: !enabled, timeout: 30000 }, async () => {
        const v = await view(name);
        try {
            await open(v.page);
            let enter!: () => void, release!: () => void;
            const entered = new Promise<void>(r => enter = r);
            v.fixture.onHeldPreview = enter;
            v.fixture.heldPreview = new Promise<void>(r => release = r);
            await v.page.getByRole('button', { name: 'Preview events', exact: true }).click();
            await entered;
            v.fixture.trip.brief.itineraryIdeas[0].title = 'New current title';
            await changed(v.page, v.fixture);
            const oldResponse = v.page.waitForResponse(r => r.request().method() === 'POST' && r.request().postDataJSON()?.action === 'preview');
            v.fixture.heldPreview = null;
            release();
            await oldResponse;
            assert.equal(await v.page.getByRole('heading', { name: 'Date only — times not set' }).count(), 0);
            assert.equal(v.fixture.writeCount(), 0);
            await preview(v.page);
            assert(await v.page.getByText(/New current title/).isVisible());
            await v.page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click();
            await v.fixture.connect('new-trip');
            await v.page.reload();
            await open(v.page);
            await v.page.getByRole('combobox', { name: /^Calendar$/i }).selectOption('__new__');
            await preview(v.page);
            v.fixture.uncertainNextCreate = true;
            await v.page.getByRole('button', { name: 'Create calendar and add events', exact: true }).click();
            await v.page.getByRole('alert').filter({ hasText: /Check Google/ }).waitFor();
            assert.equal(v.fixture.calendars.filter((c: any) => c.id.startsWith('trip-')).length, 1);
            await send(v.page, 'Create calendar and add events');
            assert.equal(v.fixture.providerCalls.filter((c: any) => c.action === 'create-calendar').length, 1);
            assert.equal(v.fixture.calendars.filter((c: any) => c.id.startsWith('trip-')).length, 1);
            assert.deepEqual(v.external, []);
            assert.deepEqual(v.errors, []);
        }
        finally {
            await v.close();
        }
    });
    test(`mounted mobile keyboard focus and layout (${name})`, { skip: !enabled, timeout: 30000 }, async () => { const v = await view(name, true, true); try {
        await open(v.page);
        await preview(v.page);
        const dialog = v.page.getByRole('dialog');
        await v.page.waitForFunction(() => document.activeElement?.tagName === 'H3');
        await v.page.keyboard.press('Tab');
        assert(await dialog.getByRole('checkbox').first().evaluate(e => e === document.activeElement), 'first Tab follows the review heading to its first event');
        await dialog.getByRole('heading', { name: /synthetic@example.invalid/ }).focus();
        await v.page.keyboard.press('Shift+Tab');
        assert(await dialog.getByRole('button', { name: 'Review current changes again', exact: true }).evaluate(e => e === document.activeElement), 'Shift+Tab follows DOM order before heading');
        for (let i = 0; i < 20; i++) {
            await v.page.keyboard.press('Tab');
            const focus = await dialog.evaluate(e => ({ inside: e.contains(document.activeElement), tag: document.activeElement?.tagName, text: document.activeElement?.textContent, html: document.activeElement?.outerHTML?.slice(0, 1000) }));
            if (!focus.inside) {
                await v.page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
                const later = await dialog.evaluate(e => ({ inside: e.contains(document.activeElement), tag: document.activeElement?.tagName, text: document.activeElement?.textContent, open: (e as HTMLDialogElement).open }));
                writeFileSync(`output/playwright/focus-${name}.json`, JSON.stringify({ tab: i, focus, later }, null, 2));
            }
            assert(focus.inside, 'keyboard focus stays within dialog');
        }
        await v.page.keyboard.press('Shift+Tab');
        assert(await dialog.evaluate(e => e.contains(document.activeElement)));
        const geometry = await dialog.evaluate(e => ({ left: e.getBoundingClientRect().left, right: e.getBoundingClientRect().right, viewport: window.innerWidth, scroll: e.scrollWidth, width: e.clientWidth }));
        assert(geometry.left >= 0 && geometry.right <= geometry.viewport, JSON.stringify(geometry));
        assert(geometry.scroll <= geometry.width + 1, JSON.stringify(geometry));
        await v.page.screenshot({ path: `output/playwright/calendar-${name}-390.png`, fullPage: true });
        await dialog.getByRole('button', { name: 'Add events', exact: true }).focus();
        await v.page.keyboard.press('Enter');
        await v.page.getByRole('status').filter({ hasText: /changes confirmed/ }).waitFor();
        await v.page.waitForFunction(() => document.querySelector('dialog')?.contains(document.activeElement));
        await v.page.keyboard.press('Tab');
        assert(await dialog.evaluate(e => e.contains(document.activeElement)));
        await v.page.keyboard.press('Shift+Tab');
        assert(await dialog.evaluate(e => e.contains(document.activeElement)));
        await v.page.keyboard.press('Escape');
        await dialog.waitFor({ state: 'hidden' });
        await v.page.waitForFunction(() => document.activeElement?.textContent === 'Send changes');
        assert.deepEqual(v.external, []);
        assert.deepEqual(v.errors, []);
    }
    finally {
        await v.close();
    } });
}
test('PostgreSQL executes migration and owner-scoped lease, CAS, disconnect and cascade constraints', { skip: !enabled, timeout: 30000 }, async () => { const f = await localCalendarHarness(); try {
    const server = (await f.pool.query("select version() as version,current_setting('listen_addresses') as listen_addresses,inet_server_addr() as network_address")).rows[0];
    assert.equal(server.listen_addresses, '');
    assert.equal(server.network_address, null);
    writeFileSync('output/calendar-pg/verification.json', JSON.stringify(server, null, 2));
    await f.connect('existing-owned');
    const b = await f.api.calendarBinding('traveller', f.trip.id, 'synthetic-subject', 'personal', 'Personal');
    const again = await f.api.calendarBinding('traveller', f.trip.id, 'synthetic-subject', 'personal', 'Personal');
    assert.equal(b.id, again.id);
    assert.equal(b.namespace, again.namespace);
    await assert.rejects(() => f.api.getCalendarBinding('other-owner', b.id, f.trip.id), /NOT_FOUND/);
    const locks = await Promise.allSettled([f.api.calendarExportStore.lock('traveller', b.id), f.api.calendarExportStore.lock('traveller', b.id)]);
    assert.equal(locks.filter(r => r.status === 'fulfilled').length, 1);
    const held = (locks.find(r => r.status === 'fulfilled') as PromiseFulfilledResult<any>).value;
    held.document.review = { id: randomUUID(), revision: f.trip.updatedAt, expiresAt: Date.now() + 60000, destination: 'Personal', operations: [{ id: 'pending', status: 'uncertain' }], issues: [], excluded: [], blocked: [], unchanged: 0 };
    await f.api.calendarExportStore.save(held.document, held.fence);
    await assert.rejects(() => f.api.calendarExportStore.save(held.document, randomUUID()), /LEASE_LOST/);
    await f.api.disconnectCalendarGrant('traveller', f.grantId);
    await assert.rejects(() => f.api.calendarExportStore.save(held.document, held.fence), /LEASE_LOST/);
    const row = (await f.pool.query('select document,lease_token from morrovia_calendar_bindings')).rows[0];
    assert.equal(row.document.review.cancelled, true);
    assert.equal(row.document.review.operations[0].status, 'uncertain');
    assert.equal(row.lease_token, null);
    const grant = (await f.pool.query('select token_cipher,generation from morrovia_calendar_grants')).rows[0];
    assert.equal(grant.token_cipher, null);
    assert.equal(grant.generation, 2);
    await f.pool.query("delete from easyt_users where id='traveller'");
    for (const table of ['morrovia_calendar_grants', 'morrovia_calendar_bindings', 'morrovia_calendar_oauth_states', 'morrovia_calendar_creation_intents'])
        assert.equal((await f.pool.query(`select count(*)::int as n from ${table}`)).rows[0].n, 0);
}
finally {
    await f.close();
} });
test('PostgreSQL creation reservation rechecks disconnect and definite rejected creation can retry', { skip: !enabled, timeout: 30000 }, async () => { const f = await localCalendarHarness(); try {
    await f.connect('new-trip');
    const status = await f.api.calendarExportStatus('traveller', f.trip.id);
    const input = { ownerId: 'traveller', tripId: f.trip.id, expectedRevision: f.trip.updatedAt, grantId: f.grantId, selectedSourceKeys: status.events.map((x: any) => x.sourceKey), idempotencyKey: randomUUID() };
    f.afterIntentReservation = async () => f.api.disconnectCalendarGrant('traveller', f.grantId);
    await assert.rejects(() => f.api.createAndSendTripCalendar(input));
    assert.equal(f.providerCalls.filter((c: any) => c.action === 'create-calendar').length, 0);
    await f.connect('new-trip');
    f.failNextCreate = true;
    await assert.rejects(() => f.api.createAndSendTripCalendar({ ...input, idempotencyKey: randomUUID() }));
    const count = f.providerCalls.filter((c: any) => c.action === 'create-calendar').length;
    await f.connect('new-trip');
    await f.api.createAndSendTripCalendar({ ...input, idempotencyKey: randomUUID() });
    assert.equal(f.providerCalls.filter((c: any) => c.action === 'create-calendar').length, count + 1);
    assert.equal(f.calendars.filter((c: any) => c.id.startsWith('trip-')).length, 1);
}
finally {
    await f.close();
} });
test('PostgreSQL definite calendar creation rejection permits a later explicit retry', { skip: !enabled, timeout: 30000 }, async () => { const f = await localCalendarHarness(); try {
    await f.connect('new-trip');
    const s = await f.api.calendarExportStatus('traveller', f.trip.id), input = { ownerId: 'traveller', tripId: f.trip.id, expectedRevision: f.trip.updatedAt, grantId: f.grantId, selectedSourceKeys: s.events.map((x: any) => x.sourceKey), idempotencyKey: randomUUID() };
    f.failNextCreate = true;
    await assert.rejects(() => f.api.createAndSendTripCalendar(input));
    await f.connect('new-trip');
    await f.api.createAndSendTripCalendar({ ...input, idempotencyKey: randomUUID() });
    assert.equal(f.calendars.filter((c: any) => c.id.startsWith('trip-')).length, 1);
    assert.equal(f.providerCalls.filter((c: any) => c.action === 'create-calendar').length, 2);
}
finally {
    await f.close();
} });

test('reliability PostgreSQL wrong Google subject cannot send another account binding', { skip: !enabled, timeout: 30000 }, async () => {
    const f = await localCalendarHarness();
    try {
        singleEvent(f); const original = await f.connect('existing-owned');
        const review = await f.api.reviewCalendarExport({ ownerId: 'traveller', tripId: f.trip.id, expectedRevision: f.trip.updatedAt, grantId: original, calendarId: 'personal' });
        const other = await f.connect('existing-owned', 'another-google-subject', 'another@example.invalid');
        await assert.rejects(() => f.api.sendCalendarExport({ ownerId: 'traveller', tripId: f.trip.id, grantId: other, bindingId: review.bindingId, reviewId: review.review.id, selectedOperationIds: review.review.operations.map((o: any) => o.id), idempotencyKey: randomUUID() }), /ACCOUNT_CHANGED/);
        assert.equal(f.writeCount(), 0);
        await f.connect('existing-owned');
        await assert.rejects(() => f.api.sendCalendarExport({ ownerId: 'traveller', tripId: f.trip.id, grantId: original, bindingId: review.bindingId, reviewId: review.review.id, selectedOperationIds: review.review.operations.map((o: any) => o.id), idempotencyKey: randomUUID() }), /STALE_REVIEW/);
        const fresh = await f.api.reviewCalendarExport({ ownerId: 'traveller', tripId: f.trip.id, expectedRevision: f.trip.updatedAt, grantId: original, calendarId: 'personal' });
        await f.api.sendCalendarExport({ ownerId: 'traveller', tripId: f.trip.id, grantId: original, bindingId: fresh.bindingId, reviewId: fresh.review.id, selectedOperationIds: fresh.review.operations.map((o: any) => o.id), idempotencyKey: randomUUID() });
        assert.equal(f.events.get('personal').size, 1);
        assert.equal(fresh.review.operations[0].eventId, review.review.operations[0].eventId);
    } finally { await f.close(); }
});
test('reliability PostgreSQL expiry after a partial send reconnects with original event identities', { skip: !enabled, timeout: 30000 }, async () => {
    const f = await localCalendarHarness();
    try {
        await f.connect('existing-owned');
        const input = { ownerId: 'traveller', tripId: f.trip.id, expectedRevision: f.trip.updatedAt, grantId: f.grantId, calendarId: 'personal' };
        const first = await f.api.reviewCalendarExport(input);
        f.afterProviderWrite = async () => { f.afterProviderWrite = null; await f.pool.query("update morrovia_calendar_grants set expires_at=now()-interval '1 second'"); };
        await assert.rejects(() => f.api.sendCalendarExport({ ...input, bindingId: first.bindingId, reviewId: first.review.id, selectedOperationIds: first.review.operations.map((o: any) => o.id), idempotencyKey: randomUUID() }), /AUTH_REQUIRED/);
        assert.equal(f.providerCalls.filter((c: any) => c.action === 'insert').length, 1);
        const originalId = [...f.events.get('personal').keys()][0];
        await f.connect('existing-owned');
        const next = await f.api.reviewCalendarExport(input), writes = f.writeCount();
        assert.equal(writes, 1);
        await f.api.sendCalendarExport({ ...input, bindingId: next.bindingId, reviewId: next.review.id, selectedOperationIds: next.review.operations.map((o: any) => o.id), idempotencyKey: randomUUID() });
        assert(f.events.get('personal').has(originalId));
        assert.equal(f.events.get('personal').size, first.review.operations.length);
        assert.equal(f.providerCalls.filter((c: any) => c.action === 'insert' && c.id === originalId).length, 1);
    } finally { await f.close(); }
});

test('reliability PostgreSQL keeping the last event survives reconnect and source return', { skip: !enabled, timeout: 30000 }, async () => {
    const f = await localCalendarHarness();
    try {
        singleEvent(f); await f.connect('existing-owned');
        const review = () => f.api.reviewCalendarExport({ ownerId: 'traveller', tripId: f.trip.id, expectedRevision: f.trip.updatedAt, grantId: f.grantId, calendarId: 'personal' });
        const sendReview = (r: any, ids = r.review.operations.map((o: any) => o.id)) => f.api.sendCalendarExport({ ownerId: 'traveller', tripId: f.trip.id, grantId: f.grantId, bindingId: r.bindingId, reviewId: r.review.id, selectedOperationIds: ids, idempotencyKey: randomUUID() });
        await sendReview(await review());
        const eventId = [...f.events.get('personal').keys()][0], saved = structuredClone(f.trip.brief.itineraryIdeas);
        f.trip.brief.itineraryIdeas = []; f.changeRevision();
        const removal = await review(); assert.equal(removal.review.operations[0].action, 'remove');
        const writes = f.writeCount(); await sendReview(removal, []);
        await f.api.disconnectCalendarGrant('traveller', f.grantId); await f.connect('existing-owned');
        assert.equal((await review()).review.operations.length, 0, 'Keep suppresses repeated removal after reconnect');
        f.trip.brief.itineraryIdeas = saved; f.changeRevision();
        const returned = await review(); assert.equal(returned.review.operations.length, 0);
        assert.equal(returned.review.unchanged, 1); await sendReview(returned);
        assert.equal(f.writeCount(), writes); assert.deepEqual([...f.events.get('personal').keys()], [eventId]);
    } finally { await f.close(); }
});
