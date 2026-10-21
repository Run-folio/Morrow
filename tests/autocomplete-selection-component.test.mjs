import test from 'node:test';
import assert from 'node:assert/strict';
import {autocompleteRender} from './helpers/autocomplete-component.mjs';
const candidate=id=>({canonicalPlaceId:'berlin',name:'Berlin',country:'Germany',placeType:'city',kind:'city',routability:'direct_destination',coordinates:[13.405,52.52],providerId:id});
const api=rows=>async()=>({status:200,body:{candidates:rows}});
async function selectedRows(candidates){
 const view=autocompleteRender('Berlin',{api:api(candidates)});
 try{await view.settle();return view.rows().map(row=>{row.choose();return {...row,selection:view.selected.at(-1)};}).filter(row=>row.selection.canonicalPlaceId==='berlin');}finally{view.close();}
}
test('conflicting provider choices retain distinct React option identities and the clicked proof',async()=>{
 const rows=await selectedRows([candidate('photon:node:101'),candidate('photon:node:102')]);
 assert.equal(rows.filter(row=>row.selection.provenance.some(p=>p.kind==='provider')).length,2);
 assert.equal(new Set(rows.map(row=>row.key)).size,rows.length,'retained distinct choices cannot share a React key');
 assert.deepEqual(rows.filter(row=>row.selection.provenance.some(p=>p.kind==='provider')).map(row=>row.selection.provenance.find(p=>p.kind==='provider').id),['photon:node:101','photon:node:102']);
});
test('provider result reordering preserves each option identity with its own selection',async()=>{
 const first=await selectedRows([candidate('photon:node:101'),candidate('photon:node:102')]);
 const second=await selectedRows([candidate('photon:node:102'),candidate('photon:node:101')]);
 const keys=rows=>Object.fromEntries(rows.filter(row=>row.selection.provenance.some(p=>p.kind==='provider')).map(row=>[row.selection.provenance.find(p=>p.kind==='provider').id,row.key]));
 assert.equal(new Set(Object.values(keys(first))).size,2);
 assert.deepEqual(keys(first),keys(second));
});
