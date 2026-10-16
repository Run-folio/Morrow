import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {build} from 'esbuild';
import ts from 'typescript';
import {canonicalPlaceSuggestionForId,canonicalPlaceFactsMatch,isOvernightBaseEligible,placeSuggestionRequiresBaseSelection,validPlaceCoordinates,type CanonicalPlaceSuggestion} from '../lib/easyt/place-intelligence.ts';
import {acceptedGeographicPlace,geographicallyReady,geographicInputKey,stopGeographicPlace} from '../lib/easyt/geographic-binding.ts';
import {searchReferencePlaces,referenceSnapshotId} from '../lib/easyt/place-reference.server.ts';
import {countryCodeFor} from '../lib/easyt/country-registry.ts';
import {isDuplicatePlaceIdentity} from '../lib/easyt/place-autocomplete.ts';
import {requiresPhysicalIslandVerification} from '../lib/easyt/island-geography.ts';
import {canonicalRouteFixture} from './fixtures/batch14-route-documents.ts';
import {requireReadableTripDocument} from '../lib/easyt/trip-document.ts';
import {builderPlaceCommand,prepareBuilderHandlerEdits} from '../lib/easyt/trip-builder-handler-contract.ts';
import {builderDocumentFingerprint} from '../lib/easyt/trip-builder-document-commit.ts';

