import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import * as strategy from '../lib/easyt/local-search-strategy.ts';
import * as displayName from '../lib/easyt/place-display-name.ts';
import * as placeStatus from '../lib/easyt/place-status.ts';
import * as geography from '../lib/easyt/local-place-geography.ts';
import * as resultQuality from '../lib/easyt/local-place-results.ts';
import * as placeCatalog from '../lib/easyt/place-catalog.ts';
import * as recommendationPerformance from '../lib/easyt/recommendation-performance.ts';

type Provider = 'google' | 'osm' | 'photon';
type Reply = {status:number;body?:unknown;errorName?:string;malformed?:boolean};
function routeHarness(replies:Record<Provider,Reply>, configured = true) {
  const calls: Array<{provider:Provider;options:any}> = [];
  const fetch = async (value:string, options:any) => {
    const provider:Provider = value.includes('places.googleapis.com') ? 'google' : value.includes('overpass.kumi.systems') ? 'osm' : 'photon';
    calls.push({provider,options}); const reply = replies[provider];
    if (reply.errorName) { const error = new Error('PRIVATE TOKEN raw body account trip query'); error.name = reply.errorName; throw error; }
    return {ok:reply.status>=200&&reply.status<300,status:reply.status,json:async()=>{
      assert.ok(reply.status>=200&&reply.status<300,'failed HTTP must not read the provider body');
      if(reply.malformed)throw new SyntaxError('PRIVATE RESPONSE BODY');return reply.body;
    }};
  };
  const imports:Record<string,unknown> = {
    'next/server':{NextResponse:{json:(body:unknown,init?:ResponseInit)=>Response.json(body,init)}},
    '@/lib/easyt/place-display-name':displayName,'@/lib/easyt/place-status':placeStatus,
    '@/lib/easyt/local-place-geography':geography,'@/lib/easyt/recommendation-performance':recommendationPerformance,
    '@/lib/easyt/local-place-results':resultQuality,'@/lib/easyt/place-catalog':placeCatalog,
    '@/lib/easyt/local-search-strategy':{...strategy,firstUsefulLocalSearchWithFallback:(primary:any,fallback:any)=>strategy.firstUsefulLocalSearchWithFallback(primary,fallback,()=>new Promise<void>(()=>{}))},
  };
  const source = readFileSync(new URL('../app/api/journey-local-search/route.ts',import.meta.url),'utf8');
  const script = ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const module = {exports:{} as {GET:(request:any)=>Promise<Response>}};
  new Function('require','module','exports','fetch','process',script)((id:string)=>{assert.ok(id in imports,id);return imports[id]},module,module.exports,fetch,{env:configured?{GOOGLE_PLACES_API_KEY:'SYNTHETIC_NOT_A_CREDENTIAL'}:{}});
  const run = (kind='stay',map='maplibre',city='Porto')=>module.exports.GET({nextUrl:new URL(`https://fixture.invalid/api/journey-local-search?kind=${kind}&mapPresentation=${map}&city=${city}&country=Portugal&lat=41.1485&lon=-8.61097`)});
  return {run,calls};
}
const allFailed:Record<Provider,Reply>={google:{status:503},osm:{status:429},photon:{status:0,errorName:'TimeoutError'}};
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
test('overlapping request diagnostics stay in their own response and successful source stays useful',async()=>{
  const failure=routeHarness(allFailed);
  const ready=routeHarness({...allFailed,osm:{status:200,body:{elements:[{id:1,lat:41.1485,lon:-8.61097,tags:{name:'Synthetic Porto stay',tourism:'hotel','addr:country':'PT'}}]}}});
  const [failedResponse,readyResponse]=await Promise.all([failure.run(),ready.run()]);
  assert.match(failedResponse.headers.get('server-timing')!,/http_error:429/);
  assert.match(readyResponse.headers.get('server-timing')!,/local-osm;dur=\d+;desc="ready"/);assert.doesNotMatch(readyResponse.headers.get('server-timing')!,/http_error|timeout|photon/);
  assert.equal((await readyResponse.json()).searchStatus,'ready');assert.equal(ready.calls.length,1);
});
