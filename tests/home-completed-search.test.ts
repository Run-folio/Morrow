import assert from 'node:assert/strict';
import test from 'node:test';
import {autocompleteRender,homepageEditorCallbacks} from './helpers/autocomplete-component.mjs';

const candidate={canonicalPlaceId:'open-world:photon:N:2822838506',providerId:'photon:N:2822838506',name:'Yunomine Onsen',country:'Japan',placeType:'town',coordinates:[135.7575842,33.8288351],routability:'direct_destination'};
function home(api?:any){return homepageEditorCallbacks([{id:'exact-occurrence',text:'Yunomine hot spring village, Japan',selection:null}],api);}
for(const action of ['Enter','Search'])test(`actual Home ${action} runs unpaid completed search and keeps candidate identity until explicit selection`,async()=>{
 const calls:any[]=[];const h=home(async(request:any)=>{calls.push(request);return {status:200,body:{candidates:[candidate,{...candidate,canonicalPlaceId:'open-world:photon:N:other',providerId:'photon:N:other',coordinates:[135.8,33.9]}],publicResearchAvailable:true}};});
 const props=h.render();assert.equal(typeof props.onFreeTextSearch,'function');assert.equal(props.showSearchAction,true);assert.equal(props.onPublicPlaceSearch,undefined);
 const ui=autocompleteRender(props.value);ui.render(props);await ui.settle();assert.equal(calls.length,0,'typing uses autocomplete only');
 if(action==='Enter')ui.enter();else{const button=ui.actions().find((item:any)=>item.label==='Search');assert.ok(button);button.click();}
 await ui.settle();assert.equal(calls.length,1);assert.equal(calls[0].method,'POST');assert.deepEqual(JSON.parse(calls[0].body),{place:'Yunomine hot spring village',country:'Japan'});assert.equal(h.entries[0].selection,null);
 assert.equal(ui.rows().length,2,'ambiguous points remain separate choices');assert.equal(ui.actions().some((item:any)=>/public place/.test(item.label)),false);
 ui.rows()[0].choose();assert.equal(h.entries[0].id,'exact-occurrence');assert.equal(h.entries[0].selection.canonicalPlaceId,candidate.canonicalPlaceId);assert.deepEqual(Array.from(h.entries[0].selection.coordinates),candidate.coordinates);assert.equal(h.render(),null);ui.close();
});
test('Home Search and Enter preserve stale and abort behavior through the shared completed-search callback',async()=>{
 let resolve!: (value:any)=>void;let signal:AbortSignal|undefined;
 const h=home(async(request:any)=>{signal=request.signal;return new Promise(done=>{resolve=done;});});
 const props=h.render(),ui=autocompleteRender(props.value);ui.render(props);await ui.settle();
 const search=ui.actions().find((item:any)=>item.label==='Search');assert.ok(search);search.click();ui.change('Other unfinished place');assert.equal(signal?.aborted,true);
 resolve({status:200,body:{candidates:[candidate]}});await ui.settle();assert.equal(ui.rows().length,0);assert.equal(h.entries[0].selection,null);assert.equal(h.entries[0].text,'Other unfinished place');ui.close();
});
for(const status of [200,503])test(`Home Search preserves ${status===200?'empty':'error and Retry'} state without selecting or researching`,async()=>{
 let calls=0;const h=home(async()=>{calls++;return {status,body:{candidates:[],publicResearchAvailable:true}};});const props=h.render(),ui=autocompleteRender(props.value);ui.render(props);await ui.settle();
 const search=ui.actions().find((item:any)=>item.label==='Search');assert.ok(search);search.click();await ui.settle();assert.equal(calls,1);assert.equal(h.entries[0].selection,null);assert.equal(ui.actions().some((item:any)=>/public place/.test(item.label)),false);
 const retry=ui.actions().find((item:any)=>item.label==='Retry');assert.equal(Boolean(retry),status===503);if(retry){retry.click();await ui.settle();assert.equal(calls,2);}ui.close();
});
test('shared Search affordance is opt in and disables blank or disabled Home input',()=>{
 const ui=autocompleteRender('unfinished');assert.equal(ui.actions().some((item:any)=>item.label==='Search'),false);ui.close();
 const h=home();h.setDisabled(true);const props=h.render();assert.equal(props.disabled,true);assert.equal(props.showSearchAction,true);
 const disabled=autocompleteRender(props.value);disabled.render(props);const action=disabled.actions().find((item:any)=>item.label==='Search');assert.ok(action);assert.equal(action.disabled,true);disabled.render({disabled:false,value:'   '});const blankAction=disabled.actions().find((item:any)=>item.label==='Search');assert.ok(blankAction);assert.equal(blankAction.disabled,true);disabled.close();
});

test('Home Enter chooses the active autocomplete option without running completed search',async()=>{
 let calls=0;const h=homepageEditorCallbacks([{id:'exact-occurrence',text:'Tokyo',selection:null}],async()=>{calls++;return {status:200,body:{candidates:[]}};});
 const props=h.render(),ui=autocompleteRender(props.value);ui.render(props);await ui.settle();assert.ok(ui.rows().length);ui.key('ArrowDown');ui.enter();await ui.settle();assert.equal(calls,0);assert.equal(h.entries[0].selection.name,'Tokyo');assert.equal(h.entries[0].id,'exact-occurrence');ui.close();
});

test('actual Home wrapper permits focused Search Enter activation while preventing text-entry form submit',async()=>{
 let calls=0;const h=home(async()=>{calls++;return {status:200,body:{candidates:[]}};});const props=h.render(),ui=autocompleteRender(props.value);ui.render(props);await ui.settle();
 let prevented=false;h.editorKeyDown({key:'Enter',target:{tagName:'BUTTON'},preventDefault(){prevented=true;}});assert.equal(prevented,false,'a bubbling button Enter must retain native click activation');
 const search=ui.actions().find((item:any)=>item.label==='Search');assert.ok(search);if(!prevented)search.click();await ui.settle();assert.equal(calls,1);
 h.editorKeyDown({key:'Enter',target:{tagName:'INPUT'},preventDefault(){prevented=true;}});assert.equal(prevented,true,'text-entry Enter must not submit the surrounding Home form');ui.close();
});
