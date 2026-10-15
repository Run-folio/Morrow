import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { renderBuilder } from './helpers/builder-render.ts';
import { jsonbObjectOrder, saveReopenTripFixture } from './fixtures/save-reopen-trip.ts';
import { resolveTripTransferJourneys } from '../lib/easyt/multimodal-transfer-resolution.ts';
import { canonicalTripForOwner } from '../lib/easyt/trip-promotion.ts';
import { requireReadableTripDocument } from '../lib/easyt/trip-document.ts';
import { nextTripUpdatedAt } from '../lib/easyt/trip-continuity.ts';
import { RoadRoutingError } from '../lib/easyt/road-routing.ts';
import type { EasyTTrip } from '../lib/easyt/trip.ts';

const enabled = process.env.MORROVIA_BUILDER_APP_BROWSER_TESTS === '1';
const provider = { provider: 'openrouteservice' as const, async route(): Promise<never> { throw new RoadRoutingError('configuration'); } };

test('mounted acknowledged IndexedDB trip survives GET object order, one Flores removal and cold reopen',
  { skip: !enabled, timeout: 45000 }, async () => {
  const submitted = await resolveTripTransferJourneys(saveReopenTripFixture(), { provider });
  let cloud = requireReadableTripDocument(jsonbObjectOrder({ ...submitted, updatedAt: nextTripUpdatedAt(submitted.updatedAt) }));
  const opened = await resolveTripTransferJourneys(structuredClone(cloud), { provider });
  assert.deepEqual(opened, cloud); assert.notEqual(JSON.stringify(opened), JSON.stringify(cloud));
  const writes: string[][] = [];
  const view = await renderBuilder({ ownerId: 'owner-a', seedRecovery: false, accountRequest: async ({ method, trip }) => {
    if (method === 'GET') return { status: 200, body: { trip: await resolveTripTransferJourneys(structuredClone(cloud), { provider }) } };
    assert.equal(method, 'PUT'); const candidate = requireReadableTripDocument(trip);
    assert.equal(candidate.updatedAt, cloud.updatedAt, 'the prior exact cloud revision remains the CAS token');
    writes.push(candidate.stops.map(stop => stop.name));
    cloud = requireReadableTripDocument(jsonbObjectOrder(canonicalTripForOwner('owner-a',
      await resolveTripTransferJourneys(candidate, { provider }), nextTripUpdatedAt(cloud.updatedAt))));
    return { status: 200, body: { trip: cloud } };
  } });
  try {
    // Only this disposable browser context is fault-injected. The real native
    // IndexedDB adapter and production broker perform save, ACK and readback.
    const fixture = (await build({ stdin: { resolveDir: fileURLToPath(new URL('../', import.meta.url)), loader: 'ts', contents: `
      import {createTwoStoreTripPersistence} from './lib/easyt/two-store-trip-persistence.ts';
      import {openIndexedDbRecoveryDriver} from './lib/easyt/durable-recovery-indexeddb.ts';
      import {rememberLastOwner} from './lib/easyt/storage.ts';
      export async function seed(submitted,canonical){
        rememberLastOwner('owner-a');
        const storage=localStorage, original=Storage.prototype.setItem;
        storage.setItem('save-reopen-preserved','exact sentinel');
        Storage.prototype.setItem=function(key,value){if(this===storage&&key!=='easyt:last-owner:v1')throw new DOMException('Synthetic quota only','QuotaExceededError');return original.call(this,key,value);};
        const driver=await openIndexedDbRecoveryDriver(indexedDB);
        const broker=createTwoStoreTripPersistence(storage,driver,{ownerId:'owner-a',isCurrent:()=>true,overflowEnabled:true,accountOverflowQualified:true});
        const first=await broker.save(submitted,{newTripOrClone:true,writeId:'browser-initial'});
        const ack=await broker.acknowledge(submitted,canonical,first.handle);
        return {stored:first.stored,backend:first.handle.backend,ack:ack.outcome};
      }
      export async function read(tripId){
        const driver=await openIndexedDbRecoveryDriver(indexedDB);
        const result=await createTwoStoreTripPersistence(localStorage,driver,{ownerId:'owner-a',isCurrent:()=>true,overflowEnabled:true,accountOverflowQualified:true}).read(tripId);
        return result.kind==='found'?{kind:result.kind,names:result.trip.stops.map(s=>s.name),recovery:result.recovery!==null,sentinel:localStorage.getItem('save-reopen-preserved')}:{kind:result.kind};
      }`, }, bundle: true, write: false, platform: 'browser', format: 'iife', globalName: 'SaveReopenFixture',
      define: { 'process.env.NODE_ENV': '"test"', 'process.env': '{}' } })).outputFiles[0]!.text;
    await view.page.addScriptTag({ content: fixture });
    const initial = await view.page.evaluate(async ({ submitted, cloud }: { submitted: EasyTTrip; cloud: EasyTTrip }) =>
      (window as any).SaveReopenFixture.seed(submitted, cloud), { submitted, cloud });
    assert.deepEqual(initial, { stored: true, backend: 'indexeddb', ack: 'acknowledged' });
    await view.page.addInitScript(() => {
      const storage = localStorage, original = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key, value) {
        if (this === storage && key !== 'easyt:last-owner:v1') throw new DOMException('Synthetic quota only', 'QuotaExceededError');
        return original.call(this, key, value);
      };
    });
    const url = new URL(`/journey/new?trip=${cloud.id}`, view.page.url()).href;
    await view.page.goto(url);
    await view.page.locator('[data-builder-edit-session="active"]').waitFor();
    await view.page.getByRole('button', { name: 'Remove Flores', exact: true }).click();
    const removal = view.page.getByRole('dialog', { name: 'Remove Flores and its plan?', exact: true });
    await removal.getByRole('button', { name: 'Remove Flores', exact: true }).click();
    await removal.waitFor({ state: 'hidden', timeout: 7000 });
    await view.page.getByRole('region', { name: 'Places you want to visit', exact: true })
      .getByRole('button', { name: 'Remove Flores', exact: true }).waitFor({ state: 'hidden', timeout: 7000 });
    await view.page.getByText('Saved to your account', { exact: true }).first().waitFor({ timeout: 7000 });
    await view.page.addScriptTag({ content: fixture });
    await view.page.waitForFunction(async (id: string) => !(await (window as any).SaveReopenFixture.read(id)).recovery, cloud.id);
    assert.ok(writes.length > 0); assert.ok(writes.every(names => names.length === 5 && !names.includes('Flores')));
    const expected = ['Antigua Guatemala', 'Panajachel', 'Colón', 'Panama City', 'David'];
    const saved = await view.page.evaluate(async (id: string) => (window as any).SaveReopenFixture.read(id), cloud.id);
    assert.deepEqual(saved, { kind: 'found', names: expected, recovery: false, sentinel: 'exact sentinel' });
    await view.page.reload();
    await view.page.locator('[data-builder-edit-session="active"]').waitFor();
    assert.equal(await view.page.getByRole('button', { name: 'Remove Flores', exact: true }).count(), 0);
    for (const name of expected) assert.equal(await view.page.getByRole('button', { name: 'Remove ' + name, exact: true }).count(), 1);
    assert.deepEqual(view.errors, []);
  } finally { await view.close(); }
});
