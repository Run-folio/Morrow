import { createHash } from 'node:crypto';
import { countryCodeFor } from './country-registry.ts';
import { normalizeIslandName, physicalGeometry, physicalCoastlineGeometry, validIslandPoint, type Point, type PhysicalIslandGeometry } from './physical-island-geometry.ts';

export const islandDigest = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
export type IslandSourceEvidence = { url: string; query?: string; checkedAt: string; body: unknown; bodySHA256: string; originalResponseSHA256?: string; originalResponseBody?: string };
export type IslandSourceRecord = {
  id: string; name: string; country: string; geometryKind: 'island-relation' | 'coastline';
  identity: IslandSourceEvidence; geometry: IslandSourceEvidence;
};
export type IslandGroupSource = {
  id: string; name: string; country: string; memberIslandIds: string[]; coverage: 'partial';
  identity: IslandSourceEvidence; membership: IslandSourceEvidence; membershipURL: string; checkedAt: string;
};
export type IslandSourcePack = { version: 1; records: IslandSourceRecord[]; groups: IslandGroupSource[] };
export type CompiledIslandSource = {
  geometry: PhysicalIslandGeometry; sourceGeometryId: string; identityId: string;
  identityPoint: Point; aliases: string[]; countryCode: string; checkedAt: string; state?: string;
};

function checkEvidence(source: IslandSourceEvidence, host: string) {
  if (new URL(source.url).protocol !== 'https:' || new URL(source.url).hostname !== host
    || !Number.isFinite(Date.parse(source.checkedAt))) throw new Error('Invalid island source provenance');
  const captured = JSON.stringify(source.body);
  if (!captured || Buffer.byteLength(captured) > 4_000_000) throw new Error('Island source exceeds bounded body limit');
  if (!/^[a-f0-9]{64}$/.test(source.bodySHA256) || islandDigest(captured) !== source.bodySHA256) throw new Error('Island captured source body digest mismatch');
  if (source.originalResponseSHA256 !== undefined || source.originalResponseBody !== undefined) {
    const original = source.originalResponseBody ?? (typeof source.body === 'string' ? source.body : undefined);
    if (typeof original !== 'string' || Buffer.byteLength(original) > 4_000_000 || !/^[a-f0-9]{64}$/.test(source.originalResponseSHA256 ?? '')
      || islandDigest(original) !== source.originalResponseSHA256) throw new Error('Island original source response digest mismatch');
    if (typeof source.body !== 'string' && JSON.stringify(JSON.parse(original)) !== captured) throw new Error('Island original source response contradicts captured body');
    if (typeof source.body === 'string' && original !== source.body) throw new Error('Island original source response contradicts captured body');
  }
}

export function islandSourceIdentity(source: IslandSourceEvidence, name: string, country: string, kind: 'island' | 'archipelago') {
  checkEvidence(source, 'photon.komoot.io');
  const body = source.body as { features?: Array<{ properties?: Record<string, unknown>; geometry?: { coordinates?: unknown } }> };
  if (!Array.isArray(body.features) || body.features.length > 8 || !countryCodeFor(country)) throw new Error('Invalid island identity evidence');
  const found = body.features.filter(feature => feature.properties?.osm_value === kind
    && normalizeIslandName(String(feature.properties.name ?? '')) === normalizeIslandName(name)
    && String(feature.properties.countrycode ?? '').toUpperCase() === countryCodeFor(country)
    && ['R', 'W'].includes(String(feature.properties.osm_type))
    && Number.isSafeInteger(feature.properties.osm_id) && Number(feature.properties.osm_id) > 0
    && validIslandPoint(feature.geometry?.coordinates));
  const keys = new Set(found.map(f => `${f.properties!.osm_type}:${f.properties!.osm_id}:${JSON.stringify(f.geometry!.coordinates)}`));
  if (keys.size !== 1) throw new Error('Ambiguous or missing exact island identity');
  const feature = found[0]!; const properties = feature.properties!;
  return { id: `${properties.osm_type === 'R' ? 'relation' : 'way'}:${properties.osm_id}`, point: feature.geometry!.coordinates as Point,
    name: String(properties.name), state: typeof properties.state === 'string' ? properties.state : undefined };
}

