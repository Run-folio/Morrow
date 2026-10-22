import assert from 'node:assert/strict';
import test from 'node:test';
import {autocompleteRender,homepagePresentation} from './helpers/autocomplete-component.mjs';
import {canonicalPlaceSuggestionsForQuery} from '../lib/easyt/place-intelligence.ts';
import {consolidateFreshDestinationSuggestions,destinationPlanningGroupKey,freshDestinationTarget} from '../lib/easyt/destination-planning-policy.ts';
import {REFERENCE_SNAPSHOT_ID} from '../lib/easyt/place-reference.ts';

const fresh={intent:'fresh-stop' as const};
function choices(){
 const rows=canonicalPlaceSuggestionsForQuery('Osaka',[],100,true);
 const legacy=rows.find(row=>row.canonicalPlaceId==='osaka')!,reference=rows.find(row=>row.canonicalPlaceId==='reference:geonames:1853909')!;
 assert.ok(legacy);assert.ok(reference);return {legacy,reference};
}

test('actual fresh Osaka autocomplete presents one reviewed city and selects its intact maintained tuple',async()=>{
 const view=autocompleteRender('Osaka');
 try {
  await view.settle();
  assert.equal(view.rows().length,1);
  view.rows()[0].choose();
  assert.equal(view.selected[0].canonicalPlaceId,'reference:geonames:1853909');
  assert.deepEqual(JSON.parse(JSON.stringify(view.selected[0])),JSON.parse(JSON.stringify(choices().reference)));
 } finally {view.close();}
});

test('fresh Osaka grouping is independent of candidate order and never alters source objects',()=>{
 const {legacy,reference}=choices(),before=structuredClone([legacy,reference]);
 for(const rows of [[legacy,reference],[reference,legacy]]){
  assert.strictEqual(freshDestinationTarget(legacy,rows,fresh),reference);
  assert.deepEqual(consolidateFreshDestinationSuggestions(rows,fresh),[reference]);
  assert.equal(destinationPlanningGroupKey(legacy,rows,fresh),'city-stop:osaka');
 }
 assert.deepEqual([legacy,reference],before);
 assert.deepEqual(consolidateFreshDestinationSuggestions([legacy],fresh),[legacy],'an absent accepted target cannot suppress the source');
});

test('Osaka saved selections and intentional repeated visits retain each occurrence and source identity',()=>{
 const {legacy,reference}=choices();
 const rows=[legacy,reference,legacy],before=structuredClone(rows);
 for(const intent of ['existing-selection','explicit-area'] as const){
  assert.deepEqual(consolidateFreshDestinationSuggestions(rows,{intent}),rows);
  assert.equal(freshDestinationTarget(legacy,rows,{intent}),null);
  assert.equal(destinationPlanningGroupKey(legacy,rows,{intent}),'osaka');
 }
 const entries=rows.map((selection,index)=>({id:`visit-${index}`,text:selection.name,selection}));
 assert.deepEqual(homepagePresentation(entries).tags.map((row:any)=>row.id),['visit-0','visit-1','visit-2']);
 assert.deepEqual(rows,before);
});

test('Osaka namesakes, gateways, districts and stale or contradictory tuples cannot borrow the fresh group',()=>{
 const {legacy,reference}=choices();
 const invalid=[
  {...legacy,canonicalPlaceId:'another-osaka'}, {...legacy,name:'Osaka district'},
  {...legacy,placeType:'transport_gateway' as const}, {...legacy,country:'United States'},
  {...legacy,coordinates:[135.5,34.7] as [number,number]}, {...legacy,providerId:'unreviewed'},
  {...reference,referenceSnapshotId:'stale'}, {...reference,provenance:[{id:'stale',kind:'provider' as const}]},
  {...reference,providerId:reference.provenance[0].id+'-stale'},
 ];
 for(const row of invalid){
  const before=structuredClone(row);
  assert.equal(freshDestinationTarget(row,[reference],fresh),null);
  assert.deepEqual(consolidateFreshDestinationSuggestions([row,reference],fresh),[row,reference]);
  assert.deepEqual(row,before);
 }
 for(const target of [{...reference,coordinates:[135.5,34.7] as [number,number]}, {...reference,referenceSnapshotId:REFERENCE_SNAPSHOT_ID+'-stale'}]){
  assert.equal(freshDestinationTarget(legacy,[target],fresh),null);
  assert.deepEqual(consolidateFreshDestinationSuggestions([legacy,target],fresh),[legacy,target]);
 }
});
