import { emptyServerMarkerPlugin } from './helpers/server-marker.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {build} from 'esbuild';
import {searchReferencePlaces,referenceAreaBaseSeeds,referencePlaceById} from '../lib/easyt/place-reference.server.ts';
import type {PlaceProviderCandidate} from '../lib/easyt/place-intelligence.ts';
const captured=JSON.parse(readFileSync('tests/fixtures/batch14-physical-island-geography.json','utf8'));
const fira=searchReferencePlaces('Fira',{explicitCountryNames:['Greece']}).find(c=>c.canonicalPlaceId==='reference:geonames:252920')!;
const athens=searchReferencePlaces('Athens',{explicitCountryNames:['Greece']}).find(c=>c.placeType==='city')!;
async function api(seeds:PlaceProviderCandidate[]){
 const output=await build({entryPoints:['app/api/journey-geocode/route.ts'],bundle:true,write:false,format:'esm',platform:'node',plugins:[emptyServerMarkerPlugin,{name:'injected-candidate-source',setup(b){
  b.onResolve({filter:/^next\/server$/},()=>({path:'next',namespace:'fixture'}));
  b.onResolve({filter:/place-reference\.server$/},()=>({path:'reference',namespace:'fixture'}));
  b.onLoad({filter:/.*/,namespace:'fixture'},({path})=>({resolveDir:process.cwd(),contents:path==='next'
    ? `export const NextResponse={json:(body,options)=>({body,status:options?.status??200})};`
    : `export * from './lib/easyt/place-reference.server.ts';export const referenceAreaBaseSeeds=()=>${JSON.stringify(seeds)};`}));
 }}]});return import(`data:text/javascript;base64,${Buffer.from(output.outputFiles[0]!.text).toString('base64')}`);
}
function request(name='Synthetic Test Island',country='Greece',type='island'){
 const q=new URLSearchParams({areaBases:'1',parentId:'synthetic-test-island',parentName:name,parentCountry:country,parentType:type});
 return {nextUrl:new URL('http://local/api/journey-geocode?'+q),signal:new AbortController().signal};
}
function physicalFixture(options:{unavailable?:boolean;adminOnly?:boolean;wrongIdentity?:boolean}={}):typeof fetch{
 const photon=structuredClone(captured.photon.body),geometry=structuredClone(captured.overpass.body);
 photon.features=photon.features.filter((f:any)=>f.properties.osm_id===453964);
 photon.features[0].properties.name='Synthetic Test Island';photon.features[0].properties.osm_id=123456;
 geometry.elements[0].id=options.wrongIdentity?999999:123456;
 geometry.elements[0].tags['name:en']='Synthetic Test Island';geometry.elements[0].tags.int_name='Synthetic Test Island';
 if(options.adminOnly)geometry.elements[0].tags.boundary='administrative';
 return async input=>String(input).startsWith('https://photon.komoot.io/api/')?Response.json(photon):options.unavailable?new Response('',{status:503}):Response.json(geometry);
}
async function run(seeds:PlaceProviderCandidate[],fetchImpl:typeof fetch,req=request()){
 const route=await api(seeds),old=globalThis.fetch;globalThis.fetch=fetchImpl;
 try{return await route.GET(req);}finally{globalThis.fetch=old;}
}
test('new unanchored API emits only physically verified unchanged pinned settlements',async()=>{
 const result=await run([fira,{...athens,parentRegionId:'Synthetic Test Island'}],physicalFixture());
 assert.equal(result.status,200);assert.equal(result.body.status,'ready');
 assert.deepEqual(result.body.candidates.map((c:any)=>c.canonicalPlaceId),[fira.canonicalPlaceId]);
 const base=result.body.candidates[0];assert.deepEqual(base.coordinates,fira.coordinates);assert.equal(base.placeType,fira.placeType);
 assert(base.provenance.some((p:any)=>p.id===fira.providerId&&p.supports.includes('Physical island verified')));
});
for(const failure of ['adminOnly','wrongIdentity'] as const)test(`unanchored API refuses ${failure} geometry without using administrative seed labels`,async()=>{
 const result=await run([{...fira,parentRegionId:'Synthetic Test Island'}],physicalFixture({[failure]:true}));
 assert.equal(result.status,200);assert.equal(result.body.status,'empty');assert.deepEqual(result.body.candidates,[]);
});
test('unanchored API distinguishes empty seeds from unavailable physical verification',async()=>{
 let calls=0;const empty=await run([],async()=>{calls++;throw Error('empty must not fetch');});
 assert.equal(empty.status,200);assert.equal(empty.body.status,'empty');assert.equal(calls,0);
 const failed=await run([fira],physicalFixture({unavailable:true}));assert.equal(failed.status,503);assert.equal(failed.body.status,'unavailable');
});
test('unanchored API refuses wrong-country, mutated reference point and non-settlement candidates',async()=>{
 const result=await run([{...fira,parentCountries:['Italy']},{...fira,coordinates:[25,36]},{...fira,placeType:'island'}],async()=>{throw Error('invalid seed must not fetch');});
 assert.equal(result.status,200);assert.equal(result.body.status,'empty');assert.deepEqual(result.body.candidates,[]);
});
test('explicit discovery rejects invalid parents and autocomplete requests',async()=>{
 const route=await api([fira]);
 for(const req of [request('','Greece'),request('Synthetic Test Island','Unknown country'),request('Synthetic Test Island','Greece','city')]){
  const result=await route.GET(req);assert.equal(result.status,400);
 }
 const req=request();req.nextUrl.searchParams.set('mode','autocomplete');
 const result=await route.GET(req);assert.equal(result.status,200);assert.deepEqual(result.body.candidates,[]);
});
test('shared discovery accepts maintained ISO country identity without weakening country containment',async()=>{
 const result=await run([fira],physicalFixture(),request('Synthetic Test Island','GR'));
 assert.equal(result.status,200);assert.equal(result.body.status,'ready');assert.equal(result.body.candidates[0].country,'Greece');
});

