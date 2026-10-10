import assert from 'node:assert/strict';
import test from 'node:test';
import {estimateLegForConstraints} from '../lib/easyt/planner.ts';
import {landConnectionEvidence} from '../lib/easyt/land-connection.ts';
import {mergeEquivalentPlaceSuggestions,placeSuggestionLocationDetail} from '../lib/easyt/place-autocomplete.ts';
import {canonicalPlaceSuggestionsForQuery} from '../lib/easyt/place-intelligence.ts';
import {scorePublishedRouteImageCandidate} from '../lib/easyt/published-route-image-pipeline.ts';

test('generic road estimate requires positive same-land evidence',()=>{
 assert.equal(landConnectionEvidence([120.2043,11.9986],[121.00861,10.8525]),'unproven');
 assert.notEqual(landConnectionEvidence([120.9842,14.5995],[123.8854,10.3157]),'same-land');
 assert.notEqual(landConnectionEvidence([115.1889,-8.4095],[112.7521,-7.2575]),'same-land','Bali and Java require a crossing');
 assert.notEqual(landConnectionEvidence([103.8198,1.3521],[103.7618,1.4927]),'same-land','Singapore and Johor have no direct land continuity');
 assert.notEqual(landConnectionEvidence([-73.9712,40.7831],[-74.0776,40.7282]),'same-land','a road bridge cannot be inferred from same-country distance');
 assert.equal(landConnectionEvidence([12.4964,41.9028],[11.2558,43.7696]),'same-land');
 assert.equal(landConnectionEvidence([2.1734,41.3851],[1.8118,41.2359]),'same-land','coastal Barcelona to Sitges stays available');
 assert.equal(landConnectionEvidence([174.7633,-36.8485],[175.2793,-37.787]),'same-land','Auckland to Hamilton stays available');
 assert.equal(landConnectionEvidence([-0.1276,51.5072],[2.3522,48.8566]),'separate-land');
 const from={name:'Coron',country:'Philippines',coordinates:[120.2043,11.9986] as [number,number]};
 const to={id:'cuyo',name:'Cuyo',country:'Philippines',coordinates:[121.00861,10.8525] as [number,number]};
 assert.equal(estimateLegForConstraints(from,to).mode,'unknown');
 assert.equal(estimateLegForConstraints({name:'Denpasar',country:'Indonesia',coordinates:[115.1889,-8.4095]},
  {id:'surabaya',name:'Surabaya',country:'Indonesia',coordinates:[112.7521,-7.2575]}).mode,'unknown');
 assert.equal(estimateLegForConstraints({name:'Rome',country:'Italy',coordinates:[12.4964,41.9028]},{id:'tivoli',name:'Tivoli',country:'Italy',coordinates:[12.7989,41.9609]}).mode,'road');
});

test('known catalog/source Manila identity is one choice, unresolved namesakes use human-readable context',()=>{
 const manila=canonicalPlaceSuggestionsForQuery('Manila').filter(p=>p.name==='Manila'&&p.country==='Philippines'&&p.placeType==='city');
 assert.equal(mergeEquivalentPlaceSuggestions(manila).length,1);
 const distinct=[{name:'Springfield',country:'United States',region:'Illinois',placeType:'city',canonicalPlaceId:'a',coordinates:[-89.65,39.78]},
 {name:'Springfield',country:'United States',region:'Massachusetts',placeType:'city',canonicalPlaceId:'b',coordinates:[-72.59,42.10]}];
 assert.deepEqual(distinct.map(p=>placeSuggestionLocationDetail(p,distinct)),['Illinois · United States','Massachusetts · United States']);
});

test('a transit ferry mentioning both stops is not destination scenery',()=>{
 const score=scorePublishedRouteImageCandidate({key:'manila',name:'Manila',country:'Philippines',coordinates:[120.9842,14.5995],routeKeys:[],siblingNames:['Cebu'],attachedLandmarks:[]},
 {provider:'wikimedia',id:'File:Philippines-1981-44 hg.jpg',src:'https://upload.wikimedia.org/ferry.jpg',sourceUrl:'https://commons.wikimedia.org/wiki/File:Philippines-1981-44_hg.jpg',author:'Author',license:'CC BY 4.0',licenseUrl:'https://creativecommons.org/licenses/by/4.0/',width:1600,height:900,alt:'Philippines 1981, ferry from Cebu City to Manila',description:'Ferry from Cebu City to Manila harbour'});
 assert.equal(score.accepted,false);
});
