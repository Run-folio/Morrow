import assert from 'node:assert/strict';
import test from 'node:test';
import {build} from 'esbuild';
import type {NextRequest} from 'next/server';

test('geocode API never auto-selects cross-country Porto with missing nearby context',async()=>{
 const result=await build({entryPoints:['app/api/journey-geocode/route.ts'],bundle:true,write:false,format:'esm',platform:'node',plugins:[{name:'controlled-provider',setup(b){
  b.onResolve({filter:/^next\/server$/},()=>({path:'next-response',namespace:'fixture'}));
  b.onResolve({filter:/open-world-place\.server$/},()=>({path:'provider',namespace:'fixture'}));
  b.onLoad({filter:/.*/,namespace:'fixture'},({path})=>({contents:path==='next-response'?`export const NextResponse={json:(body,options)=>({body,status:options?.status??200})};`:
   `export const createOpenWorldPlaceProvider=()=>({});export const searchOpenWorldNearbyBaseSuggestions=async()=>[];export const searchOpenWorldTravelCandidates=async()=>[
    {providerId:'fixture:brazil-porto',canonicalName:'Porto',parentCountries:['Brazil'],coordinates:[-51,-24],placeType:'city',routability:'direct_destination',rankScore:200},
    {providerId:'fixture:portugal-porto',canonicalName:'Porto',parentCountries:['Portugal'],coordinates:[-8.6291,41.1579],placeType:'city',routability:'direct_destination',rankScore:100}];`}));
 }}]});
 const api=await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
 const get=async(query:string)=>api.GET({nextUrl:new URL(`http://localhost/api/journey-geocode?place=Porto&${query}`)} as NextRequest);
 for(const query of ['', 'nearLat=&nearLon=', 'nearLat=0', 'nearLat=NaN&nearLon=0'])assert.deepEqual((await get(query)).body,{result:null},query);
 const choices=(await get('candidates=1')).body.candidates;assert.deepEqual(choices.map((c:{country:string})=>c.country),['Brazil','Portugal']);
 const portugal=(await get('country=Portugal')).body.result;assert.equal(portugal.country,'Portugal');assert.equal(portugal.canonicalPlaceId,'porto');assert.deepEqual(portugal.coordinates,[-8.6291,41.1579]);
 const brazil=(await get('country=Brazil')).body.result;assert.equal(brazil.country,'Brazil');assert.deepEqual(brazil.coordinates,[-51,-24],'explicit Brazilian selection retains its original identity');
});
