import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import ts from 'typescript';
import * as strategy from '../lib/easyt/local-search-strategy.ts';
import * as displayName from '../lib/easyt/place-display-name.ts';
import * as placeStatus from '../lib/easyt/place-status.ts';
import * as geography from '../lib/easyt/local-place-geography.ts';
import * as resultQuality from '../lib/easyt/local-place-results.ts';
import * as placeCatalog from '../lib/easyt/place-catalog.ts';
import * as recommendationPerformance from '../lib/easyt/recommendation-performance.ts';

type Provider = 'google' | 'osm' | 'photon';
type Reply = {status:number;body?:unknown;bodyForRequest?:(url:URL,options?:any)=>unknown;errorName?:string;malformed?:boolean};
function routeHarness(replies:Record<Provider,Reply>, configured = true) {
  const calls: Array<{provider:Provider;url:URL;options:any}> = [],deadlines:number[]=[],invalidations:string[]=[];
  const fetch = async (value:string, options:any) => {
    const provider:Provider = value.includes('places.googleapis.com') ? 'google' : value.includes('overpass.kumi.systems') ? 'osm' : 'photon';
    const url=new URL(value);calls.push({provider,url,options}); const reply = replies[provider];
    if (reply.errorName) { const error = new Error('PRIVATE TOKEN raw body account trip query'); error.name = reply.errorName; throw error; }
    return {ok:reply.status>=200&&reply.status<300,status:reply.status,json:async()=>{
      assert.ok(reply.status>=200&&reply.status<300,'failed HTTP must not read the provider body');
      if(reply.malformed)throw new SyntaxError('PRIVATE RESPONSE BODY');return reply.bodyForRequest?reply.bodyForRequest(url,options):reply.body;
    }};
  };
  const imports:Record<string,unknown> = {
    'node:crypto':{createHash},'next/cache':{revalidateTag:(tag:string)=>invalidations.push(tag)},
    'next/server':{NextResponse:{json:(body:unknown,init?:ResponseInit)=>Response.json(body,init)}},
    '@/lib/easyt/place-display-name':displayName,'@/lib/easyt/place-status':placeStatus,
    '@/lib/easyt/local-place-geography':geography,'@/lib/easyt/recommendation-performance':recommendationPerformance,
    '@/lib/easyt/local-place-results':resultQuality,'@/lib/easyt/place-catalog':placeCatalog,
    '@/lib/easyt/local-search-strategy':{...strategy,firstUsefulLocalSearchWithFallback:(primary:any,fallback:any)=>strategy.firstUsefulLocalSearchWithFallback(primary,fallback,()=>new Promise<void>(()=>{}))},
  };
  const source = readFileSync(new URL('../app/api/journey-local-search/route.ts',import.meta.url),'utf8');
  const script = ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const module = {exports:{} as {GET:(request:any)=>Promise<Response>}};
  new Function('require','module','exports','fetch','process','AbortSignal',script)((id:string)=>{assert.ok(id in imports,id);return imports[id]},module,module.exports,fetch,{env:configured?{GOOGLE_PLACES_API_KEY:'SYNTHETIC_NOT_A_CREDENTIAL'}:{}},{timeout:(ms:number)=>{deadlines.push(ms);return AbortSignal.timeout(ms)}});
  const run = (kind='stay',map='maplibre',city='Porto',refresh=false)=>module.exports.GET({nextUrl:new URL(`https://fixture.invalid/api/journey-local-search?kind=${kind}&mapPresentation=${map}&city=${city}&country=Portugal&lat=41.1485&lon=-8.61097${refresh?'&refresh=1':''}`)});
  return {run,calls,deadlines,invalidations};
}
const allFailed:Record<Provider,Reply>={google:{status:503},osm:{status:429},photon:{status:0,errorName:'TimeoutError'}};
test('manual retry invalidates only its exact public OSM query tag before fetching; normal queries retain stable caching',async()=>{
  const h=routeHarness(allFailed,false);
  await h.run();const stayTag=h.calls[0].options.next.tags[0];assert.match(stayTag,/^local-osm:[a-f0-9]{64}$/);assert.deepEqual(h.invalidations,[]);
  await h.run();assert.equal(h.calls[2].options.next.tags[0],stayTag);
  await h.run('restaurant');const foodTag=h.calls[4].options.next.tags[0];assert.notEqual(foodTag,stayTag);
  await h.run('restaurant','maplibre','Porto',true);assert.deepEqual(h.invalidations,[foodTag]);assert.equal(h.calls[6].options.cache,'no-store');assert.equal(h.calls[6].options.next,undefined);
  assert.equal(stayTag,`local-osm:${createHash('sha256').update(h.calls[0].url.searchParams.get('data')!).digest('hex')}`);
});
test('actual Stay route exposes source-specific failure without enabling Google or changing JSON', async()=>{
  const h=routeHarness(allFailed),response=await h.run(),timing=response.headers.get('server-timing')!;
  assert.match(timing,/first-base;dur=/);assert.match(timing,/local-osm;dur=\d+;desc="http_error:429"/);assert.match(timing,/local-photon;dur=\d+;desc="timeout"/);assert.doesNotMatch(timing,/google|PRIVATE|TOKEN|account|Porto|Portugal|41\.1485|body|query/i);
  assert.deepEqual(h.calls.map(c=>c.provider),['osm','photon']);
  assert.deepEqual(await response.json(),{places:[],source:'OpenStreetMap',inventory:false,searchStatus:'failed',unavailable:true});
});
test('actual Food route diagnoses its own allowed sources rather than inheriting Stay cause',async()=>{
  const h=routeHarness({...allFailed,photon:{status:200,body:{features:[]}}}),response=await h.run('restaurant','none'),timing=response.headers.get('server-timing')!;
  assert.match(timing,/local-google;dur=\d+;desc="http_error:503"/);assert.match(timing,/local-osm;dur=\d+;desc="http_error:429"/);assert.match(timing,/local-photon;dur=\d+;desc="empty"/);
  assert.equal((await response.json()).searchStatus,'empty'); assert.deepEqual(new Set(h.calls.map(c=>c.provider)),new Set(['google','osm','photon']));
});
test('malformed successful source responses stay failures with sanitized classification',async()=>{
  const h=routeHarness({google:{status:200,malformed:true},osm:{status:200,body:{private:'PRIVATE'}},photon:{status:200,body:{features:'PRIVATE'}}});
  const response=await h.run('restaurant','none'),timing=response.headers.get('server-timing')!;
  assert.equal((timing.match(/desc="malformed"/g)??[]).length,3);assert.doesNotMatch(timing,/PRIVATE|response|personal/);assert.equal((await response.json()).searchStatus,'failed');
});
test('unconfigured Google is classified without reading or returning a key',async()=>{
  const h=routeHarness(allFailed,false),response=await h.run('restaurant','none');
  assert.match(response.headers.get('server-timing')!,/local-google;dur=\d+;desc="configuration"/);assert.equal(h.calls.some(c=>c.provider==='google'),false);
});
for(const kind of ['stay','restaurant'])test(`HTTP200 Overpass runtime error cannot make failed ${kind} retrieval look empty`,async()=>{
  const h=routeHarness({...allFailed,osm:{status:200,body:{elements:[],remark:'runtime error: Query timed out. PRIVATE PROVIDER DETAILS'}}},false);
  const response=await h.run(kind,kind==='stay'?'maplibre':'none'),body=await response.json(),timing=response.headers.get('server-timing')!;
  assert.equal(body.searchStatus,'failed');assert.equal(body.unavailable,true);assert.deepEqual(body.places,[]);
  assert.match(timing,/local-osm;dur=\d+;desc="unavailable"/);assert.doesNotMatch(timing,/PRIVATE|runtime error|Query/);
  assert.equal(h.calls.filter(c=>c.provider==='photon').length,1);
});
test('an Overpass error with partial elements does not publish them as a completed hotel search',async()=>{
  const h=routeHarness({...allFailed,osm:{status:200,body:{elements:[{id:9,lat:41.1485,lon:-8.61097,tags:{name:'Partial hotel',tourism:'hotel','addr:country':'PT'}}],remark:'runtime error: Query ran out of memory.'}}},false);
  const response=await h.run(),body=await response.json();assert.equal(body.searchStatus,'failed');assert.equal(body.unavailable,true);assert.deepEqual(body.places,[]);assert.equal(h.calls.filter(c=>c.provider==='photon').length,1);
});
test('a runtime error primary still admits one useful existing fallback',async()=>{
  const h=routeHarness({...allFailed,osm:{status:200,body:{elements:[],remark:'runtime error: Query timed out.'}},photon:{status:200,body:{features:[{properties:{osm_id:101,name:'Synthetic Porto Hotel',osm_value:'hotel',country:'Portugal'},geometry:{coordinates:[-8.61097,41.1485]}}]}}},false);
  const body=await(await h.run()).json();assert.equal(body.searchStatus,'ready');assert.equal(body.places.length,1);assert.equal(body.places[0].availability,'check');assert.equal(body.inventory,false);
});
test('a successful zero-result Overpass response and an informational remark remain valid empty evidence',async()=>{
  for(const remark of [undefined,'runtime remark: informational diagnostic']){
    const h=routeHarness({...allFailed,osm:{status:200,body:{elements:[],...(remark?{remark}:{})}}},false),body=await(await h.run()).json();assert.equal(body.searchStatus,'empty');assert.notEqual(body.unavailable,true);
  }
});
test('explicit retry bypasses a cached semantic error without replacing ordinary provider caching',async()=>{
  const h=routeHarness({...allFailed,osm:{status:200,bodyForRequest:(_url,options)=>options.cache==='no-store'
    ? {elements:[{id:19,lat:41.1485,lon:-8.61097,tags:{name:'Recovered Porto hotel',tourism:'hotel','addr:country':'PT'}}]}
    : {elements:[],remark:'runtime error: Query timed out.'}}},false);
  const response=await h.run('stay','maplibre','Porto',true),body=await response.json();assert.equal(body.searchStatus,'ready');assert.equal(body.places[0]?.name,'Recovered Porto hotel');assert.equal(body.places[0]?.availability,'check');
  for(const call of h.calls){assert.equal(call.options.cache,'no-store');assert.equal(call.options.next,undefined);assert.equal(call.url.searchParams.has('refresh'),false);}
  assert.equal(h.calls.filter(c=>c.provider==='osm').length,1);
});
test('explicit Food retry refreshes only the already allowed provider lanes',async()=>{
  const h=routeHarness(allFailed,true);await h.run('restaurant','none','Porto',true);assert.deepEqual(h.calls.map(c=>c.provider),['google','osm','photon']);for(const call of h.calls){assert.equal(call.options.cache,'no-store');assert.equal(call.options.next,undefined);}
  const normal=routeHarness(allFailed,true);await normal.run('restaurant','none');assert.deepEqual(normal.calls.map(c=>c.options.next.revalidate),[900,43200,43200]);assert.ok(normal.calls.every(c=>c.options.cache===undefined));
});
test('overlapping request diagnostics stay in their own response and successful source stays useful',async()=>{
  const failure=routeHarness(allFailed);
  const ready=routeHarness({...allFailed,osm:{status:200,body:{elements:[{id:1,lat:41.1485,lon:-8.61097,tags:{name:'Synthetic Porto stay',tourism:'hotel','addr:country':'PT'}}]}}});
  const [failedResponse,readyResponse]=await Promise.all([failure.run(),ready.run()]);
  assert.match(failedResponse.headers.get('server-timing')!,/http_error:429/);
  assert.match(readyResponse.headers.get('server-timing')!,/local-osm;dur=\d+;desc="ready"/);assert.doesNotMatch(readyResponse.headers.get('server-timing')!,/http_error|timeout|photon/);
  assert.equal((await readyResponse.json()).searchStatus,'ready');assert.equal(ready.calls.length,1);
});

