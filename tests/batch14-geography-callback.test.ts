import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {preferredHandoffLocationChoice,mergeHandoffLocationChoice,handoffOutcomeIsCurrent,retireHandoffResolutionStatus,handoffStopOccurrenceId,resolveHandoffIncrementally} from '../lib/easyt/home-trip-handoff.ts';
import {builderRouteInputIsReady,canBuildTrip} from '../lib/easyt/can-build-trip.ts';
import {captureJourneyBrief} from '../lib/easyt/journey-capture.ts';
import {isOvernightBaseEligible,canonicalPlaceFactsMatch} from '../lib/easyt/place-intelligence.ts';
import {searchNominatimTravelCandidates} from '../lib/easyt/nominatim-place.server.ts';
import {canonicalRouteFixture} from './fixtures/batch14-route-documents.ts';
import {requireReadableTripDocument} from '../lib/easyt/trip-document.ts';
import {builderPlaceCommand,prepareBuilderHandlerEdit} from '../lib/easyt/trip-builder-handler-contract.ts';
import {builderDocumentFingerprint} from '../lib/easyt/trip-builder-document-commit.ts';
import {authoredContentKey} from '../lib/easyt/trip-retained-authored-content.ts';

import {acceptedGeographicPlace,geographicInputKey,stopGeographicPlace} from '../lib/easyt/geographic-binding.ts';

