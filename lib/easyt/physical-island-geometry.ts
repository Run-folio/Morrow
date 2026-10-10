import { countryCodeFor } from './country-registry.ts';

export type Point = [number, number];
export type Ring = Point[];
export type PhysicalIslandGeometry = { outer: Ring[]; inner: Ring[]; timestamp: string };
const maximumPoints = 60_000;
export const normalizeIslandName = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
export const sameCountry = (left: string, right: string) => Boolean(countryCodeFor(left) && countryCodeFor(left) === countryCodeFor(right)) || normalizeIslandName(left) === normalizeIslandName(right);
const samePoint = (a: Point, b: Point) => a[0] === b[0] && a[1] === b[1];
export const validIslandPoint = (p: unknown): p is Point => Array.isArray(p) && p.length === 2 && p.every(x => typeof x === 'number' && Number.isFinite(x)) && Math.abs(p[0]) <= 180 && Math.abs(p[1]) <= 90;
function orientation(a: Point, b: Point, c: Point) { return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]); }
function onSegment(p: Point, a: Point, b: Point) { return Math.abs(orientation(a, b, p)) <= 1e-12 && p[0] >= Math.min(a[0], b[0]) && p[0] <= Math.max(a[0], b[0]) && p[1] >= Math.min(a[1], b[1]) && p[1] <= Math.max(a[1], b[1]); }
function intersects(a: Point, b: Point, c: Point, d: Point) {
  if (Math.max(a[0], b[0]) < Math.min(c[0], d[0]) || Math.max(c[0], d[0]) < Math.min(a[0], b[0]) || Math.max(a[1], b[1]) < Math.min(c[1], d[1]) || Math.max(c[1], d[1]) < Math.min(a[1], b[1])) return false;
  return onSegment(a, c, d) || onSegment(b, c, d) || onSegment(c, a, b) || onSegment(d, a, b)
    || orientation(a, b, c) * orientation(a, b, d) < 0 && orientation(c, d, a) * orientation(c, d, b) < 0;
}
/** Boundary is deliberately distinct from strict containment. */
function inside(point: Point, ring: Ring): -1 | 0 | 1 {
  let contained = false;
  for (let i = 0; i < ring.length - 1; i++) {
    const a = ring[i]!, b = ring[i + 1]!;
    if (onSegment(point, a, b)) return 0;
    if ((a[1] > point[1]) !== (b[1] > point[1]) && point[0] < (b[0] - a[0]) * (point[1] - a[1]) / (b[1] - a[1]) + a[0]) contained = !contained;
  }
  return contained ? 1 : -1;
}
function closedRings(parts: Ring[]): Ring[] | null {
  const remaining = [...parts], rings: Ring[] = [];
  while (remaining.length) {
    const ring = [...remaining.pop()!];
    while (!samePoint(ring[0]!, ring.at(-1)!)) {
      const matches = remaining.flatMap((p, index) => samePoint(ring.at(-1)!, p[0]!) ? [{ index, reverse: false }] : samePoint(ring.at(-1)!, p.at(-1)!) ? [{ index, reverse: true }] : []);
      if (matches.length !== 1) return null;
      const match = matches[0]!, next = remaining.splice(match.index, 1)[0]!;
      ring.push(...(match.reverse ? [...next].reverse() : next).slice(1));
    }
    if (ring.length < 4 || rings.length >= 8) return null;
    rings.push(ring);
  }
  return rings;
}
/** Exact segment sweep: every pair with overlapping x bounds is checked.
 * A work cap rejects hostile dense geometry instead of weakening topology. */
