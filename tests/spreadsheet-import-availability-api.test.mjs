// Import-only availability contract. Provider transport is controlled offline.
import assert from 'node:assert/strict';
import test from 'node:test';
import {controlled} from './helpers/import-availability-api.mjs';
for(const reply of ['timeout','503','bad-json','missing-features'])test(`proposed import-only lookup reports ${reply} as unavailable rather than a valid empty result`,async()=>{
 await controlled([reply],async({get})=>{
  const response=await get(undefined,{consumer:'spreadsheet-import'});
  assert.equal(response.status,503,'import needs observable unavailability before its empty-result fallback can be safe');
 });
});
test('proposed import-only lookup still accepts a valid healthy empty feature collection',async()=>{
 await controlled(['empty'],async({get})=>{const response=await get(undefined,{consumer:'spreadsheet-import'});assert.equal(response.status,200);assert.deepEqual(await response.json(),{candidates:[]});});
});

for(const reply of ['timeout','503','bad-json','missing-features','empty'])test(`ordinary unmarked lookup keeps its existing ${reply} response`,async()=>{
 await controlled([reply],async({get})=>{const response=await get();assert.equal(response.status,200);assert.deepEqual(await response.json(),{candidates:[]});});
});
test('an unrelated consumer value does not activate import handling',async()=>{
 await controlled(['503'],async({get})=>{const response=await get(undefined,{consumer:'other'});assert.equal(response.status,200);assert.deepEqual(await response.json(),{candidates:[]});});
});
test('the outer source deadline is observed even before fetch rejects',async t=>{
 await controlled(['pending'],async({get})=>{
  t.mock.timers.enable({apis:['setTimeout']});const pending=get(undefined,{consumer:'spreadsheet-import'});await Promise.resolve();t.mock.timers.tick(3501);
  assert.equal((await pending).status,503);
 });
});
test('import keeps independently verified local candidates despite a failed supplementary source',async()=>{
 await controlled(['timeout'],async({get,trace})=>{
  const response=await get('Tagbilara',{consumer:'spreadsheet-import',mode:'resolve',parentName:'Bohol',parentType:'island',parentId:'open-world:island-snapshot:relation:3625899',parentCountry:'Philippines'});
  assert.equal(response.status,200);const body=await response.json();assert.equal(body.candidates.length,1);assert.equal(body.candidates[0].canonicalPlaceId,'reference:geonames:1684497');assert.deepEqual(body.candidates[0].coordinates,[123.85219,9.65556]);assert.equal(trace.photon.length,1);
 });
});
test('import cannot call an empty final result healthy when its partial local facts were filtered out and the source failed',async()=>{
 await controlled(['timeout'],async({get})=>{
  const response=await get('Tagbilara',{consumer:'spreadsheet-import',mode:'resolve',parentName:'Siquijor',parentType:'region',parentCountry:'Philippines'});assert.equal(response.status,503);
 });
});
test('a healthy source with no parent-compatible match remains an ordinary empty result',async()=>{
 await controlled(['empty'],async({get})=>{
  const response=await get('Tagbilara',{consumer:'spreadsheet-import',mode:'resolve',parentName:'Siquijor',parentType:'region',parentCountry:'Philippines'});assert.equal(response.status,200);assert.deepEqual(await response.json(),{candidates:[]});
 });
});
test('exact bundled places still resolve with no provider attempt in import retry mode',async()=>{
 await controlled([],async({get,trace})=>{const response=await get('Manila',{consumer:'spreadsheet-import',mode:'resolve'});assert.equal(response.status,200);assert.equal((await response.json()).candidates[0].canonicalPlaceId,'reference:geonames:1701668');assert.equal(trace.photon.length,0);});
});
const uncoveredIsland={consumer:'spreadsheet-import',mode:'resolve',parentName:'Uncovered Fixture Island',parentType:'island',parentCountry:'Philippines'};
for(const reply of ['timeout','503','bad-json','missing-features'])test(`uncovered island physical lookup ${reply} is unavailable within import`,async()=>{
 await controlled([reply],async({get,trace})=>{const response=await get('Manila',uncoveredIsland);assert.equal(response.status,503);assert.equal(trace.photon.length,1);assert.equal(trace.photon[0].query,uncoveredIsland.parentName);assert.equal(trace.geometry.length,0);});
});
for(const geometry of ['503','bad-json'])test(`uncovered island geometry ${geometry} cannot become a healthy empty import result`,async()=>{
 await controlled(['uncovered-island'],async({get,trace})=>{const response=await get('Manila',uncoveredIsland);assert.equal(response.status,503);assert.equal(trace.photon.length,1);assert.equal(trace.geometry.length,2);assert(trace.geometry.every(request=>request.method==='POST'));},{geometry});
});
test('explicit import retry refreshes remote facts without inheriting Next revalidation or stale positive candidates',async()=>{
 await controlled(['el-nido','empty'],async({get,trace})=>{
  const initial=await get(undefined,{consumer:'spreadsheet-import'});assert.equal(initial.status,200);assert.equal((await initial.json()).candidates[0].providerId,'photon:R:16029725');
  const retry=await get(undefined,{consumer:'spreadsheet-import',mode:'resolve'});assert.equal(retry.status,200);assert.deepEqual(await retry.json(),{candidates:[]});
  assert.equal(trace.photon.length,2);assert.equal(trace.photon[0].revalidate,2592000);assert.equal(trace.photon[1].cache,'no-store');assert.equal(trace.photon[1].revalidate,undefined);
 });
});
test('ordinary positive remote candidate caching remains unchanged',async()=>{
 await controlled(['el-nido'],async({get,trace})=>{
  const first=await (await get('El Nido, Palawan')).json(),second=await (await get('El Nido, Palawan')).json(),explicit=await (await get('El Nido, Palawan',{mode:'resolve'})).json();assert.deepEqual(second,first);assert.deepEqual(explicit,first);assert.equal(trace.photon.length,1);assert.equal(trace.photon[0].revalidate,2592000);assert.equal(trace.photon[0].cache,undefined);
 });
});
