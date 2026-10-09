import assert from 'node:assert/strict';
import test from 'node:test';
import {canBuildTrip,type CanBuildTripInput} from '../lib/easyt/can-build-trip.ts';
import {canonicalRouteFixture} from './fixtures/batch14-route-documents.ts';
import {PLACE_CATALOG} from '../lib/easyt/place-catalog.ts';
import {resolvePlaceMentions,type ResolvedPlaceMention} from '../lib/easyt/place-intelligence.ts';
import {extractStructuredTripBrief} from '../lib/easyt/structured-trip-brief.ts';
import {projectDiscovery} from '../lib/easyt/discovery-projection.ts';
import {createDiscoveryDraft} from '../lib/easyt/discovery-draft.ts';
import {discoverySelectablePlaces,discoveryConfirmationChoiceForId,discoveryDirectStopSuggestion} from '../lib/easyt/discovery-confirmation.ts';
import {discoveryPlaceForId} from '../lib/easyt/discovery-content.ts';
import {acceptedGeographicPlace} from '../lib/easyt/geographic-binding.ts';
import {allocateTripNights} from '../lib/easyt/night-allocation.ts';
import {projectBuilderCalendar} from '../lib/easyt/trip-builder-calendar.ts';
import {requireReadableTripDocument,prepareTripDocumentForWrite} from '../lib/easyt/trip-document.ts';
import {routeProjectionInputKey} from '../lib/easyt/trip-route-intent.ts';
import type {CanonicalPlaceSuggestion} from '../lib/easyt/place-intelligence.ts';

