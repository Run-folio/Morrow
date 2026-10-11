import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { build } from "esbuild";
import { chromium } from "playwright";

const enabled = process.env.MORROVIA_BUILDER_BROWSER_TESTS === "1";
const root = process.cwd();
const fixturePhoto = (id, country, scope) => ({ id:`File:${id}.jpg`, provider:"wikimedia", src:`https://upload.wikimedia.org/wikipedia/commons/a/ab/${id}.jpg`, sourceUrl:`https://commons.wikimedia.org/wiki/File:${id}.jpg`, sourceLabel:"Fixture author · CC BY 4.0", author:"Fixture author", license:"CC BY 4.0", licenseUrl:"https://creativecommons.org/licenses/by/4.0/", alt:`${country} skyline`, ...(scope ? {scope,country} : {}) });

async function harness(contents) {
  const output=await build({stdin:{contents,resolveDir:root,loader:"tsx"},bundle:true,write:false,outdir:"/tmp/dashboard-fixture",platform:"browser",format:"iife",jsx:"automatic",loader:{".module.css":"local-css",".css":"css"},define:{"process.env.NODE_ENV":'"test"',"process.env":"{}"},plugins:[{name:"fixture",setup(b){
    b.onResolve({filter:/^next\/(link|image|navigation)$/},({path})=>({path,namespace:"fixture"}));
    b.onResolve({filter:/^@\/lib\/auth-client$/},()=>({path:"auth",namespace:"fixture"}));
    b.onResolve({filter:/^@\/components\/journey-planner-map$/},()=>({path:"map",namespace:"fixture"}));
    b.onLoad({filter:/.*/,namespace:"fixture"},({path})=>({resolveDir:root,contents:path==="auth"?`export const authClient={useSession:()=>({data:{user:{id:'fixture-owner'}},isPending:false})};`:path==="map"?`export const JourneyPlannerMap=()=>null;`:path.endsWith("navigation")?`export const useRouter=()=>({refresh(){},push(){}});export const useSearchParams=()=>new URLSearchParams();export const usePathname=()=>'/journey/dashboard';`:`import React from 'react';export default function Component({children,fill,priority,unoptimized,...props}){return React.createElement('${path.endsWith("link")?"a":"img"}',props,children);}`}));
  }}]});
  const js=output.outputFiles.find(f=>f.path.endsWith(".js")).text,css=output.outputFiles.find(f=>f.path.endsWith(".css"))?.text??"";
  const server=createServer((req,res)=>{if(req.url==="/app.js")return res.end(js);if(req.url==="/app.css"){res.setHeader("Content-Type","text/css");return res.end(css);}res.end(`<html><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app.css"><body><div id="root"></div><script src="/app.js"></script></body></html>`);});
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));const browser=await chromium.launch({headless:true});const page=await browser.newPage();
  await page.route("https://upload.wikimedia.org/**",route=>route.fulfill({contentType:"image/png",body:Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aAWQAAAAASUVORK5CYII=","base64")}));
  return {page,url:`http://127.0.0.1:${server.address().port}`,close:async()=>{await browser.close();await new Promise(resolve=>server.close(resolve));}};
}

test("dashboard first-destination covers preserve saved trips, reject old cache and label country fallback across reload and widths",{skip:!enabled,timeout:60000},async()=>{
  const contents=`import React from 'react';import {createRoot} from 'react-dom/client';import Dashboard from './app/journey/dashboard/dashboard-client';import accountStyles from './app/journey/account.module.css';import './app/journey/journey-design.css';
  const stop=(name,country,order)=>({id:name+order,name,country,order,longitude:null,latitude:null,nights:2,arrivalDate:null,departureDate:null});
  const trip=(id,names,country)=>({schemaVersion:1,id,ownerId:'fixture-owner',title:id,status:'planned',startDate:'2027-05-01',endDate:'2027-05-10',travellers:2,currency:'GBP',stops:names.map((name,i)=>stop(name,country,i)),legs:[],planItems:[],recommendations:[],brief:{origin:'London',mustDo:'',pace:'slow',hotelChanges:'few',budgetBand:'mid',selectedPlaces:{}},createdAt:'2026-09-01',updatedAt:'2026-09-01'});
  const fresh=[trip('Milan-cover',['Milan','Como','Verona','Venice'],'Italy'),...['Athens-A','Athens-B','Athens-C'].map(id=>trip(id,['Athens','Chaniá','Firá'],'Greece')),...['Tenerife-A','Tenerife-B','Tenerife-C'].map(id=>trip(id,['Santa Cruz de Tenerife'],'Spain'))];
  if(!localStorage.getItem('saved-cover-trips'))localStorage.setItem('saved-cover-trips',JSON.stringify(fresh));const trips=JSON.parse(localStorage.getItem('saved-cover-trips'));window.savedTrips=JSON.stringify(trips);createRoot(document.getElementById('root')).render(<main className={accountStyles.page}><section className={accountStyles.dashboard}><Dashboard trips={trips} stamps={[]} ownerId="fixture-owner"/></section></main>);`;
  const view=await harness(contents),queries=[];const errors=[];view.page.on("pageerror",e=>errors.push(e.message));
  await view.page.route("**/api/journey-route-image?**",async route=>{
    const params=new URL(route.request().url()).searchParams;queries.push(Object.fromEntries(params));const name=params.get("place"),excluded=params.getAll("exclude");
    if(name==="Santa Cruz de Tenerife")return route.fulfill({status:502,json:{configured:true,image:null,candidates:[],reason:"provider-unavailable"}});
    const photos=name==="Milan"?[fixturePhoto("Italy-country","Italy","country")]:[0,1,2].map(i=>fixturePhoto("Athens"+i,"Greece"));
    const candidates=photos.filter(p=>!excluded.includes(p.sourceUrl)&&!excluded.includes(p.src)&&!excluded.includes("wikimedia:"+p.id));return route.fulfill({json:{configured:true,image:candidates[0]??null,candidates,reason:candidates.length?undefined:"no-result"}});
  });
  try{
    await view.page.addInitScript(()=>localStorage.setItem("morrovia:route-photo:v5:destination:name:athens","stale bench"));
    for(const width of [1440,390]){
      await view.page.setViewportSize({width,height:1000});await view.page.goto(view.url);
      await view.page.waitForFunction(()=>document.querySelectorAll('img[src*="Athens"]').length===3&&document.querySelector('img[src*="Italy-country"]')?.complete);
      assert.equal(await view.page.getByText("Illustrative · Italy",{exact:true}).count(),1);
      assert.equal(await view.page.getByRole("img",{name:"Spain flag",exact:true}).count(),3);
      const sources=await view.page.locator('img[src*="Athens"]').evaluateAll(nodes=>nodes.map(n=>n.src));assert.equal(new Set(sources).size,3);
      const saved=await view.page.evaluate(()=>localStorage.getItem("saved-cover-trips"));await view.page.reload();await view.page.waitForFunction(()=>document.querySelectorAll('img[src*="Athens"]').length===3);assert.equal(await view.page.evaluate(()=>localStorage.getItem("saved-cover-trips")),saved);
      assert.equal(await view.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,JSON.stringify(await view.page.evaluate(()=>[...document.querySelectorAll("*")].filter(n=>n.getBoundingClientRect().right>innerWidth+1).slice(0,8).map(n=>({tag:n.tagName,cls:n.className,text:n.textContent?.slice(0,80)})))));
    }
    assert.ok(queries.some(q=>q.place==="Milan"));assert.ok(queries.some(q=>q.place==="Athens"));assert.ok(queries.some(q=>q.place==="Santa Cruz de Tenerife"));assert.ok(queries.every(q=>q.place!=="London"));assert.deepEqual(errors,[]);
  }finally{await view.close();}
});

test("a failed cover retry preserves another visible cover's ownership without browser storage",{skip:!enabled,timeout:30000},async()=>{
  const contents=`import React from 'react';import {createRoot} from 'react-dom/client';import {useDashboardTripPhotos} from './components/easyt/use-dashboard-trip-photos';
  const trips=['A','B'].map(id=>({id,status:'planned',stops:[{id,order:0,name:'Cover '+id,country:'Greece',longitude:null,latitude:null}],planItems:[]}));function App(){const {photos,markFailed}=useDashboardTripPhotos(trips);return <div>{trips.map(trip=><div key={trip.id} data-cover={trip.id} data-src={photos.get(trip.id)?.src??''}/>) }<button onClick={()=>markFailed(trips[0],photos.get('A').src)}>Fail A</button></div>};Object.defineProperty(window,'localStorage',{get(){throw Error('storage unavailable')}});createRoot(document.getElementById('root')).render(<App/>);`;
  const view=await harness(contents);view.page.on("pageerror", e=>console.error("HOOK FIXTURE ERROR",e.message));let phase=0,bCalls=0;const a=fixturePhoto("A","Greece"),b=fixturePhoto("B","Greece");
  await view.page.route("**/api/journey-route-image?**",async route=>{
    const params=new URL(route.request().url()).searchParams,name=params.get("place"),excluded=params.getAll("exclude");if(name==="Cover B")bCalls++;
    let candidates=name==="Cover A"?(phase?[b,a]:[a]):[b];candidates=candidates.filter(p=>!excluded.includes(p.src)&&!excluded.includes(p.sourceUrl)&&!excluded.includes("wikimedia:"+p.id));await route.fulfill({json:{configured:true,image:candidates[0]??null,candidates,reason:candidates.length?undefined:"no-result"}});
  });
  try{await view.page.goto(view.url);await view.page.waitForFunction(()=>document.querySelectorAll('[data-src]').length===2&&[...document.querySelectorAll('[data-src]')].every(n=>n.dataset.src));phase=1;await view.page.getByRole("button",{name:"Fail A"}).click();await view.page.waitForTimeout(150);assert.equal(await view.page.locator('[data-cover="A"]').getAttribute("data-src"),"");assert.equal(await view.page.locator('[data-cover="B"]').getAttribute("data-src"),b.src);assert.equal(bCalls,1);}finally{await view.close();}
});


test("cover failures are bounded per canonical identity and a changed destination receives fresh lookups",{skip:!enabled,timeout:30000},async()=>{
 const contents=`import React,{useState} from 'react';import {createRoot} from 'react-dom/client';import {useDashboardTripPhotos} from './components/easyt/use-dashboard-trip-photos';
 function App(){const [name,setName]=useState('Athens');const trip={id:'same-trip',status:'planned',stops:[{id:'same-stop',order:0,name,country:name==='Athens'?'Greece':'Italy',canonicalPlaceId:name==='Athens'?'reference:geonames:264371':'reference:geonames:3173435',longitude:null,latitude:null}],planItems:[]};const {photos,markFailed}=useDashboardTripPhotos([trip]);return <div data-src={photos.get(trip.id)?.src??''}><button onClick={()=>markFailed(trip,photos.get(trip.id).src)}>Fail</button><button onClick={()=>setName(name==='Athens'?'Milan':'Athens')}>Change</button></div>};createRoot(document.getElementById('root')).render(<App/>);`;
 const view=await harness(contents),calls={Athens:0,Milan:0};const athens=[0,1,2,3].map(i=>fixturePhoto('RetryAthens'+i,'Greece')),milan=fixturePhoto('RetryMilan','Italy');
 await view.page.route('**/api/journey-route-image?**',async route=>{
  const params=new URL(route.request().url()).searchParams,name=params.get('place'),excluded=params.getAll('exclude');calls[name]++;
  const candidates=(name==='Athens'?athens:[milan]).filter(p=>!excluded.includes(p.src)&&!excluded.includes(p.sourceUrl)&&!excluded.includes('wikimedia:'+p.id));await route.fulfill({json:{configured:true,image:candidates[0]??null,candidates}});
 });
 try {
  await view.page.goto(view.url);
  for(let i=0;i<3;i++){await view.page.waitForFunction(id=>document.querySelector('[data-src]')?.dataset.src?.includes(id),'RetryAthens'+i);await view.page.getByRole('button',{name:'Fail',exact:true}).click();}
  await view.page.waitForFunction(()=>document.querySelector('[data-src]')?.dataset.src==='');assert.equal(calls.Athens,3);
  await view.page.getByRole('button',{name:'Change',exact:true}).click();
  await view.page.waitForFunction(()=>document.querySelector('[data-src]')?.dataset.src?.includes('RetryMilan'),{},{timeout:3000});assert.equal(calls.Milan,1);
  await view.page.getByRole('button',{name:'Change',exact:true}).click();await view.page.waitForFunction(()=>document.querySelector('[data-src]')?.dataset.src==='');assert.equal(calls.Athens,3,'returning to failed identity retains its bounded budget');
 } finally {await view.close();}
});
