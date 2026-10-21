import { validIslandPoint } from './physical-island-geometry.ts';

type Versioned = { type: string; id: number; version: number; timestamp: string };
type Member = { type: string; ref: number; role: string };
type Relation = Versioned & { tags: Record<string, string>; members: Member[] };
type Way = Versioned & { tags: Record<string, string>; nodes: number[] };
type Node = Versioned & { lon: number; lat: number };
type Subgraph = {
  version: number; format: string;
  archive: { url: string; bytes: number; sha256: string; md5: string; checksumURL: string; checksumBody: string;
    baseTimestamp: string; replicationSequence: number; licence: string; licenceURL: string; extraction: string; extractionScriptSHA256: string };
  relation: Relation; ways: Way[]; nodes: Node[];
};
const reject = () => { throw new Error('Unverified Geofabrik island source'); };
const positive = (n: unknown): n is number => Number.isSafeInteger(n) && Number(n) > 0;
const utc = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(s)
  && Number.isFinite(Date.parse(s)) && new Date(s).toISOString() === s.replace('Z', '.000Z');
const tags = (t: unknown): t is Record<string, string> => Boolean(t) && typeof t === 'object' && !Array.isArray(t) && Object.values(t!).every(v => typeof v === 'string');

/** An explicitly derived PBF subgraph, never an original Overpass/HTTP JSON
 * response. Archive bytes are verified offline; the complete reviewed graph
 * and archive provenance are pinned by the accepted snapshot manifest. */
export function geofabrikIslandGeometryBody(source: { url: string; checkedAt: string; body: unknown; originalResponseSHA256?: string; originalResponseBody?: string }, deadline: number) {
  if (source.originalResponseSHA256 !== undefined || source.originalResponseBody !== undefined) reject();
  const body = source.body as Subgraph;
  if (!body || body.version !== 1 || body.format !== 'geofabrik-osm-relation-subgraph-v1' || !body.archive) reject();
  const a = body.archive, url = new URL(source.url);
  if (url.protocol !== 'https:' || url.hostname !== 'download.geofabrik.de' || url.port || url.username || url.password || url.search || url.hash
    || !/^\/(?:[a-z0-9-]+\/)+[a-z0-9-]+-\d{6}\.osm\.pbf$/.test(url.pathname) || a.url !== source.url
    || !positive(a.bytes) || !/^[a-f0-9]{64}$/.test(a.sha256) || !/^[a-f0-9]{32}$/.test(a.md5)
    || a.checksumURL !== `${source.url}.md5` || a.checksumBody !== `${a.md5}  ${url.pathname.split('/').at(-1)}\n`
    || a.licence !== 'ODbL-1.0' || a.licenceURL !== 'https://opendatacommons.org/licenses/odbl/1-0/'
    || !utc(a.baseTimestamp) || Date.parse(a.baseTimestamp) > Date.parse(source.checkedAt) || !positive(a.replicationSequence)
    || typeof a.extraction !== 'string' || !a.extraction.trim() || a.extraction.length > 300 || !/^[a-f0-9]{64}$/.test(a.extractionScriptSHA256)) reject();
  const versioned = (v: Versioned, type: string) => v && v.type === type && positive(v.id) && positive(v.version) && utc(v.timestamp)
    && Date.parse(v.timestamp) <= Date.parse(a.baseTimestamp);
  const r = body.relation;
  if (!versioned(r, 'relation') || !tags(r.tags) || !Array.isArray(r.members) || !r.members.length || r.members.length > 600
    || !Array.isArray(body.ways) || body.ways.length !== r.members.length || !Array.isArray(body.nodes) || !body.nodes.length || body.nodes.length > 60_000) reject();
  const members = new Set<number>();
  for (const m of r.members) {
    if (!m || m.type !== 'way' || !positive(m.ref) || !['outer', 'inner'].includes(m.role) || members.has(m.ref)) reject();
    members.add(m.ref);
  }
  const ways = new Map<number, Way>(), needed = new Set<number>(); let points = 0;
  for (const w of body.ways) {
    if (Date.now() > deadline || !versioned(w, 'way') || !tags(w.tags) || !members.has(w.id) || ways.has(w.id)
      || !Array.isArray(w.nodes) || w.nodes.length < 2 || (points += w.nodes.length) > 60_000) reject();
    for (const id of w.nodes) { if (!positive(id)) reject(); needed.add(id); }
    ways.set(w.id, w);
  }
  if (needed.size !== body.nodes.length) reject();
  const nodes = new Map<number, Node>();
  for (const n of body.nodes) {
    if (Date.now() > deadline || !versioned(n, 'node') || !needed.has(n.id) || nodes.has(n.id) || !validIslandPoint([n.lon, n.lat])) reject();
    nodes.set(n.id, n);
  }
  // Complete, unchanged coordinates; no bbox, admin shape, simplification or
  // invented connecting segment can establish physical membership.
  return { osm3s: { timestamp_osm_base: a.baseTimestamp }, elements: [{ type: 'relation', id: r.id, tags: r.tags,
    members: r.members.map(m => ({ type: 'way', role: m.role, geometry: ways.get(m.ref)!.nodes.map(id => {
      const n = nodes.get(id)!; return { lon: n.lon, lat: n.lat };
    }) })) }] };
}
