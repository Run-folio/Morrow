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

const reviewedChoices = [
 ['Singapore','reference:geonames:1880252'],['Hong Kong','reference:geonames:1819729'],['Monaco','reference:geonames:2993458'],
 ['Beijing','reference:geonames:1816670'],['Paris','reference:geonames:2988507'],['Seoul','reference:geonames:1835848'],
 ['Manila','reference:geonames:1701668'],['Madrid','reference:geonames:3117735'],['Lisbon','reference:geonames:2267057'],['Porto','reference:geonames:2735943'],
];
const plain=value=>JSON.parse(JSON.stringify(value));
for(const [name,id] of reviewedChoices)test(`${name} actual fresh dropdown selects one complete maintained stop`,async()=>{
 const {canonicalPlaceSuggestionForId}=await import('../lib/easyt/place-intelligence.ts');
 const target=canonicalPlaceSuggestionForId(id);
 const view=autocompleteRender(name);
 try{await view.settle();const selected=view.rows().map(row=>{row.choose();return view.selected.at(-1);}).filter(row=>row.name===name);
 assert.equal(selected.length,1);assert.equal(selected[0].canonicalPlaceId,id);assert.deepEqual(plain(selected[0]),plain(target));
 }finally{view.close();}
});
test('actual planning-area dropdown retains explicit Hong Kong jurisdiction and legacy choices',async()=>{
 const view=autocompleteRender('Hong Kong',{searchIntent:'planning-area'});
 try{await view.settle();const choices=view.rows().map(row=>{row.choose();return view.selected.at(-1);});
 for(const id of ['hong-kong','jurisdiction-hk','reference:geonames:1819729'])assert(choices.some(row=>row.canonicalPlaceId===id));
 assert.equal(choices.find(row=>row.canonicalPlaceId==='hong-kong').country,'China');
 assert.equal(choices.find(row=>row.canonicalPlaceId==='jurisdiction-hk').routability,'planning_area');
 }finally{view.close();}
});
test('actual route dropdown preserves broad countries and islands, including foreign namesakes',async()=>{
 for(const [name,id,type] of [['Bali','bali','island'],['Japan','japan','country'],['Canary Islands','island-group:canary-islands','archipelago']]){
  const foreign={canonicalPlaceId:'foreign-bali',name:'Bali',country:'Cameroon',placeType:'city',routability:'direct_destination',coordinates:[10.0118,5.8874],providerId:'photon:node:991'};
  const view=autocompleteRender(name,{api:api(name==='Bali'?[foreign]:[])});
  try{await view.settle();const choices=view.rows().map(row=>{row.choose();return view.selected.at(-1);});
   const own=choices.find(row=>row.canonicalPlaceId===id || name==='Canary Islands'&&row.name===name&&row.placeType===type);
   assert(own,`${name} remains selectable`);assert.equal(own.placeType,type);assert.notEqual(own.routability,'direct_destination');
   if(name==='Bali')assert(choices.some(row=>row.canonicalPlaceId==='foreign-bali'&&row.country==='Cameroon'));
  }finally{view.close();}
 }
});
test('actual dropdown preserves conflicting mapped-ID names and unreviewed same-name city IDs',async()=>{
 const {canonicalPlaceSuggestionForId}=await import('../lib/easyt/place-intelligence.ts');
 const original=canonicalPlaceSuggestionForId('reference:geonames:1819729');
 const providerId=original.provenance.find(row=>row.kind==='provider').id;
 const conflict={...original,name:'Different place',providerId};
 const unrelated={...original,canonicalPlaceId:'other-hong-kong',providerId:'photon:node:992'};
 const view=autocompleteRender('Hong Kong',{api:api([conflict,unrelated])});
 try{await view.settle();const choices=view.rows().map(row=>{row.choose();return view.selected.at(-1);});
 assert(choices.some(row=>row.name==='Different place'&&row.canonicalPlaceId===original.canonicalPlaceId));
 assert(choices.some(row=>row.canonicalPlaceId==='other-hong-kong'));
 assert.equal(choices.filter(row=>row.name==='Hong Kong'&&row.canonicalPlaceId===original.canonicalPlaceId).length,1);
 }finally{view.close();}
});
test('same country contents in new arrays do not restart actual autocomplete requests',async()=>{
 const view=autocompleteRender('Denpasar',{contextCountries:['Indonesia']});
 try{await view.settle();assert.equal(view.calls.length,1);
 view.render({contextCountries:['Indonesia']});await view.settle();assert.equal(view.calls.length,1);
 view.render({contextCountries:['Japan']});await view.settle();assert.equal(view.calls.length,2);assert.equal(view.calls[1].searchParams.get('country'),'Japan');
 }finally{view.close();}
});
