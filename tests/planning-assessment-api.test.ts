import assert from 'node:assert/strict';
import test from 'node:test';
import {build} from 'esbuild';
import {resolve} from 'node:path';
import {readFileSync} from 'node:fs';
import {searchReferencePlaces} from '../lib/easyt/place-reference.server.ts';
import {PLACE_CATALOG} from '../lib/easyt/place-catalog.ts';

const fixture=()=>((globalThis as any).__phase1Api);
async function handler(path:string) {
 const realViator=resolve('lib/easyt/viator-affiliate.server.ts'),realRoad=resolve('lib/easyt/road-routing.ts'),realReference=resolve('lib/easyt/place-reference.server.ts');
 const bundled=await build({entryPoints:[path],bundle:true,write:false,platform:'node',format:'esm',plugins:[{name:'external-boundaries-only',setup(b){
  b.onResolve({filter:/^server-only$/},()=>({path:'empty',namespace:'fixture'}));
  b.onResolve({filter:/^next\/server$/},()=>({path:'next',namespace:'fixture'}));
  b.onResolve({filter:/^@\/lib\/easyt\/owner$/},()=>({path:'owner',namespace:'fixture'}));
  b.onResolve({filter:/^@\/lib\/easyt\/place-reference\.server$/},()=>({path:'reference',namespace:'fixture'}));
  b.onResolve({filter:/^@\/lib\/easyt\/viator-affiliate\.server$/},()=>({path:'viator',namespace:'fixture'}));
  b.onResolve({filter:/^\.\/road-routing\.server\.ts$/},()=>({path:'road',namespace:'fixture'}));
  b.onLoad({filter:/.*/,namespace:'fixture'},({path})=>({resolveDir:process.cwd(),contents:path==='empty'?'':path==='next'?`export const NextResponse={json:(body,options)=>Response.json(body,options)}; export class NextRequest {}`:
   path==='owner'?`export async function requireEasyTOwner(){if(globalThis.__phase1Api.guest)throw new Error('Unauthorized');return 'disposable-owner';}`:
   path==='reference'?`import * as real from ${JSON.stringify(realReference)};export const trustedLocalActivityCentre=real.trustedLocalActivityCentre;export function trustedPinnedActivityCentre(input){if(globalThis.__phase1Api.identityUnavailable)throw new Error('Private reference storage failure');return real.trustedPinnedActivityCentre(input);}`:
   path==='road'?`import {RoadRoutingError} from ${JSON.stringify(realRoad)};export {RoadRoutingError};export class OpenRouteServiceRoadRoutingProvider {constructor(){if(globalThis.__phase1Api.configurationMissing)throw new RoadRoutingError('configuration');}provider='openrouteservice';async route(){globalThis.__phase1Api.providerCalls++;throw new RoadRoutingError(globalThis.__phase1Api.roadFailure??'timeout');}}`:
   `import {ViatorAffiliateClient as Real,ViatorAffiliateError} from ${JSON.stringify(realViator)};export {ViatorAffiliateError};export class ViatorAffiliateClient extends Real {constructor(){if(globalThis.__phase1Api.configurationMissing)throw new ViatorAffiliateError('configuration');super({environment:'sandbox',apiBaseUrl:'https://api.sandbox.viator.com/partner',apiKey:'synthetic-placeholder'}, {cache:new Map(),taxonomyCache:new Map(),destinationResolutionCache:new Map(),...(!globalThis.__phase1Api.realTaxonomy?{resolveDestination:destination=>({...destination,providerDestinationId:'123'})}:{}),request:globalThis.__phase1Api.request});}}`}));
 }}]});
 return import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`);
}
const [discoverApi,inventoryApi,transferApi]=await Promise.all([handler('app/api/journey-discover/route.ts'),handler('app/api/journey-activity-inventory/route.ts'),handler('app/api/journey-transfer-resolution/route.ts')]);
const api={discover:discoverApi,inventory:inventoryApi,transfer:transferApi};
function setup(t:any,settings:any={}) {
 (globalThis as any).__phase1Api={guest:false,providerCalls:0,requests:[],request:async()=>Response.json({products:[]}),...settings};
 const before=globalThis.fetch;
 globalThis.fetch=async(input:any)=>{fixture().requests.push(String(input));return fixture().organic?.()??Response.json({query:{pages:{}}});};
 t.after(()=>{globalThis.fetch=before;delete (globalThis as any).__phase1Api;});
}
const selected=(name:string,country:string)=>searchReferencePlaces(name,{explicitCountryNames:[country]}).find(c=>c.canonicalName===name)!;
const tokyo=selected('Tokyo','Japan');
const discovery=(name='Tokyo',country='Japan',id=tokyo.canonicalPlaceId!,providerId=tokyo.providerId!)=>
 new URL('http://localhost/api/journey-discover?'+new URLSearchParams({destination:name,country,canonicalPlaceId:id,providerId,lat:'35.6896',lon:'139.6917'}));
const inventoryBody={destination:{canonicalPlaceId:tokyo.canonicalPlaceId,name:'Tokyo',country:'Japan',countryCode:'JP',coordinates:{latitude:35.6895,longitude:139.69171}},workspace:'itinerary'};
const inventoryRequest=(body:any=inventoryBody)=>new Request('http://localhost/api/journey-activity-inventory',{method:'POST',body:JSON.stringify(body)});
const product=(id:string)=>({productCode:id,title:`Disposable culture tour ${id}`,destinations:[{ref:'123',primary:true}],duration:{fixedDurationInMinutes:120}});

test('trusted pinned Tokyo discovery uses source coordinates while stored legacy points remain unchanged',async t=>{
 setup(t,{organic:()=>Response.json({query:{pages:{1:{pageid:1,title:'Tokyo Museum',extract:'A major museum and visitor gallery.',coordinates:[{lon:139.69171,lat:35.6895}]}}}})});
 const url=discovery(),before=url.toString();const response=await (await api.discover).GET({nextUrl:url});const body=await response.json();
 assert.equal(response.status,200);assert.equal(body.places.length,1);assert.equal(url.toString(),before);
 assert.equal(new URL(fixture().requests[0]).searchParams.get('ggscoord'),'35.6895|139.69171');
 assert.equal(body.assessment?.retrieval,'completed');assert.deepEqual(body.counts,{raw:1,admitted:1,returned:1});
});
test('an existing catalog owner with its explicitly pinned reference selection retains that owner identity',async t=>{
 setup(t);const url=discovery();url.searchParams.set('canonicalPlaceId','tokyo');
 const body=await (await (await api.discover).GET({nextUrl:url})).json();
 assert.equal(body.assessment?.retrieval,'completed');
 assert.equal(new URL(fixture().requests[0]).searchParams.get('ggscoord'),'35.6895|139.69171');
 assert.equal(url.searchParams.get('canonicalPlaceId'),'tokyo');
});
for(const [name,country,point] of [['Cusco','Peru','-13.53188|-71.96701'],['Nairobi','Kenya','-1.28333|36.81667']] as const)
 test(`trusted ${name} discovery is sourced from its pinned identity, without arbitrary caller coordinates`,async t=>{
  setup(t);const c=selected(name,country),url=discovery(name,country,c.canonicalPlaceId!,c.providerId!);url.searchParams.delete('lat');url.searchParams.delete('lon');
  const response=await (await api.discover).GET({nextUrl:url});const body=await response.json();
  assert.equal(response.status,200);assert.equal(new URL(fixture().requests[0]).searchParams.get('ggscoord'),point);
  assert.equal(body.assessment?.reason,'successful_empty');assert.deepEqual(body.counts,{raw:0,admitted:0,returned:0});
 });
for(const [label,mutate] of [
 ['fabricated ID',(u:URL)=>u.searchParams.set('canonicalPlaceId','reference:geonames:999999999')],
 ['stale provider reference',(u:URL)=>u.searchParams.set('providerId',tokyo.providerId+'-stale')],
 ['different namesake',(u:URL)=>u.searchParams.set('destination','Tokyo Bay')],
 ['conflicting selected identity',(u:URL)=>u.searchParams.set('canonicalPlaceId',selected('Nairobi','Kenya').canonicalPlaceId!)],
 ['wrong country',(u:URL)=>u.searchParams.set('country','Kenya')],
 ['unsupported alias',(u:URL)=>u.searchParams.set('destination','My Tokyo')],
] as const)test(`discovery blocks ${label} without provider calls`,async t=>{
 setup(t);const url=discovery();mutate(url);const body=await (await (await api.discover).GET({nextUrl:url})).json();
 assert.equal(body.places.length,0);assert.equal(body.assessment?.retrieval,'blocked');assert.equal(body.assessment?.reason,'identity_required');
 assert.equal(body.assessment?.evidence,'unqualified');assert.equal(body.counts,undefined);assert.equal(fixture().requests.length,0);
});
test('unproven approximate legacy coordinates require confirmation rather than claiming successful empty',async t=>{
 setup(t);const url=discovery();url.searchParams.delete('canonicalPlaceId');url.searchParams.delete('providerId');
 const body=await (await (await api.discover).GET({nextUrl:url})).json();
 assert.equal(body.assessment?.reason,'identity_required');assert.equal(body.counts,undefined);assert.equal(fixture().requests.length,0);
});
test('gateway and planning-area pins cannot become activity destinations or silently substitute a base',async t=>{
 setup(t);
 const airport=searchReferencePlaces('Tokyo',{explicitCountryNames:['Japan']}).find(c=>c.placeType==='transport_gateway')!;
 assert.ok(airport);
 const area=PLACE_CATALOG.find(c=>c.parentCountries.includes('Japan')&&c.routability==='planning_area')!;
 assert.ok(area);
 for(const url of [discovery(airport.canonicalName,'Japan',airport.canonicalPlaceId!,airport.providerId!),
  discovery(area.canonicalName,'Japan',area.canonicalPlaceId,'unsupported-provider')]) {
  const body=await (await (await api.discover).GET({nextUrl:url})).json();
  assert.equal(body.assessment?.retrieval,'blocked');assert.equal(body.assessment?.reason,'identity_required');
  assert.equal(body.counts,undefined);
 }
 assert.equal(fixture().requests.length,0);
});
test('discovery reports admissions before the unchanged ten-item presentation cap',async t=>{
 setup(t,{organic:()=>Response.json({query:{pages:Object.fromEntries(Array.from({length:12},(_,i)=>[i,{pageid:i,title:`Tokyo Museum ${i}`,extract:'A major museum and visitor gallery.',coordinates:[{lon:139.69171,lat:35.6895}]}]))}})});
 const body=await (await (await api.discover).GET({nextUrl:discovery()})).json();
 assert.equal(body.places.length,10);assert.deepEqual(body.counts,{raw:12,admitted:12,returned:10});
});
test('organic upstream failure retains unavailable and safe retry metadata',async t=>{
 setup(t,{organic:()=>{throw new DOMException('private upstream details','TimeoutError');}});
 const body=await (await (await api.discover).GET({nextUrl:discovery()})).json();
 assert.equal(body.unavailable,true);assert.equal(body.assessment?.reason,'timeout');assert.equal(body.assessment?.retryable,true);assert.equal(body.counts,undefined);
 assert.equal(JSON.stringify(body).includes('private upstream'),false);
});
test('organic admitted-empty retains raw count separately from successful empty',async t=>{
 setup(t,{organic:()=>Response.json({query:{pages:{1:{pageid:1,title:'Tokyo',extract:'A city in Japan',coordinates:[{lon:139.69171,lat:35.6895}]}}}})});
 const body=await (await (await api.discover).GET({nextUrl:discovery()})).json();
 assert.deepEqual(body.counts,{raw:1,admitted:0,returned:0});assert.equal(body.assessment?.reason,'filtered_empty');
});
for(const [label,payload] of [
 ['invalid query scalar',{query:'broken'}],['null query',{query:null}],['query array',{query:[]}],
 ['array page',{query:{pages:{1:[]}}}],['wrong title type',{query:{pages:{1:{title:5}}}}],
 ['unrecognized payload',{}],
] as const)test(`organic ${label} is unavailable malformed evidence, never zero inventory`,async t=>{
 setup(t,{organic:()=>Response.json(payload)});const body=await (await (await api.discover).GET({nextUrl:discovery()})).json();
 assert.equal(body.unavailable,true);assert.equal(body.assessment?.reason,'malformed_response');
 assert.equal(body.assessment?.retrieval,'unavailable');assert.equal(body.assessment?.retryable,true);assert.equal(body.counts,undefined);
});
test('MediaWiki batchcomplete with no query is a valid successful empty response',async t=>{
 setup(t,{organic:()=>Response.json({batchcomplete:''})});const body=await (await (await api.discover).GET({nextUrl:discovery()})).json();
 assert.equal(body.assessment?.reason,'successful_empty');assert.deepEqual(body.counts,{raw:0,admitted:0,returned:0});
});
test('local identity-source failure does not claim a Wikipedia request',async t=>{
 setup(t,{identityUnavailable:true});const body=await (await (await api.discover).GET({nextUrl:discovery()})).json();
 assert.equal(body.unavailable,true);assert.equal(body.assessment?.reason,'configuration_unavailable');
 assert.equal(body.assessment?.retryable,false);assert.deepEqual(body.assessment?.diagnostics.attemptedSources,[]);
 assert.equal(body.counts,undefined);assert.equal(fixture().requests.length,0);
 assert.equal(JSON.stringify(body).includes('Private reference'),false);
});
test('anonymous commercial remains401 and does not claim zero stock or call provider',async t=>{
 setup(t,{guest:true,request:async()=>{assert.fail('guest cannot call inventory provider');}});
 const response=await (await api.inventory).POST(inventoryRequest());const body=await response.json();
 assert.equal(response.status,401);assert.deepEqual(body.activities,[]);assert.equal(body.assessment?.reason,'auth_required');
 assert.equal(body.assessment?.retrieval,'blocked');assert.equal(body.assessment?.retryable,false);assert.equal(body.counts,undefined);
 assert.equal(body.assessment?.evidence,'insufficient','authentication does not prove invalid geography');
});
test('commercial transient failure, cached empty and expired cache remain distinguishable',async()=>{
 const {ViatorAffiliateClient}=await handler('lib/easyt/viator-affiliate.server.ts');
 let now=1_000,calls=0;const cache=new Map();
 const client=new ViatorAffiliateClient({environment:'sandbox',apiBaseUrl:'https://api.sandbox.viator.com/partner',apiKey:'synthetic-placeholder'},
  {cache,now:()=>now,cacheTtlMs:100,resolveDestination:(d:any)=>({...d,providerDestinationId:'123'}),request:async()=>{
   calls++;return calls===1?new Response('{}',{status:503}):Response.json({products:[]});
  }});
 await assert.rejects(client.searchActivitiesWithDiagnostics({destination:inventoryBody.destination,count:4}));
 assert.equal(cache.size,0);
 const miss=await client.searchActivitiesWithDiagnostics({destination:inventoryBody.destination,count:4});
 const hit=await client.searchActivitiesWithDiagnostics({destination:inventoryBody.destination,count:4});
 assert.equal(miss.cacheOutcome,'miss');assert.equal(hit.cacheOutcome,'hit');assert.equal(calls,2);
 assert.deepEqual(hit.counts,{raw:0,admitted:0,returned:0});
 delete cache.values().next().value!.counts;
 const legacyHit=await client.searchActivitiesWithDiagnostics({destination:inventoryBody.destination,count:4});
 assert.equal(legacyHit.cacheOutcome,'hit');assert.equal(legacyHit.counts,undefined,'legacy cache has unobserved raw counts');
 now+=101;const expired=await client.searchActivitiesWithDiagnostics({destination:inventoryBody.destination,count:4});
 assert.equal(expired.cacheOutcome,'miss');assert.equal(calls,3);
});
test('invalid commercial identity fails before lookup and is not described as attempted inventory',async()=>{
 const {ViatorAffiliateClient}=await handler('lib/easyt/viator-affiliate.server.ts');let calls=0;
 const client=new ViatorAffiliateClient({environment:'sandbox',apiBaseUrl:'https://api.sandbox.viator.com/partner',apiKey:'synthetic-placeholder'},
  {cache:new Map(),request:async()=>{calls++;return Response.json({products:[]});}});
 await assert.rejects(client.searchActivitiesWithDiagnostics({destination:{canonicalPlaceId:'',name:'Tokyo',country:'Japan'}}),
  (error:any)=>error.category==='identity'&&error.lookupAttempted===false);
 assert.equal(calls,0);
});
test('controlled authenticated four-product success reports retrieval/admission counts without UI filtering',async t=>{
 let calls=0;setup(t,{request:async(_url:any,init:any)=>{calls++;assert.equal(JSON.parse(init.body).pagination.count,4);return Response.json({products:['A','B','C','D'].map(product)});}});
 const response=await (await api.inventory).POST(inventoryRequest());const body=await response.json();
 assert.equal(response.status,200);assert.equal(body.activities.length,4);assert.equal(calls,1);
 assert.deepEqual(body.counts,{raw:4,admitted:4,returned:4});assert.equal(body.assessment?.retrieval,'completed');assert.equal(body.assessment?.evidence,'conditional');
 assert.equal(body.activities[0].destination.providerDestinationId,undefined);
});
for(const [label,products,reason,counts] of [
 ['successful empty',[],'successful_empty',{raw:0,admitted:0,returned:0}],
 ['admission filtered empty',[{title:'No product ID'}],'filtered_empty',{raw:1,admitted:0,returned:0}],
] as const)test(`commercial ${label} is explicit`,async t=>{
 setup(t,{request:async()=>Response.json({products})});const body=await (await (await api.inventory).POST(inventoryRequest())).json();
 assert.equal(body.assessment?.reason,reason);assert.deepEqual(body.counts,counts);
});
test('commercial missing canonical identity is400 input status, independent of availability',async t=>{
 setup(t,{request:async()=>{assert.fail('invalid identity cannot call provider');}});
 const response=await (await api.inventory).POST(inventoryRequest({destination:{name:'Tokyo',country:'Japan'}}));const body=await response.json();
 assert.equal(response.status,400);assert.equal(body.assessment?.retrieval,'blocked');assert.equal(body.assessment?.reason,'identity_required');assert.equal(body.counts,undefined);
});
for(const [label,destination,taxonomy] of [
 ['conflicting coordinates',{...inventoryBody.destination,coordinates:{latitude:-33.8688,longitude:151.2093}},[
  {destinationId:16,name:'Japan',type:'COUNTRY',lookupId:'16'},
  {destinationId:334,name:'Tokyo',type:'CITY',parentDestinationId:16,lookupId:'16.334',center:{latitude:35.6895,longitude:139.6917}},
 ]],
 ['unsupported destination',{canonicalPlaceId:'neutral-unsupported',name:'Unmapped locality',country:'Japan'},[
  {destinationId:16,name:'Japan',type:'COUNTRY',lookupId:'16'},
  {destinationId:334,name:'Tokyo',type:'CITY',parentDestinationId:16,lookupId:'16.334'},
 ]],
 ['ambiguous namesake',{canonicalPlaceId:'neutral-springfield',name:'Springfield',country:'United States',placeType:'city'},[
  {destinationId:77,name:'United States',type:'COUNTRY',lookupId:'77'},
  {destinationId:930,name:'Springfield',type:'CITY',parentDestinationId:77,lookupId:'77.930'},
  {destinationId:931,name:'Springfield',type:'CITY',parentDestinationId:77,lookupId:'77.931'},
 ]],
] as const)test(`real commercial taxonomy ${label} blocks identity without calling product search`,async t=>{
 const requests:string[]=[];setup(t,{realTaxonomy:true,request:async(url:any)=>{requests.push(String(url));return Response.json({destinations:taxonomy});}});
 const response=await (await api.inventory).POST(inventoryRequest({destination,workspace:'itinerary'}));const body=await response.json();
 assert.equal(response.status,400);assert.equal(body.assessment?.retrieval,'blocked');assert.equal(body.assessment?.reason,'identity_required');
 assert.equal(body.assessment?.retryable,false);assert.equal(body.counts,undefined);
 assert.deepEqual(body.assessment?.diagnostics.attemptedSources,['commercial-inventory']);
 assert.equal(requests.length,1);assert.ok(requests[0].endsWith('/destinations'));
});
for(const [label,status,reason,retryable] of [['provider503',503,'provider_error',true],['provider401',401,'auth_required',false],['malformed',200,'malformed_response',true]] as const)
 test(`commercial ${label} remains503 with controlled failure metadata`,async t=>{
  setup(t,{request:async()=>new Response(label==='malformed'?'bad json':'{}',{status})});const response=await (await api.inventory).POST(inventoryRequest());const body=await response.json();
  assert.equal(response.status,503);assert.equal(body.assessment?.reason,reason);assert.equal(body.assessment?.retryable,retryable);assert.equal(body.counts,undefined);
 });
test('missing commercial configuration is unavailable, nonretryable and never requests stock',async t=>{
 setup(t,{configurationMissing:true});const response=await (await api.inventory).POST(inventoryRequest());const body=await response.json();
 assert.equal(response.status,503);assert.equal(body.assessment?.reason,'configuration_unavailable');assert.equal(body.assessment?.retryable,false);assert.equal(body.counts,undefined);
});
test('transfer API retains per-leg timeout status, order and no-store while original legs remain immutable',async t=>{
 setup(t);const inputs=JSON.parse(readFileSync('tests/fixtures/planning-assessment-controls.json','utf8')).japanLegs;const original=structuredClone(inputs);
 const response=await (await api.transfer).POST(new Request('http://localhost/api/journey-transfer-resolution',{method:'POST',body:JSON.stringify({legs:inputs})}));const body=await response.json();
 assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(body.legs.length,4);
 assert.equal(body.assessments?.length,4);assert.deepEqual(body.assessments.map((a:any)=>a.legId),inputs.map((l:any)=>l.id));
 assert.ok(body.assessments.every((a:any)=>a.state.reason==='timeout'));assert.deepEqual(inputs,original);
});
test('transfer API rejects duplicate IDs and more than eight legs before provider consumption',async t=>{
 setup(t);const one=JSON.parse(readFileSync('tests/fixtures/planning-assessment-controls.json','utf8')).japanLegs[0];
 for(const legs of [[one,one],Array.from({length:9},(_,i)=>({...one,id:`${i}`}))]){
  const response=await (await api.transfer).POST(new Request('http://localhost/api/journey-transfer-resolution',{method:'POST',body:JSON.stringify({legs})}));assert.equal(response.status,400);
 }
 assert.equal(fixture().providerCalls,0);
});
