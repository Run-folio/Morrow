import type {CanonicalEasyTTrip} from './trip.ts';
import type {BuilderEditScope} from './trip-builder-reconciliation.ts';
import {builderDocumentFingerprint} from './trip-builder-document-commit.ts';
import {prepareBuilderHandlerEdit} from './trip-builder-handler-contract.ts';
import {commitAcceptedRouteProjection,routeProjectionInputKey} from './trip-route-intent.ts';
import {assessRouteOrder,type RouteOrderAssessment} from './planner.ts';
import {plannerEndpointForJourneyEnd} from './journey-endpoints.ts';
import {routeConstraintsFromStructuredTripBrief,routeScoringPreferencesFromStructuredBrief} from './structured-trip-brief.ts';

export type BuilderOptimizationProposal={
 readonly id:string;readonly ownerId:string|null;readonly tripId:string;readonly inputRevision:number;
 readonly inputKey:string;readonly projectedTrip:CanonicalEasyTTrip;
};
export type BuilderOptimizationResult=
 | {kind:'proposal';proposal:BuilderOptimizationProposal;assessment?:RouteOrderAssessment}
 | {kind:'no-improvement'|'unavailable';reason:'same-order'|'no-better-order'|'insufficient-data'|'protected-content';assessment?:RouteOrderAssessment};
function freeze<T>(value:T):T{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value)}return value}
function owns(trip:CanonicalEasyTTrip,scope:BuilderEditScope){return scope.tripId===trip.id&&(trip.ownerId===null||scope.ownerId===trip.ownerId)&&Number.isSafeInteger(scope.inputRevision)&&scope.inputRevision>=0}
/** A dry run uses the same order, schedule and authored-content owners as a real accepted edit. */
export function createBuilderOptimizationProposal(current:CanonicalEasyTTrip,scope:BuilderEditScope,stopIds:readonly string[],id:string):BuilderOptimizationResult{
 if(!owns(current,scope)||!id)return {kind:'unavailable',reason:'insufficient-data'};
 if(JSON.stringify(stopIds)===JSON.stringify(current.brief.intent.route.orderedStopIds))return {kind:'no-improvement',reason:'same-order'};
 const prepared=prepareBuilderHandlerEdit(current,{kind:'order',source:'route-check',stopIds:[...stopIds]},builderDocumentFingerprint(current));
 if(!prepared.ok)return {kind:'unavailable',reason:'protected-content'};
 const proposal=freeze(structuredClone({id,...scope,inputKey:routeProjectionInputKey(current),projectedTrip:prepared.trip}));
 if(!acceptBuilderOptimization(current,proposal,scope).ok)return {kind:'unavailable',reason:'protected-content'};
 return {kind:'proposal',proposal};
}
/** Source-bound authorization only. The caller dispatches command once through its existing edit session. */
export function acceptBuilderOptimization(current:CanonicalEasyTTrip,proposal:BuilderOptimizationProposal,expectedScope:BuilderEditScope){
 if(!proposal||!owns(current,expectedScope)||proposal.ownerId!==expectedScope.ownerId||proposal.tripId!==expectedScope.tripId
  ||proposal.inputRevision!==expectedScope.inputRevision||proposal.inputKey!==routeProjectionInputKey(current))return {ok:false as const,reason:'stale-source' as const};
 try{
  if(!proposal.id||JSON.stringify(proposal.projectedTrip.stops.map(stop=>stop.id))===JSON.stringify(current.brief.intent.route.orderedStopIds))return {ok:false as const,reason:'invalid-proposal' as const};
  const accepted=commitAcceptedRouteProjection(current,{basedOnInputKey:proposal.inputKey,projectedTrip:proposal.projectedTrip,reason:'accepted_optimization'});
  if(accepted.kind!=='accepted')return {ok:false as const,reason:'invalid-proposal' as const};
  return {ok:true as const,trip:accepted.trip,command:{kind:'order' as const,source:'route-check' as const,stopIds:proposal.projectedTrip.stops.map(stop=>stop.id)}};
 }catch{return {ok:false as const,reason:'invalid-proposal' as const}}
}
/** Existing deterministic candidate/scoring engine; no provider call, canonical mutation or persistence. */
export function calculateBuilderOptimization(current:CanonicalEasyTTrip,scope:BuilderEditScope,id:string):BuilderOptimizationResult{
 const route=current.brief.intent.route,brief=current.brief.structuredBrief;
 if(!owns(current,scope)||current.stops.some(stop=>stop.longitude===null||stop.latitude===null)
  ||route.destinations.some(intent=>intent.routeMembership==='required'&&(intent.resolution!=='resolved'||!intent.stopIds.length)))return {kind:'unavailable',reason:'insufficient-data'};
 const structured=brief?routeConstraintsFromStructuredTripBrief(brief,current.stops.map(stop=>stop.id)):undefined;
 const preferences=brief?routeScoringPreferencesFromStructuredBrief(brief):undefined;
 const assessment=assessRouteOrder({origin:{name:route.origin?.name??'',coordinates:route.origin?.coordinates},
  end:plannerEndpointForJourneyEnd(current.id,route.origin??{name:''},route.journeyEnd),
  stops:current.stops.map(stop=>({id:stop.id,name:stop.name,country:stop.country,canonicalPlaceId:stop.canonicalPlaceId,coordinates:[stop.longitude!,stop.latitude!] as [number,number]})),
  availableDays:Math.round((Date.parse(current.endDate)-Date.parse(current.startDate))/86400000)+1,
  allocations:Object.fromEntries(current.stops.map(stop=>[stop.id,stop.nights??0])),picks:current.brief.selectedPlaces,
  constraints:{...structured,fixedCommitments:current.brief.intent.hardConstraints.fixedCommitments,optionalStopIds:current.brief.intent.hardConstraints.optionalStopIds,
   avoidDriving:current.brief.intent.hardConstraints.avoidDriving,excludedTransportModes:[...(structured?.excludedTransportModes.filter(mode=>mode!=='road')??[]),...(current.brief.intent.hardConstraints.avoidDriving?['road' as const]:[])],
   transportModes:current.brief.intent.preferences.transportModes},
  scoringPreferences:{...preferences,pace:current.brief.intent.preferences.pace,interests:current.brief.intent.preferences.interests,
   preferredModes:current.brief.intent.preferences.transportModes.map(mode=>mode==='drive'?'road' as const:mode)},
 });
 if(assessment.state==='insufficient-data')return {kind:'unavailable',reason:'insufficient-data',assessment};
 if(assessment.state!=='recommendation')return {kind:'no-improvement',reason:'no-better-order',assessment};
 return {...createBuilderOptimizationProposal(current,scope,assessment.recommendedStopIds,id),assessment};
}
