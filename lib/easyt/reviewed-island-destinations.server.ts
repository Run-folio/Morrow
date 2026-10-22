import { countryFor } from './country-registry.ts';
import { referencePlaceById } from './place-reference.server.ts';
import { REVIEWED_ISLAND_DESTINATIONS, reviewedIslandParent, reviewedIslandBaseRecords } from './reviewed-island-destinations.ts';
import type { PlaceProviderCandidate, PlanningParentConstraint } from './place-intelligence.ts';

/** Covered-invalid fails closed. Exact reviewed membership is a different
 * proof from physical containment, and is labelled as such in every response. */
export function reviewedIslandBaseSeeds(parent: PlanningParentConstraint): PlaceProviderCandidate[] | undefined {
  if (!reviewedIslandParent(parent)) return undefined;
  const pins = reviewedIslandBaseRecords();
  if (!pins.length) throw new Error('Reviewed island reference snapshot unavailable');
  return pins.map(pin => {
    const record = referencePlaceById(pin.canonicalPlaceId);
    if (!record || record.status !== 'active' || record.providerId !== pin.providerId || record.canonicalName !== pin.canonicalName
      || record.placeType !== pin.placeType || record.countryCode !== pin.countryCode
      || !record.coordinates.every((value, index) => value === pin.coordinates[index])) throw new Error('Reviewed island base identity changed');
    return { canonicalPlaceId: record.canonicalPlaceId, providerId: record.providerId, canonicalName: record.canonicalName,
      aliases: [...record.aliases], placeType: record.placeType, parentCountries: [countryFor(record.countryCode)!.name],
      coordinates: [...record.coordinates], routability: 'direct_destination', matchQuality: 'exact', rankScore: 0,
      providerSourceLabel: 'GeoNames + reviewed Indonesia Tourism membership' };
  });
}
export function normalizeReviewedIslandBaseCandidates(candidates: PlaceProviderCandidate[], parent: PlanningParentConstraint): PlaceProviderCandidate[] | undefined {
  const seeds = reviewedIslandBaseSeeds(parent); if (seeds === undefined) return undefined;
  // A finite reviewed list certifies only these exact tuples. Unlisted towns,
  // airports, province records and other same-name settlements are not approved.
  return candidates.flatMap(candidate => {
    const pin = seeds.find(seed => seed.canonicalPlaceId === candidate.canonicalPlaceId);
    if (!pin || candidate.providerId !== pin.providerId || candidate.canonicalName !== pin.canonicalName
      || candidate.placeType !== pin.placeType || candidate.routability !== 'direct_destination'
      || candidate.parentCountries?.length !== 1 || candidate.parentCountries[0] !== pin.parentCountries![0]
      || candidate.coordinates?.length !== 2 || !pin.coordinates!.every((value, index) => value === candidate.coordinates![index])) return [];
    return [{ ...candidate, parentRegionId: REVIEWED_ISLAND_DESTINATIONS.island.canonicalName,
      providerSourceLabel: pin.providerSourceLabel,
      normalizationReason: `Reviewed island membership: Bali; settlement=${candidate.canonicalPlaceId}; snapshot=${REVIEWED_ISLAND_DESTINATIONS.referenceSnapshotId}; checked=${REVIEWED_ISLAND_DESTINATIONS.reviewedAt}; source=Indonesia Tourism; coverage=reviewed-subset` }];
  });
}
