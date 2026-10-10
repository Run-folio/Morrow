import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
const snapshotId=JSON.parse(readFileSync('data/place-reference/islands/manifest.json','utf8')).snapshotId;
import {build} from 'esbuild';
import {searchReferencePlaces} from '../lib/easyt/place-reference.server.ts';
const fira=searchReferencePlaces('Fira',{explicitCountryNames:['Greece']}).find(c=>c.canonicalPlaceId==='reference:geonames:252920')!;assert(fira);
async function mountedAPI(candidates = [fira]){
 const output=await build({entryPoints:['app/api/journey-geocode/route.ts'],bundle:true,write:false,format:'esm',platform:'node',plugins:[{name:'recorded-settlement',setup(b){
  b.onResolve({filter:/^next\/server$/},()=>({path:'next-response',namespace:'fixture'}));
  b.onResolve({filter:/open-world-place\.server$/},()=>({path:'settlement',namespace:'fixture'}));
  b.onLoad({filter:/.*/,namespace:'fixture'},({path})=>({contents:path==='next-response'?`export const NextResponse={json:(body,options)=>({body,status:options?.status??200})};`:`export const createOpenWorldPlaceProvider=()=>({});export const searchOpenWorldNearbyBaseSuggestions=async()=>[];export const searchOpenWorldTravelCandidates=async()=>${JSON.stringify(candidates)};`}));
 }}]});return import(`data:text/javascript;base64,${Buffer.from(output.outputFiles[0].text).toString('base64')}`);
}
test('actual Firá reference point becomes selectable only after independent physical Santorini geometry proof',async()=>{
 const api=await mountedAPI();const old=globalThis.fetch;const requests:string[]=[];globalThis.fetch=async(input)=>{requests.push(String(input));throw Error('Boundary provider unavailable');};
 try{const q=await api.GET({nextUrl:new URL('http://localhost/api/journey-geocode?place=Fira&country=Greece&mode=autocomplete&candidates=1&parentName=Santorini&parentId=santorini&parentType=island&parentCountry=Greece')});assert.equal(q.status,200);assert.equal(q.body.candidates.length,1,'Known real settlement is currently discarded because its reference record lacks island containment');const selected=q.body.candidates[0];assert.equal(selected.canonicalPlaceId,fira.canonicalPlaceId);assert.equal(selected.providerId,fira.providerId);assert.deepEqual(selected.coordinates,fira.coordinates);assert.equal(selected.region,'Santorini');assert.match(selected.normalizationReason,/453964/);assert(selected.normalizationReason.includes('snapshot='+snapshotId));assert.match(selected.normalizationReason,/checked=2026-10-10/);assert.deepEqual(requests,[]);}finally{globalThis.fetch=old;}
});
test('ordinary country-constrained settlement query retains its existing canonical identity and point',async()=>{const api=await mountedAPI();const q=await api.GET({nextUrl:new URL('http://localhost/api/journey-geocode?place=Fira&country=Greece&candidates=1')});assert.equal(q.body.candidates[0].canonicalPlaceId,fira.canonicalPlaceId);assert.deepEqual(q.body.candidates[0].coordinates,fira.coordinates);});

test('covered Canary API only exposes physically verified member towns even during boundary provider outage',async()=>{
 const candidates=['Santa Cruz de Tenerife','Las Palmas','Madrid'].map(name=>searchReferencePlaces(name,{explicitCountryNames:['Spain']}).find(c=>c.placeType==='city')!);
 const api=await mountedAPI(candidates);const previous=globalThis.fetch;let calls=0;
 globalThis.fetch=async()=>{calls++;throw Error('Boundary service unavailable');};
 try{const q=await api.GET({nextUrl:new URL('http://localhost/api/journey-geocode?place=Santa&country=Spain&mode=autocomplete&candidates=1&parentName=Canary+Islands&parentType=archipelago&parentId=canary-islands&parentCountry=Spain')});assert.equal(q.status,200);assert.deepEqual(q.body.candidates.map((c:any)=>c.canonicalPlaceId),candidates.slice(0,2).map(c=>c.canonicalPlaceId));assert.equal(calls,0);assert(q.body.candidates.every((c:any)=>c.region==='Canary Islands'&&c.normalizationReason.includes('snapshot=')));}finally{globalThis.fetch=previous;}
});
