import assert from 'node:assert/strict';
import test from 'node:test';
import { homepagePresentation } from './helpers/autocomplete-component.mjs';
import { canonicalPlaceSuggestionsForQuery } from '../lib/easyt/place-intelligence.ts';
import { destinationIntentPresentationInput, destinationSelectionCategory, destinationSelectionLabel, destinationTypeLabel } from '../lib/easyt/destination-intent-presentation.ts';
import type { DestinationIntent } from '../lib/easyt/trip.ts';

const select=(query:string,id:string)=>{
 const item=canonicalPlaceSuggestionsForQuery(query,[],100,true).find(row=>row.canonicalPlaceId===id);
 assert.ok(item,id);return item;
};
const entry=(selection:any,index=0)=>({id:`intent-${index}`,text:selection.name,selection});
test('actual homepage counts broad islands as planning areas rather than points of interest',()=>{
 const view=homepagePresentation([entry(select('Bali','bali'))]);
 assert.equal(view.status,'1 planning area');
});
test('actual homepage distinguishes same-name country and capital without merging identities',()=>{
 const country=select('San Marino','san-marino'),city=select('San Marino','reference:geonames:3168070');
 const entries=[entry(country,0),entry(city,1)],before=JSON.stringify(entries);
 const view=homepagePresentation(entries);
 assert.deepEqual(view.tags.map((tag:any)=>tag.label),['San Marino · Country','San Marino · City']);
 assert.deepEqual(view.tags.map((tag:any)=>tag.removeLabel),['Remove San Marino · Country','Remove San Marino · City']);
 assert.equal(JSON.stringify(entries),before);
});
test('ordinary city chip keeps its concise name',()=>{
 const view=homepagePresentation([entry(select('Beijing','beijing'))]);
 assert.equal(view.tags[0].label,'Beijing');
});
test('same-name cities in different countries remain visibly distinct',()=>{
 const peers=[{name:'Paris',placeType:'city',country:'France'},{name:'Paris',placeType:'city',country:'United States'}];
 assert.deepEqual(peers.map(row=>destinationSelectionLabel(row,peers)),['Paris · City · France','Paris · City · United States']);
});
test('island, landmark and unknown records follow shared policy with localized type labels',()=>{
 assert.equal(destinationSelectionCategory(select('San Marino','san-marino')),'area');
 assert.equal(destinationSelectionCategory({...select('Bali','bali'),placeType:'landmark',routability:'anchor_or_poi'}),'visit');
 assert.equal(destinationSelectionCategory({placeType:'unknown',name:'Unconfirmed'}),'unconfirmed');
 assert.equal(destinationTypeLabel('country','es'),'País');
 assert.equal(destinationTypeLabel('island'),'Island');
});
test('a stale city binding cannot relabel a country or an unknown current selection',()=>{
 const source={id:'country-sm',sourceText:'San Marino',kind:'planning_area',selectedPlace:{name:'San Marino',country:'San Marino',canonicalPlaceId:'san-marino',geographicBinding:{version:1,source:'provider',canonicalPlaceId:'reference:geonames:3168070',providerId:'3168070',placeType:'city',country:'San Marino',routability:'direct_destination',inputKey:'old-selection'}},resolution:'needs_base',requestedNights:null,routeMembership:'required',stopIds:[]} as DestinationIntent;
 assert.equal(destinationIntentPresentationInput(source).placeType,'country');
 assert.equal(destinationIntentPresentationInput({...source,kind:'overnight_place',selectedPlace:{...source.selectedPlace!,canonicalPlaceId:'unrecognized-current'}}).placeType,undefined);
});
