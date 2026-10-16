import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {build} from 'esbuild';

// Captured from actual guest Builder acceptance, not rebuilt from the resolver.
const capture=JSON.parse(readFileSync('tests/fixtures/catalog-activity-entry.json','utf8'));
const bundle=await build({entryPoints:['app/api/journey-discover/route.ts'],bundle:true,write:false,platform:'node',format:'esm',plugins:[{name:'source-drift-boundaries',setup(b){
 b.onResolve({filter:/^next\/server$/},()=>({path:'next',namespace:'fixture'}));
 b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export const NextResponse={json:(body,options)=>Response.json(body,options)};export class NextRequest {}'}));
 for(const [file,fn,key] of [['place-reference.server','referencePlaceById','reference'],['place-catalog','findCatalogPlaceById','catalog'],['discovery-content','discoveryPlaceForId','authored']]){
  b.onLoad({filter:new RegExp(file.replace('.','\\.')+'\\.ts$')},({path})=>({loader:'ts',resolveDir:resolve('lib/easyt'),contents:readFileSync(path,'utf8').replace(`export function ${fn}(`,`function actual_${fn}(`)+`\nfunction ${fn}(id){const r=actual_${fn}(id);const drift=globalThis.__activityProjectionDrift?.${key};return r&&drift?{...r,...drift}:r;}export {${fn}};`}));
 }
}}]});
const api=await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
function setup(t:any,stop:any,drift:any={}){
 const before=globalThis.fetch,requests:URL[]=[];(globalThis as any).__activityProjectionDrift=drift;
 globalThis.fetch=async input=>{const url=new URL(String(input));requests.push(url);assert.equal(url.hostname,'en.wikipedia.org');return Response.json({query:{pages:{101:{pageid:101,title:`${stop.name} Museum`,extract:'A major museum and visitor gallery.',coordinates:[{lon:stop.longitude,lat:stop.latitude}]}}}});};
 t.after(()=>{globalThis.fetch=before;delete (globalThis as any).__activityProjectionDrift;});return requests;
}
function query(stop:any){return new URL('http://localhost/api/journey-discover?'+new URLSearchParams({destination:stop.name,country:stop.country,canonicalPlaceId:stop.canonicalPlaceId,providerId:stop.providerId,lat:String(stop.latitude),lon:String(stop.longitude)}));}
for(const stop of capture.stops){
 test(`captured ${stop.name} Builder tuple retrieves local attractions without rewriting accepted facts`,async t=>{
  const requests=setup(t,stop),url=query(stop),before=url.toString(),saved=JSON.stringify(stop);
  const body=await (await api.GET({nextUrl:url})).json();
  assert.equal(body.assessment.retrieval,'completed');assert.equal(body.places.length,1);assert.equal(body.places[0].title,`${stop.name} Museum`);
  assert.equal(requests.length,1);assert.equal(requests[0].searchParams.get('ggscoord'),`${stop.latitude}|${stop.longitude}`);
  assert.equal(url.toString(),before);assert.equal(JSON.stringify(stop),saved);
 });
}
for(const stop of capture.stops.slice(0,2)){
 for(const [label,change] of [
  ['wrong country',{country:stop.name==='Lima'?'Colombia':'Peru'}],['mismatched catalog owner',{canonicalPlaceId:stop.name==='Lima'?'bogota':'lima'}],
  ['unresolved owner',{canonicalPlaceId:'unresolved:disposable'}],['ambiguous name',{destination:stop.name+' region'}],
  ['stale source fingerprint',{providerId:stop.providerId+'-stale'}],['different source record',{providerId:capture.stops[2].providerId}],
  ['unknown source',{providerId:'external:unverified'}],
 ] as const)test(`${stop.name} ${label} blocks before provider access`,async t=>{
  const requests=setup(t,stop),url=query(stop);for(const [k,v] of Object.entries(change))url.searchParams.set(k,v);
  const before=url.toString(),body=await (await api.GET({nextUrl:url})).json();
  assert.equal(body.assessment.reason,'identity_required');assert.equal(body.assessment.retrieval,'blocked');assert.deepEqual(body.places,[]);assert.equal(requests.length,0);assert.equal(url.toString(),before);
 });
 for(const [label,drift] of [
  ['reference point',{reference:{coordinates:[stop.longitude+0.00001,stop.latitude]}}],['reference status',{reference:{status:'closed'}}],
  ['reference type',{reference:{placeType:'town'}}],['reference name',{reference:{canonicalName:stop.name+' namesake'}}],
  ['reference country',{reference:{countryCode:'US'}}],['reference fingerprint',{reference:{providerId:stop.providerId+'-changed'}}],
  ['catalog name',{catalog:{canonicalName:stop.name+' district'}}],['catalog country',{catalog:{parentCountries:['United States']}}],
  ['catalog type',{catalog:{placeType:'town'}}],['catalog scope',{catalog:{captureMode:'explicit-only'}}],
  ['authored point',{authored:{coordinates:[stop.longitude,stop.latitude]}}],
 ] as const)test(`${stop.name} reviewed projection fails closed after ${label} drift`,async t=>{
  const requests=setup(t,stop,drift),body=await (await api.GET({nextUrl:query(stop)})).json();
  assert.equal(body.assessment.reason,'identity_required');assert.equal(requests.length,0);
 });
}
