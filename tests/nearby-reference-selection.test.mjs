import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {createRequire} from 'node:module';
import {canonicalPlaceSuggestionsForQuery,rankNearbyBaseCandidates} from '../lib/easyt/place-intelligence.ts';
import {referencePlaceById,referenceSnapshotId} from '../lib/easyt/place-reference.server.ts';
import {referenceSelectionMatches} from '../lib/easyt/place-reference.ts';
import {addStopSelection} from './helpers/builder-add-stop-selection.mjs';
const require=createRequire(import.meta.url),ts=require('typescript');
const apiSource=readFileSync(new URL('../app/api/journey-geocode/route.ts',import.meta.url),'utf8');
const responseSource=apiSource.slice(apiSource.indexOf('function responseNearbyCandidate('),apiSource.indexOf('export async function GET'));
const validSource=apiSource.slice(apiSource.indexOf('function validReferenceCandidate('),apiSource.indexOf('const planningParentTypes'));
const serialize=new Function('referencePlaceById','referenceSnapshotId','referenceSelectionMatches',ts.transpileModule(validSource+'\n'+responseSource+'\nreturn responseNearbyCandidate;', {compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText)(referencePlaceById,referenceSnapshotId,referenceSelectionMatches);
const beijing=canonicalPlaceSuggestionsForQuery('Beijing',[],30,true).find(s=>s.canonicalPlaceId==='reference:geonames:1816670');
const candidate={canonicalPlaceId:beijing.canonicalPlaceId,canonicalName:beijing.name,providerId:beijing.provenance.find(p=>p.kind==='provider').id,parentCountries:[beijing.country],placeType:beijing.placeType,coordinates:beijing.coordinates,routability:beijing.routability};
const anchor={canonicalName:'Synthetic Beijing landmark',placeType:'landmark',parentCountries:['China'],coordinates:[116.40723,39.9075]};
const wire=x=>JSON.parse(JSON.stringify(x));
test('nearby reference candidate keeps its canonical identity and proof through actual API serializer, Builder and country review',async()=>{
 const [ranked]=rankNearbyBaseCandidates(anchor,[candidate]);assert.ok(ranked);
 const response=wire(serialize(ranked));assert.ok(response);assert.equal(response.canonicalPlaceId,candidate.canonicalPlaceId);
 assert.equal(response.referenceSnapshotId,referenceSnapshotId());
 const result=await addStopSelection('nearby Beijing',response,{api:async()=>{throw Error('no lookup should replace an already selected reference');}});
 assert.deepEqual(result.errors,[]);assert.equal(result.ready,true);assert.equal(result.result.canonicalPlaceId,candidate.canonicalPlaceId);
});
test('nearby API rejects a self-consistent invented reference identity instead of blessing its snapshot',()=>{
 const forged={...beijing,canonicalPlaceId:'reference:geonames:99999999999',provenance:[{...beijing.provenance[0],kind:'provider',id:`reference:geonames:99999999999@${referenceSnapshotId()}:CN:city:116.39723:39.9075`}]};
 assert.equal(serialize(forged),null);
});
for(const [label,change] of [['country',c=>({...c,parentCountries:['Japan']})],['point',c=>({...c,coordinates:[0,0]})],['snapshot',c=>({...c,providerId:c.providerId.replace(/@[^:]+:/,'@old:')})]])test('nearby ranking refuses mismatched reference '+label,()=>assert.deepEqual(rankNearbyBaseCandidates(anchor,[change(candidate)]),[]));
test('ordinary provider nearby IDs and proof remain unchanged',()=>{
 const normal={...candidate,canonicalPlaceId:undefined,providerId:'photon:node:77'};const [ranked]=rankNearbyBaseCandidates(anchor,[normal]);assert.ok(ranked);
 const response=wire(serialize(ranked));assert.equal(response.canonicalPlaceId,'open-world:photon:node:77');assert.equal(response.providerId,'photon:node:77');assert.equal(response.referenceSnapshotId,undefined);
});
