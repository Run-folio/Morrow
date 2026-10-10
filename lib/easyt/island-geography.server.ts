import acceptedManifest from '../../data/place-reference/islands/manifest.json' with { type: 'json' };
import bundledIndex from '../../data/place-reference/islands/index.json' with { type: 'json' };
import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { coveredIslandParent, type IslandGeographyIndex, type IslandGroupIndexEntry } from './island-geography.ts';
import { islandDigest, compileIslandSource, validateIslandGroup, type IslandSourceRecord, type IslandGroupSource, type CompiledIslandSource } from './island-geography-source.ts';
import { normalizeIslandName, physicalContains, validIslandPoint } from './physical-island-geometry.ts';
import { isOvernightBaseEligible, type PlaceProviderCandidate, type PlanningParentConstraint } from './place-intelligence.ts';
import { countryCodeFor } from './country-registry.ts';
import { referenceSnapshotId } from './place-reference.server.ts';

type SnapshotFile = { path: string; sha256: string; bytes: number; inflatedBytes: number };
type SnapshotManifest = { version: number; snapshotId: string; referenceSnapshotId: string; files: SnapshotFile[] };
type Binding = [string, string, number, number, string, string[]];

/** A reader owns an immutable accepted snapshot. Covered-invalid throws;
 * uncovered returns undefined. Corruption can never trigger a live guess. */
