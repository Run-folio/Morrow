import assert from 'node:assert/strict';
import test from 'node:test';
import { searchReferencePlaces } from '../lib/easyt/place-reference.server.ts';
import { normalizePhysicalIslandBaseCandidates } from '../lib/easyt/openstreetmap-island-containment.server.ts';
import type { PlanningParentConstraint } from '../lib/easyt/place-intelligence.ts';
import { mkdtempSync, cpSync, rmSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';
import { createIslandGeographyReader } from '../lib/easyt/island-geography.server.ts';
import { compileIslandSource, validateIslandGroup, type IslandSourceRecord } from '../lib/easyt/island-geography-source.ts';
import { physicalCoastlineGeometry, physicalContains } from '../lib/easyt/physical-island-geometry.ts';
import { buildIslandGeography } from '../scripts/build-island-geography.ts';
import { requiresPhysicalIslandVerification } from '../lib/easyt/island-geography.ts';
import { islandDigest } from '../lib/easyt/island-geography-source.ts';
import { verifyPhysicalIslandSuggestion } from '../lib/easyt/destination-resolution.ts';
import { createOpenWorldPlaceProvider } from '../lib/easyt/open-world-place.server.ts';
import { captureJourneyBriefWithProvider } from '../lib/easyt/journey-capture.ts';

const source = (id: string): IslandSourceRecord => JSON.parse(gunzipSync(readFileSync(`data/place-reference/islands/${id}.json.gz`)).toString());

const offline: typeof fetch = async () => { throw new Error('Boundary provider unavailable'); };
const settlement = (name: string, country: string) => searchReferencePlaces(name, { explicitCountryNames: [country] })
  .find(candidate => ['city', 'town'].includes(candidate.placeType))!;
const island = (name: string, country: string): PlanningParentConstraint => ({ canonicalName: name, placeType: 'island', parentCountries: [country] });

test('an exact covered island remains a visible Spain choice beside a same-name town abroad', async () => {
  const provider = createOpenWorldPlaceProvider({ cache: new Map(), searchMode: 'reference-only', fetchImpl: offline });
  const choices = await provider.lookup('Tenerife', { travelIntent: 'route-stop' });
  assert(choices.some(candidate => candidate.canonicalName === 'Tenerife' && candidate.parentCountries?.[0] === 'Spain'
    && candidate.placeType === 'island' && candidate.routability === 'needs_base_selection'
    && candidate.providerId.endsWith('relation:2108882')));
  assert(choices.some(candidate => candidate.canonicalName === 'Tenerife' && candidate.parentCountries?.[0] === 'Colombia'
    && candidate.placeType === 'city'));
  assert(!choices.some(candidate => candidate.placeType === 'island' && candidate.parentCountries?.[0] === 'Colombia'));
  assert((await provider.lookup('Tenerife', { travelIntent: 'route-stop', countryNames: ['Greece'] }))
    .some(candidate => candidate.placeType === 'island' && candidate.parentCountries?.[0] === 'Spain'));
});

test('an unqualified Tenerife trip keeps the distinct island and Colombian city ambiguous', async () => {
  const provider = createOpenWorldPlaceProvider({ cache: new Map(), searchMode: 'reference-only', fetchImpl: offline });
  const brief = await captureJourneyBriefWithProvider('Tenerife 7 nights.', provider);
  assert.equal(brief.mentions[0]?.status, 'ambiguous');
  assert.equal(brief.mentions[0]?.canonicalPlaceId, undefined);
  assert(brief.mentions[0]?.candidates?.some(candidate => candidate.placeType === 'island' && candidate.parentCountries?.[0] === 'Spain'));
});

test('explicit Spain selects the Tenerife island while preserving the need for a real base', async () => {
  const provider = createOpenWorldPlaceProvider({ cache: new Map(), searchMode: 'reference-only', fetchImpl: offline });
  const brief = await captureJourneyBriefWithProvider('Tenerife, Spain for 7 nights.', provider);
  assert.equal(brief.mentions[0]?.placeType, 'island');
  assert.equal(brief.mentions[0]?.parentCountries[0], 'Spain');
  assert.equal(brief.mentions[0]?.requiresBaseSelection, true);
});

test('the partially covered Canary group is a source-backed planning choice, not a settlement', async () => {
  const provider = createOpenWorldPlaceProvider({ cache: new Map(), searchMode: 'reference-only', fetchImpl: offline });
  const choices = await provider.lookup('Canary Islands', { travelIntent: 'route-stop' });
  assert(choices.some(candidate => candidate.canonicalName === 'Canary Islands' && candidate.parentCountries?.[0] === 'Spain'
    && candidate.placeType === 'archipelago' && candidate.routability === 'needs_base_selection'
    && candidate.providerId.endsWith('relation:5392189')));
  assert(!(await provider.lookup('Tenerife', { travelIntent: 'route-stop', explicitCountryNames: ['Colombia'] }))
    .some(candidate => candidate.placeType === 'island'));
  assert(!(await provider.lookup('Tenerife', { travelIntent: 'route-stop', explicitCountryNames: ['Atlantis'] }))
    .some(candidate => candidate.placeType === 'island'));
  assert(!(await provider.lookup('Tenerife', { travelIntent: 'route-stop', explicitPlaceTypes: ['city'] }))
    .some(candidate => candidate.placeType === 'island'));
});

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
  political.geometry.bodySHA256 = islandDigest(JSON.stringify(body));
  assert.throws(() => compileIslandSource(political), /Unverified/);
  const open = source('tenerife'); const identity = compileIslandSource(open);
  const coastline = physicalCoastlineGeometry(open.geometry.body, identity.identityPoint, Date.now() + 10_000)!;
  (open.geometry.body as any).elements = (open.geometry.body as any).elements.filter((way: any) => way.id !== coastline.wayIds[0]);
  // Synthetic structural corruption is separately certified here so the test
  // reaches topology rather than failing the source-digest check first.
  open.geometry.bodySHA256 = islandDigest(JSON.stringify(open.geometry.body));
  delete open.geometry.originalResponseBody; delete open.geometry.originalResponseSHA256;
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


test('reference physical proof binds canonical identity as well as provider and point', () => {
  const real = settlement('Fira', 'Greece');
  assert.deepEqual(createIslandGeographyReader().normalize([{ ...real, canonicalPlaceId: 'reference:geonames:999999' }], island('Santorini', 'Greece')), []);
});

test('self-consistent rewritten source and manifest cannot replace the accepted snapshot', () => {
  const directory = mkdtempSync(join(tmpdir(), 'morrovia-island-untrusted-'));
  try {
    cpSync('data/place-reference/islands', directory, { recursive: true });
    const changed = source('santorini'); changed.identity.checkedAt = '2026-10-11T00:00:00Z';
    const inflated = Buffer.from(JSON.stringify(changed)); const bytes = gzipSync(inflated);
    writeFileSync(join(directory, 'santorini.json.gz'), bytes);
    const manifest = JSON.parse(readFileSync(join(directory, 'manifest.json'), 'utf8'));
    Object.assign(manifest.files.find((f: any) => f.path === 'santorini.json.gz'), { sha256: islandDigest(bytes), bytes: bytes.length, inflatedBytes: inflated.length });
    writeFileSync(join(directory, 'manifest.json'), JSON.stringify(manifest));
    assert.throws(() => createIslandGeographyReader(directory).normalize([settlement('Fira', 'Greece')], island('Santorini', 'Greece')), /accepted manifest/);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('absent bundled assets never block an uncovered parent but fail closed for covered geography', () => {
  const directory = mkdtempSync(join(tmpdir(), 'morrovia-island-absent-'));
  try {
    const reader = createIslandGeographyReader(directory);
    assert.equal(reader.normalize([settlement('Fira', 'Greece')], island('Uncovered Island', 'Greece')), undefined);
    assert.throws(() => reader.normalize([settlement('Fira', 'Greece')], island('Santorini', 'Greece')));
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('covered group with a conflicting source ID requests server verification without crashing the client', () => {
  assert.equal(requiresPhysicalIslandVerification({ canonicalName: 'Canary Islands', placeType: 'archipelago', parentCountries: ['Spain'], canonicalPlaceId: 'open-world:photon:R:453964' }), true);
});


test('a reference town cannot retain physical proof after its stored settlement type changes', () => {
  const real = settlement('Fira', 'Greece'); assert.equal(real.placeType, 'city');
  assert.deepEqual(createIslandGeographyReader().normalize([{ ...real, placeType: 'town' }], island('Santorini', 'Greece')), []);
});

test('uncovered archipelago preserves its previous acceptance behavior without a physical coverage claim', async () => {
  const parent: PlanningParentConstraint = { canonicalName: 'Unknown Islands', placeType: 'archipelago', parentCountries: ['Greece'] };
  const base = settlement('Fira', 'Greece');
  const selected = { canonicalPlaceId: base.canonicalPlaceId!, name: base.canonicalName, label: base.canonicalName, country: 'Greece', placeType: base.placeType, coordinates: base.coordinates, provenance: [] };
  assert.equal(requiresPhysicalIslandVerification(parent), false);
  assert.equal(await verifyPhysicalIslandSuggestion(parent, selected, { fetchImpl: offline }), selected);
  assert.deepEqual(await normalizePhysicalIslandBaseCandidates([base], parent, { fetchImpl: offline }), [base]);
});


for (const shape of ['crossing', 'touching', 'nested'] as const) test(`separate closed coastline components reject ${shape} geometry before selecting an identity`, () => {
  const first = [[-2,-2],[1,-2],[1,2],[-2,2],[-2,-2]];
  const second = shape === 'crossing' ? [[0,-1],[2,-1],[2,1],[0,1],[0,-1]] : shape === 'touching' ? [[1,-1],[2,-1],[2,1],[1,1],[1,-1]] : [[0,-1],[0.5,-1],[0.5,1],[0,1],[0,-1]];
  const body = { osm3s: { timestamp_osm_base: '2026-10-10T12:00:00Z' }, elements: [first, second].map((ring, index) => ({ type: 'way', id: index + 1, tags: { natural: 'coastline' }, geometry: ring.map(([lon,lat]) => ({lon,lat})) })) };
  assert.equal(physicalCoastlineGeometry(body, [-1,0], Date.now() + 1000), null);
});

test('Canary state labels cannot establish membership without captured official supporting evidence', () => {
  const group = JSON.parse(gunzipSync(readFileSync('data/place-reference/islands/groups.json.gz')).toString())[0];
  delete group.membership;
  const records = new Map(['tenerife','gran-canaria'].map(id => { const captured = source(id); return [id, { source: captured, compiled: compileIslandSource(captured) }] as const; }));
  assert.throws(() => validateIslandGroup(group, records), /membership evidence/);
});

test('a retained original-byte digest cannot contradict the captured source response', () => {
  const captured = source('tenerife'); captured.geometry.originalResponseSHA256 = '0'.repeat(64);
  assert.throws(() => compileIslandSource(captured), /source.*digest/i);
});


test('refresh rejects duplicate source identities and aliases under different internal keys before publishing', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'morrovia-island-duplicate-')); const output = join(directory, 'candidate');
  try {
    const first = source('santorini'); const duplicate = structuredClone(first); duplicate.id = 'santorini-copy';
    await assert.rejects(buildIslandGeography({ version: 1, records: [first, duplicate], groups: [] }, output), /Duplicate island source identity|Conflicting island alias/);
    assert.equal(existsSync(output), false);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});


for (const contradiction of ['member', 'group'] as const) test(`official membership rejects a contradictory ${contradiction} even with internally consistent content digests`, () => {
  const group = JSON.parse(gunzipSync(readFileSync('data/place-reference/islands/groups.json.gz')).toString())[0];
  group.membership.body = contradiction === 'member' ? group.membership.body.replace(/Tenerife/g, 'Unrelated Island') : group.membership.body.replace(/The Canary Islands/g, 'Unrelated Group');
  group.membership.bodySHA256 = islandDigest(JSON.stringify(group.membership.body)); group.membership.originalResponseSHA256 = islandDigest(group.membership.body);
  const records = new Map(['tenerife','gran-canaria'].map(id => { const captured = source(id); return [id, { source: captured, compiled: compileIslandSource(captured) }] as const; }));
  assert.throws(() => validateIslandGroup(group, records), /Unverified island-to-archipelago membership|Contradictory official membership/);
});
