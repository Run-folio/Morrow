import assert from 'node:assert/strict';
import test from 'node:test';
import {build} from 'esbuild';
import {resolve} from 'node:path';

const configuration={environment:'sandbox',apiBaseUrl:'https://api.sandbox.viator.com/partner',apiKey:'synthetic-only'};
const destination={canonicalPlaceId:'paris',name:'Paris',country:'France',countryCode:'FR'};
const productUrl='https://www.viator.com/tours/Paris/d479-PUBLIC?medium=api&campaign=a%2Bb';
const fixture=()=>((globalThis as any).__guestViatorPublic);
async function bundle(entry:string, route=false) {
 const real=resolve('lib/easyt/viator-affiliate.server.ts');
 const output=await build({entryPoints:[entry],bundle:true,write:false,platform:'node',format:'esm',plugins:[{name:'external-boundaries',setup(b){
  b.onResolve({filter:/^server-only$/},()=>({path:'empty',namespace:'fixture'}));
  b.onResolve({filter:/^next\/server$/},()=>({path:'next',namespace:'fixture'}));
  b.onResolve({filter:/^@\/lib\/easyt\/owner$/},()=>({path:'owner',namespace:'fixture'}));
  b.onResolve({filter:/^\.\/database(?:\.ts)?$/},()=>({path:'database',namespace:'fixture'}));
  if(route)b.onResolve({filter:/^@\/lib\/easyt\/viator-affiliate\.server$/},()=>({path:'client',namespace:'fixture'}));
  b.onLoad({filter:/.*/,namespace:'fixture'},({path})=>({resolveDir:process.cwd(),contents:path==='empty'?'':path==='next'?'export const NextResponse={json:(value,options)=>Response.json(value,options)};':path==='owner'?`export async function requireEasyTOwner(){globalThis.__guestViatorPublic.ownerReads++;throw new Error('Unauthorized');}`:path==='database'?`export function getEasyTDatabase(){throw new Error('No hosted database in tests');}`:
   `import {ViatorAffiliateClient as Real,ViatorAffiliateError} from ${JSON.stringify(real)};export {ViatorAffiliateError};export class ViatorAffiliateClient extends Real {constructor(){super(${JSON.stringify(configuration)},{cache:new Map(),resolveDestination:d=>({...d,providerDestinationId:'479'}),admission:globalThis.__guestViatorPublic.admission,request:globalThis.__guestViatorPublic.request});}}`}));
 }}]});
 return import(`data:text/javascript;base64,${Buffer.from(output.outputFiles[0].text).toString('base64')}`);
}
const route=await bundle('app/api/journey-activity-inventory/route.ts',true);
const clientModule=await bundle('lib/easyt/viator-affiliate.server.ts');
const admission={claim:async()=>({admitted:true,token:'synthetic-permit'}),release:async()=>{},cooldown:async()=>{}};
function setup(t:any) {
 (globalThis as any).__guestViatorPublic={ownerReads:0,calls:0,admission,request:async()=>{fixture().calls++;return Response.json({products:[{productCode:'PUBLIC',title:'Paris museum tour',destinations:[{ref:'479',primary:true}],productUrl}]});}};
 t.after(()=>delete (globalThis as any).__guestViatorPublic);
}
const request=(body:unknown={workspace:'map',destination},headers:Record<string,string>={'content-type':'application/json'})=>new Request('http://localhost/api/journey-activity-inventory',{method:'POST',headers,body:typeof body==='string'?body:JSON.stringify(body)});

