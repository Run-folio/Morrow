import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {preferredHandoffLocationChoice,mergeHandoffLocationChoice,handoffOutcomeIsCurrent,retireHandoffResolutionStatus,handoffStopOccurrenceId} from '../../lib/easyt/home-trip-handoff.ts';
import {captureJourneyBrief} from '../../lib/easyt/journey-capture.ts';
import {canonicalRouteFixture} from '../fixtures/batch14-route-documents.ts';
import {requireReadableTripDocument} from '../../lib/easyt/trip-document.ts';
import {builderPlaceCommand,prepareBuilderHandlerEdit} from '../../lib/easyt/trip-builder-handler-contract.ts';
import {builderDocumentFingerprint} from '../../lib/easyt/trip-builder-document-commit.ts';
import {authoredContentKey} from '../../lib/easyt/trip-retained-authored-content.ts';
import {acceptedGeographicPlace,geographicInputKey,stopGeographicPlace} from '../../lib/easyt/geographic-binding.ts';
import type {JourneyEndpointPlace} from '../../lib/easyt/trip.ts';

// Replays the actual Builder callback; synthetic owner/document, frozen candidates.
const fixtures=JSON.parse(readFileSync(new URL('../fixtures/batch14-city-region-candidates.json',import.meta.url),'utf8'));
export const lima=fixtures[0],region=lima.choices.find((c:any)=>c.placeType==='region');
export function actualCallbackHarness(initialCoordinates?:[number,number], initialCanonicalPlaceId = "lima"){
 const require=createRequire(new URL('../../package.json',import.meta.url)),ts=require('typescript');
 let trip=requireReadableTripDocument(canonicalRouteFixture()),revision=1,accepted=0;
 const mention=structuredClone(lima.mention),id=trip.stops[0].id;
 trip.stops[0]={...trip.stops[0],name:'Lima',country:'Peru',canonicalPlaceId:initialCanonicalPlaceId,providerId:lima.expected.providerId,latitude:initialCoordinates?.[1]??null,longitude:initialCoordinates?.[0]??null};
 trip.brief.intent.route.destinations[0]={...trip.brief.intent.route.destinations[0],id:mention.mentionId,sourceText:'Lima',selectedPlace:{name:'Lima',country:'Peru',canonicalPlaceId:initialCanonicalPlaceId},requestedNights:trip.stops[0].nights};
 trip.brief.intent.route.orderAuthority='manual';
 trip.brief.structuredBrief={...captureJourneyBrief('Lima').structuredBrief,placeMentions:[mention]};
 const lookupSession={statuses:new Map([[mention.mentionId,'pending']]),handled:new Set<string>()};let choices:any[]=[];
 const scope:any={lookupSession,handoffLookupSessionRef:{current:lookupSession},isCurrent:()=>true,
  builderEditSessionRef:{current:{getSnapshot:()=>({trip,inputRevision:revision,browserOwnerId:'owner-a'})}},
  activeBrowserOwnerIdRef:{current:'owner-a'},lookupOwnerId:'owner-a',lookupTripId:trip.id,
  removedPlaceMentionIdsRef:{current:[]},placeSelectionsRef:{current:[]},setHandoffResolutionStatuses:()=>{},
  setLocationChoices:(fn:any)=>{choices=fn(choices)},mergeHandoffLocationChoice,handoffOutcomeIsCurrent,retireHandoffResolutionStatus,preferredHandoffLocationChoice,acceptedGeographicPlace,authoredContentKey,geographicInputKey,stopGeographicPlace,
  isOriginMention:(m:any)=>m.role==='origin'||m.role==='fixed_start',draft:{},originResolutionVersionRef:{current:0},originVersion:0,
  seedById:new Map(trip.stops.map(s=>[s.id,stopGeographicPlace(s)])),handoffOccurrenceMentionIdsRef:{current:{[id]:mention.mentionId}},handoffStopOccurrenceId,builderPlaceCommand,
  dispatchAcceptedBuilderEdit:(command:any,options:any)=>{assert.equal(options.expectedInputRevision,revision);const result=prepareBuilderHandlerEdit(trip,command,builderDocumentFingerprint(trip));assert.ok(result.ok);if(result.ok)trip=result.trip;revision++;accepted++;}};
 const source=readFileSync(new URL('../../app/journey/new/trip-builder.tsx',import.meta.url),'utf8');
 const key=source.slice(source.indexOf('  const savedTargetKey='),source.indexOf('  const savedFinishIsCurrent='));
 scope.savedTargetKey=new Function('scope',`with(scope){${ts.transpileModule(`${key}\nreturn savedTargetKey;`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText}}`)(scope);
 const body=source.slice(source.indexOf('      const onOutcome ='),source.indexOf('      const runLookups ='));
 const script=ts.transpileModule(`${body}\nreturn onOutcome;`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
 const callback=new Function('scope',`with(scope){${script}}`)(scope);
 const changePlace = (place: JourneyEndpointPlace) => {
  const command = builderPlaceCommand(trip, {stopId:id, intentId:mention.mentionId, place});
  assert.ok(command);
  const result = prepareBuilderHandlerEdit(trip, command!, builderDocumentFingerprint(trip));
  assert.ok(result.ok);
  if (result.ok) trip = result.trip;
  revision++;
 };
 return {
  scope, mention, before:structuredClone(trip), trip:()=>trip, accepted:()=>accepted, choices:()=>choices,
  changePlace:(place:Partial<JourneyEndpointPlace>)=>changePlace({...stopGeographicPlace(trip.stops[0]),...place}),
  changeCoordinates:(coordinates:[number,number])=>changePlace({name:'Lima',canonicalPlaceId:'lima',country:'Peru',coordinates}),
  send:(cs:any[])=>callback({item:mention,value:cs,status:'resolved'},0),
  sendBeforeCanonical:(cs:any[])=>{
   // Replay the same production callback before the canonical owner exists,
   // with the real handoff merge and a fixture implementation of React's setter.
   const before=trip.stops.map(stop=>({...stopGeographicPlace(stop),id:stop.id,nights:stop.nights}));
   let current=structuredClone(before);
   scope.builderEditSessionRef.current=null;
   scope.setStops=(update:any)=>{current=update(current)};
   callback({item:mention,value:cs,status:'resolved'},0);
   return {before,after:current};
  },
 };
}
