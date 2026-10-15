import type { CanonicalPlaceSuggestion } from '@/lib/easyt/place-intelligence';

// Exact identities/types/points from pinned GeoNames snapshot 699b595afdba9be6994e.
// Storybook simulates already verified results; it does not call the live island provider.
export const baliBaseFixtures: CanonicalPlaceSuggestion[] = [
  ['1645528', 'Denpasar', 'city', 115.21667, -8.65],
  ['1626932', 'Singaraja', 'city', 115.08818, -8.112],
  ['1622846', 'Ubud', 'town', 115.2654, -8.5098],
].map(([id, name, type, longitude, latitude]) => ({
  canonicalPlaceId: `reference:geonames:${id}`, referenceSnapshotId: '699b595afdba9be6994e',
  name: String(name), label: `${name}, Indonesia`, country: 'Indonesia', region: 'Bali',
  placeType: type as 'city' | 'town', routability: 'direct_destination',
  coordinates: [Number(longitude), Number(latitude)],
  provenance: [{ id: `reference:geonames:${id}@699b595afdba9be6994e:ID:${type}:${longitude}:${latitude}`,
    kind: 'provider', label: 'GeoNames', supports: 'Pinned settlement identity; simulated physical verification in Storybook.' }],
}));
