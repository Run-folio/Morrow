import assert from 'node:assert/strict';
import test from 'node:test';
import { generatedPinFixture } from './fixtures/batch14-generated-pin.ts';
import { renderBuilder } from './helpers/builder-render.ts';
import { requireReadableTripDocument } from '../lib/easyt/trip-document.ts';
import { nextTripUpdatedAt } from '../lib/easyt/trip-continuity.ts';
import { canonicalTripForOwner } from '../lib/easyt/trip-promotion.ts';

const enabled = process.env.MORROVIA_BUILDER_APP_BROWSER_TESTS === '1';
for (const allPinned of [false, true]) test(`mounted Add preserves ${allPinned ? 'both pinned stays and shows Needs nights' : 'Tokyo pinned day while Kyoto rebalances'}`, { skip: !enabled, timeout: 30000 }, async () => {
  let cloud = requireReadableTripDocument(canonicalTripForOwner('owner-a', generatedPinFixture(allPinned ? [7, 14] : [7])));
  const before = structuredClone(cloud);
  const view = await renderBuilder({ initialTrip: cloud, ownerId: 'owner-a', seedRecovery: false, query: `?trip=${cloud.id}`,
    geocodeCandidates: { Hiroshima: [{ name: 'Hiroshima', country: 'Japan', canonicalPlaceId: 'hiroshima', coordinates: [132.4553, 34.3853], kind: 'city' }] },
    accountRequest: ({ method, trip }) => {
      if (method === 'GET') return { status: 200, body: { trip: cloud } };
      const next = requireReadableTripDocument(trip);
      if (next.updatedAt !== cloud.updatedAt) return { status: 409, body: { trip: cloud, conflictReason: 'cloud-changed' } };
      cloud = { ...next, updatedAt: nextTripUpdatedAt(cloud.updatedAt) };
      return { status: 200, body: { trip: cloud } };
    } });
  try {
    await view.page.locator('[data-builder-top-controls]').waitFor();
    await view.page.getByRole('button', { name: 'Add destination', exact: true }).click();
    await view.page.getByRole('combobox', { name: 'Add a stop', exact: true }).fill('Hiroshima');
    await view.page.getByRole('option', { name: /^Hiroshima/ }).first().click();
    for (let index = 0; index < 50 && cloud.stops.length !== 3; index++) await view.page.waitForTimeout(100);
    assert.equal(cloud.stops.length, 3, (await view.page.locator('body').innerText()).slice(0, 5000));
    assert.equal(cloud.stops[0]!.nights, 7);
    assert.deepEqual(cloud.brief.mapPins, before.brief.mapPins);
    for (const pin of before.brief.mapPins!) {
      const day = before.planItems.find(day => day.dayNumber === pin.dayNumber)!;
      assert.deepEqual(cloud.planItems.find(item => item.id === day.id), day);
    }
    if (allPinned) {
      assert.deepEqual(cloud.stops.map(stop => stop.nights), [7, 7, 0]);
      await view.page.getByText('Stays need nights', { exact: false }).waitFor();
    } else {
      assert.equal(cloud.stops.reduce((sum, stop) => sum + (stop.nights ?? 0), 0), 14);
      assert.ok(cloud.stops.slice(1).every(stop => (stop.nights ?? 0) > 0));
    }
    await view.page.waitForFunction(() => !Object.keys(localStorage).some(key => key.startsWith('easyt:trip-recovery:v2:')));
    await view.page.reload(); await view.page.locator('[data-builder-top-controls]').waitFor();
    assert.equal(cloud.stops[0]!.nights, 7);
    assert.deepEqual(cloud.brief.mapPins, before.brief.mapPins);
    assert.equal(cloud.endDate, before.endDate);
    assert.deepEqual(view.errors, []);
  } finally { await view.close(); }
});
