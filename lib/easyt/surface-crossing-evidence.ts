import { landConnectionEvidence } from './land-connection.ts';
import { placeDistanceKm } from './local-place-geography.ts';
import { REFERENCE_SNAPSHOT_ID } from './place-reference.ts';
import type { CanonicalRouteEndpoint } from './trip.ts';

type Side = {
  name: string;
  country: string;
  /** Physical gateway geometry is unknown until a terminal point is verified. */
  coordinates: null;
  scopeCentre: [number, number];
  scopeReferenceId: string;
  scopeName: string;
  /** Exact existing GeoNames record, used only to identify the access landmass. */
  landAnchor: [number, number];
  landAnchorReferenceId: string;
  coordinateProvenance: { source: 'geonames'; snapshotId: string };
  maximumAccessKm: number;
};
type Crossing = {
  id: string;
  mode: 'road' | 'ferry';
  sides: readonly [Side, Side];
  source: { label: string; url: string; supportingUrl?: string; reviewedAt: string; supports: string };
};
/** Bounded infrastructure components, not a catalogue of destination services.
 * Timing, availability and fares are intentionally absent. */
export const REVIEWED_SURFACE_CROSSINGS: readonly Crossing[] = [
  {
    id: 'ketapang-gilimanuk', mode: 'ferry',
    sides: [
      { name: 'Ketapang ferry port', country: 'Indonesia', coordinates: null, scopeCentre: [114.35755, -8.2325], scopeReferenceId: 'reference:geonames:1650077', scopeName: 'Banyuwangi', landAnchor: [114.35755, -8.2325], landAnchorReferenceId: 'reference:geonames:1650077', coordinateProvenance: { source: 'geonames', snapshotId: REFERENCE_SNAPSHOT_ID }, maximumAccessKm: 350 },
      { name: 'Gilimanuk ferry port', country: 'Indonesia', coordinates: null, scopeCentre: [114.61694, -8.35694], scopeReferenceId: 'reference:geonames:1634266', scopeName: 'Negara', landAnchor: [114.61694, -8.35694], landAnchorReferenceId: 'reference:geonames:1634266', coordinateProvenance: { source: 'geonames', snapshotId: REFERENCE_SNAPSHOT_ID }, maximumAccessKm: 200 },
    ],
    source: { label: 'ASDP Ketapang–Gilimanuk crossing', url: 'https://www.asdp.id/siaran-pers/layanan-ketapang-gilimanuk-diperkuat-regulator-dan-operator-penyeberangan-solid-jaga-keselamatan-dan-kelancaran-logistik', supportingUrl: 'https://dephub.go.id/post/read/lintasan-ketapang-gilimanuk-63027', reviewedAt: '2026-10-10', supports: 'Named ferry crossing and vehicle carriage; no current sailing, fare or stable duration assertion.' },
  },
  {
    id: 'oresund-fixed-link', mode: 'road',
    sides: [
      { name: 'Copenhagen fixed-link access', country: 'Denmark', coordinates: null, scopeCentre: [12.56553, 55.67594], scopeReferenceId: 'reference:geonames:2618425', scopeName: 'Copenhagen', landAnchor: [12.08035, 55.64152], landAnchorReferenceId: 'reference:geonames:2614481', coordinateProvenance: { source: 'geonames', snapshotId: REFERENCE_SNAPSHOT_ID }, maximumAccessKm: 25 },
      { name: 'Malmö fixed-link access', country: 'Sweden', coordinates: null, scopeCentre: [13.00073, 55.60587], scopeReferenceId: 'reference:geonames:2692969', scopeName: 'Malmö', landAnchor: [13.19321, 55.70584], landAnchorReferenceId: 'reference:geonames:2693678', coordinateProvenance: { source: 'geonames', snapshotId: REFERENCE_SNAPSHOT_ID }, maximumAccessKm: 25 },
    ],
    source: { label: 'Øresundsbron road and rail fixed link', url: 'https://www.oresundsbron.com/en/about-oresundsbron/about-us/facts-about-oresundsbron', reviewedAt: '2026-10-10', supports: 'Road and railway infrastructure linking Denmark and Sweden; not a train service, fare or journey duration.' },
  },
];
function matchesSide(endpoint: CanonicalRouteEndpoint, side: Side, mode: Crossing['mode']) {
  if (!endpoint.coordinates || endpoint.country?.trim().toLowerCase() !== side.country.toLowerCase()) return false;
  const distance = placeDistanceKm(endpoint.coordinates, side.scopeCentre);
  if (distance > side.maximumAccessKm) return false;
  if (landConnectionEvidence(endpoint.coordinates, side.landAnchor) === 'same-land') return true;
  // A coastal city point can be unproven in simplified geometry. Only the
  // exact existing city identity and point supported by the fixed-link source
  // can use this exception; a neighbouring island cannot borrow its access.
  return mode === 'road' && endpoint.canonicalPlaceId === side.scopeReferenceId
    && endpoint.name.trim().toLowerCase() === side.scopeName.toLowerCase()
    && endpoint.coordinates.every((value, index) => value === side.scopeCentre[index]);
}
export function findSurfaceCrossing(from: CanonicalRouteEndpoint, to: CanonicalRouteEndpoint, mode: Crossing['mode']) {
  for (const crossing of REVIEWED_SURFACE_CROSSINGS) {
    if (crossing.mode !== mode) continue;
    for (const reverse of [false, true]) {
      const [origin, destination] = reverse ? [crossing.sides[1], crossing.sides[0]] : crossing.sides;
      if (matchesSide(from, origin, mode) && matchesSide(to, destination, mode)) return { ...crossing, origin, destination };
    }
  }
  return undefined;
}