type OsmFixture = {type:'node'|'way'|'relation';id:number;lat?:number;lon?:number;center?:{lat:number;lon:number};tags:Record<string,string>};
// Upstream output_json.cc:118–120 emits node coordinates for CENTER as well
// as COORDS. This fixture must not fabricate a difference between tags+center
// and body+center. print.cc:245–250 supplies the node Point_Geometry.
function osmOutputReply(elements:OsmFixture[]):Reply {
  return {status:200,bodyForRequest:url=>{
    const query=url.searchParams.get('data')!,output=/;\s*out\s+([^;]+);/.exec(query)?.[1]?.split(/\s+/)??[];
    const tagsOnly=output.includes('tags'),nodeGeometry=!tagsOnly||output.includes('center')||output.includes('geom')||output.includes('bb');
    return {elements:elements.map(element=>{
      const copy=structuredClone(element);
      if(copy.type==='node'&&!nodeGeometry){delete copy.lat;delete copy.lon;}
      if(copy.type!=='node'&&!output.includes('center'))delete copy.center;
      return copy;
    })};
  }};
}
const venue=(kind:string,type:OsmFixture['type'],id:number):OsmFixture=>({type,id,
  ...(type==='node'?{lat:41.1495,lon:-8.61197}:{center:{lat:41.1475,lon:-8.60997}}),
  tags:{name:`Synthetic Porto ${kind} ${type}`,...(kind==='stay'?{tourism:'hotel'}:{amenity:'restaurant'}),'addr:country':'PT'},
});
test('OSM fixture honors node coordinates for both center output clauses',()=>{
  const node=venue('stay','node',1001),reply=osmOutputReply([node]);
  const render=(output:string)=>reply.bodyForRequest!(new URL(`https://fixture.invalid?data=${encodeURIComponent(`;out ${output} 35;`)}`));
  assert.deepEqual(render('center tags'),render('body center'));
  const tagsOnly=render('tags') as {elements:OsmFixture[]};
  assert.equal(tagsOnly.elements[0]?.lat,undefined);
});
for(const kind of ['stay','restaurant'])test(`OSM ${kind} query retains node venue coordinates through the actual route`,async()=>{
  const node=venue(kind,'node',1001),h=routeHarness({...allFailed,osm:osmOutputReply([node])},false);
  const response=await h.run(kind,kind==='stay'?'maplibre':'none'),body=await response.json();
  assert.equal(body.searchStatus,'ready','a real matching named node must not become an empty search');
  assert.equal(body.places.length,1);assert.deepEqual(body.places[0].coordinates,[-8.61197,41.1495]);assert.equal(body.places[0].availability,'check');assert.equal(body.inventory,false);
  assert.deepEqual(h.calls.map(c=>c.provider),['osm']);assert.deepEqual(h.deadlines,[4500]);
  const url=h.calls[0].url,query=url.searchParams.get('data')!;
  assert.equal(url.origin+url.pathname,'https://overpass.kumi.systems/api/interpreter');
  assert.match(query,new RegExp(`nwr\\(around:${kind==='stay'?7500:5000},41\\.1485,-8\\.61097\\)`));
  assert.match(query,/\[timeout:18\]/);assert.match(query,/\["name"\];out\s+[^;]*\b35;/);
});
test('OSM mixed node, way and relation venues retain their own geometry',async()=>{
  const h=routeHarness({...allFailed,osm:osmOutputReply([venue('stay','node',1001),venue('stay','way',1002),venue('stay','relation',1003)])});
  const body=await (await h.run()).json();assert.equal(body.searchStatus,'ready');assert.deepEqual(new Set(body.places.map((p:{id:string})=>p.id)),new Set(['1001','1002','1003']));
  assert.deepEqual(body.places.find((p:{id:string})=>p.id==='1001').coordinates,[-8.61197,41.1495]);assert.deepEqual(body.places.find((p:{id:string})=>p.id==='1002').coordinates,[-8.60997,41.1475]);
});
test('OSM way-center control succeeds independently of node output',async()=>{
  const h=routeHarness({...allFailed,osm:osmOutputReply([venue('stay','way',1002)])});
  const body=await (await h.run()).json();assert.equal(body.searchStatus,'ready');assert.equal(body.places.length,1);assert.deepEqual(body.places[0].coordinates,[-8.60997,41.1475]);
});
test('OSM geometry validation does not admit missing coordinates, foreign country or distant venues',async()=>{
  const missing=venue('stay','node',2001);delete missing.lat;delete missing.lon;
  const foreign=venue('stay','node',2002);foreign.tags['addr:country']='ES';
  const distant=venue('stay','node',2003);distant.lat=42;
  const h=routeHarness({...allFailed,osm:osmOutputReply([missing,foreign,distant])});
  const response=await h.run(),body=await response.json();assert.equal(body.searchStatus,'empty');assert.deepEqual(body.places,[]);assert.match(response.headers.get('server-timing')!,/local-osm;dur=\d+;desc="empty"/);
});
