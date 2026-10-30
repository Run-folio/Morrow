import {transportComparisonRequestBody} from './transport-comparison-request.ts';
import {reviewedPilotCandidateIsCurrent,validateReviewedRouteGuidance,type ReviewedRouteGuidance} from './reviewed-transport-pilot.ts';
import type {EasyTTrip,TripLeg,CanonicalRouteEndpoint} from './trip.ts';
import type {MultimodalResolutionResult,TransferJourneyCandidate} from './multimodal-transfer-resolution.ts';
import {routeEndpointForLeg} from './trip-legs.ts';
import {authoredContentKey} from './trip-retained-authored-content.ts';
import {transferEndpointGeographicallyReady} from './geographic-binding.ts';
import {supportedCandidateForLeg,supportedTransportChoicesForLeg,selectTripLegTransportChoice} from './transport-mode-choice.ts';
import {planningEvidenceFromResponse} from './planning-evidence-presentation.ts';
import {routeConstraintsFromStructuredTripBrief} from './structured-trip-brief.ts';
import type {RoutePlanningConstraints} from './planner.ts';
import type {PlanningEvidenceState} from './planning-evidence-state.ts';

export function transportEndpointEvidenceKey(endpoint: CanonicalRouteEndpoint | null | undefined) {
  return authoredContentKey(endpoint ? {id:endpoint.id,kind:endpoint.kind,name:endpoint.name,country:endpoint.country,
    canonicalPlaceId:endpoint.canonicalPlaceId,providerId:endpoint.providerId,coordinates:endpoint.coordinates,
    geographicBinding:endpoint.geographicBinding} : null);
}

/** Complete dependency key, not a timestamp winner or permission to rebase. */
export function transportComparisonBasis(trip: EasyTTrip, legId: string): string | null {
  const leg=trip.legs.find(l=>l.id===legId); if(!leg)return null;
  return authoredContentKey({trip:trip.id,owner:trip.ownerId,leg,
    from:routeEndpointForLeg(trip,leg,'from'),to:routeEndpointForLeg(trip,leg,'to'),
    dates:[trip.startDate,trip.endDate],stops:trip.stops.map(s=>({id:s.id,arrival:s.arrivalDate,departure:s.departureDate,nights:s.nights})),
    constraints:trip.brief.intent?.hardConstraints,preferences:trip.brief.intent?.preferences,
    structured:trip.brief.structuredBrief,choice:trip.brief.decisionSelections,bookings:trip.brief.bookings??[]});
}

export function transportComparisonInput(trip: EasyTTrip, legId: string): TripLeg | null {
  const leg=trip.legs.find(l=>l.id===legId);if(!leg)return null;
  const from=routeEndpointForLeg(trip,leg,'from'),to=routeEndpointForLeg(trip,leg,'to');
  if(!transferEndpointGeographicallyReady(from)||!transferEndpointGeographicallyReady(to))return null;
  const prior=(leg.routeMetadata.transportConstraints??{}) as {avoidDriving?:boolean;excludedModes?:string[];preferredModes?:string[]};
  const structured:RoutePlanningConstraints=trip.brief.structuredBrief ? routeConstraintsFromStructuredTripBrief(trip.brief.structuredBrief,trip.stops.map(s=>s.id)) : {};
  return structuredClone({...leg,fromEndpoint:from!,toEndpoint:to!,routeMetadata:{...leg.routeMetadata,transportConstraints:{
    avoidDriving:prior.avoidDriving===true||structured.avoidDriving===true||trip.brief.intent?.hardConstraints.avoidDriving===true,
    excludedModes:[...new Set([...(prior.excludedModes??[]),...(structured.excludedTransportModes??[])])],
    preferredModes:trip.brief.intent?.preferences.transportModes??prior.preferredModes??[],
  }}});
}

export type TransportComparison = {
  legId:string; basis:string; routeGuidance?:ReviewedRouteGuidance[]; candidates:TransferJourneyCandidate[]; assessment:PlanningEvidenceState;
};
export function transportGuidanceForLeg(trip:EasyTTrip,legId:string,raw:unknown):ReviewedRouteGuidance[]{
 const input=transportComparisonInput(trip,legId);if(!input)return [];
 const rules=input.routeMetadata.transportConstraints as {avoidDriving:boolean;excludedModes:string[]};
 const excluded=new Set(rules.excludedModes);if(rules.avoidDriving)excluded.add('road');
 return validateReviewedRouteGuidance(raw,input.fromEndpoint!,input.toEndpoint!,excluded);
}
const evidence=new Set(['reviewed_composition','exact_transfer','reviewed_air_journey','intercity_rail_network','direct_rail_connectivity','routed_road','canonical_gateway_access','direct_air_connectivity','legacy_flight_estimate','airport_planning_allowance','air_gateway_composition']);

