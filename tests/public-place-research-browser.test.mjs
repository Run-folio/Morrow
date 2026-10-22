// Opt-in only. Prior browser denials remain; preparing this fixture is not launch approval.
import test from 'node:test';import assert from 'node:assert/strict';import {build} from 'esbuild';import {createRequire} from 'node:module';import {existsSync} from 'node:fs';
const require=createRequire(import.meta.url);
const enabled=process.env.MORROVIA_PUBLIC_PLACE_BROWSER_TESTS==='1';
async function fixtureBundle(){return (await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`
import React,{useState} from 'react';import {createRoot} from 'react-dom/client';
import {CanonicalPlaceAutocomplete} from './components/easyt/canonical-place-autocomplete';
import {searchCompletedPlaceCandidates,searchPublicPlaceCandidates} from './lib/easyt/completed-place-search';
function Field({label}){const [value,setValue]=useState('Yunomine hot spring village');return <section data-field={label}><CanonicalPlaceAutocomplete label={label} language={window.fixtureLanguage} placeholder="Public place" value={value} onChange={setValue} onSelect={choice=>window.fixtureChoices.push({label,choice})} onFreeTextSearch={searchCompletedPlaceCandidates} onPublicPlaceSearch={searchPublicPlaceCandidates} includeNonRoutable menuPlacement="inline"/></section>}
window.fixtureChoices=[];createRoot(document.getElementById('root')).render(<><Field label="First Place"/><Field label="Add Stop"/></>);
`},bundle:true,write:false,format:'iife',platform:'browser',jsx:'automatic',loader:{'.css':'empty','.module.css':'empty'},define:{'process.env.NODE_ENV':'"test"','process.env':'{}'},logLevel:'silent'})).outputFiles[0].text;}

test('offline browser fixture compiles actual component and completed-search helper without full build',async()=>{assert.ok((await fixtureBundle()).includes('public-place-alias-v3'));});
test('native React/DOM chooser: disabled capability, explicit OpenAI notice, selectable verified locality in both fields and EN/ES', {skip:!enabled,timeout:30000},async()=>{
 const executablePath=process.env.MORROVIA_PUBLIC_PLACE_BROWSER_EXECUTABLE;
 assert.ok(executablePath&&existsSync(executablePath),'Require an explicitly authorized existing headless executable; no download/default personal-browser fallback.');
 const script=await fixtureBundle(),{chromium}=require('playwright');let browser;
 const candidate={canonicalPlaceId:'open-world:photon:N:2822838506',providerId:'photon:N:2822838506',name:'Yunomine Onsen',country:'Japan',placeType:'town',routability:'direct_destination',coordinates:[135.7575842,33.8288351]};
 try{browser=await chromium.launch({executablePath,headless:true});for(const language of ['en','es']){
  const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});const page=await context.newPage();let available=false,researchCalls=0;const unexpected=[],errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',async route=>{const request=route.request(),url=new URL(request.url());
   if(url.origin==='http://fixture.invalid'&&url.pathname==='/'){await route.fulfill({contentType:'text/html',body:`<div id="root"></div><script>window.fixtureLanguage=${JSON.stringify(language)}</script><script>${script}</script>`});return;}
   if(url.origin==='http://fixture.invalid'&&url.pathname==='/api/journey-geocode'){
    if(request.method()==='GET'){assert.equal(url.searchParams.get('mode'),'autocomplete');await route.fulfill({json:{candidates:[]}});return;}
    assert.equal(url.search,'');const body=request.postDataJSON();assert.equal(request.method(),'POST');
    if(body.research){assert.equal(body.noticeVersion,'public-place-alias-v3');researchCalls++;await route.fulfill({json:{candidates:[candidate],publicResearchAvailable:true}});}
    else await route.fulfill({json:{candidates:[],publicResearchAvailable:available}});return;
   }unexpected.push(url.origin+url.pathname);await route.abort();
  });
  await page.goto('http://fixture.invalid/');const actionName=language==='es'?'Buscar nombres de lugares públicos':'Search public place names';
  const first=page.getByRole('combobox',{name:'First Place'});await first.focus();await first.press('Enter');
  await page.waitForTimeout(350);assert.equal(await page.getByRole('button',{name:actionName,exact:true}).count(),0);assert.equal(researchCalls,0);
  available=true;
  for(const label of ['First Place','Add Stop']){const field=page.locator(`section[data-field="${label}"]`),input=page.getByRole('combobox',{name:label});await input.focus();await input.press('Enter');
   const action=field.getByRole('button',{name:actionName,exact:true});await action.waitFor();assert.match(await field.innerText(),/OpenAI/);assert.equal((await page.evaluate(()=>window.fixtureChoices)).length,label==='First Place'?0:1);
   await action.click();const choice=field.getByRole('option').filter({hasText:'Yunomine Onsen'});await choice.waitFor();await choice.click();
  }
  const selected=await page.evaluate(()=>window.fixtureChoices);assert.equal(selected.length,2);for(const row of selected){assert.equal(row.choice.canonicalPlaceId,candidate.canonicalPlaceId);assert.deepEqual(row.choice.coordinates,candidate.coordinates);assert.equal(row.choice.routability,'direct_destination');}
  assert.equal(researchCalls,2);assert.deepEqual(unexpected,[]);assert.deepEqual(errors,[]);await context.close();
 }}finally{await browser?.close();}
});