for(const [name,type] of [['Gran Canaria','island'],['Canary Islands','archipelago']] as const)test(`automatic ${name} bases come from accepted physical bindings during source outage`,async()=>{
 let calls=0;const result=await run([],async()=>{calls++;throw Error('Covered suggestions must remain offline');},request(name,'Spain',type));
 assert.equal(result.status,200);assert.equal(result.body.status,'ready');assert.equal(result.body.candidates.length,5);assert.equal(calls,0);
 assert.equal(new Set(result.body.candidates.map((c:any)=>c.canonicalPlaceId)).size,5);
 for(const c of result.body.candidates){const original=referencePlaceById(c.canonicalPlaceId)!;assert(original);assert.equal(c.providerId,original.providerId);assert.deepEqual(c.coordinates,original.coordinates);assert.equal(c.name,original.canonicalName);assert.equal(c.placeType,original.placeType);assert.equal(c.country,'Spain');assert.equal(c.region,name);assert(c.normalizationReason.includes('snapshot='));assert(c.provenance.some((p:any)=>p.id===original.providerId));}
});
const bali={canonicalName:'Bali',placeType:'island' as const,parentCountries:['Indonesia']};
const baliSeed=referenceAreaBaseSeeds(bali)[0]!;assert(baliSeed);
for(const failure of ['http','missing-features','invalid-json','abort'] as const)test(`uncovered Bali ${failure} identity lookup is unavailable instead of false empty`,async()=>{
 const result=await run([baliSeed],async()=>{
  if(failure==='http')return new Response('',{status:503});
  if(failure==='missing-features')return Response.json({});
  if(failure==='invalid-json')return new Response('{');
  throw new DOMException('Timed out','TimeoutError');
 },request('Bali','Indonesia'));
 assert.equal(result.status,503);assert.equal(result.body.status,'unavailable');assert.deepEqual(result.body.candidates,[]);
});
test('uncovered Bali healthy empty identity lookup remains empty without guessing a base',async()=>{
 let calls=0;const result=await run([baliSeed],async()=>{calls++;return Response.json({features:[]});},request('Bali','Indonesia'));
 assert.equal(result.status,200);assert.equal(result.body.status,'empty');assert.deepEqual(result.body.candidates,[]);assert.equal(calls,1);
});

test('automatic Bohol bases retain coastline-source proof and exact identity during source outage',async()=>{
 let calls=0;const result=await run([],async()=>{calls++;throw Error('Covered suggestions must remain offline');},request('Bohol','Philippines'));
 assert.equal(result.status,200);assert.equal(result.body.status,'ready');assert(result.body.candidates.length>0&&result.body.candidates.length<=5);assert.equal(calls,0);
 const c=result.body.candidates.find((c:any)=>c.canonicalPlaceId==='reference:geonames:1684497');assert(c);const original=referencePlaceById(c.canonicalPlaceId)!;
 assert.equal(c.providerId,original.providerId);assert.deepEqual(c.coordinates,original.coordinates);assert.match(c.normalizationReason,/relation:3625899/);assert.match(c.normalizationReason,/snapshot=/);
});
test('malformed physical geometry response remains unavailable instead of false empty',async()=>{
 const photon=structuredClone(captured.photon.body);photon.features=photon.features.filter((f:any)=>f.properties.osm_id===453964);photon.features[0].properties.name='Synthetic Test Island';photon.features[0].properties.osm_id=123456;
 const result=await run([fira],async input=>String(input).startsWith('https://photon.komoot.io/api/')?Response.json(photon):Response.json({}));
 assert.equal(result.status,503);assert.equal(result.body.status,'unavailable');assert.deepEqual(result.body.candidates,[]);
});
