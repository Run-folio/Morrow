import {createReviewedPlaceMappingReader} from '@/lib/easyt/public-place-durable.server';
import { defaultPlaceResearchControls, publicPlaceResearchReady } from '@/lib/easyt/public-place-research-controls.server';
import { PlacePostError, readCompletedPlacePost } from '@/lib/easyt/public-place-post.server';
import { publicPlaceQueryAllowed } from '@/lib/easyt/public-place-search-input';
import { enrichPublicPlaceSearch } from '@/lib/easyt/public-place-research.server';
import { reviewedIslandBaseSeeds } from '@/lib/easyt/reviewed-island-destinations.server';
import { NextRequest, NextResponse } from "next/server";
import { destinationPlanningDecision } from "@/lib/easyt/destination-planning-policy";
import {referencePlaceById,referenceSnapshotId,referenceAreaBaseSeeds} from '@/lib/easyt/place-reference.server';
import {referenceSelectionMatches} from '@/lib/easyt/place-reference';
import {countryCodeFor,countryFor} from '@/lib/easyt/country-registry';
import { geocodeNearbyContext, needsDestinationConfirmation } from "@/lib/easyt/destination-resolution";
import { createOpenWorldPlaceProvider, searchOpenWorldNearbyBaseSuggestions, searchOpenWorldTravelCandidates } from "@/lib/easyt/open-world-place.server";
import { requiresPhysicalIslandVerification } from "@/lib/easyt/island-geography";
import { bundledIslandBaseSeeds } from "@/lib/easyt/island-geography.server";
import { normalizePhysicalIslandBaseCandidates } from "@/lib/easyt/openstreetmap-island-containment.server";
import { catalogPlaceForProviderIdentity, placeCandidateSuitableAsNearbyBase, placeCandidateWithinPlanningParent, type GeographicBounds, type NearbyBaseAnchor, type NearbyBaseSuggestion, type PlaceProviderCandidate, type PlaceType, type PlanningParentConstraint } from "@/lib/easyt/place-intelligence";

