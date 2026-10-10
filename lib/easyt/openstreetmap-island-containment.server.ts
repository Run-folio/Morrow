import { countryCodeFor } from './country-registry.ts';
import { searchPhotonTravelCandidates } from './photon-place.server.ts';
import { isOvernightBaseEligible, type PlaceProviderCandidate, type PlanningParentConstraint } from './place-intelligence.ts';

type Point = [number, number];
type Ring = Point[];
const endpoints = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
const maximumBodyBytes = 4_000_000;
const maximumPoints = 60_000;
const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const sameCountry = (left: string, right: string) => Boolean(countryCodeFor(left) && countryCodeFor(left) === countryCodeFor(right)) || normalize(left) === normalize(right);
const samePoint = (a: Point, b: Point) => a[0] === b[0] && a[1] === b[1];
const validPoint = (p: unknown): p is Point => Array.isArray(p) && p.length === 2 && p.every(x => typeof x === 'number' && Number.isFinite(x)) && Math.abs(p[0]) <= 180 && Math.abs(p[1]) <= 90;
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
function physicalGeometry(raw: unknown, expected: { id: number; type: 'way' | 'relation'; name: string; country: string }, deadline: number) {
  const body = raw as { elements?: Array<{ type?: string; id?: number; tags?: Record<string, string>; geometry?: Array<{ lon?: unknown; lat?: unknown }>; members?: Array<{ type?: string; role?: string; geometry?: Array<{ lon?: unknown; lat?: unknown }> }> }>; osm3s?: { timestamp_osm_base?: string } };
  if (!body || !Array.isArray(body.elements) || body.elements.length !== 1) return null;
  const element = body.elements[0]!, tags = element.tags ?? {}, timestamp = body.osm3s?.timestamp_osm_base;
  if (element.type !== expected.type || element.id !== expected.id || tags.place !== 'island' || tags.boundary
    || normalize(tags['name:en'] ?? tags.int_name ?? tags.name ?? '') !== normalize(expected.name)
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
    if (count > maximumPoints || !points.every(validPoint)) return null;
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
async function geometryBody(response: Response) {
  if (!response.ok) throw new Error('Existing island geometry provider unavailable');
  const reader = response.body?.getReader(); if (!reader) throw new Error('Existing island geometry provider unavailable');
  const decoder = new TextDecoder(); let text = '', bytes = 0;
  try {
    while (true) {
      const chunk = await reader.read(); if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > maximumBodyBytes) throw new Error('Island geometry exceeds the bounded lookup limit');
      text += decoder.decode(chunk.value, { stream: true });
    }
    return JSON.parse(text + decoder.decode()) as unknown;
  } finally { await reader.cancel().catch(() => {}); }
}

/** Existing-provider fact normalization only. No requested parent label, admin
 * hierarchy, rectangle or proximity can replace the physical polygon check. */
export async function normalizePhysicalIslandBaseCandidates(candidates: PlaceProviderCandidate[], parent: PlanningParentConstraint, options: { fetchImpl?: typeof fetch; signal?: AbortSignal } = {}): Promise<PlaceProviderCandidate[]> {
  if (parent.placeType !== 'island') return candidates;
  if (candidates.length > 16 || parent.parentCountries.length !== 1 || !countryCodeFor(parent.parentCountries[0])) return [];
  const eligible = candidates.filter(c => validPoint(c.coordinates) && isOvernightBaseEligible({ placeType: c.placeType, routability: c.routability ?? 'direct_destination' })
    && parent.parentCountries.length === 1 && c.parentCountries?.some(country => sameCountry(country, parent.parentCountries[0]!)));
  if (!eligible.length) return [];
  const fetchImpl = options.fetchImpl ?? fetch, deadline = Date.now() + 15_000;
  const signalFor = (ms: number) => options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(ms)]) : AbortSignal.timeout(ms);
  const found = await searchPhotonTravelCandidates(parent.canonicalName, { travelIntent: 'planning-area', explicitCountryNames: parent.parentCountries, countryNames: parent.parentCountries }, fetchImpl, { signal: signalFor(2_500) });
  const islands = found.filter(c => c.placeType === 'island' && c.matchQuality === 'exact' && normalize(c.canonicalName) === normalize(parent.canonicalName)
    && c.parentCountries?.some(country => sameCountry(country, parent.parentCountries[0]!)) && /^[RW]:\d+$/.test(c.providerId));
  const identities = new Set(islands.map(c => c.providerId)); if (identities.size !== 1) return [];
  const island = islands[0]!, [kind, rawId] = island.providerId.split(':'), type = kind === 'R' ? 'relation' : 'way', id = Number(rawId);
  if (!Number.isSafeInteger(id) || id <= 0 || Date.now() > deadline) return [];
  const query = `[out:json][timeout:8];${type}(${id});out geom;`;
  const results = await Promise.allSettled(endpoints.map(async endpoint => geometryBody(await fetchImpl(endpoint, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8', 'User-Agent': 'Morrovia trip planner/1.0 (https://morrovia.com)' },
    body: new URLSearchParams({ data: query }), signal: signalFor(10_000), next: { revalidate: 86_400 },
  }))));
  const available = results.flatMap(r => r.status === 'fulfilled' ? [r.value] : []);
  if (!available.length) throw new Error('Existing island geometry providers unavailable');
  const geometries = available.map(body => physicalGeometry(body, { id, type, name: island.canonicalName, country: parent.parentCountries[0]! }, deadline));
  if (geometries.some(g => !g) || Date.now() > deadline) return [];
  return eligible.flatMap(candidate => {
    const point = candidate.coordinates!;
    if (!geometries.every(g => g!.outer.some(r => inside(point, r) === 1) && g!.outer.every(r => inside(point, r) !== 0) && g!.inner.every(r => inside(point, r) === -1))) return [];
    const timestamp = geometries.map(g => g!.timestamp).sort().at(-1)!;
    // Essential evidence precedes the name and fits the existing 240-char
    // normalization boundary. The settlement identity/point are unchanged.
    const proof = `Physical island verified: OSM ${type}:${id}; timestamp=${timestamp}; point=${point.join(',')}; country=${countryCodeFor(parent.parentCountries[0]!)}; result=strict-inside/outside-holes; name=${island.canonicalName}`;
    return [{ ...candidate, parentRegionId: island.canonicalName, providerSourceLabel: `${candidate.providerSourceLabel ?? 'Settlement geography'} + OpenStreetMap`, normalizationReason: proof.slice(0, 240) }];
  });
}
