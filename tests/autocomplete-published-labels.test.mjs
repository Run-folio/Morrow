import test from 'node:test';
import assert from 'node:assert/strict';
import {autocompleteRender} from './helpers/autocomplete-component.mjs';
import {canonicalPlaceSuggestionsForQuery} from '../lib/easyt/place-intelligence.ts';
import {mergeEquivalentPlaceSuggestions,placeSuggestionLocationDetail} from '../lib/easyt/place-autocomplete.ts';

const choices=name=>canonicalPlaceSuggestionsForQuery(name,[],30,true);
const pair=name=>choices(name).filter(c=>c.name===name&&c.placeType==='city');
for(const name of ['Beijing','Seoul','Paris','Manila']){
 test(`${name}: explicit planning-area catalog and reference choices retain distinguishable labels and raw selections`,async()=>{
  const view=autocompleteRender(name,{searchIntent:'planning-area'});
  try{
   await view.settle();
   const rows=view.rows().map(row=>{row.choose();return {label:row.label,choice:view.selected.at(-1)};})
    .filter(row=>row.choice.name===name&&row.choice.placeType==='city');
   assert.equal(rows.length,2);
   assert.equal(new Set(rows.map(row=>row.label)).size,2,'different unmerged records must not look like identical options');
   assert(rows.some(row=>/GeoNames/.test(row.label)));
   assert(rows.some(row=>/Morrovia curated place catalog/.test(row.label)));
   for(const row of rows)assert.deepEqual(JSON.parse(JSON.stringify(row.choice)),JSON.parse(JSON.stringify(pair(name).find(c=>c.canonicalPlaceId===row.choice.canonicalPlaceId))));
  }finally{view.close();}
 });
}
test('Bali API attribution echo collapses to one island while retaining base-selection intent',async()=>{
 const original=choices('Bali').find(c=>c.canonicalPlaceId==='bali');
 const view=autocompleteRender('Bali',{api:async()=>({status:200,body:{candidates:[{...original,kind:'island',providerId:'bali'}]}})});
 try{await view.settle();const rows=view.rows().filter(row=>{row.choose();return view.selected.at(-1).canonicalPlaceId==='bali';});
  assert.equal(rows.length,1);rows[0].choose();assert.equal(view.selected.at(-1).routability,'needs_base_selection');assert.equal(view.selected.at(-1).placeType,'island');
 }finally{view.close();}
});
test('Hong Kong explicit planning-area catalog, reference city and jurisdiction retain different tuples',async()=>{
 const view=autocompleteRender('Hong Kong',{searchIntent:'planning-area'});
 try{await view.settle();const rows=view.rows().map(row=>{row.choose();return {label:row.label,choice:view.selected.at(-1)};});
  for(const id of ['hong-kong','reference:geonames:1819729','jurisdiction-hk'])assert(rows.some(row=>row.choice.canonicalPlaceId===id));
  assert.equal(rows.find(row=>row.choice.canonicalPlaceId==='hong-kong').choice.country,'China');
  assert.equal(rows.find(row=>row.choice.canonicalPlaceId==='reference:geonames:1819729').choice.country,'Hong Kong');
  assert.equal(rows.find(row=>row.choice.canonicalPlaceId==='jurisdiction-hk').choice.routability,'planning_area');
  assert.equal(new Set(rows.map(row=>row.label)).size,rows.length);
 }finally{view.close();}
});
test('no name, proximity or matching point heuristic merges different canonical identities',()=>{
 const [a,b]=pair('Beijing');assert(a&&b);assert.deepEqual(mergeEquivalentPlaceSuggestions([a,b]),[a,b]);
 const unrelated={...a,canonicalPlaceId:'unreviewed-beijing',coordinates:b.coordinates};
 assert.deepEqual(mergeEquivalentPlaceSuggestions([unrelated,b]),[unrelated,b]);
});
test('published source labels are withheld from changed coordinates, country, type, name or reference proof',()=>{
 const a=pair('Manila').find(c=>c.canonicalPlaceId.startsWith('reference:'));
 for(const patch of [{coordinates:[0,0]},{country:'China'},{placeType:'town'},{name:'Unrelated place'},
  {referenceSnapshotId:'wrong-snapshot'},{provenance:[{id:'photon:node:123',kind:'provider'}]}]){
  const changed={...a,...patch};
  assert.doesNotMatch(placeSuggestionLocationDetail(changed,[changed,{...changed,canonicalPlaceId:'unrelated'}]),/GeoNames|Morrovia curated place catalog/);
 }
});
test('verified administrative differences remain the useful distinction and do not gain source boilerplate',()=>{
 const a={name:'San Pedro',canonicalPlaceId:'first',country:'Mexico',placeType:'town',administrativeHierarchy:['North']};
 const b={...a,canonicalPlaceId:'second',administrativeHierarchy:['South']};
 assert.equal(placeSuggestionLocationDetail(a,[a,b]),'North · Mexico');
 assert.equal(placeSuggestionLocationDetail(b,[a,b]),'South · Mexico');
});
test('a solitary known city keeps its compact location detail',()=>{
 const a=pair('Beijing')[0];assert.equal(placeSuggestionLocationDetail(a,[a]),'China');
});
test('Spanish duplicate details translate the uncertainty without changing source names',()=>{
 const items=pair('Beijing');
 for(const item of items){
  const detail=placeSuggestionLocationDetail(item,items,'es');
  assert.match(detail,/Ubicación por confirmar/);assert.doesNotMatch(detail,/Location to confirm/);
  assert.match(detail,item.canonicalPlaceId.startsWith('reference:')?/GeoNames/:/Morrovia curated place catalog/);
 }
});
