import type { CanonicalPlaceSuggestion, PlaceType } from './place-intelligence.ts';
import { referenceGeographicAcceptanceMatches } from './place-reference.ts';
import { PUBLIC_PLACE_NOTICE_VERSION, type CompletedPlaceSearchResult, submittedPublicPlaceInput } from './public-place-search-input.ts';

export async function searchCompletedPlaceCandidates(query: string, signal: AbortSignal, publicPlaceResearch = false): Promise<CompletedPlaceSearchResult> {
  // Only an explicit comma-separated country is a country hint; never trip context.
  const {query:place,country}=submittedPublicPlaceInput(query);
  const response = await fetch('/api/journey-geocode', {method:'POST',signal,cache:'no-store',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({place,...(country?{country}:{}),...(publicPlaceResearch?{research:true,noticeVersion:PUBLIC_PLACE_NOTICE_VERSION}:{})})});
  if (!response.ok) throw new Error("place search unavailable");
  const payload = await response.json() as { publicResearchAvailable?: boolean; candidates?: Array<{
    canonicalPlaceId?: string; name: string; country: string; region?: string;
    administrativeHierarchy?: string[]; accessPlaceName?: string; providerId?: string;
    referenceSnapshotId?: string; providerSourceLabel?: string; normalizationReason?: string;
    scheduledService?: boolean;
    coordinates: [number, number]; bounds?: CanonicalPlaceSuggestion["bounds"];
    placeType?: PlaceType; kind?: string; routability?: CanonicalPlaceSuggestion["routability"];
  }> };
  const suggestions = (payload.candidates ?? []).filter(referenceGeographicAcceptanceMatches).map((candidate) => {
    const placeType = candidate.placeType ?? (candidate.kind === "city" ? "city" : "unknown");
    const canonicalPlaceId = candidate.canonicalPlaceId ?? (candidate.providerId
      ? `open-world:${candidate.providerId}` : `provider:${candidate.country}:${candidate.name}`);
    return {
      canonicalPlaceId, referenceSnapshotId: candidate.referenceSnapshotId, name: candidate.name,
      scheduledService: candidate.scheduledService,
      label: `${candidate.name}${candidate.region ? ` · ${candidate.region}` : ""}, ${candidate.country}`,
      country: candidate.country, region: candidate.region,
      administrativeHierarchy: candidate.administrativeHierarchy,
      accessPlaceName: candidate.accessPlaceName, placeType, coordinates: candidate.coordinates,
      bounds: candidate.bounds, routability: candidate.routability,
      provenance: [{ id: candidate.providerId ?? canonicalPlaceId,
        label: candidate.providerSourceLabel ?? "Global place provider", kind: "provider" as const,
        supports: candidate.normalizationReason ?? "Global place-search candidate selected by the traveller." }],
    } satisfies CanonicalPlaceSuggestion;
  });
  return {suggestions,publicResearchAvailable:payload.publicResearchAvailable===true};
}
export const searchPublicPlaceCandidates = (query: string, signal: AbortSignal) => searchCompletedPlaceCandidates(query,signal,true);
