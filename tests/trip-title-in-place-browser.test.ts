import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdirSync } from 'node:fs';
import { builderBrowserTestsEnabled, renderBuilder } from './helpers/builder-render.ts';
import { japanTrip } from './fixtures/transport-choice.ts';

test('rename replaces the title line, supports keyboard cancellation and persists a saved name', {skip: !builderBrowserTestsEnabled, timeout: 60_000}, async () => {
  const trip = japanTrip();
  const view = await renderBuilder({path: `/journey/${trip.id}/itinerary`, initialTrip: trip, styled: true});
  try {
    for (const width of [1440, 390, 320]) {
      await view.page.setViewportSize({width, height: 1000});
      const title = view.page.locator('#trip-shell-title');
      const before = await title.boundingBox();
      const oldName = await title.getByRole('button').innerText();
      await view.page.locator('button[aria-haspopup="menu"]').filter({hasText: 'More'}).click();
      await view.page.getByRole('menuitem', {name: 'Rename trip', exact: true}).click();
      const input = title.getByRole('textbox', {name: 'Trip name', exact: true});
      await input.waitFor({timeout: 3000});
      assert.equal(await input.evaluate((el: Element) => el === document.activeElement), true);
      assert.equal(await view.page.getByRole('textbox', {name: 'Trip name', exact: true}).count(), 1);
      assert.ok(Math.abs((await input.boundingBox())!.y - before!.y) < 4);
      mkdirSync('output/playwright', {recursive: true});
      if (width !== 320) await view.page.screenshot({path: `output/playwright/trip-title-edit-${width}.png`});
      await input.fill('Cancelled title');
      await input.press('Escape');
      assert.equal(await title.getByRole('button').innerText(), oldName);
      assert.equal(await title.getByRole('button').evaluate((el: Element) => el === document.activeElement), true);
    }
    await view.page.locator('button[aria-haspopup="menu"]').filter({hasText: 'More'}).click();
    await view.page.getByRole('menuitem', {name: 'Rename trip', exact: true}).click();
    const input = view.page.getByRole('textbox', {name: 'Trip name', exact: true});
    await input.fill('日'.repeat(81)); await input.press('Enter');
    await view.page.getByRole('alert').getByText('Use 80 characters or fewer.').waitFor();
    assert.equal(await input.inputValue(), '日'.repeat(81));
    await input.fill('Japan & Korea — our adventure');
    mkdirSync('output/playwright', {recursive: true});
    await view.page.screenshot({path: 'output/playwright/trip-title-edit-mobile.png'});
    await input.press('Enter');
    await view.page.waitForFunction(() => document.querySelector('#trip-shell-title')?.textContent?.includes('Japan & Korea — our adventure') && !document.querySelector('#trip-shell-title input'));
    await view.page.reload();
    await view.page.getByRole('heading', {level: 1, name: 'Japan & Korea — our adventure', exact: true}).waitFor();
    assert.equal(await view.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.deepEqual(view.errors, []);
  } finally {await view.close();}
});
