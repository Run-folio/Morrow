import { readFile, mkdir, writeFile, rename, rm, stat } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { countryCodeFor } from '../lib/easyt/country-registry.ts';
import { compileIslandSource, validateIslandGroup, islandDigest, type IslandSourcePack } from '../lib/easyt/island-geography-source.ts';
import { normalizeIslandName, physicalContains } from '../lib/easyt/physical-island-geometry.ts';
import { referencePlaceById, referenceSnapshotId } from '../lib/easyt/place-reference.server.ts';

/** Offline candidate import. Never fetches data or modifies an accepted
 * directory. Every source and derived relationship is validated first. */
export async function buildIslandGeography(pack: IslandSourcePack, output: string) {
  if (pack.version !== 1 || !Array.isArray(pack.records) || !pack.records.length || pack.records.length > 16
    || !Array.isArray(pack.groups) || pack.groups.length > 4) throw new Error('Invalid island source pack');
  try { await stat(output); throw new Error('Candidate directory already exists; accepted data is never overwritten'); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  const records = new Map(pack.records.map(source => [source.id, { source, compiled: compileIslandSource(source) }]));
  if (records.size !== pack.records.length) throw new Error('Duplicate island records');
  const groupIdentities = pack.groups.map(group => validateIslandGroup(group, records));
  if (new Set([...records.keys(), ...pack.groups.map(g => g.id)]).size !== records.size + pack.groups.length) throw new Error('Duplicate island/group keys');
  const sourceIdentities = new Set<string>(); const aliases = new Set<string>();
  const checkIdentity = (identity: string, country: string, type: string, names: string[]) => {
    if (sourceIdentities.has(identity)) throw new Error('Duplicate island source identity');
    sourceIdentities.add(identity);
    for (const name of new Set(names.map(normalizeIslandName))) {
      const key = `${country}:${type}:${name}`;
      if (aliases.has(key)) throw new Error('Conflicting island alias');
      aliases.add(key);
    }
  };
  for (const { compiled } of records.values()) checkIdentity(compiled.identityId, compiled.countryCode, 'island', compiled.aliases);
  pack.groups.forEach((group, i) => checkIdentity(groupIdentities[i]!.id, countryCodeFor(group.country)!, 'archipelago', [group.name]));
  const bindings: Array<[string, string, number, number, string, string[]]> = [];
  const rows = JSON.parse(await readFile(resolve(process.cwd(), 'data/place-reference/settlements.json'), 'utf8')) as Array<[string, string, string, number, number]>;
  const scopes = [...records].map(([id, { compiled }]) => ({ id, compiled,
    west: Math.min(...compiled.geometry.outer.flat().map(p => p[0])), east: Math.max(...compiled.geometry.outer.flat().map(p => p[0])),
    south: Math.min(...compiled.geometry.outer.flat().map(p => p[1])), north: Math.max(...compiled.geometry.outer.flat().map(p => p[1])) }));
  for (const row of rows) {
    const [id, , country, lon, lat] = row;
    const members = scopes.filter(s => country === s.compiled.countryCode && lon > s.west && lon < s.east && lat > s.south && lat < s.north
      && physicalContains(s.compiled.geometry, [lon, lat])).map(s => s.id);
    if (members.length) {
      const place = referencePlaceById(`reference:geonames:${id}`);
      if (!place || place.countryCode !== country || place.coordinates[0] !== lon || place.coordinates[1] !== lat) throw new Error('Reference binding mismatch');
      bindings.push([place.canonicalPlaceId, place.providerId, lon, lat, country, members]);
    }
  }
  const index = { version: 1, snapshotId: '', islands: [...records].map(([id, { source, compiled }]) => ({ id, name: source.name, countryCode: compiled.countryCode, aliases: compiled.aliases, identityId: compiled.identityId })),
    groups: pack.groups.map((g, i) => ({ id: g.id, name: g.name, countryCode: records.get(g.memberIslandIds[0]!)!.compiled.countryCode, aliases: [g.name], identityId: groupIdentities[i]!.id, memberIslandIds: g.memberIslandIds, coverage: g.coverage })) };
  const payloads = new Map<string, Buffer>();
  for (const [id, { source }] of records) payloads.set(`${id}.json.gz`, gzipSync(JSON.stringify(source), { level: 9 }));
  payloads.set('groups.json.gz', gzipSync(JSON.stringify(pack.groups), { level: 9 }));
  payloads.set('base-bindings.json.gz', gzipSync(JSON.stringify({ referenceSnapshotId: referenceSnapshotId(), bindings }), { level: 9 }));
  index.snapshotId = islandDigest(JSON.stringify([...payloads].map(([path, buffer]) => [path, islandDigest(buffer)]))).slice(0, 12);
  payloads.set('index.json', Buffer.from(JSON.stringify(index, null, 2) + '\n'));
  const files = [...payloads].map(([path, buffer]) => ({ path, sha256: islandDigest(buffer), bytes: buffer.length,
    inflatedBytes: path.endsWith('.gz') ? (path === 'base-bindings.json.gz' ? Buffer.byteLength(JSON.stringify({ referenceSnapshotId: referenceSnapshotId(), bindings }))
      : path === 'groups.json.gz' ? Buffer.byteLength(JSON.stringify(pack.groups)) : Buffer.byteLength(JSON.stringify(records.get(path.replace('.json.gz', ''))!.source))) : buffer.length }));
  const compressedBytes = files.reduce((n, f) => n + f.bytes, 0), inflatedBytes = files.reduce((n, f) => n + f.inflatedBytes, 0);
  if (compressedBytes > 2 * 1024 * 1024 || inflatedBytes > 8 * 1024 * 1024) throw new Error('Island snapshot exceeds separate dataset budget');
  const manifest = { version: 1, generatorVersion: 'island-geography-v1', snapshotId: index.snapshotId, generatedAt: new Date().toISOString(),
    referenceSnapshotId: referenceSnapshotId(), attribution: '© OpenStreetMap contributors; physical polygons and derived containment under ODbL1.0. Settlement facts retain GeoNames CC BY4.0.',
    licenseURL: 'https://www.openstreetmap.org/copyright', coverage: { islands: records.size, groups: pack.groups.length, groupCoverage: 'partial', baseBindings: bindings.length },
    budgets: { compressedBytes, inflatedBytes, maximumCompressedBytes: 2 * 1024 * 1024, maximumInflatedBytes: 8 * 1024 * 1024 }, files };
  const temporary = `${output}.candidate-${process.pid}`;
  await mkdir(dirname(output), { recursive: true }); await mkdir(temporary);
  try {
    for (const [path, buffer] of payloads) await writeFile(resolve(temporary, path), buffer);
    await writeFile(resolve(temporary, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
    await rename(temporary, output);
  } catch (error) { await rm(temporary, { recursive: true, force: true }); throw error; }
  return manifest;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [, , input, output] = process.argv;
  if (!input || !output) throw new Error('Usage: node --experimental-strip-types scripts/build-island-geography.ts SOURCE_PACK.json NEW_CANDIDATE_DIRECTORY');
  const manifest = await buildIslandGeography(JSON.parse(await readFile(input, 'utf8')), resolve(output));
  console.log(JSON.stringify({ snapshotId: manifest.snapshotId, coverage: manifest.coverage, budgets: manifest.budgets }));
}
