import assert from 'node:assert/strict';
import test from 'node:test';
import { tripOverviewDisplayTitle } from '../lib/easyt/trip-display.ts';
import { dashboardLibraryTrips } from '../lib/easyt/dashboard-library.ts';
import type { EasyTTrip } from '../lib/easyt/trip.ts';
import { canonicalRouteFixture } from './fixtures/batch14-route-documents.ts';
function sample(id: string, names: string[], countries: string[]): EasyTTrip { const t = canonicalRouteFixture(); return { ...t, id, title: 'Old generated route', brief: { ...t.brief, customTitle: null }, stops: names.map((name, i) => ({ ...t.stops[0]!, id: `${id}-${i}`, name, order: i, country: countries[i] ?? '', countryCode: undefined })) }; }
test('card country presentation reuses known provenance and does not mutate saved identity', () => {
    const multi = sample('multi', ['Tokyo', 'Seoul', 'Kyoto'], ['Japan', 'South Korea', 'Japan']);
    const before = JSON.stringify(multi);
    assert.equal(tripOverviewDisplayTitle(multi), 'Japan & South Korea');
    assert.equal(JSON.stringify(multi), before);
    assert.equal(tripOverviewDisplayTitle(sample('unknown', ['Unverified'], ['Atlantis'])), 'Your trip');
    const code = sample('code', ['Tokyo'], ['']);
    code.stops[0]!.countryCode = 'JP';
    assert.equal(tripOverviewDisplayTitle(code), 'Japan');
    const custom = { ...multi, brief: { ...multi.brief, customTitle: 'Our anniversary — 春の旅' } };
    assert.equal(tripOverviewDisplayTitle(custom), 'Our anniversary — 春の旅');
    const { customTitle: _, ...brief } = multi.brief;
    const legacy = { ...multi, title: 'An unclassified saved title', brief };
    assert.equal(tripOverviewDisplayTitle(legacy), 'An unclassified saved title');
});
test('collection title sort and search follow displayed country names while destination search stays available', () => {
    const korea = sample('korea', ['Seoul'], ['South Korea']), japan = sample('japan', ['Tokyo'], ['Japan']);
    assert.deepEqual(dashboardLibraryTrips([korea, japan], { view: 'all', sort: 'title', query: '' }).map(t => t.id), ['japan', 'korea']);
    assert.deepEqual(dashboardLibraryTrips([korea, japan], { view: 'all', sort: 'updated', query: 'Japan' }).map(t => t.id), ['japan']);
    assert.deepEqual(dashboardLibraryTrips([korea, japan], { view: 'all', sort: 'updated', query: 'Seoul' }).map(t => t.id), ['korea']);
});

test('loading and page composition start with the collection',async()=>{
 const {readFileSync}=await import('node:fs');const page=readFileSync(new URL('../app/journey/dashboard/page.tsx',import.meta.url),'utf8'),loading=readFileSync(new URL('../app/journey/dashboard/loading.tsx',import.meta.url),'utf8');assert.doesNotMatch(page,/Ready when you are\.|Your journeys\./);assert.match(page,/<h1 className=\{dashboardStyles.srOnly\}>My Trips<\/h1>/);assert.doesNotMatch(loading,/loadingHero|loadingHeading/);assert.match(loading,/loadingToolbar/);assert.match(loading,/loadingGrid/);
});