export function createIslandGeographyReader(root = resolve(process.cwd(), 'data/place-reference/islands')) {
  let manifest: SnapshotManifest | undefined; let index: IslandGeographyIndex | undefined;
  let bindings: Map<string, Binding> | undefined;
  const records = new Map<string, { source: IslandSourceRecord; compiled: CompiledIslandSource }>();
  let groups: IslandGroupSource[] | undefined;
  const read = (name: string) => {
    const file = manifest!.files.find(f => f.path === name);
    if (!file || !/^[a-z0-9-]+\.(?:json|json\.gz)$/.test(name) || statSync(resolve(root, name)).size !== file.bytes) throw new Error(`Island snapshot integrity failure: ${name}`);
    const bytes = readFileSync(resolve(root, name));
    if (islandDigest(bytes) !== file.sha256) throw new Error(`Island snapshot integrity failure: ${name}`);
    const data = name.endsWith('.gz') ? gunzipSync(bytes, { maxOutputLength: file.inflatedBytes }) : bytes;
    if (data.length !== file.inflatedBytes) throw new Error(`Island snapshot inflated-size mismatch: ${name}`);
    return JSON.parse(data.toString());
  };
  function loadIndex() {
    if (index) return index;
    if (statSync(resolve(root, 'manifest.json')).size > 65_536) throw new Error('Island manifest exceeds bounded size');
    const candidate = JSON.parse(readFileSync(resolve(root, 'manifest.json'), 'utf8')) as SnapshotManifest;
    if (candidate.version !== 1 || !/^[a-f0-9]{12}$/.test(candidate.snapshotId) || !Array.isArray(candidate.files)
      || candidate.files.length > 22 || candidate.referenceSnapshotId !== referenceSnapshotId()
      || new Set(candidate.files.map(f => f.path)).size !== candidate.files.length
      || candidate.files.some(f => !Number.isSafeInteger(f.bytes) || f.bytes < 1 || !Number.isSafeInteger(f.inflatedBytes) || f.inflatedBytes < 1)
      || candidate.files.reduce((n, f) => n + f.bytes, 0) > 2 * 1024 * 1024
      || candidate.files.reduce((n, f) => n + f.inflatedBytes, 0) > 8 * 1024 * 1024) throw new Error('Invalid island snapshot manifest');
    // Pin the reviewed snapshot in the build; a rewritten file plus its own
    // checksums is not an accepted refresh. Candidate activation requires a rebuild.
    if (JSON.stringify(candidate) !== JSON.stringify(acceptedManifest)) throw new Error('Island snapshot differs from accepted manifest');
    manifest = candidate;
    const parsed = read('index.json') as IslandGeographyIndex;
    if (parsed.version !== 1 || parsed.snapshotId !== manifest.snapshotId || !Array.isArray(parsed.islands) || !Array.isArray(parsed.groups)
      || parsed.islands.length > 16 || parsed.groups.length > 4) throw new Error('Invalid island snapshot index');
    const derived = read('base-bindings.json.gz') as { referenceSnapshotId?: string; bindings?: Binding[] };
    if (derived.referenceSnapshotId !== manifest.referenceSnapshotId || !Array.isArray(derived.bindings)) throw new Error('Island reference bindings mismatch');
    const decoded = new Map<string, Binding>();
    for (const row of derived.bindings) {
      if (!Array.isArray(row) || row.length !== 6 || typeof row[0] !== 'string' || typeof row[1] !== 'string' || !validIslandPoint([row[2], row[3]])
        || !Array.isArray(row[5]) || !row[5].length || decoded.has(row[0]) || row[5].some(id => !parsed.islands.some(e => e.id === id))) throw new Error('Invalid island base binding');
      decoded.set(row[0], row);
    }
    bindings = decoded; index = parsed; return index;
  }
  function record(id: string) {
    const existing = records.get(id); if (existing) return existing;
    const entry = loadIndex().islands.find(e => e.id === id); if (!entry) throw new Error('Unknown covered island member');
    const source = read(`${id}.json.gz`) as IslandSourceRecord; const compiled = compileIslandSource(source);
    if (source.id !== entry.id || source.name !== entry.name || compiled.countryCode !== entry.countryCode
      || compiled.identityId !== entry.identityId || JSON.stringify(compiled.aliases) !== JSON.stringify(entry.aliases)) throw new Error('Island source/index mismatch');
    for (const ring of [...compiled.geometry.outer, ...compiled.geometry.inner]) { ring.forEach(Object.freeze); Object.freeze(ring); }
    Object.freeze(compiled.geometry.outer); Object.freeze(compiled.geometry.inner); Object.freeze(compiled.geometry); Object.freeze(compiled);
    const value = { source, compiled }; records.set(id, value); return value;
  }
  return {
    identities(phrase: string, explicitCountries: string[] = [], explicitPlaceTypes: string[] = []): PlaceProviderCandidate[] {
      const normalized = normalizeIslandName(phrase);
      const known = [...bundledIndex.islands, ...bundledIndex.groups];
      if (!normalized || !known.some(entry => entry.aliases.some(alias => normalizeIslandName(alias) === normalized))) return [];
      const allowed = explicitCountries.map(countryCodeFor).filter((code): code is string => Boolean(code));
      if (explicitCountries.length > 0 && allowed.length === 0) return [];
      const acceptedEntries = [...loadIndex().islands, ...loadIndex().groups]
        .filter(entry => entry.aliases.some(alias => normalizeIslandName(alias) === normalized)
          && (explicitCountries.length === 0 || allowed.includes(entry.countryCode))
          && (explicitPlaceTypes.length === 0 || explicitPlaceTypes.includes('memberIslandIds' in entry ? 'archipelago' : 'island')));
      return acceptedEntries.map(entry => {
        const isGroup = 'memberIslandIds' in entry;
        let identityPoint: [number, number]; let state: string | undefined; let checkedAt: string; let country: string;
        if (isGroup) {
          groups ??= read('groups.json.gz') as IslandGroupSource[];
          const group = groups.find(candidate => candidate.id === entry.id);
          if (!group) throw new Error('Covered island group is missing');
          group.memberIslandIds.forEach(record);
          const identity = validateIslandGroup(group, records);
          if (identity.id !== entry.identityId || JSON.stringify(group.memberIslandIds) !== JSON.stringify(entry.memberIslandIds)) throw new Error('Island group/index mismatch');
          identityPoint = identity.point; state = identity.state; checkedAt = group.checkedAt; country = group.country;
        } else {
          const member = record(entry.id);
          identityPoint = member.compiled.identityPoint; state = member.compiled.state;
          checkedAt = member.source.identity.checkedAt; country = member.source.country;
        }
        return {
          providerId: `island-snapshot:${entry.identityId}`,
          canonicalName: entry.name,
          aliases: entry.aliases,
          placeType: isGroup ? 'archipelago' : 'island',
          parentCountries: [country],
          parentRegionId: state,
          coordinates: identityPoint,
          routability: 'needs_base_selection',
          matchQuality: 'exact',
          rankScore: 1000,
          providerSourceId: 'island-snapshot',
          providerSourceLabel: 'Captured island identity',
          normalizationReason: `Source-backed ${isGroup ? 'partial archipelago' : 'island'} identity; snapshot=${manifest!.snapshotId}; checked=${checkedAt.slice(0, 10)}; overnight base still needs physical verification`,
        };
      });
    },
    normalize(candidates: PlaceProviderCandidate[], parent: PlanningParentConstraint): PlaceProviderCandidate[] | undefined {
      if (!coveredIslandParent(parent)) return undefined;
      const entry = coveredIslandParent(parent, loadIndex()); if (!entry) return undefined;
      let ids: string[] = [entry.id];
      if (parent.placeType === 'archipelago') {
        groups ??= read('groups.json.gz') as IslandGroupSource[];
        const group = groups.find(g => g.id === entry.id); if (!group) throw new Error('Covered island group is missing');
        ids = (entry as IslandGroupIndexEntry).memberIslandIds;
        ids.forEach(record); const identity = validateIslandGroup(group, records);
        if (identity.id !== entry.identityId || JSON.stringify(group.memberIslandIds) !== JSON.stringify(ids)) throw new Error('Island group/index mismatch');
      }
      const physical = ids.map(record);
      return candidates.flatMap(candidate => {
        const point = candidate.coordinates;
        if (!validIslandPoint(point) || !isOvernightBaseEligible({ placeType: candidate.placeType, routability: candidate.routability ?? 'direct_destination' })
          || !candidate.parentCountries?.some(c => countryCodeFor(c) === entry.countryCode)) return [];
        const member = physical.find(r => physicalContains(r.compiled.geometry, point)); if (!member) return [];
        if (candidate.providerId.startsWith('reference:')) {
          const binding = bindings!.get(candidate.providerId.split('@')[0]!);
          if (!binding || binding[0] !== candidate.canonicalPlaceId || binding[1] !== candidate.providerId
            || binding[1].split(':').at(-3) !== candidate.placeType || binding[2] !== point[0] || binding[3] !== point[1]
            || binding[4] !== entry.countryCode || !binding[5].includes(member.source.id)) return [];
        }
        const proof = `Physical island verified: OSM ${member.compiled.sourceGeometryId}; snapshot=${manifest!.snapshotId}; checked=${member.compiled.checkedAt.slice(0, 10)}; point=${point.join(',')}; country=${entry.countryCode}; result=strict-inside/outside-holes; timestamp=${member.compiled.geometry.timestamp}; identity=${member.compiled.identityId}`;
        return [{ ...candidate, parentRegionId: entry.name, providerSourceLabel: `${candidate.providerSourceLabel ?? 'Settlement geography'} + OpenStreetMap`, normalizationReason: proof.slice(0, 240) }];
      });
    },
  };
}

const accepted = createIslandGeographyReader();
export const normalizeBundledIslandCandidates = (candidates: PlaceProviderCandidate[], parent: PlanningParentConstraint) => accepted.normalize(candidates, parent);
export const searchBundledIslandIdentityCandidates = (phrase: string, explicitCountries: string[] = [], explicitPlaceTypes: string[] = []) => accepted.identities(phrase, explicitCountries, explicitPlaceTypes);
