import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { renderBuilder, builderBrowserTestsEnabled } from './helpers/builder-render.ts';
import { affiliateEndpointTrip } from './fixtures/transport-affiliate-endpoints.ts';

const now = new Date('2026-10-19T12:00:00.000Z');
const evidence = process.env.MORROVIA_AFFILIATE_ARTIFACT_DIR;

for (const width of [1440, 390]) test(`future return flight in an in-progress trip retains a guarded Omio CTA at ${width}px`, { skip: !builderBrowserTestsEnabled, timeout: 30000 }, async () => {
  const trip = affiliateEndpointTrip();
  const fixture = await renderBuilder({ path: `/journey/${trip.id}/transport`, initialTrip: trip, styled: true });
  const { page } = fixture;
  try {
    await page.clock.install({ time: now });
    await page.setViewportSize({ width, height: 900 });
    await page.reload();
    const card = page.locator('[data-transport-leg-id]').filter({ has: page.getByRole('heading', { name: 'Madrid to London', exact: true }) });
    const snapshot = () => page.evaluate(() => Object.fromEntries(Object.entries(localStorage).filter(([key]) => key.startsWith('easyt:trip-recovery:'))));
    const before = await snapshot();
    await card.getByRole('button', { name: 'View details: Madrid to London', exact: true }).click();
    const link = card.getByRole('link', { name: /Find flights, opens Omio in a new tab/i });
    await link.waitFor();
    const href = await link.getAttribute('href');
    const search = new URL(new URL(href!).searchParams.get('u')!);
    assert.equal(search.searchParams.get('departurePosTerm'), 'Madrid, Spain');
    assert.equal(search.searchParams.get('arrivalPosTerm'), 'London, United Kingdom');
    assert.equal(search.searchParams.get('departureDate'), '2026-10-21');
    assert.equal(search.searchParams.get('travelMode'), 'FLIGHT');
    assert.equal(await link.getAttribute('target'), '_blank');
    assert.match((await link.getAttribute('rel'))!, /sponsored.*noopener.*noreferrer/);
    assert.equal(await card.getByRole('button', { name: 'Mark as booked', exact: true }).count(), 1);
    assert.deepEqual(await snapshot(), before, 'expansion and link availability cannot change the saved fixture');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
    if (evidence) { mkdirSync(evidence, { recursive: true }); await page.screenshot({ path: join(evidence, `affiliate-return-${width}.png`), fullPage: true }); }
    assert.deepEqual(fixture.errors, []);
  } finally { await fixture.close(); }
});

test('a wholly future trip displays its initial rail affiliate action without a fake origin stop', { skip: !builderBrowserTestsEnabled, timeout: 30000 }, async () => {
  const trip = affiliateEndpointTrip('2026-11-01', '2026-11-15');
  const fixture = await renderBuilder({ path: `/journey/${trip.id}/transport`, initialTrip: trip });
  const { page } = fixture;
  try {
    await page.clock.install({ time: now }); await page.reload();
    await page.getByRole('button', { name: 'View details: London to Paris', exact: true }).click();
    const link = page.getByRole('link', { name: /Find trains, opens Omio in a new tab/i });
    await link.waitFor();
    const search = new URL(new URL((await link.getAttribute('href'))!).searchParams.get('u')!);
    assert.equal(search.searchParams.get('departureDate'), '2026-11-01');
    assert.equal(search.searchParams.get('travelMode'), 'TRAIN');
    assert.equal(trip.stops.length, 2);
    assert.deepEqual(fixture.errors, []);
  } finally { await fixture.close(); }
});

for (const scenario of ['past leg', 'ended trip', 'missing date', 'unknown mode']) test(`Transport keeps the affiliate action unavailable for ${scenario}`, { skip: !builderBrowserTestsEnabled, timeout: 30000 }, async () => {
  const trip = affiliateEndpointTrip();
  const leg = trip.legs.find(leg => leg.classification === (scenario === 'past leg' ? 'international' : 'departure'))!;
  if (scenario === 'ended trip') trip.endDate = '2026-10-18';
  if (scenario === 'missing date') trip.endDate = '';
  if (scenario === 'unknown mode') { leg.mode = 'unknown'; leg.durationMinutes = null; leg.doorToDoorMinutes = null; }
  const fixture = await renderBuilder({ path: `/journey/${trip.id}/transport`, initialTrip: trip });
  const { page } = fixture;
  try {
    await page.clock.install({ time: now }); await page.reload();
    await page.getByRole('button', { name: scenario === 'past leg' ? 'View details: Paris to Madrid' : 'View details: Madrid to London', exact: true }).click();
    assert.equal(await page.getByRole('region', { name: 'Journey details', exact: true }).getByRole('link', { name: /Omio/ }).count(), 0);
    assert.deepEqual(fixture.errors, []);
  } finally { await fixture.close(); }
});
