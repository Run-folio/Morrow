import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveSpreadsheetImportPlace } from '../lib/easyt/spreadsheet-import-places.ts';
import * as intake from '../lib/easyt/spreadsheet-import-places.ts';
import type { ImportPlaceCandidate } from '../lib/easyt/spreadsheet-import-places.ts';
import type { PlanningParentConstraint } from '../lib/easyt/place-intelligence.ts';

const candidate = (name: string, country: string, region?: string): ImportPlaceCandidate => ({
  name, country, region, canonicalPlaceId: `fixture:${name}`, providerId: `fixture:${name}`, coordinates: [12, 45], placeType: 'town', routability: 'direct_destination',
});
const verify = (...args: Parameters<typeof intake.verifySpreadsheetImportBase>) => {
  assert.equal(typeof intake.verifySpreadsheetImportBase, 'function');
  return intake.verifySpreadsheetImportBase(...args);
};

test('explicit intake retry carries the chosen region and qualified label through the existing resolve API', async () => {
  const original = globalThis.fetch;
  const requests: URL[] = [];
  globalThis.fetch = async input => {
    requests.push(new URL(String(input), 'https://example.invalid'));
    return Response.json({ candidates: [] });
  };
  try {
    await resolveSpreadsheetImportPlace('Siquijor', 'Philippines', 'stop', undefined, {
      mode: 'resolve', parent: { canonicalName: 'Siquijor', canonicalPlaceId: 'open-world:photon:R:3604058', placeType: 'region', parentCountries: ['Philippines'] },
    });
    assert.deepEqual(Object.fromEntries(requests[0].searchParams), {
      place: 'Siquijor, Philippines', candidates: '1', consumer: 'spreadsheet-import', country: 'Philippines', mode: 'resolve',
      parentName: 'Siquijor', parentType: 'region', parentId: 'open-world:photon:R:3604058', parentCountry: 'Philippines',
    });
  } finally { globalThis.fetch = original; }
});

for (const [name, country, region] of [['Chiang Mai', 'Thailand', 'Chiang Mai'], ['Kyoto', 'Japan', 'Kyoto Prefecture'], ['Valencia', 'Spain', 'Valencia'], ['Lyon', 'France', 'Auvergne-Rhône-Alpes']]) {
  test(`${name} explicit base selection retains its verified regional constraint`, async () => {
    const parent: PlanningParentConstraint = { canonicalName: region, placeType: 'region', parentCountries: [country] };
    assert.equal((await verify(candidate(name, country, region), parent))?.name, name);
    assert.equal(await verify(candidate(name, country), parent), null, 'country alone is not containment');
    assert.equal(await verify(candidate(name, country, 'another region'), parent), null);
    assert.equal(await verify({ ...candidate(name, country, region), placeType: 'region', routability: 'planning_area' }, parent), null);
  });
}

test('island base selection uses existing physical verification and preserves the exact selected identity and point', async () => {
  const original = globalThis.fetch;
  const base = candidate('Fira', 'Greece');
  const parent: PlanningParentConstraint = { canonicalName: 'Santorini', placeType: 'island', parentCountries: ['Greece'] };
  globalThis.fetch = async input => {
    const url = new URL(String(input), 'https://example.invalid');
    assert.equal(url.searchParams.get('parentName'), 'Santorini');
    assert.equal(url.searchParams.get('parentCountry'), 'Greece');
    return Response.json({ candidates: [{ ...base, region: 'Santorini', normalizationReason: 'Physical island verified: OSM relation:example; result=strict-inside/outside-holes' }] });
  };
  try {
    const selected = await verify(base, parent);
    assert.equal(selected?.canonicalPlaceId, base.canonicalPlaceId);
    assert.equal(selected?.providerId, base.providerId);
    assert.deepEqual(selected?.coordinates, base.coordinates);
    assert.equal(selected?.region, 'Santorini');
  } finally { globalThis.fetch = original; }
});

for (const [name, patch, status] of [
  ['unavailable provider', {}, 503],
  ['different point', { coordinates: [13, 46] }, 200],
  ['different identity', { canonicalPlaceId: 'another-settlement' }, 200],
  ['different country', { country: 'Italy' }, 200],
  ['different parent', { region: 'Crete' }, 200],
] as const) test(`island base selection refuses ${name}`, async () => {
  const original = globalThis.fetch;
  const base = candidate('Fira', 'Greece');
  globalThis.fetch = async () => Response.json({ candidates: [{ ...base, region: 'Santorini', normalizationReason: 'physical verification', ...patch }] }, { status });
  try {
    const result = verify(base, { canonicalName: 'Santorini', placeType: 'island', parentCountries: ['Greece'] });
    if (status === 503) await assert.rejects(result, /unavailable/);
    else assert.equal(await result, null);
  }
  finally { globalThis.fetch = original; }
});

test('cancelled base verification cannot adopt a late provider response', async () => {
  const original = globalThis.fetch;
  const controller = new AbortController();
  const base = candidate('Fira', 'Greece');
  globalThis.fetch = async () => { controller.abort(); return Response.json({ candidates: [{ ...base, region: 'Santorini', normalizationReason: 'physical verification' }] }); };
  try { await assert.rejects(verify(base, { canonicalName: 'Santorini', placeType: 'island', parentCountries: ['Greece'] }, controller.signal), { name: 'AbortError' }); }
  finally { globalThis.fetch = original; }
});
