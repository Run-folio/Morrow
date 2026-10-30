import test from 'node:test';import assert from 'node:assert/strict';import {build}from'esbuild';import{createServer}from'node:http';import{readFileSync}from'node:fs';import{fileURLToPath}from'node:url';import{createRequire}from'node:module';import{homedir}from'node:os';
const root=fileURLToPath(new URL('../',import.meta.url)),text=readFileSync(new URL('../app/journey/new/trip-builder.tsx',import.meta.url),'utf8');
const start=text.indexOf('  const countryEnrichmentKey ='),end=text.indexOf('  const activeCountryEnrichment =',start);assert.ok(start>0&&end>start);const production=text.slice(start,end);
const require=createRequire(import.meta.url);const{chromium,webkit}=require(`${homedir()}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright`);let bundle:Promise<string>;const enabled=process.env.MORROVIA_BUILDER_BROWSER_TESTS==='1';
async function view(name:'chromium'|'webkit'){
 bundle??=build({stdin:{contents:`import React,{useState,useRef,useEffect}from'react';import{createRoot}from'react-dom/client';import{createAbortableEffectScope}from'./lib/easyt/abortable-effect';
 const p=window.__enrich={requests:[],updates:[]};window.fetch=(url,o)=>new Promise(resolve=>{const i=p.requests.length;p.requests.push({signal:o.signal,resolve:()=>resolve({ok:true,json:async()=>({planningSuggestions:[{canonicalPlaceId:'candidate-'+i,name:'Result '+i,country:'Japan',placeType:'city',coordinates:[139,35],provenance:[{id:'fixture'}]}]})})});});
 function App(){const[s,set]=useState({owner:'a',trip:'t',mention:'m',start:'2027-11-01',end:'2027-11-15',pace:'balanced',interests:[],stops:[],committing:false});p.set=patch=>set(s=>({...s,...patch}));
 const[value,setValue]=useState(null);const setCountryEnrichment=v=>{p.updates.push(v);setValue(v)};
 const countryEnrichmentRequestsRef=useRef(new Map()),countryEnrichmentScopeRef=useRef('');
 const discoveryCommitRef=useRef(false);discoveryCommitRef.current=s.committing;const discoveryCommitting=s.committing,clarificationOpen=true,clarificationUsesNearbyBases=false;
 const activeBrowserOwnerId=s.owner,activeTripDocument={id:s.trip},activeClarificationMention={mentionId:s.mention,canonicalName:'Japan'};
 const activeBrowserOwnerIdRef=useRef(s.owner);activeBrowserOwnerIdRef.current=s.owner;const activeDiscoveryRef=useRef(null);activeDiscoveryRef.current={open:true,mentionId:s.mention};
 const builderMountedRef=useRef(true);useEffect(()=>()=>{builderMountedRef.current=false},[]);const discoveryOwnersRef=useRef(null);discoveryOwnersRef.current={trip:{id:s.trip}};
 const clarificationDiscovery={candidates:[]},effectiveIntent={preferences:{interests:s.interests,pace:s.pace}},effectiveStructuredBrief={},totalDays=15,stops=s.stops,startDate=s.start,endDate=s.end;const placeCandidateWithinPlanningParent=()=>true;
 ${production}
 p.current={key:countryEnrichmentKey,value};return <output>{value?.status??'initial'}</output>};const mount=createRoot(document.getElementById('root'));p.unmount=()=>mount.unmount();mount.render(<App/>);`,resolveDir:root,loader:'tsx'},bundle:true,write:false,platform:'browser',format:'iife',jsx:'automatic',define:{'process.env.NODE_ENV':'"test"'}}).then(r=>r.outputFiles[0].text);
 const script=await bundle,server=createServer((_q,res)=>res.end(`<div id="root"></div><script>${script.replaceAll('</script>','<\\/script>')}</script>`));await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));let browser:any;
 try{browser=await(name==='webkit'?webkit:chromium).launch({headless:true});const page=await browser.newPage();await page.goto(`http://127.0.0.1:${(server.address()as any).port}`);await page.waitForFunction(()=>(window as any).__enrich.requests.length===1);return{page,async close(){await browser.close();await new Promise<void>(r=>server.close(()=>r()))}}}catch(e){await browser?.close();await new Promise<void>(r=>server.close(()=>r()));throw e}
}
async function change(page:any,patch:unknown){await page.evaluate((p:unknown)=>(window as any).__enrich.set(p),patch);await page.evaluate(()=>new Promise<void>(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>r()))))}
for(const name of ['chromium','webkit']as const){
 test(`optional enrichment holds acceptance and resumes one current request (${name})`,{skip:!enabled,timeout:15000},async()=>{const v=await view(name);try{
 await change(v.page,{committing:true});for(let i=1;i<=3;i++)await change(v.page,{stops:[{canonicalPlaceId:'s'+i,name:'Stop '+i}]});assert.equal(await v.page.evaluate(()=>(window as any).__enrich.requests.length),1);
 await v.page.evaluate(()=>(window as any).__enrich.requests[0].resolve());await change(v.page,{});assert.equal(await v.page.evaluate(()=>(window as any).__enrich.updates.filter((u:any)=>u.status==='ready').length),0);
 await change(v.page,{committing:false});assert.equal(await v.page.evaluate(()=>(window as any).__enrich.requests.length),2);await change(v.page,{committing:false});assert.equal(await v.page.evaluate(()=>(window as any).__enrich.requests.length),2);
 await v.page.evaluate(()=>(window as any).__enrich.requests[1].resolve());await v.page.waitForFunction(()=>(window as any).__enrich.current.value?.status==='ready');assert.equal(await v.page.evaluate(()=>(window as any).__enrich.current.value.suggestions[0].name),'Result 1');
 }finally{await v.close()}});
 test(`optional enrichment rejects obsolete scope and unmount completions (${name})`,{skip:!enabled,timeout:20000},async()=>{const v=await view(name);try{let count=1;
 for(const patch of [{owner:'b'},{trip:'other'},{mention:'new'},{start:'2027-11-02'},{end:'2027-11-16'},{pace:'relaxed'},{interests:['food']}]){const old=count-1;await change(v.page,patch);count++;assert.equal(await v.page.evaluate(()=>(window as any).__enrich.requests.length),count,'exact context starts one request');const before=await v.page.evaluate(()=>(window as any).__enrich.updates.length);await v.page.evaluate((i:number)=>(window as any).__enrich.requests[i].resolve(),old);await change(v.page,{});assert.equal(await v.page.evaluate(()=>(window as any).__enrich.updates.length),before,'stale completion cannot update');}
 const before=await v.page.evaluate(()=>(window as any).__enrich.updates.length);await v.page.evaluate(()=>{const p=(window as any).__enrich;p.unmount();p.requests.at(-1).resolve()});await v.page.evaluate(()=>new Promise(r=>setTimeout(r,0)));assert.equal(await v.page.evaluate(()=>(window as any).__enrich.updates.length),before);
 }finally{await v.close()}});
}