// Replays the actual Builder callback; synthetic owner/document, frozen candidates.
const fixtures=JSON.parse(readFileSync(new URL('./fixtures/batch14-city-region-candidates.json',import.meta.url),'utf8'));
const lima=fixtures[0],region=lima.choices.find((c:any)=>c.placeType==='region');
function actualCallbackHarness(initialCoordinates?:[number,number]){
 const require=createRequire(new URL('../package.json',import.meta.url)),ts=require('typescript');
 let trip=requireReadableTripDocument(canonicalRouteFixture()),revision=1,accepted=0;
 const mention=structuredClone(lima.mention),id=trip.stops[0].id;
 trip.stops[0]={...trip.stops[0],name:'Lima',country:'Peru',canonicalPlaceId:'lima',providerId:lima.expected.providerId,latitude:initialCoordinates?.[1]??null,longitude:initialCoordinates?.[0]??null};
 trip.brief.intent.route.destinations[0]={...trip.brief.intent.route.destinations[0],id:mention.mentionId,sourceText:'Lima',selectedPlace:{name:'Lima',country:'Peru',canonicalPlaceId:'lima'},requestedNights:trip.stops[0].nights};
 trip.brief.intent.route.orderAuthority='manual';
 trip.brief.structuredBrief={...captureJourneyBrief('Lima').structuredBrief,placeMentions:[mention]};
 const lookupSession={statuses:new Map([[mention.mentionId,'pending']]),handled:new Set<string>()};let choices:any[]=[];
 const scope:any={lookupSession,handoffLookupSessionRef:{current:lookupSession},isCurrent:()=>true,
  builderEditSessionRef:{current:{getSnapshot:()=>({trip,inputRevision:revision,browserOwnerId:'owner-a'})}},
  activeBrowserOwnerIdRef:{current:'owner-a'},lookupOwnerId:'owner-a',lookupTripId:trip.id,
  removedPlaceMentionIdsRef:{current:[]},placeSelectionsRef:{current:[]},setHandoffResolutionStatuses:()=>{},
  setLocationChoices:(fn:any)=>{choices=fn(choices)},handoffOutcomeIsCurrent,retireHandoffResolutionStatus,preferredHandoffLocationChoice,acceptedGeographicPlace,authoredContentKey,geographicInputKey,stopGeographicPlace,
  isOriginMention:(m:any)=>m.role==='origin'||m.role==='fixed_start',draft:{},originResolutionVersionRef:{current:0},originVersion:0,
  seedById:new Map(trip.stops.map(s=>[s.id,stopGeographicPlace(s)])),handoffOccurrenceMentionIdsRef:{current:{[id]:mention.mentionId}},handoffStopOccurrenceId,builderPlaceCommand,
  dispatchAcceptedBuilderEdit:(command:any,options:any)=>{assert.equal(options.expectedInputRevision,revision);const result=prepareBuilderHandlerEdit(trip,command,builderDocumentFingerprint(trip));assert.ok(result.ok);if(result.ok)trip=result.trip;revision++;accepted++;}};
 const source=readFileSync(new URL('../app/journey/new/trip-builder.tsx',import.meta.url),'utf8');
 const key=source.slice(source.indexOf('  const savedTargetKey='),source.indexOf('  const savedFinishIsCurrent='));
 scope.savedTargetKey=new Function('scope',`with(scope){${ts.transpileModule(`${key}\nreturn savedTargetKey;`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText}}`)(scope);
 const body=source.slice(source.indexOf('      const onOutcome ='),source.indexOf('      const runLookups ='));
 const script=ts.transpileModule(`${body}\nreturn onOutcome;`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
 const callback=new Function('scope',`with(scope){${script}}`)(scope);
 return {scope,mention,before:structuredClone(trip),trip:()=>trip,accepted:()=>accepted,choices:()=>choices,changeCoordinates:(coordinates:[number,number])=>{const command=builderPlaceCommand(trip,{stopId:id,intentId:mention.mentionId,place:{name:'Lima',canonicalPlaceId:'lima',country:'Peru',coordinates}});assert.ok(command);const result=prepareBuilderHandlerEdit(trip,command!,builderDocumentFingerprint(trip));assert.ok(result.ok);if(result.ok)trip=result.trip;revision++;},send:(cs:any[])=>callback({item:mention,value:cs,status:'resolved'},0)};
}
test('actual Builder callback binds compatible city geometry without changing manual order, IDs or nights',()=>{
 const h=actualCallbackHarness();h.send(lima.choices);assert.equal(h.accepted(),1);
 assert.deepEqual([h.trip().stops[0].longitude,h.trip().stops[0].latitude],lima.expected.coordinates);
 assert.deepEqual(h.trip().brief.intent.route.orderedStopIds,h.before.brief.intent.route.orderedStopIds);
 assert.equal(h.trip().brief.intent.route.orderAuthority,'manual');
 assert.deepEqual(h.trip().stops.map(s=>[s.id,s.nights]),h.before.stops.map(s=>[s.id,s.nights]));
});
test('actual Builder callback retains region-only result for clarification without accepting a city edit',()=>{
 const h=actualCallbackHarness();h.send([region]);assert.equal(h.accepted(),0);assert.deepEqual(h.trip(),h.before);
 assert.equal(h.scope.lookupSession.statuses.get(h.mention.mentionId),'needs-confirmation');
});
test('actual callback discards a foreign-owner response',()=>{
 const h=actualCallbackHarness();h.scope.activeBrowserOwnerIdRef.current='owner-b';h.send(lima.choices);assert.equal(h.accepted(),0);assert.deepEqual(h.trip(),h.before);
});

test('actual callback rejects a held result after a newer geometry-only edit with unchanged city identity',()=>{
 const h=actualCallbackHarness();h.changeCoordinates([-77.0306,-12.046]);const newer=structuredClone(h.trip());h.send(lima.choices);
 assert.equal(h.accepted(),0);assert.deepEqual(h.trip(),newer);
});

test('missing-coordinate seed cannot overwrite a newer confirmed same-identity provider point',()=>{
 const h=actualCallbackHarness();assert.equal(h.scope.seedById.get(h.trip().stops[0].id).coordinates,undefined);
 const place=acceptedGeographicPlace(stopGeographicPlace(h.trip().stops[0]),{...lima.expected,coordinates:[-77.025,-12.04]});assert.ok(place);
 h.scope.dispatchAcceptedBuilderEdit(builderPlaceCommand(h.trip(),{stopId:h.trip().stops[0].id,intentId:h.mention.mentionId,place:place!}),{expectedInputRevision:1});
 const confirmed=structuredClone(h.trip());h.send(lima.choices);
 assert.equal(h.accepted(),1,'held callback must not apply a second edit');assert.deepEqual(h.trip(),confirmed);
});

test('evidence-only confirmation invalidates held initial lookup with identical point and provider',()=>{
 const h=actualCallbackHarness(lima.expected.coordinates);
 const place=acceptedGeographicPlace(stopGeographicPlace(h.trip().stops[0]),lima.expected);assert.ok(place);
 h.scope.dispatchAcceptedBuilderEdit(builderPlaceCommand(h.trip(),{stopId:h.trip().stops[0].id,intentId:h.mention.mentionId,place:place!}),{expectedInputRevision:1});
 const confirmed=structuredClone(h.trip());h.send(lima.choices);
 assert.equal(h.accepted(),1,'evidence changed even though identity and point did not');assert.deepEqual(h.trip(),confirmed);
});

test('unchanged target still accepts held compatible lookup after a sibling budget edit',()=>{
 const h=actualCallbackHarness();h.scope.dispatchAcceptedBuilderEdit({kind:'budget',budget:'high'},{expectedInputRevision:1});
 h.send(lima.choices);assert.equal(h.accepted(),2);assert.equal(h.trip().brief.budgetBand,'high');
 assert.deepEqual([h.trip().stops[0].longitude,h.trip().stops[0].latitude],lima.expected.coordinates);
 assert.deepEqual(h.trip().stops.map(s=>[s.id,s.nights]),h.before.stops.map(s=>[s.id,s.nights]));
});
