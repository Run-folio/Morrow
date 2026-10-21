import assert from 'node:assert/strict';
import test from 'node:test';
import {resolveSpreadsheetImportPlace,verifySpreadsheetImportBase} from '../lib/easyt/spreadsheet-import-places.ts';
import {createOpenWorldPlaceProvider} from '../lib/easyt/open-world-place.server.ts';
import {controlled,qualified} from './helpers/import-availability-api.mjs';

const parent={canonicalName:'Bohol',canonicalPlaceId:'open-world:island-snapshot:relation:3625899',placeType:'island' as const,parentCountries:['Philippines']};
for(const reply of ['timeout','503','bad-json','missing-features'])test(`import ${reply} preserves unresolved intent and cannot launch its empty-result fallback`,async()=>{
 await controlled([reply],async({trace}:any)=>{
  await assert.rejects(resolveSpreadsheetImportPlace('Tagbilaran','Philippines','stop',undefined,{mode:'resolve',parent}),/unavailable/);
  assert.equal(trace.api.length,1);assert.equal(trace.photon.length,1);assert.equal(trace.api[0].consumer,'spreadsheet-import');
 });
});
test('healthy empty still permits exactly one fallback with identical country, parent and bounds',async()=>{
 const bounded={...parent,bounds:{south:9.58,west:123.78,north:10.18,east:124.60}};
 await controlled(['empty'],async({trace}:any)=>{
  const result=await resolveSpreadsheetImportPlace('Tagbilaran','Philippines','stop',undefined,{mode:'resolve',parent:bounded});
  assert.equal(trace.api.length,2);assert.deepEqual(trace.api.map((r:any)=>r.place),['Tagbilaran, Philippines','Tagbilaran']);
  for(const request of trace.api){assert.equal(request.consumer,'spreadsheet-import');assert.equal(request.parentId,parent.canonicalPlaceId);assert.equal(request.parentCountry,'Philippines');assert.equal(request.country,'Philippines');assert.equal(request.parentSouth,'9.58');}
  assert.equal(result.result,null);assert.equal(result.candidates[0].canonicalPlaceId,'reference:geonames:1684497');assert.deepEqual(result.candidates[0].coordinates,[123.85219,9.65556]);
 });
});
test('an explicit retry after a failed primary can recover without changing the reviewed query or selecting a base automatically',async()=>{
 await controlled(['timeout','empty'],async({trace}:any)=>{
  await assert.rejects(resolveSpreadsheetImportPlace('Tagbilaran','Philippines','stop',undefined,{mode:'resolve',parent}),/unavailable/);
  const result=await resolveSpreadsheetImportPlace('Tagbilaran','Philippines','stop',undefined,{mode:'resolve',parent});
  assert.deepEqual(trace.api.map((r:any)=>r.place),['Tagbilaran, Philippines','Tagbilaran, Philippines','Tagbilaran']);assert.equal(result.result,null);assert.equal(result.candidates.length,1);
 });
});
for(const reply of ['empty','503'])test(`cancellation during ${reply} reply is an abort and never falls back`,async()=>{
 const abort=new AbortController();
 await controlled([{kind:reply,beforeReply:()=>abort.abort()}],async({trace}:any)=>{
  await assert.rejects(resolveSpreadsheetImportPlace('Tagbilaran','Philippines','stop',abort.signal,{mode:'resolve',parent}),{name:'AbortError'});assert.equal(trace.api.length,1);
 });
});

const base={name:'Fira',country:'Greece',canonicalPlaceId:'fixture:fira',providerId:'fixture:fira',coordinates:[25.431,36.417] as [number,number],placeType:'town' as const,routability:'direct_destination' as const};
const island={canonicalName:'Santorini',placeType:'island' as const,parentCountries:['Greece']};
for(const reply of ['503','network','bad-json','missing-array'])test(`physical base ${reply} propagates unavailability within import`,async()=>{
 const original=globalThis.fetch;let calls=0;
 globalThis.fetch=async input=>{calls++;const url=new URL(String(input),'http://localhost');assert.equal(url.searchParams.get('consumer'),'spreadsheet-import');
  if(reply==='network')throw new TypeError('Synthetic offline');if(reply==='503')return Response.json({result:null},{status:503});if(reply==='bad-json')return new Response('invalid json');return Response.json({result:null});};
 try{await assert.rejects(verifySpreadsheetImportBase(base,island),/unavailable/);assert.equal(calls,1);}finally{globalThis.fetch=original;}
});
test('a healthy empty physical lookup still refuses the base without claiming provider failure',async()=>{
 const original=globalThis.fetch;globalThis.fetch=async()=>Response.json({candidates:[]});
 try{assert.equal(await verifySpreadsheetImportBase(base,island),null);}finally{globalThis.fetch=original;}
});
test('physical verification cancellation retains AbortError',async()=>{
 const original=globalThis.fetch,abort=new AbortController();globalThis.fetch=async()=>{abort.abort();return Response.json({result:null},{status:503});};
 try{await assert.rejects(verifySpreadsheetImportBase(base,island,abort.signal),{name:'AbortError'});}finally{globalThis.fetch=original;}
});
test('an import consumer marker does not relax the qualified Palawan identity requirement',async()=>{
 await controlled(['el-nido'],async({trace}:any)=>{const result=await resolveSpreadsheetImportPlace(qualified,'Philippines');assert.equal(result.result?.providerId,'photon:R:16029725');assert.equal(result.result?.region,'Palawan');assert.deepEqual(result.result?.coordinates,[119.390496,11.1800395]);assert.equal(trace.api[0].consumer,'spreadsheet-import');});
});

for (const [name,payload] of [['null response',null],['missing candidates',{}],['null candidates',{candidates:null}],['object candidates',{candidates:{length:0}}],['string candidates',{candidates:''}]] as const)
test(`malformed application ${name} is unavailable and cannot trigger fallback`,async()=>{
 const original=globalThis.fetch;let calls=0;
 globalThis.fetch=async()=>{calls++;return Response.json(payload);};
 try{await assert.rejects(resolveSpreadsheetImportPlace('Tagbilaran','Philippines','stop',undefined,{mode:'resolve',parent}),/unavailable/);assert.equal(calls,1);}finally{globalThis.fetch=original;}
});

test('source failure observation is optional, fault-isolated and retains partial positive facts/cache behavior',async()=>{
 let observed=0,calls=0;const positive={providerId:'fixture-town',canonicalName:'Test Town',placeType:'town' as const,parentCountries:['Philippines'],coordinates:[120,14] as [number,number],routability:'direct_destination' as const,matchQuality:'exact' as const};
 const provider=createOpenWorldPlaceProvider({cache:new Map(),onSourceFailure:()=>{observed++;throw Error('Observer isolated');},sources:[{id:'failed',label:'Failed test source',async search(){throw Error('Synthetic failure');}},{id:'healthy',label:'Healthy test source',async search(){calls++;return [positive];}}]});
 const first=await provider.lookup('Test Town',{}),second=await provider.lookup('Test Town',{});assert.equal(first[0].canonicalName,'Test Town');assert.deepEqual(second,first);assert.equal(observed,1);assert.equal(calls,1);
});
