import {placeMappingKey,type ReviewedPublicPlaceMappingReader} from './reviewed-place-mapping-cache.ts';
import { publicPlaceQueryAllowed } from './public-place-search-input.ts';
import { countryCodeFor } from './country-registry.ts';
import type { OpenWorldTravelCandidate } from './open-world-place.server.ts';
import type { PlaceProviderCandidate } from './place-intelligence.ts';

// No trip, session, nearby coordinates, profile or conversation enters this API.
export type PublicPlaceResearchInput = {
  query: string; country?: string; publicPlaceConfirmed: boolean;
  deterministicCandidates: PlaceProviderCandidate[]; sourceFailed: boolean; signal: AbortSignal;
};
type Suggestion = { alternate_name: string };
export type PlaceResearchDependencies = {
  research: (query: string, country: string | undefined, signal: AbortSignal) => Promise<unknown>;
  lookup: (name: string, signal: AbortSignal) => Promise<{ candidates: PlaceProviderCandidate[]; sourceFailed: boolean }>;
  mappingReader?: ReviewedPublicPlaceMappingReader;
  timeoutMs?: number;
  onUnavailable?: () => void;
};
const normalize = (value: string) => value.normalize('NFKC').toLocaleLowerCase().replace(/\s+/g,' ').trim();

