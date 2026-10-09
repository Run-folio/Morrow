import test from 'node:test';import assert from 'node:assert/strict';import {build} from 'esbuild';import {createRequire} from 'node:module';
import {searchReferencePlaces} from '../lib/easyt/place-reference.server.ts';
test('actual API preserves reference source identity/point and rejects tampered source tuples',async()=>{
 const require=createRequire(import.meta.url);const candidates=searchReferencePlaces('GUA',{});
 const bundle=await build({entryPoints:['app/api/journey-geocode/route.ts'],bundle:true,write:false,format:'cjs',platform:'node',external:['next/server'],plugins:[{name:'local-provider',setup(b){b.onResolve({filter:/open-world-place\.server$/},()=>({path:'provider',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:`export const createOpenWorldPlaceProvider=()=>({});export const searchOpenWorldNearbyBaseSuggestions=async()=>[];export const searchOpenWorldTravelCandidates=async()=>${JSON.stringify([...candidates,{...candidates[0],coordinates:[0,0]}])};`}));}}]});
 const module={exports:{} as any};new Function('require','module','exports',bundle.outputFiles[0].text)(require,module,module.exports);
 const body=await(await module.exports.GET(new (require('next/server').NextRequest)('http://fixture/api/journey-geocode?place=GUA&candidates=1'))).json();
 assert.equal(body.candidates.length,1);const c=body.candidates[0];assert.equal(c.canonicalPlaceId,candidates[0].canonicalPlaceId);assert.equal(c.providerId,candidates[0].providerId);assert.deepEqual(c.coordinates,candidates[0].coordinates);assert.equal(c.matchedAirportCode,'GUA');
});
