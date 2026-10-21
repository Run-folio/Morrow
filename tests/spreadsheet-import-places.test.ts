import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { geographicallyReady } from '../lib/easyt/geographic-binding.ts';
import { assessImportPlaceCandidates, importPlaceRequest, acceptImportPlace, importPlanningParent, resolveSpreadsheetImportPlace, type ImportPlaceCandidate } from '../lib/easyt/spreadsheet-import-places.ts';
import type { PlaceType } from '../lib/easyt/place-intelligence.ts';

const islands = JSON.parse(readFileSync(new URL('./fixtures/import-island-candidates.json', import.meta.url), 'utf8'));
const place = (name: string, country: string, region: string, type: PlaceType = 'city', coordinates: [number, number] = [12, 45]): ImportPlaceCandidate => ({
  canonicalPlaceId: `fixture:${name}:${country}:${region}:${type}`, providerId: `fixture:${name}:${country}:${region}:${type}`,
  name, country, region, placeType: type, coordinates,
  routability: type === 'region' ? 'planning_area' : type === 'island' ? 'needs_base_selection' : 'direct_destination',
});

test('country and region qualifiers stay attached to an import lookup', () => {
  assert.deepEqual(importPlaceRequest('El Nido, Palawan, Philippines', ''), { query: 'El Nido, Palawan, Philippines', name: 'El Nido', country: 'Philippines', regions: ['Palawan'], conflict: false });
  assert.equal(importPlaceRequest('Paris, France', 'Germany').conflict, true);
  assert.equal(importPlaceRequest('Valencia', 'Spain').query, 'Valencia, Spain');
});

for (const name of ['Bohol', 'Siquijor']) test(`${name} requires a meaning decision, without accepting the first town`, () => {
  const result = assessImportPlaceCandidates(importPlaceRequest(`${name}, Philippines`, ''), islands[`${name}, Philippines`]);
  assert.equal(result.result, null);
  assert.ok(result.candidates.some(candidate => candidate.placeType === 'town'));
  assert.ok(result.candidates.some(candidate => ['island', 'region'].includes(candidate.placeType ?? '')));
});

test('a selected planning geography is a constraint, never an overnight base', () => {
  const island = islands['Bohol, Philippines'].find((candidate: ImportPlaceCandidate) => candidate.placeType === 'island');
  assert.equal(acceptImportPlace(island), null);
  const parent = importPlanningParent(island);
  assert.equal(parent?.canonicalPlaceId, 'open-world:photon:R:3625899');
  assert.equal(parent?.placeType, 'island');
});

for (const [name, country, region] of [['Tokyo', 'Japan', 'Tokyo'], ['Chiang Mai', 'Thailand', 'Chiang Mai'], ['Granada', 'Spain', 'Andalusia'], ['Valencia', 'Spain', 'Valencia'], ['Lyon', 'France', 'Auvergne-Rhône-Alpes']]) {
  test(`${name} accepts a unique typed settlement and keeps validated evidence`, () => {
    const result = assessImportPlaceCandidates(importPlaceRequest(name, country), [place(name, country, region)]);
    assert.ok(result.result);
    assert.ok(geographicallyReady(result.result));
  });
}

test('country and administrative qualifiers reject a homonym elsewhere', () => {
  const spain = place('Granada', 'Spain', 'Andalusia');
  const nicaragua = place('Granada', 'Nicaragua', 'Granada');
  assert.equal(assessImportPlaceCandidates(importPlaceRequest('Granada', ''), [spain, nicaragua]).result, null);
  assert.equal(assessImportPlaceCandidates(importPlaceRequest('Granada', 'Spain'), [nicaragua, spain]).result?.country, 'Spain');
  const parisTexas = place('Paris', 'United States', 'Texas');
  assert.equal(assessImportPlaceCandidates(importPlaceRequest('Paris, Île-de-France, France', ''), [parisTexas]).result, null);
  const elNido = place('El Nido', 'Philippines', 'Palawan', 'town');
  assert.equal(assessImportPlaceCandidates(importPlaceRequest('El Nido, Palawan, Philippines', ''), [elNido]).result?.region, 'Palawan');
  assert.equal(assessImportPlaceCandidates(importPlaceRequest('San José, San José, Costa Rica', ''), [place('San José', 'Costa Rica', 'Alajuela')]).result, null,
    'a settlement name is not evidence of its administrative parent');
});

test('European and Asian region/city names require clarification, including distinct source identities', () => {
  for (const [name, country] of [['Valencia', 'Spain'], ['Chiang Mai', 'Thailand'], ['Bali', 'Indonesia'], ['Naxos', 'Greece']]) {
    assert.equal(assessImportPlaceCandidates(importPlaceRequest(name, country), [place(name, country, name), place(name, country, name, 'region')]).result, null);
  }
  const lyon = place('Lyon', 'France', 'Rhône');
  assert.equal(assessImportPlaceCandidates(importPlaceRequest('Lyon', 'France'), [lyon, { ...lyon, canonicalPlaceId: 'another-source', providerId: 'another-source' }]).result, null);
});

test('airport is available for an explicit endpoint, never for an overnight stop', () => {
  const airport = place('Heathrow Airport', 'United Kingdom', 'England', 'transport_gateway');
  assert.equal(acceptImportPlace(airport), null);
  assert.ok(acceptImportPlace(airport, 'endpoint'));
  assert.equal(assessImportPlaceCandidates(importPlaceRequest('Heathrow Airport', 'United Kingdom'), [airport]).result, null);
  assert.ok(assessImportPlaceCandidates(importPlaceRequest('Heathrow Airport', 'United Kingdom'), [airport], 'endpoint').result);
});

test('unmatched names, invalid coordinates, and unvalidated reference identities cannot auto-resolve', () => {
  assert.equal(assessImportPlaceCandidates(importPlaceRequest('Osaka', 'Japan'), [place('Tokyo', 'Japan', 'Tokyo')]).result, null);
  assert.equal(acceptImportPlace(place('Tokyo', 'Japan', 'Tokyo', 'city', [NaN, 45])), null);
  assert.equal(acceptImportPlace({ ...place('Tokyo', 'Japan', 'Tokyo'), canonicalPlaceId: 'reference:geonames:1850147' }), null);
});

test('lookup sends only qualified place fields and requests candidates rather than accepting the direct top hit', async () => {
  const original = globalThis.fetch;
  const requests: URL[] = [];
  globalThis.fetch = async input => {
    requests.push(new URL(String(input), 'https://example.invalid'));
    return Response.json({ result: islands['Bohol, Philippines'][0], candidates: islands['Bohol, Philippines'] });
  };
  try {
    const result = await resolveSpreadsheetImportPlace('Bohol, Philippines', '');
    assert.equal(result.result, null);
    assert.equal(requests.length, 1);
    assert.equal(requests[0].pathname, '/api/journey-geocode');
    assert.deepEqual(Object.fromEntries(requests[0].searchParams), { place: 'Bohol, Philippines', candidates: '1', consumer: 'spreadsheet-import', country: 'Philippines' });
    assert.deepEqual(await resolveSpreadsheetImportPlace('Paris, France', 'Germany'), { result: null, candidates: [] });
    assert.equal(requests.length, 1, 'conflicting country fields are not sent to the provider');
  } finally { globalThis.fetch = original; }
});