function normalise(value: string) {
  return value.toLocaleLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[’']/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

function matchesCountry(returnedCountry: string | undefined, requestedCountry: string) {
  const code=countryCodeFor(returnedCountry);if(code&&code===countryCodeFor(requestedCountry))return true;
  const returned = normalise(returnedCountry ?? "");
  const requested = normalise(requestedCountry);
  const aliases: Record<string, string[]> = {
    "united states": ["united states of america"],
    "united kingdom": ["united kingdom", "great britain"],
    "czech republic": ["czechia"],
    "ivory coast": ["cote divoire"],
    "south korea": ["republic of korea"],
    taiwan: ["taiwan"],
  };
  return returned === requested || (aliases[requested] ?? []).includes(returned);
}

function distanceFrom(nearby: [number, number] | undefined, candidate: PlaceProviderCandidate) {
  if (!nearby || !candidate.coordinates) return 0;
  const [longitude, latitude] = candidate.coordinates;
  const [nearbyLon, nearbyLat] = nearby;
  const radians = Math.PI / 180;
  const deltaLat = (latitude - nearbyLat) * radians;
  const deltaLon = (longitude - nearbyLon) * radians;
  const area = Math.sin(deltaLat / 2) ** 2 + Math.cos(nearbyLat * radians) * Math.cos(latitude * radians) * Math.sin(deltaLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(area), Math.sqrt(1 - area));
}

function responseCandidate(candidate: PlaceProviderCandidate) {
  const country = candidate.parentCountries?.[0] ?? "";
  const catalogPlace = candidate.providerId.startsWith('reference:')?undefined:catalogPlaceForProviderIdentity({
    canonicalName: candidate.canonicalName,
    placeType: candidate.placeType,
    parentCountries: candidate.parentCountries ?? [],
    coordinates: candidate.coordinates,
  });
  return {
    canonicalPlaceId: candidate.providerId.startsWith('reference:')?candidate.canonicalPlaceId:catalogPlace?.canonicalPlaceId ?? `open-world:${candidate.providerId}`,
    name: candidate.canonicalName,
    country,
    countryCode: "countryCode" in candidate && typeof candidate.countryCode === "string" ? candidate.countryCode : undefined,
    region: candidate.parentRegionId,
    administrativeHierarchy: candidate.administrativeHierarchy,
    accessPlaceName: candidate.accessPlaceName,
    providerId: candidate.providerId,
    providerSourceLabel: candidate.providerSourceLabel,
    normalizationReason: candidate.normalizationReason,
    coordinates: candidate.coordinates,
    bounds: candidate.bounds,
    kind: candidate.placeType,
    placeType: candidate.placeType,
    locality: candidate.placeType === "city" || candidate.placeType === "town" ? candidate.canonicalName : undefined,
    routability: candidate.routability,
    matchQuality: candidate.matchQuality,
    rankScore: candidate.rankScore,
    matchedAirportCode: candidate.matchedAirportCode,
    matchedIcaoCode: candidate.matchedIcaoCode,
    scheduledService:candidate.scheduledService,
    referenceSnapshotId: candidate.providerId.startsWith('reference:')?referenceSnapshotId():undefined,
  };
}

function validReferenceCandidate(candidate:PlaceProviderCandidate){
  if(!candidate.providerId.startsWith('reference:'))return true;
  const record=referencePlaceById(candidate.canonicalPlaceId??'');
  return Boolean(record&&candidate.coordinates&&candidate.canonicalName===record.canonicalName
    &&referenceSelectionMatches({canonicalPlaceId:candidate.canonicalPlaceId!,providerId:candidate.providerId,country:candidate.parentCountries?.[0]??'',placeType:candidate.placeType,coordinates:candidate.coordinates},record,referenceSnapshotId())
    &&(!candidate.matchedAirportCode||candidate.matchedAirportCode===record.iataCode)
    &&(!candidate.matchedIcaoCode||candidate.matchedIcaoCode===record.icaoCode));
}

const planningParentTypes = new Set<PlaceType>(["continent", "country", "macro_region", "region", "sub_region", "island", "archipelago", "natural_area", "coast", "mountain_range", "valley", "travel_corridor"]);
const nearbyAnchorTypes = new Set<PlaceType>(["island", "archipelago", "natural_area", "coast", "mountain_range", "valley", "travel_corridor", "landmark"]);

function finiteQueryNumber(request: NextRequest, key: string) {
  const raw = request.nextUrl.searchParams.get(key);
  if (raw === null || raw.trim() === "") return undefined;
  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
}

function planningParentFromRequest(request: NextRequest): PlanningParentConstraint | undefined {
  const canonicalName = request.nextUrl.searchParams.get("parentName")?.trim();
  const rawType = request.nextUrl.searchParams.get("parentType")?.trim() as PlaceType | undefined;
  if (!canonicalName || !rawType || !planningParentTypes.has(rawType)) return undefined;
  const parentCountries = request.nextUrl.searchParams.getAll("parentCountry").map((country) => country.trim()).filter(Boolean);
  const boundsValues = {
    south: finiteQueryNumber(request, "parentSouth"),
    west: finiteQueryNumber(request, "parentWest"),
    north: finiteQueryNumber(request, "parentNorth"),
    east: finiteQueryNumber(request, "parentEast"),
  };
  const bounds = Object.values(boundsValues).every((value) => value !== undefined)
    ? boundsValues as GeographicBounds
    : undefined;
  return {
    canonicalPlaceId: request.nextUrl.searchParams.get("parentId")?.trim() || undefined,
    canonicalName,
    placeType: rawType,
    parentCountries: parentCountries.length ? parentCountries : rawType === "country" ? [canonicalName] : [],
    bounds,
  };
}

function nearbyAnchorFromRequest(request: NextRequest): NearbyBaseAnchor | undefined {
  const canonicalName = request.nextUrl.searchParams.get("anchorName")?.trim();
  const placeType = request.nextUrl.searchParams.get("anchorType")?.trim() as PlaceType | undefined;
  const longitude = finiteQueryNumber(request, "anchorLon");
  const latitude = finiteQueryNumber(request, "anchorLat");
  const parentCountries = request.nextUrl.searchParams.getAll("anchorCountry").map((country) => country.trim()).filter(Boolean);
  if (!canonicalName || !placeType || !nearbyAnchorTypes.has(placeType)
    || longitude === undefined || latitude === undefined
    || longitude < -180 || longitude > 180 || latitude < -90 || latitude > 90
    || !parentCountries.length) return undefined;
  return {
    canonicalPlaceId: request.nextUrl.searchParams.get("anchorId")?.trim() || undefined,
    canonicalName,
    placeType,
    parentCountries,
    parentRegionId: request.nextUrl.searchParams.get("anchorRegion")?.trim() || undefined,
    accessPlaceName: request.nextUrl.searchParams.get("anchorAccessPlace")?.trim().slice(0, 140) || undefined,
    coordinates: [longitude, latitude],
  };
}

function responseNearbyCandidate(candidate: NearbyBaseSuggestion) {
  const providerId = candidate.provenance.find(source => source.kind === "provider")?.id;
  if (providerId?.startsWith("reference:") && (!validReferenceCandidate({
    canonicalPlaceId: candidate.canonicalPlaceId, providerId, canonicalName: candidate.name,
    parentCountries: [candidate.country], placeType: candidate.placeType, coordinates: candidate.coordinates,
  }) || candidate.referenceSnapshotId !== referenceSnapshotId())) return null;
  return {
    canonicalPlaceId: candidate.canonicalPlaceId,
    name: candidate.name,
    label: candidate.label,
    country: candidate.country,
    region: candidate.region,
    coordinates: candidate.coordinates,
    placeType: candidate.placeType,
    routability: candidate.routability,
    providerId,
    referenceSnapshotId: candidate.referenceSnapshotId,
    providerSourceLabel: candidate.provenance[0]?.label,
    distanceKm: candidate.distanceKm,
    containment: candidate.containment,
    confidence: candidate.confidence,
    provenance: candidate.provenance,
    reason: candidate.reason,
  };
}

async function resolvePlaceRequest(request: NextRequest, researchConfirmed=false) {
  const mode=request.nextUrl.searchParams.get('mode');
  if(mode!==null&&mode!=='autocomplete'&&mode!=='resolve')return NextResponse.json({result:null},{status:400});
  if(mode==='autocomplete'&&request.nextUrl.searchParams.get('nearbyBases')==='1')return NextResponse.json({candidates:[],status:'explicit-nearby-search-required'});
  if (request.nextUrl.searchParams.get("areaBases") === "1") {
    if (mode === "autocomplete") return NextResponse.json({ candidates: [], status: "explicit-area-search-required" });
    const parent = planningParentFromRequest(request);
    if (!parent || parent.canonicalName.length > 140 || parent.parentCountries.length !== 1
      || !countryCodeFor(parent.parentCountries[0])
      || destinationPlanningDecision(parent, { intent: "explicit-area" }).behavior !== "choose-base")
      return NextResponse.json({ candidates: [], status: "invalid-parent" }, { status: 400 });
    parent.parentCountries = [countryFor(parent.parentCountries[0])!.name];
    try {
      // Covered islands discover exact settlements from accepted bindings;
      // uncovered administrative facts only seed the live physical check.
      // Every offered settlement needs physical or exact reviewed membership proof.
      if (!requiresPhysicalIslandVerification(parent)) return NextResponse.json({ candidates: [], status: "empty" });
      const seeds = (reviewedIslandBaseSeeds(parent) ?? bundledIslandBaseSeeds(parent) ?? referenceAreaBaseSeeds(parent)).filter(validReferenceCandidate)
        .filter(candidate => candidate.parentCountries?.length === 1 && matchesCountry(candidate.parentCountries[0], parent.parentCountries[0]!));
      const verified = seeds.length ? await normalizePhysicalIslandBaseCandidates(seeds, parent, { signal: request.signal }) : [];
      const candidates = verified.filter(validReferenceCandidate)
        .filter(candidate => ["city", "town"].includes(candidate.placeType) && placeCandidateWithinPlanningParent(candidate, parent))
        .slice(0, 5).map(candidate => ({ ...responseCandidate(candidate), label: `${candidate.canonicalName}, ${candidate.parentCountries![0]}`,
          provenance: [{ id: candidate.providerId, kind: "provider", label: candidate.providerSourceLabel ?? "Settlement geography",
            supports: candidate.normalizationReason! }] }));
      return NextResponse.json({ candidates, status: candidates.length ? "ready" : "empty" });
    } catch {
      return NextResponse.json({ candidates: [], status: "unavailable" }, { status: 503 });
    }
  }
  if (request.nextUrl.searchParams.get("nearbyBases") === "1") {
    const anchor = nearbyAnchorFromRequest(request);
    if (!anchor) return NextResponse.json({ candidates: [], status: "invalid-anchor" }, { status: 400 });
    try {
      const suggestions = await searchOpenWorldNearbyBaseSuggestions(anchor, { limit: 5, maximumDistanceKm: 140 });
      const candidates = suggestions.map(responseNearbyCandidate).filter(candidate => candidate !== null);
      return NextResponse.json({ candidates, status: candidates.length ? "ready" : "empty" });
    } catch {
      return NextResponse.json({ candidates: [], status: "unavailable" }, { status: 503 });
    }
  }

  const place = request.nextUrl.searchParams.get("place")?.trim();
  const country = request.nextUrl.searchParams.get("country")?.trim();
  const requestedIntent = request.nextUrl.searchParams.get("intent");
  const travelIntent = requestedIntent === "planning-area" || requestedIntent === "anchor" || requestedIntent === "unknown"
    ? requestedIntent
    : "route-stop";
  const planningParent = planningParentFromRequest(request);
  const nearbyAnchor = request.nextUrl.searchParams.get("nearbyBaseSearch") === "1" ? nearbyAnchorFromRequest(request) : undefined;
  const nearby = geocodeNearbyContext(request.nextUrl.searchParams);
  if (!place || place.length > 140 || (country && country.length > 100)) return NextResponse.json({ result: null }, { status: 400 });

  const importLookup = request.nextUrl.searchParams.get('consumer') === 'spreadsheet-import';
  const refreshImport = importLookup && mode === 'resolve';
  const completedPlaceLookup = mode === 'resolve' && request.nextUrl.searchParams.get('candidates') === '1'
    && requestedIntent === 'route-stop' && !importLookup && !planningParent && !nearbyAnchor
    && !request.nextUrl.searchParams.has('nearbyBaseSearch')
    && !request.nextUrl.searchParams.has('anchorName') && !request.nextUrl.searchParams.has('nearLat')
    && !request.nextUrl.searchParams.has('nearLon');
  const publicPlaceConfirmed = completedPlaceLookup && researchConfirmed;
  const monitoredLookup = importLookup || completedPlaceLookup;
  let sourceFailed = false;
  const importFetch: typeof fetch | undefined = monitoredLookup ? async (input, init) => {
    let options = init;
    if (refreshImport || completedPlaceLookup) {
      options = { ...init, cache: 'no-store' };
      delete options.next;
    }
    if (request.signal) options = { ...options, signal: options?.signal
      ? AbortSignal.any([request.signal,options.signal]) : request.signal };
    const response = await fetch(input, options);
    if (!response.ok) throw new Error('Place source unavailable');
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    if (url.origin === 'https://photon.komoot.io' && url.pathname === '/api/') {
      const payload = await response.clone().json() as { features?: unknown } | null;
      if (!payload || !Array.isArray(payload.features)) throw new Error('Place source unavailable');
    }
    return response;
  } : undefined;
  try {
    const reviewedMatches = planningParent ? reviewedIslandBaseSeeds(planningParent)?.filter(candidate =>
      [candidate.canonicalName, ...(candidate.aliases ?? [])].some(name => normalise(name).includes(normalise(place)))) : undefined;
    const deterministicCandidates = (reviewedMatches?.length ? reviewedMatches : await searchOpenWorldTravelCandidates(place, {
      travelIntent,
      ...(country ? { countryNames: [country], explicitCountryNames: [country] } : {}),
    }, createOpenWorldPlaceProvider({searchMode:mode==='autocomplete'?'reference-only':'reference-with-photon',
      fetchImpl:importFetch, ...(refreshImport || completedPlaceLookup ? {cache:new Map()} : {}),
      ...(monitoredLookup ? {onSourceFailure:()=>{sourceFailed=true;}} : {})})));
    let researchUnavailable=false;
    const researchedCandidates = publicPlaceConfirmed ? await enrichPublicPlaceSearch({
      query:place,country,publicPlaceConfirmed,deterministicCandidates,sourceFailed,
      signal:request.signal,
    },{mappingReader:createReviewedPlaceMappingReader(),onUnavailable:()=>{researchUnavailable=true;},research:async (query,country,signal) => (await import("@/lib/easyt/public-place-research-openai.server")).researchPublicPlaceNames(query,country,signal),lookup:async (alias,signal) => {
      let aliasFailed=false;
      const fetchAlias: typeof fetch = async (input,init) => importFetch!(input,{...init,signal:init?.signal?AbortSignal.any([signal,init.signal]):signal});
      const candidates=await searchOpenWorldTravelCandidates(alias,{travelIntent,...(country?{countryNames:[country],explicitCountryNames:[country]}:{})},
        createOpenWorldPlaceProvider({searchMode:'reference-with-photon',cache:new Map(),fetchImpl:fetchAlias,onSourceFailure:()=>{aliasFailed=true;}}));
      if(aliasFailed) sourceFailed=true;
      return {candidates,sourceFailed:aliasFailed};
    }}) : [];
    const availableCandidates = [...deterministicCandidates,...researchedCandidates]
      .filter(validReferenceCandidate)
      .filter((candidate) => !country || matchesCountry(candidate.parentCountries?.[0], country));
    // An island's administrative label or rectangle is not physical
    // containment. Normalize only independently checked settlement points.
    const candidates = (planningParent && requiresPhysicalIslandVerification(planningParent)
      ? await normalizePhysicalIslandBaseCandidates(availableCandidates, planningParent, { signal: request.signal, fetchImpl: importFetch })
      : availableCandidates)
      .filter((candidate) => !planningParent || placeCandidateWithinPlanningParent(candidate, planningParent))
      .filter((candidate) => !nearbyAnchor || Boolean(placeCandidateSuitableAsNearbyBase(nearbyAnchor, candidate)))
      .sort((left, right) => (right.rankScore ?? 0) - (left.rankScore ?? 0) || distanceFrom(nearby, left) - distanceFrom(nearby, right));

    if ((monitoredLookup && sourceFailed || publicPlaceConfirmed && researchUnavailable) && !candidates.length) throw new Error('Place source unavailable');
    if (request.nextUrl.searchParams.get("candidates") === "1") {
      return NextResponse.json({ candidates: candidates.slice(0, 8).map(responseCandidate),
        ...(completedPlaceLookup ? {publicResearchAvailable:!sourceFailed&&!deterministicCandidates.length
          &&publicPlaceQueryAllowed(place,country)&&publicPlaceResearchReady(defaultPlaceResearchControls())} : {}) });
    }

    const countries = candidates.map((candidate) => candidate.parentCountries?.[0] ?? "");
    const exactCode=place.trim().toUpperCase();
    const exactCodeIdentities=new Set(candidates.filter(candidate=>candidate.matchedAirportCode===exactCode||candidate.matchedIcaoCode===exactCode)
      .map(candidate=>candidate.canonicalPlaceId??candidate.providerId.split('@')[0]));
    const selected = exactCodeIdentities.size>1 || !country && needsDestinationConfirmation(countries, Boolean(nearby)) ? undefined : candidates[0];
    // Free-text stops and origins must be actual route endpoints. Broad areas
    // remain available as clarification candidates, not fake centroid stops.
    if (!selected || selected.routability !== "direct_destination") return NextResponse.json({ result: null });
    return NextResponse.json({ result: responseCandidate(selected) });
  } catch {
    return NextResponse.json({ result: null }, { status: request.nextUrl.searchParams.get("candidates") === "1" ? 503 : 200 });
  }
}


export async function GET(request:NextRequest) {
  // Paid research is never available via a link, prefetch or query-string flag.
  if(request.nextUrl.searchParams.has('research'))return NextResponse.json({candidates:[],status:'post-required'},{status:405,headers:{'cache-control':'private, no-store','allow':'POST'}});
  return resolvePlaceRequest(request);
}
export async function POST(request:NextRequest) {
  const headers={'cache-control':'private, no-store'};
  try{
    if(request.nextUrl.search || request.headers.get('origin')!==request.nextUrl.origin
      || request.headers.get('sec-fetch-site')&&request.headers.get('sec-fetch-site')!=='same-origin')
      return NextResponse.json({candidates:[],status:'invalid-origin'},{status:403,headers});
    const input=await readCompletedPlacePost(request);
    if(input.research&&!publicPlaceResearchReady(defaultPlaceResearchControls()))
      return NextResponse.json({candidates:[],status:'research-disabled'},{status:503,headers});
    const url=new URL(request.nextUrl.origin+'/api/journey-geocode');
    url.search=new URLSearchParams({place:input.place,mode:'resolve',candidates:'1',intent:'route-stop',...(input.country?{country:input.country}:{})}).toString();
    // Internal projection only; the submitted name never travels in a request URL.
    const result=await resolvePlaceRequest({nextUrl:url,signal:request.signal} as NextRequest,input.research);
    result.headers.set('cache-control','private, no-store');return result;
  }catch(error){return NextResponse.json({candidates:[],status:'unavailable'},{status:error instanceof PlacePostError?error.status:503,headers});}
}
