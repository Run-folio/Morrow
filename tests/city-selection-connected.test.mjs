import test from 'node:test';
import assert from 'node:assert/strict';
import {autocompleteRender,selectHomepageEntry} from './helpers/autocomplete-component.mjs';
import {addStopSelection} from './helpers/builder-add-stop-selection.mjs';
import {canonicalPlaceSuggestionsForQuery} from '../lib/easyt/place-intelligence.ts';
import {projectHomepageInput,readHomepageInput} from '../lib/easyt/home-trip-handoff.ts';
import {emptyHomepageInput} from './fixtures/homepage-dual-entry.ts';
import {geographicallyReady,stopGeographicPlace} from '../lib/easyt/geographic-binding.ts';
import {requireReadableTripDocument} from '../lib/easyt/trip-document.ts';
const wire=value=>JSON.parse(JSON.stringify(value));
const reference=name=>canonicalPlaceSuggestionsForQuery(name,[],30,true).find(s=>s.name===name&&s.canonicalPlaceId.startsWith('reference:'));
const response=s=>({name:s.name,country:s.country,canonicalPlaceId:s.canonicalPlaceId,placeType:s.placeType,kind:s.placeType,routability:s.routability,coordinates:s.coordinates,providerId:s.provenance.find(p=>p.kind==='provider')?.id,referenceSnapshotId:s.referenceSnapshotId});
const api=async({searchParams})=>{const s=reference(searchParams.get('place'));return {status:200,body:searchParams.get('candidates')==='1'?{candidates:s?[response(s)]:[]}:{result:s?response(s):null}};};
async function chosen(query,id){const view=autocompleteRender(query,{api});try{await view.settle();for(const row of view.rows()){row.choose();if(view.selected.at(-1).canonicalPlaceId===id)return view.selected.at(-1);}throw Error('Expected displayed choice '+id);}finally{view.close();}}
for(const [name,id] of [['Beijing','reference:geonames:1816670'],['Beijing','beijing'],['Hong Kong','reference:geonames:1819729'],['Seoul','reference:geonames:1835848'],['Paris','reference:geonames:2988507']]){
 test(name+' '+id+': actual selection survives homepage capture, country review, canonical edit and JSON reopen',async()=>{
  const selected=await chosen(name,id);const before=wire(selected);
  const entry=selectHomepageEntry(selected);assert.deepEqual(wire(entry.selection),before);
  const snapshot={...emptyHomepageInput(),entries:[entry],tripType:{state:'selected',value:'one_way'}};
  const restored=readHomepageInput(wire({snapshot}),null);assert.ok(restored);
  assert.deepEqual(wire(restored.snapshot.entries[0].selection),before);
  const projected=projectHomepageInput({snapshot:restored.snapshot,profile:null,handoffId:'connected-selection'});assert.equal(projected.ok,true);
  assert.equal(projected.draft.routeIntent.destinations[0].kind,'overnight_place');
  assert.equal(projected.draft.routeIntent.destinations[0].selectedPlace.canonicalPlaceId,id);
  const added=await addStopSelection(name,restored.snapshot.entries[0].selection,{api});
  assert.deepEqual(added.errors,[]);assert.deepEqual(added.missing,[]);assert.equal(added.ready,true);
  const reopened=requireReadableTripDocument(wire(added.savedTrip));const stop=reopened.stops.find(s=>s.id===added.result.id);assert.ok(stop);
  assert.equal(stop.canonicalPlaceId,id);assert.equal(geographicallyReady(stopGeographicPlace(stop)),true);
  assert.deepEqual(wire(selected),before);
 });
}
test('missing reference proof remains unresolved through the actual country review and does not write a stop',async()=>{
 const selected=await chosen('Beijing','reference:geonames:1816670');
 const result=await addStopSelection('missing proof',{...selected,referenceSnapshotId:undefined},{api});
 assert.deepEqual(result.errors,['Choose a verified city or town.']);assert.equal(result.commands.length,0);assert.equal(result.ready,false);
});
for(const [name,id] of [['Bali','bali'],['Hong Kong','jurisdiction-hk'],['Singapore','singapore']])test(name+' explicit broad choice survives actual editor/capture and invokes area selection',async()=>{
 const selected=await chosen(name,id);const entry=selectHomepageEntry(selected);
 const projected=projectHomepageInput({snapshot:{...emptyHomepageInput(),entries:[entry]},profile:null,handoffId:'connected-area'});assert.equal(projected.ok,true);
 assert.equal(projected.draft.routeIntent.destinations[0].kind,'planning_area');
 const result=await addStopSelection(name,selected,{api});assert.equal(result.area,id);assert.equal(result.commands.length,0);
});
