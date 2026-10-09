import test from 'node:test';import assert from 'node:assert/strict';import {build} from 'esbuild';import {createRequire} from 'node:module';
import {createOpenWorldPlaceProvider} from '../lib/easyt/open-world-place.server.ts';
import {trustedLocalActivityCentre} from '../lib/easyt/place-reference.server.ts';
import {referenceCountrySeeds} from '../lib/easyt/place-reference.ts';
async function handler(path:string){const require=createRequire(import.meta.url);const bundle=await build({entryPoints:[path],bundle:true,write:false,format:'cjs',platform:'node',external:['next/server']});const module={exports:{} as any};new Function('require','module','exports',bundle.outputFiles[0].text)(require,module,module.exports);return {GET:module.exports.GET,Request:require('next/server').NextRequest};}
test('autocomplete and exact local resolves make zero external calls; an unresolved explicit lookup makes one abortable Photon call',async()=>{
 const calls:{url:string;signal:AbortSignal}[]=[];const fetcher=(async(input:any,init:any)=>{calls.push({url:String(input),signal:init.signal});return new Response('{"features":[]}');}) as typeof fetch;
 const local=createOpenWorldPlaceProvider({searchMode:'reference-only',fetchImpl:fetcher,cache:new Map()});
 assert.ok((await local.lookup('GUA',{})).length);assert.deepEqual(await local.lookup('no-such-place-zzzz',{}),[]);assert.equal(calls.length,0);
 const explicit=createOpenWorldPlaceProvider({fetchImpl:fetcher,cache:new Map()});assert.ok((await explicit.lookup('LHR',{})).length);assert.equal(calls.length,0);
 await explicit.lookup('no-such-place-zzzz',{});assert.equal(calls.length,1);assert.equal(new URL(calls[0].url).hostname,'photon.komoot.io');assert.ok(calls[0].signal instanceof AbortSignal);
});
test('actual API validates mode before every geocode branch and autocomplete never performs nearby external search',async()=>{
 const api=await handler('app/api/journey-geocode/route.ts'),original=globalThis.fetch;let calls=0;globalThis.fetch=(async()=>{calls++;throw new Error('offline');}) as typeof fetch;
 try{
  for(const params of ['place=GUA','place=no-such-place-zzzz','nearbyBases=1&anchorName=Crete&anchorType=island&anchorCountry=Greece&anchorLon=25&anchorLat=35','place=Heraklion&nearbyBaseSearch=1&anchorName=Crete&anchorType=island&anchorCountry=Greece&anchorLon=25&anchorLat=35']){const response=await api.GET(new api.Request(`http://fixture/api/journey-geocode?mode=autocomplete&${params}&candidates=1`));assert.equal(response.status,200,params);}
  const invalid=await api.GET(new api.Request('http://fixture/api/journey-geocode?mode=unexpected&nearbyBases=1'));assert.equal(invalid.status,400);assert.equal(calls,0);
 }finally{globalThis.fetch=original;}
});
test('activity centres require exact local identity/type/jurisdiction/source tuple; negative centres fetch nothing',async()=>{
 const seed=referenceCountrySeeds('FJ')[0],input={destination:seed.canonicalName,requestedCountryCode:'FJ',coordinates:seed.coordinates!,canonicalPlaceId:seed.canonicalPlaceId,providerId:seed.referenceProviderId};
 assert.ok(trustedLocalActivityCentre(input));assert.ok(trustedLocalActivityCentre({...input,canonicalPlaceId:undefined,providerId:undefined}));
 for(const change of [{requestedCountryCode:'PF'},{canonicalPlaceId:'reference:geonames:deleted'},{providerId:'different-provider'},{coordinates:[seed.coordinates![0]+0.00001,seed.coordinates![1]] as const},{coordinates:[0,0] as const},{destination:'Other town'}])assert.equal(trustedLocalActivityCentre({...input,...change}),null);
 const api=await handler('app/api/journey-discover/route.ts'),original=globalThis.fetch,calls:string[]=[];globalThis.fetch=(async(url:any)=>{calls.push(String(url));return new Response('{"query":{"pages":{}}}');}) as typeof fetch;
 try{
  for(const query of ['destination=Suva&country=Fiji&lat=0&lon=0','destination=Suva&country=Fiji&lat=-18&lon=179.9','destination=Suva&country=French%20Polynesia&lat=-18.14161&lon=178.44149','destination=Suva&lat=-18.14161&lon=178.44149']){assert.deepEqual(await(await api.GET(new api.Request(`http://fixture/api/journey-discover?${query}`))).json(),{places:[]});}
  assert.equal(calls.length,0);
  const params=new URLSearchParams({destination:seed.canonicalName,country:'Fiji',lat:String(seed.coordinates![1]),lon:String(seed.coordinates![0]),canonicalPlaceId:seed.canonicalPlaceId,providerId:seed.referenceProviderId!});
  await api.GET(new api.Request(`http://fixture/api/journey-discover?${params}`));assert.equal(calls.length,1);assert.equal(new URL(calls[0]).hostname,'en.wikipedia.org');
 }finally{globalThis.fetch=original;}
});