const source=readFileSync(new URL('../app/journey/new/trip-builder.tsx',import.meta.url),'utf8');
const callback=source.slice(source.indexOf('  const addStop = async ('),source.indexOf('  const addSupportedBase ='));
const js=ts.transpileModule(callback+'\nreturn addStop;',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
function harness(response:any){
 let trip=requireReadableTripDocument(canonicalRouteFixture()),revision=1,accepted=0,error='';
 // Synthetic existing Spanish origin avoids the independent new-country review.
 trip.brief.intent.route.origin={name:'Madrid',country:'Spain',canonicalPlaceId:'madrid'};
 const before=structuredClone(trip),noop=()=>{};
 const snapshot=()=>({trip,browserOwnerId:'owner-a',inputRevision:revision,draft:{fields:[{binding:{kind:'destination-add'},status:'editable',raw:'Seville'}]}});
 const scope={builderEditSessionRef:{current:{getSnapshot:snapshot}},activeBrowserOwnerIdRef:{current:'owner-a'},addPlaceLookupSequenceRef:{current:0},countryAddReviewRef:{current:null},resolvingPlaceMentionId:null,capturedStructuredBrief:{placeMentions:[]},intakeMentions:[],stops:trip.stops,stopInput:'Seville',language:'en',ui:{unavailable:'unavailable',typePlace:'Type a place'},
  isDuplicatePlaceIdentity,placeSuggestionRequiresBaseSelection,isOvernightBaseEligible,canonicalPlaceFactsMatch,countryCodeFor,requiresPhysicalIslandVerification,validPlaceCoordinates,acceptedGeographicPlace,builderPlaceCommand,
  fetch:async()=>Response.json({result:response}),
  setStopError:(value:string)=>{error=value},setStopChecking:noop,setBaseSearchErrors:noop,setRemovedPlaceMentionIds:noop,rememberStructuralChange:noop,cancelCountryAddReview:noop,setStopInput:noop,setShowStopEditor:noop,setStopSearchReadyKey:noop,
  dispatchAcceptedBuilderEdits:async(commands:any[],options:any)=>{assert.equal(options.expectedInputRevision,revision);const result=prepareBuilderHandlerEdits(trip,commands,builderDocumentFingerprint(trip));assert.ok(result.ok);if(result.ok)trip=result.trip;revision++;accepted++;return true;}};
 return {add:new Function('scope',`with(scope){${js}}`)(scope),before,trip:()=>trip,accepted:()=>accepted,error:()=>error};
}
const responseFor=(id:string)=>{const c=searchReferencePlaces(id==='2510911'?'Sevilla':'Sevilleja de la Jara',{explicitCountryNames:['Spain']}).find(c=>c.canonicalPlaceId===`reference:geonames:${id}`)!;assert.ok(c);return {canonicalPlaceId:c.canonicalPlaceId,name:c.canonicalName,country:'Spain',providerId:c.providerId,coordinates:c.coordinates,kind:c.placeType,placeType:c.placeType,routability:c.routability,referenceSnapshotId:referenceSnapshotId()};};

test('actual geocoder exposes Sevilleja as a distinct partial candidate, not catalogue Seville',async t=>{
 const require=createRequire(import.meta.url),bundle=await build({entryPoints:['app/api/journey-geocode/route.ts'],bundle:true,write:false,format:'cjs',platform:'node',external:['next/server']});
 const module={exports:{} as any};new Function('require','module','exports',bundle.outputFiles[0].text)(require,module,module.exports);
 let externalAttempts=0;t.mock.method(globalThis,'fetch',async()=>{externalAttempts++;throw new Error('Controlled offline provider');});
 const body=await(await module.exports.GET(new (require('next/server').NextRequest)('http://fixture/api/journey-geocode?place=Seville&country=Spain&candidates=1'))).json();
 assert.equal(externalAttempts,0);const candidate=body.candidates.find((c:any)=>c.canonicalPlaceId==='reference:geonames:2510906');
 assert.ok(candidate);assert.equal(candidate.name,'Sevilleja de la Jara');assert.equal(candidate.matchQuality,'partial');assert.deepEqual(candidate.coordinates,[-4.96387,39.57488]);
 const single=await(await module.exports.GET(new (require('next/server').NextRequest)('http://fixture/api/journey-geocode?place=Seville&country=Spain'))).json();
 assert.equal(single.result.name,'Sevilla','the exact country-scoped catalogue alias outranks partial airport and locality results');
});

test('actual Add Stop rejects a different locality before a canonical command or persistence',async()=>{
 const payload=responseFor('2510906'),before=structuredClone(payload),h=harness(payload);
 await h.add('Seville','Spain',undefined,undefined,canonicalPlaceSuggestionForId('seville'));
 assert.equal(h.accepted(),0);assert.deepEqual(h.trip(),h.before);assert.deepEqual(payload,before);assert.match(h.error(),/verified city or town/);
});

test('catalogue Seville still accepts its exact Sevilla alias without rewriting provider evidence',async()=>{
 const payload=responseFor('2510911'),before=structuredClone(payload),h=harness(payload);
 await h.add('Seville','Spain',undefined,undefined,canonicalPlaceSuggestionForId('seville'));
 assert.equal(h.accepted(),1);const added=h.trip().stops.at(-1)!;
 assert.equal(added.name,'Seville');assert.equal(added.canonicalPlaceId,'seville');assert.equal(added.providerId,payload.providerId);assert.equal(geographicallyReady(stopGeographicPlace(added)),true);assert.deepEqual(payload,before);
 assert.deepEqual(h.trip().brief.bookings,h.before.brief.bookings);assert.deepEqual(h.trip().planItems.filter(p=>p.type==='activity'),h.before.planItems.filter(p=>p.type==='activity'));assert.deepEqual(h.trip().stops.slice(0,-1),h.before.stops);
});

test('explicitly selected Sevilleja remains valid as its own locality',async()=>{
 const payload=responseFor('2510906'),h=harness(payload);
 const suggestion:CanonicalPlaceSuggestion={...payload,canonicalPlaceId:payload.canonicalPlaceId!,label:'Sevilleja de la Jara, Spain',placeType:'city',routability:'direct_destination',coordinates:payload.coordinates!,provenance:[{id:payload.providerId,label:'GeoNames',kind:'provider',supports:'Explicitly selected settlement'}]};
 await h.add(suggestion.name,'Spain',undefined,undefined,suggestion);
 assert.equal(h.accepted(),1);const added=h.trip().stops.at(-1)!;assert.equal(added.name,'Sevilleja de la Jara');assert.equal(added.canonicalPlaceId,payload.canonicalPlaceId);assert.deepEqual([added.longitude,added.latitude],payload.coordinates);
});

test('reading a historical binding preserves its saved identity and point without migration',()=>{
 const trip=requireReadableTripDocument(canonicalRouteFixture()),payload=responseFor('2510906');
 const place={name:'Seville',country:'Spain',canonicalPlaceId:'seville',providerId:payload.providerId,coordinates:payload.coordinates!};
 const binding={version:1 as const,source:'provider' as const,canonicalPlaceId:place.canonicalPlaceId,providerId:place.providerId,placeType:'city',country:'Spain',routability:'direct_destination',inputKey:geographicInputKey(place)};
 trip.stops[0]={...trip.stops[0],...place,longitude:place.coordinates[0],latitude:place.coordinates[1],geographicBinding:binding};
 const saved=JSON.parse(JSON.stringify(trip)),before=structuredClone(saved),read=requireReadableTripDocument(saved);
 assert.deepEqual(saved,before);assert.deepEqual(read.stops[0],before.stops[0]);assert.equal(geographicallyReady(stopGeographicPlace(read.stops[0])),true);
});
