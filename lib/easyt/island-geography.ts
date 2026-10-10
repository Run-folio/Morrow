import bundledIndex from '../../data/place-reference/islands/index.json' with { type: 'json' };
import { countryCodeFor } from './country-registry.ts';
import type { PlanningParentConstraint } from './place-intelligence.ts';

export type IslandIndexEntry = { id: string; name: string; countryCode: string; aliases: string[]; identityId: string };
export type IslandGroupIndexEntry = IslandIndexEntry & { memberIslandIds: string[]; coverage: 'partial' };
export type IslandGeographyIndex = { version: number; snapshotId: string; islands: IslandIndexEntry[]; groups: IslandGroupIndexEntry[] };
const key = (name: string) => name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** Small coverage metadata only; physical source data never enters the client
 * bundle. A matching label requests server proof, not acceptance. */
export function coveredIslandParent(parent: PlanningParentConstraint, index: IslandGeographyIndex = bundledIndex as IslandGeographyIndex) {
  if (!['island', 'archipelago'].includes(parent.placeType) || parent.parentCountries.length !== 1) return undefined;
  const country = countryCodeFor(parent.parentCountries[0]); if (!country) return undefined;
  const entries = parent.placeType === 'island' ? index.islands : index.groups;
  const matches = entries.filter(entry => entry.countryCode === country && entry.aliases.some(alias => key(alias) === key(parent.canonicalName)));
  if (matches.length !== 1) return undefined;
  const entry = matches[0]!;
  const suppliedSourceId = parent.canonicalPlaceId?.match(/(?:^|:)(relation|way|R|W):(\d+)$/);
  if (suppliedSourceId) {
    const kind = ['relation', 'R'].includes(suppliedSourceId[1]!) ? 'relation' : 'way';
    if (`${kind}:${suppliedSourceId[2]}` !== entry.identityId) throw new Error('Conflicting covered island identity');
  }
  return entry;
}

export function requiresPhysicalIslandVerification(parent: PlanningParentConstraint) {
  return parent.placeType === 'island' || parent.placeType === 'archipelago' && Boolean(coveredIslandParent(parent));
}
