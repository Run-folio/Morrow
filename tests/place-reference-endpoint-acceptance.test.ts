import test from 'node:test';import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';import {createRequire} from 'node:module';
import {resolveTypedJourneyEndpoint,journeyEndpointIdentityIsCoherent,journeyEndpointPlaceFromSuggestion} from '../lib/easyt/journey-endpoints.ts';
import {geographicallyReady} from '../lib/easyt/geographic-binding.ts';
import {searchReferencePlaces} from '../lib/easyt/place-reference.server.ts';
import {REFERENCE_SNAPSHOT_ID} from '../lib/easyt/place-reference.ts';
import {actualCallbackHarness} from './helpers/builder-handoff-callback.ts';
import {prepareBuilderHandlerEdit} from '../lib/easyt/trip-builder-handler-contract.ts';
import {builderDocumentFingerprint} from '../lib/easyt/trip-builder-document-commit.ts';
import type {CanonicalPlaceSuggestion} from '../lib/easyt/place-intelligence.ts';
const record=searchReferencePlaces('Lima',{explicitCountryNames:['Peru']}).find(c=>c.canonicalPlaceId==='reference:geonames:3936456')!;
const current={...record,name:record.canonicalName,country:'Peru',coordinates:record.coordinates!,referenceSnapshotId:REFERENCE_SNAPSHOT_ID};
const negatives=[{...current,providerId:current.providerId.replace(`@${REFERENCE_SNAPSHOT_ID}:`,'@future-snapshot:'),referenceSnapshotId:'future-snapshot'},
 {...current,referenceSnapshotId:undefined},{...current,providerId:current.providerId.replace(':PE:',':CL:')},{...current,coordinates:[-77,-12] as [number,number]},
 {...current,coordinates:[0,0] as [number,number],providerId:current.providerId.replace('-77.02824:-12.04318','0:0')}];
test('typed endpoint resolves current reference but never returns rejected source facts via raw fallback',()=>{
 const valid=resolveTypedJourneyEndpoint('Lima',[current]);assert.equal(valid.status,'resolved');if(valid.status==='resolved')assert.equal(geographicallyReady(valid.place,'endpoint'),true);
 for(const invalid of negatives)assert.deepEqual(resolveTypedJourneyEndpoint('Lima',[invalid]),{status:'unresolved'});
 assert.deepEqual(resolveTypedJourneyEndpoint('Lima',[...negatives,current]),valid,'incompatible identities cannot affect valid ranking or uniqueness');
 const photon={...current,canonicalPlaceId:'lima',providerId:'photon:node:legacy',referenceSnapshotId:undefined};assert.equal(resolveTypedJourneyEndpoint('Lima',[photon]).status,'resolved');
});
test('actual Builder endpoint draft callback returns no place and causes no accepted edit for incompatible source evidence',async()=>{
 const require=createRequire(import.meta.url),ts=require('typescript'),source=readFileSync(new URL('../app/journey/new/trip-builder.tsx',import.meta.url),'utf8');
 const callbackSource=source.slice(source.indexOf('  const resolveEndpointDraftPlace ='),source.indexOf('  const commitTripDetailsDocument ='));
 for(const role of ['start','end'] as const)for(const candidate of [current,...negatives]){
  let error='',accepted=0;const scope={journeyEndpointIdentityIsCoherent,resolveTypedJourneyEndpoint,language:'en',setDetailsCommitError:(value:string)=>{error=value},fetch:async()=>({json:async()=>({candidates:[candidate]})})};
  const callback=new Function('scope',`with(scope){${ts.transpileModule(callbackSource+'\nreturn resolveEndpointDraftPlace;',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText}}`)(scope);
  const h=actualCallbackHarness(),before=JSON.stringify(h.trip()),place=await callback({name:'Lima'},role);
  if(place){const result=prepareBuilderHandlerEdit(h.trip(),{kind:'origin',place},builderDocumentFingerprint(h.trip()));assert.ok(result.ok);accepted++;}
  if(candidate===current){assert.ok(place?.geographicBinding);assert.equal(error,'');assert.equal(accepted,1);}
  else {assert.equal(place,null);assert.ok(error);assert.equal(accepted,0);assert.equal(JSON.stringify(h.trip()),before);}
 }
});
test('manual suggestion fallback rejects incompatible reference facts while compiled current selection binds',()=>{
 const suggestion=(candidate:Omit<typeof current,'referenceSnapshotId'> & {referenceSnapshotId?:string}):CanonicalPlaceSuggestion=>({...candidate,canonicalPlaceId:candidate.canonicalPlaceId!,placeType:candidate.placeType,label:'Lima, Peru',provenance:[{id:candidate.providerId,label:'GeoNames',kind:'provider',supports:'Selected source point'}]});
 assert.ok(journeyEndpointPlaceFromSuggestion(suggestion(current))?.geographicBinding);
 for(const invalid of negatives)assert.equal(journeyEndpointPlaceFromSuggestion(suggestion(invalid)),undefined);
});

