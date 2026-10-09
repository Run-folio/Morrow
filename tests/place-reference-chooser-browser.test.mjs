import test from 'node:test';import assert from 'node:assert/strict';
import {build} from 'esbuild';import {createRequire} from 'node:module';import {existsSync} from 'node:fs';import {homedir} from 'node:os';import {resolve} from 'node:path';
const enabled=process.env.MORROVIA_REFERENCE_CHOOSER_BROWSER_TESTS==='1';
const require=createRequire(import.meta.url),root=resolve(process.env.MORROVIA_REFERENCE_TEST_ROOT??'.');
const cached=`${homedir()}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright`;
test('mounted actual chooser shows EN/ES non-scheduled caution, preserves exact selection evidence and rejects future snapshot', {skip:!enabled,timeout:30000}, async()=>{
 const {NextRequest}=require('next/server');
 const apiBundle=await build({absWorkingDir:root,entryPoints:['app/api/journey-geocode/route.ts'],bundle:true,write:false,format:'cjs',platform:'node',external:['next/server'],logLevel:'silent'}),module={exports:{}};
 new Function('require','module','exports',apiBundle.outputFiles[0].text)(require,module,module.exports);
 const GET=module.exports.GET;
 const candidates=async place=>(await(await GET(new NextRequest(`http://fixture/api/journey-geocode?mode=autocomplete&candidates=1&place=${encodeURIComponent(place)}`))).json()).candidates;
 const choices=await candidates('MJR'),airport=choices.find(c=>c.canonicalPlaceId==='reference:ourairports:24');assert.ok(airport);
 const bundle=await build({absWorkingDir:root,stdin:{resolveDir:root,loader:'tsx',contents:`import React,{useState} from 'react';import {createRoot} from 'react-dom/client';import {CanonicalPlaceAutocomplete} from './components/easyt/canonical-place-autocomplete';function App(){const [value,setValue]=useState('MJR');return <CanonicalPlaceAutocomplete language={window.fixtureLanguage} label="Start from" placeholder="City or airport" value={value} onChange={setValue} onSelect={s=>window.fixtureSelection=s} allowedPlaceTypes={['transport_gateway']} revealSuggestionsKey={1} menuPlacement="inline"/>}createRoot(document.getElementById('root')).render(<App/>);`},bundle:true,write:false,format:'iife',platform:'browser',jsx:'automatic',loader:{'.css':'empty','.module.css':'empty'},define:{'process.env.NODE_ENV':'"test"','process.env':'{}'},logLevel:'silent'});
 const {chromium}=require(existsSync(cached)?cached:'playwright');let browser;
 try{
  browser=await chromium.launch({channel:process.env.MORROVIA_BROWSER_CHANNEL??'chrome',headless:true});
  for(const language of ['en','es']){
   const page=await browser.newPage();const unexpected=[];let mismatch=false;
   await page.route('**/*',async route=>{
    const url=new URL(route.request().url());
    if(url.origin==='http://fixture'&&url.pathname==='/'){await route.fulfill({contentType:'text/html',body:`<div id="root"></div><script>window.fixtureLanguage=${JSON.stringify(language)}</script><script>${bundle.outputFiles[0].text}</script>`});return;}
    if(url.origin==='http://fixture'&&url.pathname==='/api/journey-geocode'){
     const cs=await candidates(url.searchParams.get('place'));const response=mismatch?cs.map(c=>({...c,providerId:c.providerId.replace('@','@future-'),referenceSnapshotId:'future'})):cs;
     await route.fulfill({contentType:'application/json',body:JSON.stringify({candidates:response})});return;
    }
    unexpected.push(url.origin+url.pathname);await route.abort();
   });
   await page.goto('http://fixture/');const option=page.getByRole('option').filter({hasText:'Miramar Airport'});
   await option.waitFor();assert.match(await option.innerText(),language==='es'?/No consta servicio regular de pasajeros/:/No scheduled passenger service recorded/);
   await option.click();const selected=await page.evaluate(()=>window.fixtureSelection);
   assert.equal(selected.canonicalPlaceId,airport.canonicalPlaceId);assert.equal(selected.referenceSnapshotId,airport.referenceSnapshotId);assert.equal(selected.scheduledService,false);
   assert.deepEqual(selected.coordinates,airport.coordinates);assert.ok(selected.provenance.some(p=>p.id===airport.providerId));
   const input=page.getByRole('combobox');await input.fill('  míramar   airport  ');await option.waitFor();
   await input.fill('Miramar Airpor');await page.waitForTimeout(400);assert.equal(await option.count(),0);
   mismatch=true;await input.fill('MJR');await page.waitForTimeout(400);assert.equal(await option.count(),0);
   assert.deepEqual(unexpected,[],'text-only chooser must make no real media or external requests');await page.close();
  }
 }finally{await browser?.close();}
});
