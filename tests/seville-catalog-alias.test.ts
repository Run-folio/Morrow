import assert from 'node:assert/strict';
import test from 'node:test';
import {createRequire} from 'node:module';
import {build} from 'esbuild';
import {createOpenWorldPlaceProvider} from '../lib/easyt/open-world-place.server.ts';
import {referencePlaceById,searchReferencePlaces} from '../lib/easyt/place-reference.server.ts';
import {destinationKnowledge} from '../lib/easyt/destination-knowledge.ts';
import {buildCanonicalTripLegs} from '../lib/easyt/trip-legs.ts';
import {resolveCanonicalTransferJourney} from '../lib/easyt/multimodal-transfer-resolution.ts';
import {selectedTransferPlace} from './fixtures/accepted-transfer-place.ts';

const sevilla=referencePlaceById('reference:geonames:2510911')!;
const madrid=selectedTransferPlace('Madrid','Spain','reference:geonames:3117735','endpoint');
const correctSevilla=selectedTransferPlace('Sevilla','Spain',sevilla.canonicalPlaceId,'stop');
const offline:typeof fetch=async()=>{throw new Error('offline control must not require network');};

test('country-scoped catalogue alias finds the intact reference Sevilla tuple',async()=>{
 const provider=createOpenWorldPlaceProvider({searchMode:'reference-only',cache:new Map(),fetchImpl:offline});
 const choices=await provider.lookup('Seville',{countryNames:['Spain'],explicitCountryNames:['Spain']});
 const first=choices[0];assert.equal(first.canonicalPlaceId,sevilla.canonicalPlaceId);
 assert.equal(first.canonicalName,sevilla.canonicalName);assert.equal(first.providerId,sevilla.providerId);assert.deepEqual(first.coordinates,sevilla.coordinates);assert.deepEqual(first.aliases,sevilla.aliases);assert.equal(first.placeType,sevilla.placeType);
 assert.ok(choices.some(c=>c.canonicalName==='Sevilleja de la Jara'&&c.matchQuality==='partial'));
});

test('actual API chooses Sevilla for English catalogue Seville with and without Madrid context',async t=>{
 const require=createRequire(import.meta.url),bundle=await build({entryPoints:['app/api/journey-geocode/route.ts'],bundle:true,write:false,format:'cjs',platform:'node',external:['next/server']});
 const module={exports:{} as any};new Function('require','module','exports',bundle.outputFiles[0].text)(require,module,module.exports);
 let external=0;t.mock.method(globalThis,'fetch',async()=>{external++;throw new Error('offline control');});
 for(const nearby of ['', '&nearLat=40.4165&nearLon=-3.70256']){
  const body=await(await module.exports.GET(new (require('next/server').NextRequest)('http://fixture/api/journey-geocode?place=Seville&country=Spain'+nearby))).json();
  assert.equal(body.result?.canonicalPlaceId,sevilla.canonicalPlaceId);assert.equal(body.result?.name,'Sevilla');assert.equal(body.result?.providerId,sevilla.providerId);assert.deepEqual(body.result?.coordinates,sevilla.coordinates);
 }
 assert.equal(external,0);
});

test('prefix and wrong-country searches do not borrow the Spain alias',async()=>{
 const provider=createOpenWorldPlaceProvider({searchMode:'reference-only',cache:new Map(),fetchImpl:offline});
 for(const [phrase,countries] of [['Sevill',['Spain']],['Seville',['United States']],['Seville',[]]] as const){
  const choices=await provider.lookup(phrase,{explicitCountryNames:[...countries]});
  assert.equal(choices.some(c=>c.canonicalPlaceId===sevilla.canonicalPlaceId&&c.matchQuality==='exact'),false,phrase+countries.join(','));
 }
});

test('correct provider Sevilla resolves the existing Iberian rail evidence in both directions',async()=>{
 for(const [from,to] of [[madrid,correctSevilla],[correctSevilla,madrid]]){
  const before=structuredClone({from,to});
  assert.equal(destinationKnowledge.findIntercityRailConnection(from,to,391)?.networkId,'iberia-high-speed-intercity');
  const leg=buildCanonicalTripLegs({tripId:'catalog-alias',origin:{...from,coordinates:from.coordinates!},stops:[{id:'arrival',order:0,name:to.name,country:to.country!,canonicalPlaceId:to.canonicalPlaceId,providerId:to.providerId,geographicBinding:to.geographicBinding,longitude:to.coordinates![0],latitude:to.coordinates![1],arrivalDate:null,departureDate:null,nights:2}]})[0]!;
  const result=await resolveCanonicalTransferJourney(leg);assert.equal(result.leg.mode,'train');assert.ok(result.leg.durationMinutes!>120);assert.equal(result.assessment.retrieval,'completed');
  assert.deepEqual({from,to},before);
 }
});

test('rail alias does not apply to a prefix locality, airport, missing country or another country',()=>{
 for(const candidate of [
  {name:'Sevilleja de la Jara',country:'Spain',canonicalPlaceId:'reference:geonames:2510906'},
  {name:'Seville Airport',country:'Spain',canonicalPlaceId:'reference:ourairports:4049'},
  {...correctSevilla,country:'Colombia'}, {...correctSevilla,country:undefined},
 ])assert.equal(destinationKnowledge.findIntercityRailConnection(madrid,candidate,391),undefined,candidate.name+' '+candidate.country);
});

// Adding catalogue fallback must not replace the reference provider's own
// canonical-name/population ordering with an opaque source-ID tiebreaker.
test('lookup preserves direct reference ordering when no catalogue alias is added',async()=>{
 const provider=createOpenWorldPlaceProvider({searchMode:'reference-only',cache:new Map(),fetchImpl:offline});
 for(const phrase of ['Portland','Santiago','Lond']){
  const expected=searchReferencePlaces(phrase,{});
  const actual=await provider.lookup(phrase,{});
  assert.deepEqual(actual.map(c=>c.providerId),expected.map(c=>c.providerId),phrase);
 }
});