export { publicPlaceQueryAllowed } from './public-place-search-input.ts';
function object(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
function exactKeys(value: Record<string, unknown>, keys: string[]) { return Object.keys(value).length === keys.length && keys.every(key => key in value); }
function publicUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 500) return false;
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password && !url.port
    && !url.search && !url.hash && /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(url.hostname)
    && !/(^|\.)(localhost|local|internal|example|invalid|test)$/.test(url.hostname); } catch { return false; }
}
export function parsePlaceResearchResponse(response: unknown): Suggestion[] {
  if (!object(response) || response.status !== 'completed' || !Array.isArray(response.output)) return [];
  const texts: string[] = [];
  for (const item of response.output) {
    if (!object(item)) return [];
    // Reasoning may precede the single message. Tools and unknown output types
    // are forbidden; this path must never imply fresh external evidence.
    if (item.type === 'reasoning') continue;
    if (item.type !== 'message' || !Array.isArray(item.content)) return [];
    for (const part of item.content) {
      if (!object(part) || part.type !== 'output_text' || typeof part.text !== 'string') return [];
      texts.push(part.text);
    }
  }
  if (texts.length !== 1 || texts[0]!.length > 4000) return [];
  try {
    const value: unknown = JSON.parse(texts[0]!);
    if (!object(value) || !exactKeys(value,['status','candidates']) || value.status !== 'candidates'
      || !Array.isArray(value.candidates) || !value.candidates.length || value.candidates.length > 2) return [];
    const accepted: Suggestion[] = [];
    for (const candidate of value.candidates) {
      if (!object(candidate) || !exactKeys(candidate,['alternate_name'])
        || typeof candidate.alternate_name !== 'string' || candidate.alternate_name.length < 2 || candidate.alternate_name.length > 80
        || !/^[\p{L}\p{M} .’'()\-]+$/u.test(candidate.alternate_name)) return [];
      accepted.push({alternate_name:candidate.alternate_name});
    }
    return accepted;
  } catch { return []; }
}

function scenicFeature(key: string, value: string) {
  return key === 'natural' && ['peak','volcano','cliff','waterfall','glacier','lake','island','islet','bare_rock'].includes(value)
    || key === 'leisure' && ['nature_reserve','park'].includes(value)
    || key === 'boundary' && ['national_park','protected_area'].includes(value)
    || key === 'place' && ['island','islet'].includes(value);
}
function culturalFeature(key: string, value: string) {
  return key === 'tourism' && ['attraction','museum'].includes(value)
    || key === 'historic' && ['archaeological_site','monument','ruins','castle','memorial'].includes(value);
}
function verifiedCandidate(candidate: OpenWorldTravelCandidate, alias: string, country?: string) {
  const coordinates = candidate.coordinates;
  const code = candidate.parentCountries?.length === 1 ? countryCodeFor(candidate.parentCountries[0]) : undefined;
  return /^photon:[NWR]:[1-9]\d*$/.test(candidate.providerId)
    && typeof candidate.providerName === 'string' && normalize(candidate.providerName) === normalize(alias)
    && Boolean(candidate.providerKey && candidate.providerKind)
    && Boolean(code && (!country || code === countryCodeFor(country)))
    && Boolean(coordinates && coordinates.length === 2 && coordinates.every(Number.isFinite)
      && Math.abs(coordinates[0]!) <= 180 && Math.abs(coordinates[1]!) <= 90)
    && (['city','town'].includes(candidate.placeType) && candidate.providerKey === 'place'
      && ['city','town','village','hamlet','municipality','suburb','neighbourhood','locality'].includes(candidate.providerKind!) && candidate.routability === 'direct_destination'
      || ['natural_area','mountain_range','valley','island'].includes(candidate.placeType) && scenicFeature(candidate.providerKey!,candidate.providerKind!) && candidate.routability === 'needs_base_selection'
      || candidate.placeType === 'landmark' && culturalFeature(candidate.providerKey!,candidate.providerKind!) && candidate.routability === 'anchor_or_poi');
}

export async function enrichPublicPlaceSearch(input: PublicPlaceResearchInput, dependencies: PlaceResearchDependencies): Promise<PlaceProviderCandidate[]> {
  if (!input.publicPlaceConfirmed || input.sourceFailed || input.deterministicCandidates.length || input.signal.aborted
    || !publicPlaceQueryAllowed(input.query,input.country)) return [];
  const unavailable = () => { try { dependencies.onUnavailable?.(); } catch { /* observer only */ } };
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let cancel: (() => void) | undefined;
  const stopped = new Promise<PlaceProviderCandidate[]>(resolve => {
    cancel = () => { controller.abort(); resolve([]); };
    input.signal.addEventListener('abort',cancel,{once:true});
    timer = setTimeout(() => { unavailable(); cancel?.(); },Math.max(1,Math.min(dependencies.timeoutMs ?? 18_000,18_000)));
  });
  const work = async () => {
    if(dependencies.mappingReader){
      const key=placeMappingKey(input.query,input.country);
      const entries=await dependencies.mappingReader.read(key,controller.signal);
      if(controller.signal.aborted)return [];
      if(entries.length>8)throw new Error('Reviewed mapping unavailable');
      if(entries.length){
        const names=[...new Set(entries.map(entry=>entry.alternateName))];
        if(names.length>2)throw new Error('Reviewed mapping unavailable');
        const found=new Map<string,PlaceProviderCandidate[]>();
        for(const name of names){const result=await dependencies.lookup(name,controller.signal);if(controller.signal.aborted)return [];if(result.sourceFailed)throw new Error('Place source unavailable');found.set(name,result.candidates);}
        const verified=new Map<string,PlaceProviderCandidate>();
        for(const entry of entries){
          if(entry.status!=='reviewed'||entry.key.normalizedQuery!==key.normalizedQuery||entry.key.countryContext!==key.countryContext||entry.key.intent!==key.intent||entry.key.version!==key.version||!Number.isFinite(Date.parse(entry.expiresAt))||Date.parse(entry.expiresAt)<=Date.now()
            ||!entry.sourceUrls.length||!entry.sourceUrls.every(publicUrl))throw new Error('Reviewed mapping unavailable');
          const candidate=found.get(entry.alternateName)?.find((value:OpenWorldTravelCandidate)=>verifiedCandidate(value,entry.alternateName,input.country)
            &&value.providerId===entry.providerId&&value.providerKey===entry.providerKey&&value.providerKind===entry.providerKind&&value.placeType===entry.placeType
            &&countryCodeFor(value.parentCountries?.[0])===entry.countryCode);
          if(!candidate)throw new Error('Reviewed identity changed');
          verified.set(candidate.providerId,candidate);
        }
        // Do not guess around stale reviewed identities or reviewed ambiguity.
        return [...verified.values()];
      }
    }
    const response = await dependencies.research(input.query,input.country,controller.signal);
    if (controller.signal.aborted) return [];
    const aliases = parsePlaceResearchResponse(response);
    const candidates = new Map<string,PlaceProviderCandidate>();
    for (const alias of aliases) {
      if (controller.signal.aborted) return [];
      const result = await dependencies.lookup(alias.alternate_name,controller.signal);
      if (result.sourceFailed || controller.signal.aborted) return [];
      for (const candidate of result.candidates) if (verifiedCandidate(candidate,alias.alternate_name,input.country)) candidates.set(candidate.providerId,candidate);
    }
    // Conflicting countries remain unresolved; never ask AI to guess around ambiguity.
    return new Set([...candidates.values()].map(candidate => countryCodeFor(candidate.parentCountries![0]))).size > 1 ? [] : [...candidates.values()];
  };
  try { return await Promise.race([work().catch(() => { if (!controller.signal.aborted) unavailable(); return []; }),stopped]); }
  finally { clearTimeout(timer); if (cancel) input.signal.removeEventListener('abort',cancel); controller.abort(); }
}
