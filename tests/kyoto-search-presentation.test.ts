import test from 'node:test';
import assert from 'node:assert/strict';
import {autocompleteRender} from './helpers/autocomplete-component.mjs';
import {REFERENCE_SNAPSHOT_ID} from '../lib/easyt/place-reference.ts';
import {referencePlaceById} from '../lib/easyt/place-reference.server.ts';
const record=referencePlaceById('reference:geonames:1857910')!;
const kyoto={canonicalPlaceId:record.canonicalPlaceId,providerId:record.providerId,referenceSnapshotId:REFERENCE_SNAPSHOT_ID,coordinates:record.coordinates,name:record.canonicalName,country:'Japan',placeType:record.placeType,routability:'direct_destination'};
const api=(candidates:unknown[])=>async()=>({status:200,body:{candidates}});
test('Kyoto remains one city as the reviewed pinned record arrives; keyboard selects the intact reference',async()=>{
 const view=autocompleteRender('Kyoto',{api:api([kyoto])});
 try{assert.equal(view.rows().length,1);await view.settle();assert.equal(view.rows().length,1);
 assert.match(view.rows()[0].label,/City · Japan/i);view.key('ArrowDown');view.key('Enter');
 assert.equal(view.selected[0].canonicalPlaceId,kyoto.canonicalPlaceId);assert.equal(view.selected[0].provenance[0].id,record.providerId);
 }finally{view.close();}
});
test('unrelated Kyoto city ID remains an explicit choice',async()=>{
 const other={...kyoto,canonicalPlaceId:'reference:geonames:99',providerId:kyoto.providerId.replace('1857910','99')};
 const view=autocompleteRender('Kyoto',{api:api([kyoto,other])});
 try{await view.settle();assert.equal(view.rows().length,2);assert.ok(view.rows().every(r=>r.label.includes('Location to confirm')));}finally{view.close();}
});
for(const [label,changes] of Object.entries({differentAdmin:{region:'Another province'},differentPoint:{coordinates:[135.75,35.01],providerId:kyoto.providerId.replace('135.75385:35.02107','135.75:35.01')}})){
 test('admitted but conflicting Kyoto '+label+' remains separate',async()=>{
  const view=autocompleteRender('Kyoto',{api:api([{...kyoto,...changes}])});
  try{await view.settle();assert.equal(view.rows().length,2);}finally{view.close();}
 });
}
test('explicit area search never silently replaces an existing choice',async()=>{
 const view=autocompleteRender('Kyoto',{searchIntent:'planning-area',api:api([kyoto])});
 try{await view.settle();assert.equal(view.rows().length,2);}finally{view.close();}
});