test('guest inventory returns faithful public cards without any account read',async t=>{
 setup(t);const response=await route.POST(request()),payload=await response.json();
 assert.equal(response.status,200);assert.equal(fixture().ownerReads,0);
 assert.equal(payload.activities[0]?.productUrl,productUrl);
 assert.deepEqual(payload.activities[0]?.destination,{canonicalPlaceId:'paris',label:'Paris'});
 assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(fixture().calls,1);
});
test('invalid and oversized public bodies never dispatch provider work',async t=>{
 setup(t);
 for(const [body,headers,status] of [
  [{destination,workspace:'bogus'},{'content-type':'application/json'},400],
  [{destination:{...destination,aliases:['ok',42]}},{'content-type':'application/json'},400],
  [{destination:{...destination,countryCode:'123'}},{'content-type':'application/json'},400],
  [{destination,currency:'ZZZ'},{'content-type':'application/json'},400],
  [{destination,locale:'xx-XX'},{'content-type':'application/json'},400],
  [{destination,trip:{private:'must not be accepted'}},{'content-type':'application/json'},400],
  [null,{'content-type':'application/json'},400],
  [{destination},{'content-type':'text/plain'},415],
  [' '.repeat(17000),{'content-type':'application/json','content-length':'2'},413],
 ] as const){const response=await route.POST(request(body,headers));assert.equal(response.status,status,JSON.stringify(body)?.slice(0,80));}
 assert.equal(fixture().calls,0);assert.equal(fixture().ownerReads,0);
});
test('eight identical cold searches share one product request and clone output',async t=>{
 setup(t);let calls=0;
 const client=new clientModule.ViatorAffiliateClient(configuration,{admission,cache:new Map(),resolveDestination:(d:any)=>({...d,providerDestinationId:'479'}),request:async()=>{calls++;await new Promise(resolve=>setTimeout(resolve,5));return Response.json({products:[{productCode:'P',title:'Paris tour',destinations:[{ref:'479',primary:true}]}]});}});
 const results=await Promise.all(Array.from({length:8},()=>client.searchActivities({destination,count:12})));
 assert.equal(calls,1);results[0][0].destination.label='changed';assert.equal(results[1][0].destination.label,'Paris');
});
test('unprepared coordination and denied admission dispatch zero provider requests',async t=>{
 setup(t);let calls=0;
 for(const gate of [undefined,{...admission,claim:async()=>({admitted:false,retryAfterSeconds:60})},{...admission,claim:async()=>{throw new Error('database unavailable');}}]) {
  const client=new clientModule.ViatorAffiliateClient(configuration,{...(gate?{admission:gate}:{}),cache:new Map(),resolveDestination:(d:any)=>({...d,providerDestinationId:'479'}),request:async()=>{calls++;return Response.json({products:[]});}});
  await assert.rejects(client.searchActivities({destination}), (error:any)=>['unavailable','rate_limited'].includes(error.category)&&error.lookupAttempted===false);
 }
 assert.equal(calls,0);
});
test('429 applies Retry-After cooldown, releases permit, and is never cached as empty success',async t=>{
 setup(t);let claims=0,releases=0,cooldown=0,calls=0;
 const gate={claim:async()=>{claims++;return {admitted:cooldown===0,token:'permit',retryAfterSeconds:cooldown};},release:async()=>{releases++;},cooldown:async(seconds:number)=>{cooldown=seconds;}};
 const client=new clientModule.ViatorAffiliateClient(configuration,{admission:gate,cache:new Map(),resolveDestination:(d:any)=>({...d,providerDestinationId:'479'}),request:async()=>{calls++;return new Response('',{status:429,headers:{'retry-after':'120'}});}});
 await assert.rejects(client.searchActivities({destination}),(error:any)=>error.category==='rate_limited'&&error.retryAfterSeconds===120);
 await assert.rejects(client.searchActivities({destination}),(error:any)=>error.category==='rate_limited');
 assert.equal(calls,1);assert.equal(claims,2);assert.equal(releases,1);assert.equal(cooldown,120);
});
test('distinct cold requests have no unbounded in-process admission queue',async t=>{
 setup(t);let claims=0;
 let finish!:(value:unknown)=>void;
 const waiting=new Promise(resolve=>{finish=resolve;});
 const gate={...admission,claim:async()=>{claims++;return await waiting;}};
 const client=new clientModule.ViatorAffiliateClient(configuration,{admission:gate,cache:new Map(),resolveDestination:(d:any)=>({...d,providerDestinationId:'479'}),request:async()=>assert.fail('denied claim must not dispatch')});
 const requests=['GBP','EUR','USD'].map(currency=>client.searchActivities({destination,currency}).catch((error:any)=>error));
 await new Promise(resolve=>setTimeout(resolve,5));
 const observed=claims;finish({admitted:false,retryAfterSeconds:60});await Promise.all(requests);
 assert.equal(observed,2);
});
test('day-long provider Retry-After never resumes earlier than the provider',async t=>{
 setup(t);let cooldown=0;
 const client=new clientModule.ViatorAffiliateClient(configuration,{admission:{...admission,cooldown:async(seconds:number)=>{cooldown=seconds;}},cache:new Map(),resolveDestination:(d:any)=>({...d,providerDestinationId:'479'}),request:async()=>new Response('',{status:429,headers:{'retry-after':'86400'}})});
 await assert.rejects(client.searchActivities({destination}),(error:any)=>error.category==='rate_limited');
 assert.equal(cooldown,86400);
});
test('public Retry-After feedback is bounded while the full provider cooldown is recorded',async t=>{
 setup(t);let cooldown=0;fixture().admission={...admission,cooldown:async(seconds:number)=>{cooldown=seconds;}};
 fixture().request=async()=>new Response('',{status:429,headers:{'retry-after':'864000'}});
 const response=await route.POST(request());assert.equal(response.status,429);
 assert.equal(cooldown,864000);assert.equal(response.headers.get('retry-after'),'86400');
 const body=await response.json();assert.equal(body.assessment.retrieval,'unavailable');assert.equal(body.assessment.diagnostics.stage,'provider');
});
test('timed-out admission retains local slots and releases late permits without dispatch',async t=>{
 setup(t);let claims=0,releases=0,dispatches=0;
 const pending:Array<(value:unknown)=>void>=[];
 const gate={...admission,claim:()=>{claims++;return new Promise(resolve=>pending.push(resolve));},release:async()=>{releases++;}};
 const client=new clientModule.ViatorAffiliateClient(configuration,{admission:gate,cache:new Map(),resolveDestination:(d:any)=>({...d,providerDestinationId:'479'}),request:async()=>{dispatches++;return Response.json({products:[]});}});
 await Promise.all(['USD','GBP'].map(currency=>client.searchActivities({destination,currency}).catch(()=>{})));
 const later=['EUR','AUD'].map(currency=>client.searchActivities({destination,currency}).catch(()=>{}));
 await new Promise(resolve=>setTimeout(resolve,5));const observed=claims;
 pending.splice(0).forEach(resolve=>resolve({admitted:true,token:'late'}));await Promise.all(later);
 await new Promise(resolve=>setTimeout(resolve,5));
 assert.equal(observed,2);assert.equal(releases,2);assert.equal(dispatches,0);
});
