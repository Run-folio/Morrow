import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {pathToFileURL,fileURLToPath} from 'node:url';
const repo=fileURLToPath(new URL('../',import.meta.url)).replace(/\/$/,'');
const require=createRequire(repo+'/package.json'),ts=require('typescript');
const imp=async name=>import(pathToFileURL(repo+'/lib/easyt/'+name+'.ts').href);
const strategy=await imp('local-search-strategy'),cache=await imp('local-finder-base-cache'),query=await imp('local-finder-query'),performanceModule=await imp('recommendation-performance'),local=await imp('local-place');
const tick=async()=>{for(let i=0;i<80;i++)await Promise.resolve();};
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};};
const evalTs=(code,scope)=>new Function('scope','with(scope){'+ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText+'}')(scope);
const venue={id:'synthetic-saved',name:'Synthetic Porto hotel',address:'Porto, Portugal',category:'hotel',coordinates:[-8.61097,41.1485],mapsUrl:'https://example.invalid/venue',provider:'openstreetmap',availability:'check'};
function effectHarness({retained=false,commercial=false}={}){
 cache.clearLocalFinderBaseCacheForTests();const text=fs.readFileSync(repo+'/components/journey-local-finder.tsx','utf8'),tree=ts.createSourceFile('finder.tsx',text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let code='';
 function walk(n){if(ts.isCallExpression(n)&&n.expression.getText(tree)==='useEffect'&&n.arguments[0]?.getText(tree).includes('streamIndependentRecommendationLanes'))code=n.arguments[0].getText(tree);ts.forEachChild(n,walk);}walk(tree);assert.ok(code);
 const state={corePlaces:retained?[venue]:[],commercialPlaces:[],chosen:retained?venue:null,saved:retained?venue:null,loading:!retained,searchUnavailable:false,accommodationInventoryStatus:'not-requested'};
 const requests=[],timers=[];const refs={loadedBaseResultKeyRef:{current:null},lastBaseRequestRef:{current:null},performanceRequestRef:{current:null},reportedAccommodationSearchRef:{current:''},autoSelectedRef:{current:false}};
 const fakeAbort={any:AbortSignal.any.bind(AbortSignal),timeout:ms=>{const controller=new AbortController();timers.push({ms,controller});return controller.signal;}};
 let cleanup,city='Porto',stop='porto',version=0;const mutations=[];
 const mount=()=>{cleanup?.();const baseResultKey=query.localFinderBaseQueryKey({kind:'stay',city,country:'Portugal',canonicalPlaceId:stop,dayId:stop,coordinates:[-8.61097,41.1485],locale:'en',mapPresentation:'maplibre'});if(retained&&!refs.loadedBaseResultKeyRef.current)refs.loadedBaseResultKeyRef.current=baseResultKey;
  const scope={...cache,...query,...performanceModule,...local,...refs,initialState:undefined,kind:'stay',city,country:'Portugal',canonicalPlaceId:stop,dayId:stop,stopId:stop,longitude:-8.61097,latitude:41.1485,locale:'en',mapPresentation:'maplibre',baseResultKey,searchVersion:version,staySearch:commercial?{checkIn:'2026-10-22',checkOut:'2026-10-25'}:undefined,analyticsSurface:'stay',corePlaces:state.corePlaces,storageKey:'synthetic',canonicalSavedState:true,trackEvent:()=>{},window:{localStorage:{getItem:()=>null}},AbortController,AbortSignal:fakeAbort};
  for(const key of ['corePlaces','commercialPlaces','chosen','saved','loading','searchUnavailable','accommodationInventoryStatus','meal','pace','mood','moment'])scope['set'+key[0].toUpperCase()+key.slice(1)]=value=>{state[key]=value;mutations.push({key,value});};
  scope.fetch=(url,options={})=>{const pending=deferred(),request={url,options,pending};requests.push(request);options.signal?.addEventListener('abort',()=>pending.reject(options.signal.reason),{once:true});return pending.promise;};
  cleanup=evalTs('return ('+code+');',scope)();
 };
 return{state,requests,timers,mutations,mount,retry(){version++;mount();},change(){city='Braga';stop='braga';mount();},expire(){for(const timer of timers)timer.controller.abort(new DOMException('controlled timeout','TimeoutError'));},async reply(i,places=[venue]){requests[i].pending.resolve({ok:true,json:async()=>({places,searchStatus:places.length?'ready':'empty'})});await tick();},async fail(i){requests[i].pending.reject(new Error('controlled offline'));await tick();},dispose(){cleanup?.();}};
}

test('Stay browser request has a finite deadline; expiry clears loading and shared retry can recover',async()=>{
 const h=effectHarness();h.mount();await tick();assert.equal(h.requests.length,1);h.expire();await tick();assert.equal(h.state.loading,false,'a stalled fetch must reach a retryable failure');assert.equal(h.state.searchUnavailable,true);h.retry();await tick();assert.equal(h.requests.length,2,'expired shared work must not trap retry');await h.reply(1);assert.equal(h.state.loading,false);assert.equal(h.state.searchUnavailable,false);assert.deepEqual(h.state.corePlaces,[venue]);h.dispose();
});
test('Stay failed retry retains useful mapped results and saved selection',async()=>{
 const h=effectHarness({retained:true});h.mount();await tick();await h.fail(0);assert.equal(h.state.loading,false);assert.deepEqual(h.state.corePlaces,[venue]);assert.deepEqual(h.state.saved,venue);assert.deepEqual(h.state.chosen,venue);h.dispose();
});
test('Stay late previous destination cannot publish over current results even if cancellation is ignored',async()=>{
 const h=effectHarness();h.mount();await tick();h.change();await tick();await h.reply(1,[{...venue,id:'braga',name:'Synthetic Braga hotel'}]);const before=structuredClone(h.state);await h.reply(0);assert.deepEqual(h.state,before);h.dispose();
});
test('optional commercial failure or pending request cannot block usable mapped Stay',async()=>{
 const h=effectHarness({commercial:true});h.mount();await tick();assert.equal(h.requests.length,2);const core=h.requests.findIndex(r=>r.url.startsWith('/api/journey-local-search'));await h.reply(core);assert.equal(h.state.loading,false);assert.deepEqual(h.state.corePlaces,[venue]);await h.fail(1-core);assert.equal(h.state.accommodationInventoryStatus,'unavailable');assert.deepEqual(h.state.corePlaces,[venue]);assert.equal(h.state.loading,false);h.dispose();
});

for (const places of [[venue], []]) test(`optional commercial deadline ends loading with ${places.length} mapped Stay results`,async()=>{
 const h=effectHarness({commercial:true});h.mount();await tick();const core=h.requests.findIndex(r=>r.url.startsWith('/api/journey-local-search'));await h.reply(core,places);assert.equal(h.state.accommodationInventoryStatus,'loading');h.expire();await tick();assert.equal(h.state.accommodationInventoryStatus,'unavailable');assert.deepEqual(h.state.corePlaces,places);assert.equal(h.state.loading,false);h.retry();await tick();const next=h.requests.length-1;await h.reply(next);assert.equal(h.state.loading,false);h.dispose();
});
test('same-key Stay remount reuses pending work without aborting it',async()=>{
 const h=effectHarness();h.mount();await tick();const signal=h.requests[0].options.signal;h.mount();await tick();assert.equal(h.requests.length,1);assert.equal(signal.aborted,false);await h.reply(0);assert.equal(h.state.loading,false);assert.deepEqual(h.state.corePlaces,[venue]);h.dispose();
});
test('Stay deadline also bounds a stalled response body and permits retry',async()=>{
 const h=effectHarness();h.mount();await tick();const request=h.requests[0],body=deferred();request.options.signal.addEventListener('abort',()=>body.reject(request.options.signal.reason),{once:true});request.pending.resolve({ok:true,json:()=>body.promise});await tick();assert.equal(h.state.loading,true);h.expire();await tick();assert.equal(h.state.loading,false);assert.equal(h.state.searchUnavailable,true);h.retry();await tick();await h.reply(1);assert.equal(h.state.searchUnavailable,false);assert.deepEqual(h.state.corePlaces,[venue]);h.dispose();
});
test('a manual Stay retry requests fresh provider data only for the failed scope',async()=>{
 const h=effectHarness();h.mount();await tick();assert.equal(new URL(h.requests[0].url,'http://fixture').searchParams.has('refresh'),false);await h.fail(0);h.retry();await tick();assert.equal(new URL(h.requests[1].url,'http://fixture').searchParams.get('refresh'),'1');await h.fail(1);h.change();await tick();assert.equal(new URL(h.requests[2].url,'http://fixture').searchParams.has('refresh'),false);await h.reply(2);h.dispose();
});

// Run the real route with controlled provider ports and virtual deadline signals.
const imports={'next/server':{NextResponse:{json:(value,init)=>Response.json(value,init)}},'node:crypto':require('node:crypto'),'next/cache':{revalidateTag:()=>{}}};for(const name of ['place-display-name','place-status','local-place-geography','recommendation-performance','local-place-results','place-catalog','local-search-strategy'])imports['@/lib/easyt/'+name]=await imp(name);
function routeHarness(configured=false){
 const requests=[],timers=[],hedge=deferred();const abort={timeout:ms=>{const controller=new AbortController();timers.push({ms,controller});return controller.signal;}};
 const scopeImports={...imports,'@/lib/easyt/local-search-strategy':{...strategy,firstUsefulLocalSearchWithFallback:(primary,fallback)=>strategy.firstUsefulLocalSearchWithFallback(primary,fallback,()=>hedge.promise)}};
 const fetch=(url,options)=>{const pending=deferred(),provider=url.includes('overpass')?'osm':url.includes('photon')?'photon':'google';const row={provider,pending,options};requests.push(row);options.signal.addEventListener('abort',()=>pending.reject(options.signal.reason),{once:true});return pending.promise;};
 const text=fs.readFileSync(repo+'/app/api/journey-local-search/route.ts','utf8'),script=ts.transpileModule(text,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,module={exports:{}};
 new Function('require','module','exports','fetch','process','AbortSignal',script)(name=>scopeImports[name],module,module.exports,fetch,{env:configured?{GOOGLE_PLACES_API_KEY:'SYNTHETIC'}:{}},abort);
 let settled=false,response;const result=module.exports.GET({nextUrl:new URL('http://fixture/api/journey-local-search?kind=restaurant&city=Porto&country=Portugal&lat=41.1485&lon=-8.61097')}).then(async r=>{settled=true;response={body:await r.json(),timing:r.headers.get('server-timing')};return response;});
 const reply=async(provider,status,body)=>{const row=requests.find(r=>r.provider===provider);assert.ok(row);row.pending.resolve(Response.json(body,{status}));await tick();};
 return{requests,timers,result,hedge,settled:()=>settled,response:()=>response,reply,expire:async ms=>{for(const x of timers.filter(t=>t.ms===ms))x.controller.abort(new DOMException('controlled provider deadline','TimeoutError'));await tick();}};
}
const photon={features:[{properties:{osm_id:1002,name:'Synthetic Porto Restaurant',osm_value:'restaurant',country:'Portugal'},geometry:{coordinates:[-8.61197,41.1495]}}]};
test('primary500 falls back once to a useful venue without requiring Google configuration',async()=>{
 const h=routeHarness();await tick();await h.reply('osm',500,{});await h.reply('photon',200,photon);const response=await h.result;assert.equal(response.body.searchStatus,'ready');assert.equal(response.body.places.length,1);assert.equal(h.requests.filter(r=>r.provider==='photon').length,1);assert.match(response.timing,/http_error:500/);
});
test('hedged fallback succeeds before primarytimeout and remains useful after the timeout',async()=>{
 const h=routeHarness();await tick();assert.equal(h.timers[0].ms,4500);h.hedge.resolve();await tick();await h.reply('photon',200,photon);assert.equal(h.settled(),true);assert.equal(h.response().body.searchStatus,'ready');await h.expire(4500);assert.equal(h.response().body.places.length,1);
});
test('all three configured provider deadlines settle failed rather than empty',async()=>{
 const h=routeHarness(true);await tick();h.hedge.resolve();await tick();assert.deepEqual(h.timers.map(t=>t.ms).sort((a,b)=>a-b),[4500,5000,7000]);await h.expire(4500);await h.expire(5000);assert.equal(h.settled(),false);await h.expire(7000);const response=await h.result;assert.equal(response.body.searchStatus,'failed');assert.equal(response.body.unavailable,true);assert.deepEqual(response.body.places,[]);
});
test('primarytimeout followed by useful fallback completes, while failed plus genuineempty remains honest',async()=>{
 const h=routeHarness();await tick();await h.expire(4500);await h.reply('photon',200,photon);assert.equal((await h.result).body.searchStatus,'ready');const empty=routeHarness();await tick();await empty.reply('osm',500,{});await empty.reply('photon',200,{features:[]});assert.equal((await empty.result).body.searchStatus,'empty');
});

// Execute the actual Food loader; virtual deadline advances do not alter the
// production provider budgets or require wall-clock sleeps.
test('Food loader has its own finite network deadline and keeps effect cancellation',async()=>{
 const text=fs.readFileSync(repo+'/components/easyt/trip-explore-workspace.tsx','utf8'),tree=ts.createSourceFile('food.tsx',text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let code='';
 function visit(n){if(ts.isFunctionDeclaration(n)&&n.name?.text==='loadRestaurants')code=n.getText(tree);ts.forEachChild(n,visit);}visit(tree);assert.ok(code);
 const explore=await imp('explore'),timers=[],requests=[];const scope={...local,...explore,AbortSignal:{any:AbortSignal.any.bind(AbortSignal),timeout:ms=>{const controller=new AbortController();timers.push({ms,controller});return controller.signal;}},fetch:(url,options)=>{const p=deferred();requests.push({url,options,p});options.signal.addEventListener('abort',()=>p.reject(options.signal.reason),{once:true});return p.promise;}};
 const load=evalTs(code+';return loadRestaurants;',scope),controller=new AbortController();let settled=false;const result=load({id:'porto',name:'Porto',country:'Portugal',latitude:41.1485,longitude:-8.61097},controller.signal,()=>{}).then(()=>{settled=true;return 'ready';},()=>{settled=true;return 'failed';});
 for(const t of timers)t.controller.abort(new DOMException('controlled deadline','TimeoutError'));await tick();assert.equal(settled,true,'stalled Food transport must not remain loading');assert.equal(await result,'failed');assert.deepEqual(timers.map(t=>t.ms),[10000]);
 const next=load({id:'porto',name:'Porto',country:'Portugal',latitude:41.1485,longitude:-8.61097},controller.signal,()=>{}).catch(e=>e);controller.abort();await tick();assert.equal((await next).name,'AbortError');
});
