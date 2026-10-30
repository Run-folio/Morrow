import test from 'node:test';
import assert from 'node:assert/strict';
import {searchReferencePlaces} from '../lib/easyt/place-reference.server.ts';
import {REFERENCE_SNAPSHOT_ID} from '../lib/easyt/place-reference.ts';
import {geographicCandidateMatches,acceptedGeographicPlace,geographicallyReady} from '../lib/easyt/geographic-binding.ts';
import {canonicalPlaceFactsMatch} from '../lib/easyt/place-intelligence.ts';
import {sameRegisteredCountry} from '../lib/easyt/country-registry.ts';
const record=searchReferencePlaces('Istanbul',{travelIntent:'route-stop',explicitCountryNames:['Turkey']}).find(c=>c.canonicalPlaceId==='reference:geonames:745044')!;
const city={...record,name:record.canonicalName,country:record.parentCountries![0],coordinates:record.coordinates!,referenceSnapshotId:REFERENCE_SNAPSHOT_ID};
test('saved Istanbul Turkey admits the exact compiled Türkiye city without rewriting its legacy identity',()=>{
 for(const id of [undefined,'istanbul',city.canonicalPlaceId]){
  const owner={name:'Istanbul',country:'Turkey',canonicalPlaceId:id};assert.equal(geographicCandidateMatches(owner,city),true);
  const chosen=acceptedGeographicPlace(owner,city)!;assert.ok(chosen);assert.equal(chosen.canonicalPlaceId,id??city.canonicalPlaceId);assert.equal(geographicallyReady(chosen),true);assert.equal(geographicallyReady(JSON.parse(JSON.stringify(chosen))),true);assert.equal(owner.country,'Turkey');
 }
});
test('catalogue facts accept a known country alias and retain foreign-country/geometry rejection',()=>{
 assert.equal(canonicalPlaceFactsMatch('istanbul',{country:'Türkiye',coordinates:city.coordinates}),true);
 assert.equal(canonicalPlaceFactsMatch('istanbul',{country:'Greece',coordinates:city.coordinates}),false);
 assert.equal(canonicalPlaceFactsMatch('nikko',{country:'Japan',coordinates:[0,0]}),false);
});
test('alias compatibility never relaxes exact candidate snapshot identity or stay role',()=>{
 const owner={name:'Istanbul',country:'Turkey',canonicalPlaceId:'istanbul'};
 for(const bad of [{...city,referenceSnapshotId:'future'},{...city,providerId:'unreviewed'},{...city,canonicalPlaceId:'reference:geonames:1'},{...city,country:'Greece'},{...city,coordinates:[0,0] as [number,number]},{...city,name:'Athens'}])assert.equal(acceptedGeographicPlace(owner,bad),undefined);
 const airports=searchReferencePlaces('Istanbul',{travelIntent:'route-stop',explicitCountryNames:['Turkey']}).filter(c=>c.placeType==='transport_gateway');assert.ok(airports.length);
 for(const airport of airports){const candidate={...airport,name:airport.canonicalName,country:airport.parentCountries![0],coordinates:airport.coordinates!,referenceSnapshotId:REFERENCE_SNAPSHOT_ID};assert.equal(acceptedGeographicPlace({...owner,name:airport.canonicalName,canonicalPlaceId:undefined},candidate,'stop'),undefined);}
});

test('country equivalence requires a known registry match, never two unknown values',()=>{
 assert.equal(sameRegisteredCountry('Turkey','Türkiye'),true);assert.equal(sameRegisteredCountry('TR','Türkiye'),true);
 for(const [a,b] of [['Atlantis','El Dorado'],['',''],[undefined,null],['Turkey','Greece'],['Congo','Democratic Republic of the Congo']])assert.equal(sameRegisteredCountry(a,b),false);
});
