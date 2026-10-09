import test from 'node:test';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {geographicCandidateMatches,geographicInputKey,stopGeographicPlace} from '../lib/easyt/geographic-binding.ts';
import {authoredContentKey} from '../lib/easyt/trip-retained-authored-content.ts';
import assert from 'node:assert/strict';
import {actualCallbackHarness} from './helpers/builder-handoff-callback.ts';
import {searchReferencePlaces} from '../lib/easyt/place-reference.server.ts';
import {REFERENCE_SNAPSHOT_ID} from '../lib/easyt/place-reference.ts';
import {acceptedGeographicPlace,geographicallyReady} from '../lib/easyt/geographic-binding.ts';
const record=searchReferencePlaces('Lima',{explicitCountryNames:['Peru']}).find(c=>c.canonicalPlaceId==='reference:geonames:3936456')!;
const current={...record,name:record.canonicalName,country:'Peru',coordinates:record.coordinates!,referenceSnapshotId:REFERENCE_SNAPSHOT_ID};
const owner={name:'Lima',country:'Peru',canonicalPlaceId:current.canonicalPlaceId};
const future={...current,providerId:current.providerId.replace(`@${REFERENCE_SNAPSHOT_ID}:`,'@future-snapshot:'),referenceSnapshotId:'future-snapshot'};
test('actual initial Builder callback rejects incompatible reference response without accepted edit',()=>{
 const h=actualCallbackHarness();h.send([future]);assert.equal(h.accepted(),0);assert.deepEqual(h.trip(),h.before);
 assert.ok(h.choices().every(item=>item.choices.length===0));
});
test('new shared geographic writer binds only the exact compiled reference tuple',()=>{
 assert.ok(acceptedGeographicPlace(owner,current));
 for(const bad of [future,{...current,referenceSnapshotId:undefined},{...current,canonicalPlaceId:'reference:geonames:1'},{...current,country:'Chile'},{...current,coordinates:[-77,-12] as [number,number]},{...current,placeType:'town'},{...current,coordinates:{0:-77.02824,1:-12.04318,length:2} as unknown as [number,number]}])assert.equal(acceptedGeographicPlace(owner,bad),undefined);
 assert.equal(acceptedGeographicPlace({...owner,canonicalPlaceId:'reference:geonames:1'},current),undefined);
});
test('current reference callback preserves sibling budget, manual order, nights, commitments and content',()=>{
 const h=actualCallbackHarness();h.trip().brief.budgetBand='high';h.trip().stops[1].nights=5;const before=structuredClone(h.trip());
 h.send([current]);assert.equal(h.accepted(),1);const after=h.trip();
 assert.equal(after.brief.budgetBand,'high');assert.equal(after.stops[1].nights,5);
 assert.deepEqual(after.brief.intent.route.orderedStopIds,before.brief.intent.route.orderedStopIds);
 assert.deepEqual(after.planItems,before.planItems);assert.deepEqual(after.brief.intent.hardConstraints.fixedCommitments,before.brief.intent.hardConstraints.fixedCommitments);
});
test('historical accepted reference bindings remain readable without current snapshot acceptance',()=>{
 const place=acceptedGeographicPlace(owner,current)!;assert.ok(place);
 const old={...place,providerId:future.providerId,geographicBinding:{...place.geographicBinding!,providerId:future.providerId,inputKey:JSON.stringify([place.canonicalPlaceId,future.providerId,'lima','peru',place.coordinates])}};
 assert.equal(geographicallyReady(old),true);assert.equal(acceptedGeographicPlace(owner,future),undefined);
});

test('actual saved Builder lookup filters mismatched snapshots and never saves during confirmation',async()=>{
 const require=createRequire(import.meta.url),ts=require('typescript');
 const source=readFileSync(new URL('../app/journey/new/trip-builder.tsx',import.meta.url),'utf8');
 const helpers=source.slice(source.indexOf('  const savedTargetPlace='),source.indexOf('  const dismissSavedFinish='));
 const lookup=source.slice(source.indexOf('  const confirmSavedLocation='),source.indexOf('  const confirmSavedFinish='));
 for(const candidate of [current,future]){
  const h=actualCallbackHarness(undefined,current.canonicalPlaceId),before=JSON.stringify(h.trip());let review:any;
  const scope={...h.scope,stopGeographicPlace,authoredContentKey,geographicInputKey,geographicallyReady,geographicCandidateMatches,
   savedFinishRequestRef:{current:null},setSavedFinishReview:(value:any)=>{review=value},
   withProviderTimeout:async({request,signal}:any)=>request(signal),fetch:async()=>({ok:true,json:async()=>({candidates:[candidate]})})};
  const callback=new Function('scope',`with(scope){${ts.transpileModule(helpers+lookup+'\nreturn confirmSavedLocation;',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText}}`)(scope);
  await callback(h.trip().stops[0].id);
  assert.equal(review.status,candidate===current?'ready':'unavailable');assert.equal(review.choices.length,candidate===current?1:0);
  assert.equal(h.accepted(),0);assert.equal(JSON.stringify(h.trip()),before);
 }
});

test('pre-canonical handoff and endpoint suggestion cannot bind incompatible new reference evidence',()=>{
 const h=actualCallbackHarness();const result=h.sendBeforeCanonical([future]);assert.deepEqual(result.after,result.before);
 assert.equal(acceptedGeographicPlace({...owner,name:'Lima'},future,'endpoint'),undefined);
});

import {canonicalPlaceSuggestionForId,canonicalPlaceSuggestionsForQuery} from '../lib/easyt/place-intelligence.ts';
import {journeyEndpointPlaceFromSuggestion} from '../lib/easyt/journey-endpoints.ts';
import {referenceCountrySeeds} from '../lib/easyt/place-reference.ts';
test('compiled generated catalog choices carry evidence through manual endpoint selection',()=>{
 const seed=referenceCountrySeeds('FJ')[0];
 for(const suggestion of [canonicalPlaceSuggestionForId(seed.canonicalPlaceId),canonicalPlaceSuggestionsForQuery(seed.canonicalName,['Fiji']).find(s=>s.canonicalPlaceId===seed.canonicalPlaceId)]){
  assert.ok(suggestion);assert.equal(suggestion.referenceSnapshotId,REFERENCE_SNAPSHOT_ID);
  const endpoint=journeyEndpointPlaceFromSuggestion(suggestion);assert.ok(endpoint);assert.ok(endpoint.geographicBinding);assert.equal(geographicallyReady(endpoint,'endpoint'),true);
 }
});
