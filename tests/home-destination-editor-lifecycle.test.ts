import assert from 'node:assert/strict';
import test from 'node:test';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {homedir} from 'node:os';
import {existsSync} from 'node:fs';
import {selectedEntry} from './fixtures/homepage-dual-entry.ts';
const enabled=process.env.MORROVIA_BUILDER_BROWSER_TESTS==='1',require=createRequire(import.meta.url),runtime=`${homedir()}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright`;
let bundle:Promise<string>|undefined;
async function fixture(entries:unknown[]){
 const root=fileURLToPath(new URL('../',import.meta.url));
 bundle??=build({stdin:{contents:`import React,{useState,useRef} from 'react';import {createRoot} from 'react-dom/client';import {HomeDestinationEditor} from './app/journey/home/home-destination-editor';
 function App(){const count=useRef(0);const [state,setState]=useState({owner:'owner-a',entries:window.initialEntries,focusEntryId:null});window.editorFixture={state,replace:next=>setState(current=>({...current,...next}))};return React.createElement(HomeDestinationEditor,{entries:state.entries,language:'en',focusEntryId:state.focusEntryId,createEntry:()=>({id:'added-occurrence-'+(++count.current),text:'',selection:null}),onChange:entries=>setState(current=>({...current,entries}))})};createRoot(document.getElementById('root')).render(React.createElement(App));`,resolveDir:root,loader:'tsx'},bundle:true,write:false,platform:'browser',format:'iife',jsx:'automatic',loader:{'.css':'empty','.module.css':'empty'},define:{'process.env.NODE_ENV':'"test"','process.env':'{}'},plugins:[{name:'next-link-boundary',setup(b){b.onResolve({filter:/^next\/link$/},()=>({path:'link',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({resolveDir:root,contents:`import React from 'react';export default function Link({href,children,...props}){return React.createElement('a',{...props,href},children)}`}))}}]}).then(result=>result.outputFiles[0].text);
 const js=await bundle;const {chromium}=require(existsSync(runtime)?runtime:'playwright') as typeof import('playwright'),browser=await chromium.launch({headless:true}),page=await browser.newPage();
 await page.setContent('<div id="root"></div>');await page.evaluate(entries=>{(window as any).initialEntries=entries;window.fetch=async()=>new Response(JSON.stringify({candidates:[],result:null}),{headers:{'content-type':'application/json'}})},entries);await page.addScriptTag({content:js});await page.getByRole('button',{name:'Add destination',exact:true}).waitFor();
 return {page,close:()=>browser.close(),replace:async(next:unknown)=>{await page.evaluate(next=>(window as any).editorFixture.replace(next),next);await page.waitForTimeout(30)},read:()=>page.evaluate(()=>(window as any).editorFixture.state)};
}
test('implicit startup follows restored selections and unresolved occurrence IDs across owner replacement',{skip:!enabled,timeout:30000},async()=>{
 const h=await fixture([{id:'destination-1',text:'',selection:null}]);try{
  const selected=selectedEntry('destination-1','Tokyo');await h.replace({entries:[selected]});assert.equal(await h.page.getByRole('combobox',{name:'Destination',exact:true}).count(),0);
  await h.replace({owner:'owner-b',entries:[selectedEntry('destination-1','Kyoto')]});assert.equal(await h.page.getByRole('combobox',{name:'Destination',exact:true}).count(),0);
  const raw={id:'pending-occurrence-7',text:'  San Pe unfinished  ',selection:null};await h.replace({entries:[selected,raw]});assert.equal(await h.page.getByRole('combobox',{name:'Destination',exact:true}).inputValue(),raw.text);assert.deepEqual((await h.read()).entries,[selected,raw]);
 }finally{await h.close()}
});
test('deliberate Edit, Add, typing, selection and Escape survive ordinary updates and preserve focus',{skip:!enabled,timeout:30000},async()=>{
 const h=await fixture([selectedEntry('destination-1','Tokyo')]);try{
  await h.page.getByRole('button',{name:/^Edit Tokyo/}).click();const input=h.page.getByRole('combobox',{name:'Destination',exact:true});assert.match(await input.inputValue(),/^Tokyo/);
  await h.replace({entries:JSON.parse(JSON.stringify((await h.read()).entries))});assert.equal(await input.count(),1);assert.equal(await input.evaluate(el=>el===document.activeElement),true);
  await input.fill('  Kyoto unfinished  ');assert.equal(await input.inputValue(),'  Kyoto unfinished  ');assert.equal((await h.read()).entries[0].selection,null);
  await input.press('Escape');assert.equal(await input.count(),0);assert.equal(await h.page.getByRole('button',{name:/^Edit.*Kyoto unfinished/}).evaluate(el=>el===document.activeElement),true);
  await h.replace({entries:JSON.parse(JSON.stringify((await h.read()).entries))});assert.equal(await input.count(),0,'unrelated replacement must not reopen deliberately closed draft');
  await h.page.getByRole('button',{name:'Add destination',exact:true}).click();assert.equal(await input.inputValue(),'');assert.equal((await h.read()).entries[0].text,'  Kyoto unfinished  ','Add retains the existing raw occurrence');assert.equal(await input.evaluate(el=>el===document.activeElement),true);
  await input.fill('Kyoto');await h.page.getByRole('option',{name:/Kyoto.*Japan/}).first().click();assert.equal(await input.count(),0);assert.equal((await h.read()).entries[1].selection.name,'Kyoto');
  await h.page.getByRole('button',{name:'Add destination',exact:true}).click();assert.equal(await input.inputValue(),'');await input.fill('  add raw  ');assert.equal((await h.read()).entries[2].id,'added-occurrence-2');assert.equal((await h.read()).entries[2].text,'  add raw  ');
  await h.replace({entries:JSON.parse(JSON.stringify((await h.read()).entries))});assert.equal(await input.inputValue(),'  add raw  ');assert.equal(await input.evaluate(el=>el===document.activeElement),true);
 }finally{await h.close()}
});
test('external focus deliberately opens a selected chip and removal returns focus to the remaining chip',{skip:!enabled,timeout:30000},async()=>{
 const h=await fixture([selectedEntry('destination-1','Tokyo'),selectedEntry('destination-2','Kyoto')]);try{
  await h.replace({focusEntryId:'destination-2'});const input=h.page.getByRole('combobox',{name:'Destination',exact:true});assert.match(await input.inputValue(),/^Kyoto/);assert.equal(await input.evaluate(el=>el===document.activeElement),true);
  await h.page.getByRole('button',{name:/^Remove Kyoto/}).click();assert.equal(await input.count(),0);assert.equal((await h.read()).entries.length,1);assert.equal(await h.page.getByRole('button',{name:/^Edit Tokyo/}).evaluate(el=>el===document.activeElement),true);
 }finally{await h.close()}
});