function completedBase(mention:ResolvedPlaceMention,suggestion:CanonicalPlaceSuggestion) {
 let trip=requireReadableTripDocument(canonicalRouteFixture());
 const owner={name:suggestion.name,country:suggestion.country,canonicalPlaceId:suggestion.canonicalPlaceId,coordinates:suggestion.coordinates,
  providerId:suggestion.provenance.find(source=>source.kind==='provider')?.id};
 const place=acceptedGeographicPlace(owner,{...owner,placeType:suggestion.placeType,routability:suggestion.routability,referenceSnapshotId:suggestion.referenceSnapshotId});assert.ok(place);
 const origin={name:'London',country:'United Kingdom',canonicalPlaceId:'london',providerId:'fixture:confirmed-origin',coordinates:[-.1276,51.5072] as [number,number]};
 const boundOrigin=acceptedGeographicPlace(origin,{...origin,placeType:'city',routability:'direct_destination'},'endpoint')!;
 trip.stops=[{id:'accepted-base',order:0,name:place.name,country:place.country!,canonicalPlaceId:place.canonicalPlaceId,providerId:place.providerId,geographicBinding:place.geographicBinding,
  longitude:place.coordinates![0],latitude:place.coordinates![1],nights:9,arrivalDate:null,departureDate:null}];
 trip.legs=[];trip.planItems=[];
 Object.assign(trip.brief,{origin:origin.name,originCountry:origin.country,originCanonicalPlaceId:origin.canonicalPlaceId,originProviderId:origin.providerId,originCoordinates:origin.coordinates,
  bookings:[],selectedPlaces:{},manualNightStopIds:[],nightAllocations:{'accepted-base':9},nightAllocation:allocateTripNights({totalNights:9,stops:trip.stops})});
 trip.brief.intent.hardConstraints={originRequired:true,mustSeeStopIds:[],optionalStopIds:[],fixedCommitments:[],avoidDriving:false};
 trip.brief.intent.route={version:1,origin:boundOrigin,tripType:'return_to_start',journeyEnd:{mode:'same_as_start'},orderAuthority:'manual',explicitIntentIds:null,orderedStopIds:['accepted-base'],projectionInputKey:null,
  destinations:[{id:mention.mentionId,sourceText:mention.sourceText,kind:'planning_area',selectedPlace:{name:mention.canonicalName,canonicalPlaceId:mention.canonicalPlaceId},resolution:'resolved',requestedNights:null,routeMembership:'required',stopIds:['accepted-base']}]};
 trip.brief.journeyEnd={mode:'same_as_start'};
 const structured=extractStructuredTripBrief(mention.sourceText);structured.placeMentions=[mention];
 structured.placeSelections=[{mentionId:mention.mentionId,kind:'base',selectedCanonicalPlaceId:place.canonicalPlaceId!,selectedName:place.name,selectedPlaceType:suggestion.placeType,selectedParentCountries:[place.country!],routeStopId:'accepted-base',provenance:{id:'fixture:accepted-choice',kind:'builder',label:'Traveller choice',supports:'Explicit accepted base'}}];
 structured.completedPlanningAreaMentionIds=[mention.mentionId];trip.brief.structuredBrief=structured;
 trip=requireReadableTripDocument(projectBuilderCalendar(trip,trip).trip);trip.brief.intent.route.projectionInputKey=routeProjectionInputKey(trip);
 return trip;
}
function inputFor(trip:ReturnType<typeof completedBase>):CanBuildTripInput {
 return {origin:trip.brief.origin,originCoordinates:trip.brief.originCoordinates!,journeyEnd:trip.brief.intent.route.journeyEnd,
  stops:trip.stops.map(stop=>({id:stop.id,name:stop.name,country:stop.country,canonicalPlaceId:stop.canonicalPlaceId,coordinates:[stop.longitude!,stop.latitude!] as [number,number]})),
  placeIssues:[{code:'missing_routable_destination',mentionId:trip.brief.intent.route.destinations[0]!.id,blocksRoute:true,message:'Add or choose at least one concrete base before Morrovia builds the route.'}],
  startDate:trip.startDate,endDate:trip.endDate,durationDays:10,allocations:trip.brief.nightAllocations!,nightAllocation:trip.brief.nightAllocation!,document:trip};
}
test('completed canonical bases supersede the no-base intake issue for every selectable planning-parent class without changing durable input',context=>{
 const seed=resolvePlaceMentions('France').mentions[0]!;let parents=0,choices=0;
 for(const entry of PLACE_CATALOG.filter(entry=>['planning_area','needs_base_selection','anchor_or_poi'].includes(entry.routability))){
  const mention={...seed,mentionId:`build:${entry.canonicalPlaceId}`,canonicalPlaceId:entry.canonicalPlaceId,canonicalName:entry.canonicalName,sourceText:entry.canonicalName,placeType:entry.placeType,parentCountries:[...entry.parentCountries],parentRegionId:entry.parentRegionId,routability:entry.routability,requiresBaseSelection:true};
  const draft=createDiscoveryDraft(),projection=projectDiscovery({mention,draft,context:{durationDays:10,interests:[],existingPlaceIds:[]}});parents++;
  for(const place of discoverySelectablePlaces(projection.places)){
   const choice=discoveryConfirmationChoiceForId(place.id,projection,draft);assert.ok(!('reason' in choice));
   const trip=completedBase(mention,choice.suggestion),input=inputFor(trip),before=structuredClone(input);
   const result=canBuildTrip(input);assert.equal(result.canBuildTrip,true,`${entry.canonicalName}/${place.name}: ${JSON.stringify(result.conflicts)}`);
   assert.deepEqual(input,before,'Build assessment is read-only');
   const reloaded=requireReadableTripDocument(JSON.parse(JSON.stringify(prepareTripDocumentForWrite(trip))));assert.equal(canBuildTrip(inputFor(reloaded)).canBuildTrip,true);choices++;
  }
 }
 assert.ok(parents>=292);assert.ok(choices>=218);context.diagnostic(`${parents} planning parents audited; ${choices} accepted choice occurrences build and reload`);
});
test('global no-base conflict survives absent, removed, unverified, unmatched and non-overnight route evidence',()=>{
 const mention=resolvePlaceMentions('Japan').mentions[0]!,suggestion=discoveryDirectStopSuggestion(discoveryPlaceForId('kyoto')!)!;
 for(const change of ['no-base','removed-last','unverified','wrong-point','view-id','view-identity','view-point','outside-order','outside-intent','visit-only'] as const){
  const trip=completedBase(mention,suggestion),input=inputFor(trip);
  if(change==='no-base'||change==='removed-last'){trip.stops=[];if(change==='no-base')input.stops=[];}
  if(change==='unverified'){trip.stops[0]!.providerId='fixture:unverified';delete trip.stops[0]!.geographicBinding;}
  if(change==='wrong-point')trip.stops[0]!.longitude!+=.01;
  if(change==='view-id')input.stops[0]!.id='stale-occurrence';
  if(change==='view-identity')input.stops[0]!.canonicalPlaceId='tokyo';
  if(change==='view-point')input.stops[0]!.coordinates=[0,0];
  if(change==='outside-order')trip.brief.intent.route.orderedStopIds=[];
  if(change==='outside-intent')trip.brief.intent.route.destinations[0]!.stopIds=[];
  if(change==='visit-only')trip.brief.intent.route.destinations[0]!.kind='visit_anchor' as never;
  assert.ok(canBuildTrip(input).conflicts.some(issue=>issue.code==='place-review-required'),change);
 }
});
test('a valid accepted base only retires the global no-base issue; pending reviews, unresolved parents and other hard conflicts retain their safeguards',()=>{
 const trip=completedBase(resolvePlaceMentions('Japan').mentions[0]!,discoveryDirectStopSuggestion(discoveryPlaceForId('kyoto')!)!);
 const input=inputFor(trip);input.placeIssues!.push({code:'region_requires_base',mentionId:'remaining-region',sourceText:'Remaining region',blocksRoute:true,message:'Choose a base for the remaining region.'});
 let result=canBuildTrip(input);assert.equal(result.canBuildTrip,true);assert.equal(result.needsAttention[0]?.mentionId,'remaining-region');
 input.placeReviewPending=true;assert.ok(canBuildTrip(input).conflicts.some(issue=>issue.code==='place-review-required'));
 input.placeReviewPending=false;input.placeIssues!.push({mentionId:'hard-conflict',blocksRoute:true,message:'Another hard conflict.'});assert.ok(canBuildTrip(input).conflicts.some(issue=>issue.message==='Another hard conflict.'));
});