/** Validate comparison evidence; never accept a returned whole-document/leg replacement. */
export function validateTransportComparison(trip:EasyTTrip,legId:string,raw:unknown):TransportComparison|null {
  try {
    const basis=transportComparisonBasis(trip,legId),input=transportComparisonInput(trip,legId);
    const value=raw as MultimodalResolutionResult;
    const assessment=planningEvidenceFromResponse(value);
    if(!basis||!input||!value||value.leg?.id!==legId||!assessment||value.diagnostic?.version!==1
      ||!Array.isArray(value.diagnostic.candidates)||value.diagnostic.candidates.length>8)return null;
    const candidates=value.diagnostic.candidates;
    if(new Set(candidates.map(c=>c.id)).size!==candidates.length)return null;
    const rules=input.routeMetadata.transportConstraints as {avoidDriving:boolean;excludedModes:string[]};
    const excluded=new Set(rules.excludedModes);if(rules.avoidDriving)excluded.add('road');
    for(const candidate of candidates){
      const choice=supportedCandidateForLeg(input,candidate);
      if(!choice||!reviewedPilotCandidateIsCurrent(candidate.id,input.fromEndpoint,input.toEndpoint)||!evidence.has(candidate.evidence)||!Number.isFinite(candidate.score)
        ||excluded.has(candidate.summaryMode)
        ||candidate.summaryMode!=='mixed'&&candidate.segments.some(segment=>segment.mode!==candidate.summaryMode)
        ||candidate.summaryMode==='mixed'&&candidate.segments.length<2
        ||candidate.headlineMinutes!==undefined&&(!Number.isFinite(candidate.headlineMinutes)||candidate.headlineMinutes<0||candidate.headlineMinutes>candidate.totalDurationMinutes)
        ||candidate.connectionCount!==null&&(!Number.isInteger(candidate.connectionCount)||candidate.connectionCount<0)
        ||candidate.distanceKm!==null&&(!Number.isFinite(candidate.distanceKm)||candidate.distanceKm<0)
        ||!Array.isArray(candidate.reasons)||!candidate.reasons.every(reason=>typeof reason==='string')
        ||!['high','medium','low'].includes(candidate.confidence)
        ||candidate.transferImpact&&!choice.transferImpact
        ||transportEndpointEvidenceKey(candidate.segments[0]?.fromEndpoint)!==transportEndpointEvidenceKey(input.fromEndpoint)
        ||transportEndpointEvidenceKey(candidate.segments.at(-1)?.toEndpoint)!==transportEndpointEvidenceKey(input.toEndpoint))return null;
      for(const [index,segment] of candidate.segments.entries()){
        if(excluded.has(segment.mode)||!transferEndpointGeographicallyReady(segment.fromEndpoint)||!transferEndpointGeographicallyReady(segment.toEndpoint)
          ||segment.durationMinutes!==null&&(!Number.isFinite(segment.durationMinutes)||segment.durationMinutes<0)
          ||index>0&&transportEndpointEvidenceKey(candidate.segments[index-1].toEndpoint)!==transportEndpointEvidenceKey(segment.fromEndpoint))return null;
      }
    }
    const routeGuidance=validateReviewedRouteGuidance(value.diagnostic.routeGuidance,input.fromEndpoint!,input.toEndpoint!,excluded);
    return structuredClone({legId,basis,candidates,assessment,routeGuidance});
  }catch{return null;}
}

/** Only the explicit Use action calls this inside the existing guarded mutation queue. */
export function adoptTransportComparison(trip:EasyTTrip,comparison:TransportComparison,candidateId:string):EasyTTrip {
  if(transportComparisonBasis(trip,comparison.legId)!==comparison.basis)return trip;
  const leg=trip.legs.find(l=>l.id===comparison.legId)!;
  const checked=validateTransportComparison(trip,leg.id,{leg,diagnostic:{version:1,candidates:comparison.candidates},assessment:comparison.assessment});
  const candidate=checked?.candidates.find(c=>c.id===candidateId);if(!candidate)return trip;
  const raw=leg.routeMetadata.multimodalResolution as {version?:unknown;candidates?:unknown;selected?:unknown;selectedCandidateId?:unknown}|undefined;
  if(raw&&(raw.version!==1||!Array.isArray(raw.candidates)))return trip;
  const existing=(raw?.candidates??[]) as TransferJourneyCandidate[];
  const collision=existing.find(c=>c.id===candidate.id);
  if(collision&&authoredContentKey(collision)!==authoredContentKey(candidate))return trip;
  const updated={...leg,routeMetadata:{...leg.routeMetadata,multimodalResolution:{...(raw??{version:1,selected:leg.mode,rejected:[]}),
    candidates:collision?existing:[...existing,structuredClone(candidate)]}}};
  if(!collision){
    const nextInput=transportComparisonInput({...trip,legs:trip.legs.map(l=>l===leg?updated:l)},leg.id);
    if(!nextInput||!transportComparisonRequestBody(nextInput))return trip;
  }
  const choice=supportedTransportChoicesForLeg(trip,updated).find(c=>c.candidateId===candidate.id);if(!choice)return trip;
  return selectTripLegTransportChoice({...trip,legs:trip.legs.map(l=>l===leg?updated:l)},leg.id,choice.identity);
}
