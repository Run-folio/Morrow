import assert from 'node:assert/strict';
import test from 'node:test';
import { searchReferencePlaces } from '../lib/easyt/place-reference.server.ts';
import { normalizePhysicalIslandBaseCandidates } from '../lib/easyt/openstreetmap-island-containment.server.ts';
import type { PlanningParentConstraint } from '../lib/easyt/place-intelligence.ts';
import { mkdtempSync, cpSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { createIslandGeographyReader } from '../lib/easyt/island-geography.server.ts';
import { compileIslandSource, type IslandSourceRecord } from '../lib/easyt/island-geography-source.ts';
import { physicalCoastlineGeometry, physicalContains } from '../lib/easyt/physical-island-geometry.ts';
import { buildIslandGeography } from '../scripts/build-island-geography.ts';
import { verifyPhysicalIslandSuggestion } from '../lib/easyt/destination-resolution.ts';

const source = (id: string): IslandSourceRecord => JSON.parse(gunzipSync(readFileSync(`data/place-reference/islands/${id}.json.gz`)).toString());

const offline: typeof fetch = async () => { throw new Error('Boundary provider unavailable'); };
const settlement = (name: string, country: string) => searchReferencePlaces(name, { explicitCountryNames: [country] })
  .find(candidate => ['city', 'town'].includes(candidate.placeType))!;
const island = (name: string, country: string): PlanningParentConstraint => ({ canonicalName: name, placeType: 'island', parentCountries: [country] });

for (const [name, base, country] of [['Santorini', 'Fira', 'Greece'], ['Crete', 'Chania', 'Greece'], ['Tenerife', 'Santa Cruz de Tenerife', 'Spain'], ['Gran Canaria', 'Las Palmas', 'Spain']]) {
  test(`covered ${name} verifies its unchanged real town while every boundary provider is unavailable`, async () => {
    const candidate = settlement(base, country); assert(candidate);
    const [verified] = await normalizePhysicalIslandBaseCandidates([candidate], island(name, country), { fetchImpl: offline });
    assert(verified, `${base} must remain selectable without a live boundary lookup`);
    assert.equal(verified.canonicalPlaceId, candidate.canonicalPlaceId);
    assert.equal(verified.providerId, candidate.providerId);
    assert.deepEqual(verified.coordinates, candidate.coordinates);
    assert.equal(verified.parentRegionId, name);
    assert.match(verified.normalizationReason!, /snapshot=/);
    assert.match(verified.normalizationReason!, /checked=/);
    assert.match(verified.normalizationReason!, /strict-inside\/outside-holes/);
  });
}

test('a Tenerife parent rejects the real Gran Canaria town without using Spanish country or area bounds as proof', async () => {
  assert.deepEqual(await normalizePhysicalIslandBaseCandidates([settlement('Las Palmas', 'Spain')], { ...island('Tenerife', 'Spain'), bounds: { west: -19, south: 27, east: -13, north: 30 } }, { fetchImpl: offline }), []);
});

test('covered Canary archipelago accepts only verified member land, not mainland Spain or a Greek island town', async () => {
  const parent: PlanningParentConstraint = { canonicalPlaceId: 'canary-islands', canonicalName: 'Canary Islands', placeType: 'archipelago', parentCountries: ['Spain'] };
  const candidates = [settlement('Santa Cruz de Tenerife', 'Spain'), settlement('Las Palmas', 'Spain'), settlement('Madrid', 'Spain'), settlement('Fira', 'Greece')];
  const result = await normalizePhysicalIslandBaseCandidates(candidates, parent, { fetchImpl: offline });
  assert.deepEqual(result.map(c => c.canonicalPlaceId), candidates.slice(0, 2).map(c => c.canonicalPlaceId));
  assert(result.every(c => c.parentRegionId === 'Canary Islands'));
});

test('covered source checksum corruption fails closed and stays distinct from uncovered data', () => {
  const directory = mkdtempSync(join(tmpdir(), 'morrovia-island-integrity-'));
  try {
    cpSync('data/place-reference/islands', directory, { recursive: true });
    const reader = createIslandGeographyReader(directory);
    assert.equal(reader.normalize([settlement('Fira', 'Greece')], island('Uncovered Island', 'Greece')), undefined);
    writeFileSync(join(directory, 'santorini.json.gz'), 'corrupt accepted data');
    assert.throws(() => reader.normalize([settlement('Fira', 'Greece')], island('Santorini', 'Greece')), /integrity/);
    assert.throws(() => reader.normalize([settlement('Fira', 'Greece')], island('Santorini', 'Greece')), /integrity/);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('covered reference relationship cannot accept a different provider or altered town point', async () => {
  const real = settlement('Fira', 'Greece');
  for (const candidate of [{ ...real, providerId: real.providerId.replace('@', '@different-') }, { ...real, coordinates: [25.431, 36.421] as [number, number] }]) {
    assert.deepEqual(await normalizePhysicalIslandBaseCandidates([candidate], island('Santorini', 'Greece'), { fetchImpl: offline }), []);
  }
});

test('an explicit source ID conflict does not reinterpret the covered label', () => {
  assert.throws(() => createIslandGeographyReader().normalize([settlement('Fira', 'Greece')], { ...island('Santorini', 'Greece'), canonicalPlaceId: 'open-world:photon:R:2108882' }), /Conflicting/);
});

test('actual bundled physical land rejects water and exact boundary without a bounds or reference-binding shortcut', async () => {
  const captured = source('santorini'); const compiled = compileIslandSource(captured); const fira = settlement('Fira', 'Greece');
  for (const point of [[25.36, 36.4], compiled.geometry.outer[0]![0]!] as [number, number][]) {
    assert(!physicalContains(compiled.geometry, point));
    assert.deepEqual(await normalizePhysicalIslandBaseCandidates([{ ...fira, providerId: 'independent:point', canonicalPlaceId: 'independent:point', coordinates: point }], island('Santorini', 'Greece'), { fetchImpl: offline }), []);
  }
});

test('a named island identity cannot retag political geometry or patch an open coastline', () => {
  const political = source('santorini'); const body = political.geometry.body as any;
  body.elements[0].tags.boundary = 'political'; body.elements[0].tags.type = 'boundary';
  assert.throws(() => compileIslandSource(political), /Unverified/);
  const open = source('tenerife'); const identity = compileIslandSource(open);
  const coastline = physicalCoastlineGeometry(open.geometry.body, identity.identityPoint, Date.now() + 10_000)!;
  (open.geometry.body as any).elements = (open.geometry.body as any).elements.filter((way: any) => way.id !== coastline.wayIds[0]);
  assert.throws(() => compileIslandSource(open), /Unverified/);
});

test('failed refresh never overwrites an accepted candidate directory', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'morrovia-island-refresh-')); const marker = join(directory, 'accepted-marker');
  try {
    writeFileSync(marker, 'keep accepted data');
    await assert.rejects(buildIslandGeography({ version: 1, records: [source('santorini')], groups: [] }, directory), /never overwritten/);
    assert.equal(readFileSync(marker, 'utf8'), 'keep accepted data');
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('a covered archipelago base cannot be accepted from a local suggestion before server verification', async () => {
  const parent: PlanningParentConstraint = { canonicalName: 'Canary Islands', placeType: 'archipelago', parentCountries: ['Spain'] };
  const base = settlement('Santa Cruz de Tenerife', 'Spain'); let calls = 0;
  const result = await verifyPhysicalIslandSuggestion(parent, { canonicalPlaceId: base.canonicalPlaceId!, name: base.canonicalName,
    label: base.canonicalName, country: 'Spain', placeType: base.placeType, routability: 'direct_destination', coordinates: base.coordinates,
    provenance: [{ id: base.providerId, kind: 'provider', label: 'GeoNames', supports: 'Town identity only' }] },
    { fetchImpl: async () => { calls++; return Response.json({ candidates: [] }); } });
  assert.equal(result, null); assert.equal(calls, 1);
});