function validTopology(rings: Ring[], deadline: number) {
  const segments: Array<{ a: Point; b: Point; ring: number; index: number; last: number; minX: number; maxX: number }> = [];
  for (let r = 0; r < rings.length; r++) {
    const ring = rings[r]!;
    const area = ring.slice(0, -1).reduce((sum, point, i) => sum + point[0] * ring[i + 1]![1] - ring[i + 1]![0] * point[1], 0);
    if (Math.abs(area) <= 1e-12) return false;
    for (let i = 0; i < ring.length - 1; i++) {
      const a = ring[i]!, b = ring[i + 1]!;
      if (samePoint(a, b) || Math.abs(a[0] - b[0]) > 180 || Date.now() > deadline) return false;
      segments.push({ a, b, ring: r, index: i, last: ring.length - 2, minX: Math.min(a[0], b[0]), maxX: Math.max(a[0], b[0]) });
    }
  }
  segments.sort((a, b) => a.minX - b.minX);
  let comparisons = 0;
  for (let i = 0; i < segments.length; i++) {
    if (Date.now() > deadline) return false;
    const a = segments[i]!;
    for (let j = i + 1; j < segments.length && segments[j]!.minX <= a.maxX; j++) {
      if (++comparisons > 8_000_000) return false;
      const b = segments[j]!;
      if (!intersects(a.a, a.b, b.a, b.b)) continue;
      const adjacent = a.ring === b.ring && (Math.abs(a.index - b.index) === 1 || Math.min(a.index, b.index) === 0 && Math.max(a.index, b.index) === a.last);
      if (!adjacent) return false;
      // Adjacent edges may share their endpoint, but cannot overlap/backtrack.
      const unsharedA = samePoint(a.a, b.a) || samePoint(a.a, b.b) ? a.b : a.a;
      const unsharedB = samePoint(b.a, a.a) || samePoint(b.a, a.b) ? b.b : b.a;
      if (onSegment(unsharedA, b.a, b.b) || onSegment(unsharedB, a.a, a.b)) return false;
    }
  }
  return true;
}
export function physicalGeometry(raw: unknown, expected: { id: number; type: 'way' | 'relation'; name: string; country: string }, deadline: number) {
  const body = raw as { elements?: Array<{ type?: string; id?: number; tags?: Record<string, string>; geometry?: Array<{ lon?: unknown; lat?: unknown }>; members?: Array<{ type?: string; role?: string; geometry?: Array<{ lon?: unknown; lat?: unknown }> }> }>; osm3s?: { timestamp_osm_base?: string } };
  if (!body || !Array.isArray(body.elements) || body.elements.length !== 1) return null;
  const element = body.elements[0]!, tags = element.tags ?? {}, timestamp = body.osm3s?.timestamp_osm_base;
  if (element.type !== expected.type || element.id !== expected.id || tags.place !== 'island' || tags.boundary
    || normalizeIslandName(tags['name:en'] ?? tags.int_name ?? tags.name ?? '') !== normalizeIslandName(expected.name)
    || tags.country && !sameCountry(tags.country, expected.country)
    || tags['ISO3166-1'] && !sameCountry(tags['ISO3166-1'], expected.country)
    || !timestamp || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(timestamp) || !Number.isFinite(Date.parse(timestamp))) return null;
  if (expected.type === 'relation' && (tags.type !== 'multipolygon' || !Array.isArray(element.members) || element.members.length > 600)) return null;
  const members = expected.type === 'way' ? [{ type: 'way', role: 'outer', geometry: element.geometry }] : element.members!;
  const outerParts: Ring[] = [], innerParts: Ring[] = []; let count = 0;
  for (const member of members) {
    if (member.type !== 'way' || !['outer', 'inner'].includes(member.role ?? '') || !Array.isArray(member.geometry) || member.geometry.length < 2) return null;
    const points = member.geometry.map(p => [p.lon, p.lat]);
    count += points.length;
    if (count > maximumPoints || !points.every(validIslandPoint)) return null;
    (member.role === 'outer' ? outerParts : innerParts).push(points as Ring);
  }
  const outer = closedRings(outerParts), inner = closedRings(innerParts);
  if (!outer?.length || !inner || !validTopology([...outer, ...inner], deadline)) return null;
  for (const rings of [outer, inner]) for (let i = 0; i < rings.length; i++) for (let j = i + 1; j < rings.length; j++) {
    if (inside(rings[i]![0]!, rings[j]!) >= 0 || inside(rings[j]![0]!, rings[i]!) >= 0) return null;
  }
  for (const hole of inner) if (!outer.some(shell => inside(hole[0]!, shell) === 1)) return null;
  return { outer, inner, timestamp };
}

export function physicalContains(geometry: PhysicalIslandGeometry, point: Point) {
  return validIslandPoint(point) && geometry.outer.some(r => inside(point, r) === 1)
    && geometry.outer.every(r => inside(point, r) !== 0) && geometry.inner.every(r => inside(point, r) === -1);
}

/** Select a complete land component from independently tagged coastline ways.
 * The named identity point selects the component; no administrative polygon,
 * bbox, nearest ring or invented connecting segment establishes containment. */
export function physicalCoastlineGeometry(raw: unknown, identityPoint: Point, deadline: number): (PhysicalIslandGeometry & { wayIds: number[] }) | null {
  const body = raw as { osm3s?: { timestamp_osm_base?: string }; elements?: Array<{ type?: string; id?: number; tags?: Record<string, string>; geometry?: Array<{ lon?: unknown; lat?: unknown }> }> };
  const timestamp = body?.osm3s?.timestamp_osm_base;
  if (!timestamp || !Number.isFinite(Date.parse(timestamp)) || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(timestamp)
    || !validIslandPoint(identityPoint) || !Array.isArray(body.elements) || !body.elements.length || body.elements.length > 600) return null;
  const ways: Array<{ id: number; points: Ring }> = []; const ids = new Set<number>(); let points = 0;
  for (const e of body.elements) {
    if (e.type !== 'way' || !Number.isSafeInteger(e.id) || e.id! <= 0 || ids.has(e.id!) || e.tags?.natural !== 'coastline'
      || e.tags.boundary || e.tags.maritime || !Array.isArray(e.geometry) || e.geometry.length < 2) return null;
    const ring = e.geometry.map(p => [p.lon, p.lat]); points += ring.length;
    if (points > maximumPoints || !ring.every(validIslandPoint)) return null;
    ids.add(e.id!); ways.push({ id: e.id!, points: ring as Ring });
  }
  const ends = new Map<string, number[]>(); const key = (point: Point) => point.join(',');
  ways.forEach((way, index) => { for (const p of [way.points[0]!, way.points.at(-1)!]) ends.set(key(p), [...(ends.get(key(p)) ?? []), index]); });
  const remaining = new Set(ways.map((_, i) => i)); const selected: Array<PhysicalIslandGeometry & { wayIds: number[] }> = [];
  while (remaining.size) {
    const queue = [remaining.values().next().value!]; const component: number[] = [];
    while (queue.length) {
      const index = queue.pop()!; if (!remaining.delete(index)) continue; component.push(index);
      const way = ways[index]!; for (const point of [way.points[0]!, way.points.at(-1)!]) queue.push(...ends.get(key(point))!);
    }
    const rings = closedRings(component.map(i => ways[i]!.points));
    if (!rings || !validTopology(rings, deadline) || Date.now() > deadline) return null;
    const containing = rings.filter(r => inside(identityPoint, r) === 1);
    if (containing.length) {
      // A physical island record covers one uniquely identified closed land
      // component. Nested/touching or multiple identity matches stay unknown.
      if (rings.length !== 1 || containing.length !== 1) return null;
      selected.push({ outer: rings, inner: [], timestamp, wayIds: component.map(i => ways[i]!.id).sort((a, b) => a - b) });
    }
  }
  return selected.length === 1 ? selected[0]! : null;
}
