import { countryCodeFor, countryFor } from './country-registry.ts';

/** A narrow input shape plus the separate public-name action, not a PII detector.
 * Bare ambiguous names need an explicit country or a geographic descriptor. */
export function publicPlaceQueryAllowed(query: string, country?: string) {
  if (country && !countryCodeFor(country)) return false;
  return query.length >= 2 && query.length <= 80 && query.trim().split(/\s+/).length <= 8
    && /^[\p{L}\p{M} .’'()\-]+$/u.test(query)
    && !/\b(my|our|me|home|hotel reservation|address|street|road|avenue|please|ignore|instructions|email|phone|passport|booking|live|staying)\b/i.test(query)
    && Boolean(country || /\b(onsen|mountain|mount|village|hot spring|national park|island|lake|valley|falls|temple|monastery)\b/i.test(query));
}

export function submittedPublicPlaceInput(value: string) {
  const parts=value.split(',');
  const country=parts.length===2 ? countryFor(parts[1]?.trim()) : undefined;
  return {query:country ? parts[0]!.trim() : value,country:country?.name};
}

export const PUBLIC_PLACE_NOTICE_VERSION = 'public-place-alias-v3';
export type CompletedPlaceSearchResult = { suggestions: import('./place-intelligence.ts').CanonicalPlaceSuggestion[]; publicResearchAvailable: boolean };
