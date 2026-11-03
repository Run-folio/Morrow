import test from 'node:test';
import assert from 'node:assert/strict';
import {autocompleteRender} from './helpers/autocomplete-component.mjs';

test('actual closed popup Enter does not choose a retained hidden row',async()=>{
 const view=autocompleteRender('Berlin');try{await view.settle();assert(view.rows().length);view.key('Escape');view.enter();assert.equal(view.selected.length,0);}finally{view.close();}
});
test('actual IME confirmation does not choose a destination',async()=>{
 const view=autocompleteRender('Berlin');try{await view.settle();view.key('Enter',{isComposing:true});assert.equal(view.selected.length,0);}finally{view.close();}
});
test('completed search choices disappear when their geographic context changes',async()=>{
 const paris={canonicalPlaceId:'synthetic-paris',name:'Synthetic Paris',label:'Synthetic Paris, France',country:'France',placeType:'city',coordinates:[2.35,48.85],routability:'direct_destination',provenance:[]};
 const view=autocompleteRender('Synthetic query',{contextCountries:['France'],onFreeTextSearch:async()=>[paris]});
 try{view.enter();await view.settle();assert(view.rows().some(r=>r.label.includes('Paris')));view.render({contextCountries:['Japan']});assert(!view.rows().some(r=>r.label.includes('Paris')));}finally{view.close();}
});
test('an old context lookup cannot leave the new context search button busy',async()=>{
 let release;const view=autocompleteRender('Synthetic query',{contextCountries:['France'],onFreeTextSearch:()=>new Promise(r=>{release=r})});
 try{view.render({showSearchAction:true});view.enter();view.render();assert.equal(view.actions().find(a=>a.label==='Search').disabled,true);view.render({contextCountries:['Japan']});assert.equal(view.actions().find(a=>a.label==='Search').disabled,false);}finally{release?.([]);await view.settle();view.close();}
});