export function compileIslandSource(source: IslandSourceRecord): CompiledIslandSource {
  if (!/^[a-z0-9][a-z0-9-]{0,79}$/.test(source.id) || !source.name || !normalizeIslandName(source.name)) throw new Error('Invalid island record key');
  const identity = islandSourceIdentity(source.identity, source.name, source.country, 'island');
  checkEvidence(source.geometry, 'overpass-api.de');
  const deadline = Date.now() + 10_000;
  let geometry: PhysicalIslandGeometry | null; let sourceGeometryId: string;
  if (source.geometryKind === 'island-relation') {
    const [type, rawId] = identity.id.split(':');
    geometry = physicalGeometry(source.geometry.body, { id: Number(rawId), type: type as 'way' | 'relation', name: identity.name, country: source.country }, deadline);
    sourceGeometryId = identity.id;
  } else if (source.geometryKind === 'coastline') {
    const physical = physicalCoastlineGeometry(source.geometry.body, identity.point, deadline);
    geometry = physical;
    sourceGeometryId = `coastline:${islandDigest(JSON.stringify(physical?.wayIds ?? [])).slice(0, 12)}`;
  } else throw new Error('Unsupported island geometry source');
  if (!geometry || Date.now() > deadline) throw new Error(`Unverified physical island geometry: ${source.id}`);
  return { geometry, sourceGeometryId, identityId: identity.id, identityPoint: identity.point, aliases: [source.name, identity.name],
    countryCode: countryCodeFor(source.country)!, checkedAt: source.geometry.checkedAt, state: identity.state };
}

/** Geographic membership evidence binds named islands to the group; town
 * points must still pass each member's independent physical land polygon. */
export function validateIslandGroup(group: IslandGroupSource, records: Map<string, { source: IslandSourceRecord; compiled: CompiledIslandSource }>) {
  if (!/^[a-z0-9][a-z0-9-]{0,79}$/.test(group.id) || group.coverage !== 'partial' || !group.memberIslandIds.length
    || group.memberIslandIds.length > 16 || new Set(group.memberIslandIds).size !== group.memberIslandIds.length
    || !Number.isFinite(Date.parse(group.checkedAt)) || new URL(group.membershipURL).protocol !== 'https:') throw new Error('Invalid covered archipelago membership');
  if (!group.membership || group.membership.url !== group.membershipURL || typeof group.membership.body !== 'string' || !group.membership.originalResponseSHA256) throw new Error('Missing official membership evidence');
  checkEvidence(group.membership, 'www.hellocanaryislands.com');
  const html = group.membership.body;
  const text = (value: string) => normalizeIslandName(value.replace(/<[^>]*>/g, ' '));
  if (![...html.matchAll(/<h[1-6]\b[^>]*>([\s\S]*?)<\/h[1-6]>/gi)].some(match => text(match[1]!).replace(/^the /, '') === normalizeIslandName(group.name))) throw new Error('Contradictory official membership evidence');
  const links = [...html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)];
  const identity = islandSourceIdentity(group.identity, group.name, group.country, 'archipelago');
  for (const id of group.memberIslandIds) {
    const member = records.get(id);
    if (!member || member.compiled.countryCode !== countryCodeFor(group.country)
      || normalizeIslandName(member.compiled.state ?? '') !== normalizeIslandName(group.name)
      || !links.some(match => {
        const url = new URL(match[1]!, group.membership.url);
        return url.protocol === 'https:' && url.hostname === 'www.hellocanaryislands.com' && url.pathname === `/${member.source.id}/`
          && member.compiled.aliases.some(alias => normalizeIslandName(alias) === text(match[2]!));
      })) throw new Error('Unverified island-to-archipelago membership');
  }
  return identity;
}
