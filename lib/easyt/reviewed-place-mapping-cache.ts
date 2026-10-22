import {countryCodeFor} from './country-registry.ts';
import {publicPlaceQueryAllowed} from './public-place-search-input.ts';
/** Read boundary only. Durable reader has no request-path publication or automatic learning.
 * An operator reviews public evidence and exact OSM taxonomy before publication.
 * Query keys must never include a trip, user/session ID, address or coordinates.
 */
export const PLACE_MAPPING_VERSION = 'public-place-v1';
export type PublicPlaceMappingKey = Readonly<{
  normalizedQuery: string; countryContext: string | null; intent: 'route-stop'; version: typeof PLACE_MAPPING_VERSION;
}>;
export type ReviewedPublicPlaceMapping = Readonly<{
  key: PublicPlaceMappingKey; status: 'reviewed'; alternateName: string;
  providerId: string; providerKey: string; providerKind: string; placeType: string; countryCode: string;
  sourceUrls: readonly string[]; reviewedAt: string; expiresAt: string;
}>;
export interface ReviewedPublicPlaceMappingReader {
  /** At most eight trusted reviewed public records. Distinct identities remain
   * ambiguous choices, never a preferred first row. No personal queries. */
  read(key: PublicPlaceMappingKey, signal: AbortSignal): Promise<readonly ReviewedPublicPlaceMapping[]>;
}
// The future adapter must validate key equality/version, review status, expiry,
// sources and exact identity/type/country on a fresh provider lookup. Do not trust
// a structurally typed record as evidence. Re-review on taxonomy/identity change.

export function placeMappingKey(query:string,country?:string):PublicPlaceMappingKey {
  if(!publicPlaceQueryAllowed(query,country))throw new Error('Public mapping key required');
  return {normalizedQuery:query.normalize('NFKC').toLocaleLowerCase().replace(/\s+/g,' ').trim(),countryContext:countryCodeFor(country)??null,intent:'route-stop',version:PLACE_MAPPING_VERSION};
}
