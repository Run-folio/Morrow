import test from 'node:test';
import assert from 'node:assert/strict';
import {referenceRecordKey,referenceSelectionMatches,type ReferencePlaceRecord} from '../lib/easyt/place-reference.ts';
const r:ReferencePlaceRecord={source:'geonames',sourceId:'10',canonicalPlaceId:'reference:geonames:10',providerId:'',canonicalName:'Fixture town',aliases:[],countryCode:'PF',placeType:'town',coordinates:[-149.5,-17.5],status:'active'};
const snapshot='fixture-snapshot';r.providerId=referenceRecordKey(r,snapshot);
const c={canonicalPlaceId:r.canonicalPlaceId,providerId:r.providerId,country:'French Polynesia',placeType:'town',coordinates:[-149.5,-17.5] as const};
test('exact source snapshot identity/type/jurisdiction/tuple is required, not catalogue distance tolerance',()=>{
 assert.equal(referenceSelectionMatches(c,r,snapshot),true);
 for(const change of [{canonicalPlaceId:'reference:geonames:11'},{providerId:r.providerId+'-stale'},{country:'France'},{placeType:'city'},{coordinates:[-149.50001,-17.5] as const},{coordinates:[-17.5,-149.5] as const}])assert.equal(referenceSelectionMatches({...c,...change},r,snapshot),false);
 assert.equal(referenceSelectionMatches(c,r,'changed-snapshot'),false);assert.equal(referenceSelectionMatches(c,{...r,status:'closed'},snapshot),false);assert.equal(referenceSelectionMatches(c,{...r,status:'quarantined'},snapshot),false);
});