import {emptyHomepageInput} from './fixtures/homepage-dual-entry.ts';
import {projectHomepageInput} from '../lib/easyt/home-trip-handoff.ts';
test('homepage new destination projection cannot fall back to rejected reference facts and preserves the draft',()=>{
 for(const candidate of [current,...negatives]){
  const selection:CanonicalPlaceSuggestion={...candidate,canonicalPlaceId:candidate.canonicalPlaceId!,label:'Lima, Peru',provenance:[{id:candidate.providerId,label:'GeoNames',kind:'provider',supports:'Selected source point'}]};
  const snapshot={...emptyHomepageInput(),tripType:{state:'selected' as const,value:'one_way' as const},entries:[{id:'lima-intent',text:'Lima',selection}]},before=JSON.stringify(snapshot);
  const result=projectHomepageInput({snapshot,profile:null,handoffId:'reference-selection'});
  if(candidate===current){assert.ok(result.ok);assert.ok(result.draft.destinations);assert.ok(result.draft.destinations[0].geographicBinding);assert.equal(result.draft.destinations[0].canonicalPlaceId,current.canonicalPlaceId);}
  else {assert.equal(result.ok,false);if(!result.ok)assert.ok(result.issues.some(issue=>issue.field==='destinations'&&issue.code==='unresolved'));}
  assert.equal(JSON.stringify(snapshot),before,'confirmation must not erase or rewrite the existing draft');
 }
});

import {placeSuggestionRequiresBaseSelection} from '../lib/easyt/place-intelligence.ts';
test('actual manual Builder origin callback refuses rejected suggestions before dispatching an accepted edit',async()=>{
 const require=createRequire(import.meta.url),ts=require('typescript'),source=readFileSync(new URL('../app/journey/new/trip-builder.tsx',import.meta.url),'utf8');
 const callbackSource=source.slice(source.indexOf('  const selectOriginSuggestion ='),source.indexOf('  const changeJourneyEndInput ='));
 for(const candidate of [current,...negatives]){
  const h=actualCallbackHarness();let accepted=0,error='';
  const scope={placeSuggestionRequiresBaseSelection,journeyEndpointPlaceFromSuggestion,originResolutionVersionRef:{current:0},builderEditSessionRef:{current:{getSnapshot:()=>({trip:h.trip(),inputRevision:1,draft:{fields:[]}})}},ui:{verifyOrigin:'Choose a verified place'},setOriginError:(value:string)=>{error=value},setOriginTouched:()=>{},dispatchAcceptedBuilderEdit:(command:any)=>{const edit=prepareBuilderHandlerEdit(h.trip(),command,builderDocumentFingerprint(h.trip()));assert.ok(edit.ok);accepted++;return true}};
  const callback=new Function('scope',`with(scope){${ts.transpileModule(callbackSource+'\nreturn selectOriginSuggestion;',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText}}`)(scope);
  const suggestion:CanonicalPlaceSuggestion={...candidate,canonicalPlaceId:candidate.canonicalPlaceId!,label:'Lima, Peru',provenance:[{id:candidate.providerId,label:'GeoNames',kind:'provider',supports:'Selected source point'}]};
  const before=JSON.stringify(h.trip()),result=await callback(suggestion);
  assert.equal(result,candidate===current);assert.equal(accepted,candidate===current?1:0);assert.equal(Boolean(error),candidate!==current);
  assert.equal(JSON.stringify(h.trip()),before);
 }
});
