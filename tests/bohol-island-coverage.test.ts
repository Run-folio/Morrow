import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { normalizePhysicalIslandBaseCandidates } from '../lib/easyt/openstreetmap-island-containment.server.ts';
import { compileIslandSource } from '../lib/easyt/island-geography-source.ts';
import { createOpenWorldPlaceProvider } from '../lib/easyt/open-world-place.server.ts';
import { searchReferencePlaces } from '../lib/easyt/place-reference.server.ts';
import type { PlaceProviderCandidate, PlanningParentConstraint } from '../lib/easyt/place-intelligence.ts';
import { captureJourneyBriefWithProvider } from '../lib/easyt/journey-capture.ts';
const captured = JSON.parse(gunzipSync(readFileSync('data/place-reference/islands/bohol.json.gz')).toString());
const baseline = JSON.parse(readFileSync('tests/fixtures/bohol-search-baseline.json','utf8'));
const parent: PlanningParentConstraint = { canonicalName:'Bohol', canonicalPlaceId:'open-world:photon:R:3625899',placeType:'island',parentCountries:['Philippines'] };
const tagbilaran = () => searchReferencePlaces('Tagbilaran City',{explicitCountryNames:['Philippines']}).find(c=>c.canonicalPlaceId==='reference:geonames:1684497')!;
const signature = (c: PlaceProviderCandidate) => ({providerId:c.providerId,canonicalPlaceId:c.canonicalPlaceId??null,name:c.canonicalName,type:c.placeType,countries:c.parentCountries,point:c.coordinates,rank:c.rankScore,routability:c.routability,match:c.matchQuality});

for(const row of baseline.filter((r:any)=>r.phrase!=='Bohol')) test(`normal search preserves the 67dd09d ${row.phrase}/${row.country} choices`,async()=>{
  let calls=0;const provider=createOpenWorldPlaceProvider({cache:new Map(),searchMode:'reference-with-photon',fetchImpl:async()=>{calls++;if(row.phrase.startsWith('Bohol'))return Response.json(captured.identity.body);throw Error('offline normal search control');}});
  const results=await provider.lookup(row.phrase,{travelIntent:'route-stop',...(row.country?{explicitCountryNames:[row.country],countryNames:[row.country]}:{})});
  assert.deepEqual(results.map(signature),row.candidates);assert.equal(calls,row.calls);
});

test('Bohol bundle exposes an island planning choice without a provider call or fake overnight endpoint',async()=>{
  let calls=0;const provider=createOpenWorldPlaceProvider({cache:new Map(),fetchImpl:async()=>{calls++;throw Error('all providers unavailable');}});
  const choices=await provider.lookup('Bohol',{travelIntent:'route-stop',explicitCountryNames:['Philippines']});
  const island=choices.find(c=>c.providerId==='island-snapshot:relation:3625899');assert(island);
  assert.equal(island.placeType,'island');assert.equal(island.routability,'needs_base_selection');assert.equal(calls,0);
  assert(choices.some(c=>c.providerId!==island.providerId),'local homonyms remain visible');
});
test('full Bohol capture retains an area/base decision instead of accepting its identity point as a city',async()=>{
  const provider=createOpenWorldPlaceProvider({cache:new Map(),fetchImpl:async()=>{throw Error('offline capture');}});
  const brief=await captureJourneyBriefWithProvider('Bohol, Philippines for 4 nights.',provider);
  const mention=brief.mentions.find(m=>m.sourceText.includes('Bohol'));assert(mention);
  if(mention.placeType==='island'){assert.equal(mention.requiresBaseSelection,true);assert.equal(mention.directlyRoutable,false);}
  else {assert.equal(mention.status,'ambiguous');assert(mention.candidates?.some(c=>c.placeType==='island'));}
});
test('covered Bohol accepts the unchanged real Tagbilaran reference tuple with zero live calls',async()=>{
  const original=tagbilaran();assert(original);let calls=0;
  const [accepted]=await normalizePhysicalIslandBaseCandidates([original],parent,{fetchImpl:async()=>{calls++;throw Error('offline');}});
  assert(accepted);assert.equal(calls,0);assert.equal(accepted.canonicalPlaceId,original.canonicalPlaceId);assert.equal(accepted.providerId,original.providerId);assert.deepEqual(accepted.coordinates,[123.85219,9.65556]);
  assert.equal(accepted.placeType,'city');assert.equal(accepted.parentRegionId,'Bohol');assert.match(accepted.normalizationReason!,/relation:3625899/);assert.match(accepted.normalizationReason!,/snapshot=/);
});
test('Bohol physical proof refuses changed reference identity, provider, type, point and country',async()=>{
  const c=tagbilaran();
  for(const candidate of [{...c,canonicalPlaceId:'reference:geonames:1'},{...c,providerId:c.providerId.replace('@','@changed-')},{...c,placeType:'town' as const},{...c,coordinates:[123.85220,9.65556] as [number,number]},{...c,parentCountries:['Japan']}]){
    assert.deepEqual(await normalizePhysicalIslandBaseCandidates([candidate],parent,{fetchImpl:async()=>{throw Error('must not fetch');}}),[]);
  }
});
test('Bohol never accepts wrong islands or exact boundary using parent labels and broad bounds',async()=>{
  const c=tagbilaran(),boundary=compileIslandSource(captured).geometry.outer[0]![0]!;
  for(const point of [[119.8922002,10.4819463],[123.5138212,9.2155864],[123.7733382,9.577673],boundary] as [number,number][]){
    const candidate={...c,providerId:'controlled:actual-point',canonicalPlaceId:'controlled:actual-point',coordinates:point};
    assert.deepEqual(await normalizePhysicalIslandBaseCandidates([candidate],{...parent,bounds:{west:115,east:128,south:4,north:20}},{fetchImpl:async()=>{throw Error('must not fetch');}}),[]);
  }
});
test('Bohol label cannot reinterpret the province source ID as a physical island',async()=>{
  await assert.rejects(normalizePhysicalIslandBaseCandidates([tagbilaran()],{...parent,canonicalPlaceId:'open-world:photon:R:1550487'},{fetchImpl:async()=>{throw Error('must not fetch');}}),/Conflicting covered island identity/);
});
