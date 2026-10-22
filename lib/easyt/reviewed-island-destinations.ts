import registry from '../../data/place-reference/reviewed-island-destinations.json' with { type: 'json' };
import { countryCodeFor } from './country-registry.ts';
import { REFERENCE_SNAPSHOT_ID, referenceRecordKey, type ReferencePlaceRecord } from './place-reference.ts';
import type { PlanningParentConstraint } from './place-intelligence.ts';

/** Small reviewed relationships, not a replacement geography database. Raw
 * saved identities never change. Every point/provider is from the pinned data. */
export const REVIEWED_ISLAND_DESTINATIONS = registry;
// Immutable review anchor: a self-consistent edit of the JSON is not a new
// authority to move or rename this gateway. Snapshot updates require review.
const gatewayProviderPin = 'reference:ourairports:26751@699b595afdba9be6994e:ID:transport_gateway:115.167123:-8.748409';
const gatewayNamePin = 'Denpasar I Gusti Ngurah Rai International Airport';
const normalized = (name: string) => name.normalize('NFKD').toLocaleLowerCase().trim();
function activeRecord(raw: typeof registry.gateway | typeof registry.bases[number]): ReferencePlaceRecord | undefined {
  if (registry.version !== 1 || registry.referenceSnapshotId !== REFERENCE_SNAPSHOT_ID || raw.status !== 'active'
    || raw.countryCode !== registry.island.countryCode || !Array.isArray(raw.coordinates) || raw.coordinates.length !== 2 || !raw.coordinates.every(Number.isFinite)
    || Math.abs(raw.coordinates[0]!) > 180 || Math.abs(raw.coordinates[1]!) > 90
    || raw.canonicalPlaceId !== `reference:${raw.source}:${raw.sourceId}`
    || !['geonames', 'ourairports'].includes(raw.source) || !['town', 'transport_gateway'].includes(raw.placeType)) return;
  const record: ReferencePlaceRecord = { ...raw, source: raw.source === 'geonames' ? 'geonames' : 'ourairports',
    status: 'active', placeType: raw.placeType === 'town' ? 'town' : 'transport_gateway',
    coordinates: [raw.coordinates[0]!, raw.coordinates[1]!], aliases: [] };
  return record.providerId === referenceRecordKey(record, REFERENCE_SNAPSHOT_ID) ? record : undefined;
}
export function reviewedIslandParent(parent: PlanningParentConstraint) {
  return parent.canonicalPlaceId === registry.island.canonicalPlaceId && parent.placeType === registry.island.placeType
    && normalized(parent.canonicalName) === normalized(registry.island.canonicalName)
    && parent.parentCountries.length === 1 && countryCodeFor(parent.parentCountries[0]) === registry.island.countryCode;
}
export function reviewedIslandBaseRecords(): ReferencePlaceRecord[] {
  const records = registry.bases.map(activeRecord);
  return records.every(Boolean) ? records as ReferencePlaceRecord[] : [];
}
export function reviewedIslandGatewayRecord(): ReferencePlaceRecord | undefined {
  const gateway = activeRecord(registry.gateway);
  return gateway?.source === 'ourairports' && gateway.placeType === 'transport_gateway'
    && gateway.scheduledService === true && gateway.iataCode === 'DPS' && gateway.icaoCode === 'WADD'
    && gateway.providerId === gatewayProviderPin && gateway.canonicalName === gatewayNamePin ? gateway : undefined;
}
export function reviewedIslandGatewayForBase(input: {canonicalPlaceId?: string; providerId?: string; name: string; country?: string; coordinates?: readonly number[] | null}) {
  const base = reviewedIslandBaseRecords().find(record => record.canonicalPlaceId === input.canonicalPlaceId);
  if (!base || input.providerId !== base.providerId || normalized(input.name) !== normalized(base.canonicalName)
    || countryCodeFor(input.country) !== base.countryCode || input.coordinates?.length !== 2
    || !base.coordinates.every((point, index) => point === input.coordinates![index])) return;
  return reviewedIslandGatewayRecord();
}
