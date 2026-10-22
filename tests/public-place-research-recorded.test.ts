import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { build } from 'esbuild';
import { createOpenWorldPlaceProvider } from '../lib/easyt/open-world-place.server.ts';
import { enrichPublicPlaceSearch } from '../lib/easyt/public-place-research.server.ts';
const evidence=JSON.parse(readFileSync('notes/heldout-place-yunomine-evidence.json','utf8'));
const evaluation=JSON.parse(readFileSync('notes/paired-yunomine-model-eval-20261022.json','utf8'));

test('recorded alias names projected into tool-free mock resolve through real Photon adapter',async()=>{
 const queries:string[]=[];const fetchFixture:typeof fetch=async input=>{const url=new URL(String(input));const query=url.searchParams.get('q')!;queries.push(query);const capture=evidence.captures.find((c:any)=>new URL(c.url).searchParams.get('q')===query);return new Response(JSON.stringify(capture?.body??{features:[]}));};
 const baseline=await createOpenWorldPlaceProvider({fetchImpl:fetchFixture,cache:new Map()}).lookup(evidence.query,{travelIntent:'route-stop',explicitCountryNames:['Japan'],countryNames:['Japan']});assert.deepEqual(baseline,[]);
 const recorded=evaluation.results.find((r:any)=>r.model==='gpt-6-luna');
 const result=await enrichPublicPlaceSearch({query:evidence.query,country:'Japan',publicPlaceConfirmed:true,deterministicCandidates:baseline,sourceFailed:false,signal:new AbortController().signal},{research:async()=>({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({status:'candidates',candidates:JSON.parse(recorded.output.find((item:any)=>item.type==='message').content.find((part:any)=>part.type==='output_text').text).candidates.map((item:any)=>({alternate_name:item.alternate_name}))})}]}]}),lookup:async(name,signal)=>{
  let sourceFailed=false;const provider=createOpenWorldPlaceProvider({cache:new Map(),onSourceFailure:()=>{sourceFailed=true;},fetchImpl:(input,init)=>fetchFixture(input,{...init,signal})});return {candidates:await provider.lookup(name,{travelIntent:'route-stop',explicitCountryNames:['Japan'],countryNames:['Japan']}),sourceFailed};
 }});
 assert.equal(result.length,1);assert.equal(result[0]?.providerId,'photon:N:2822838506');assert.equal(result[0]?.placeType,'town');assert.deepEqual(result[0]?.parentCountries,['Japan']);assert.equal(result[0]?.routability,'direct_destination');assert.deepEqual(queries,[evidence.query,'Yunomine Onsen','湯の峰温泉']);
});

async function sdkFixture(abortAtClient=false) {
 const state={abortAtClient,events:[] as string[],controller:new AbortController()};
 (globalThis as any).aliasSdkFixture=state;
 const bundle=await build({entryPoints:['lib/easyt/public-place-research-openai.server.ts'],bundle:true,write:false,format:'esm',platform:'node',plugins:[{name:'offline-sdk',setup(b){
 b.onResolve({filter:/^server-only$/},()=>({path:'marker',namespace:'offline'}));b.onResolve({filter:/public-place-research-controls\.server(?:\.ts)?$/},()=>({path:'admission',namespace:'offline'}));b.onResolve({filter:/openai\.server$/},()=>({path:'client',namespace:'offline'}));b.onLoad({filter:/.*/,namespace:'offline'},({path})=>({contents:path==='marker'?'':path==='admission'?`export const defaultPlaceResearchControls=()=>({});export const runAdmittedPlaceResearch=async(_c,_s,upstream)=>{globalThis.aliasSdkFixture.events.push('admitted');return upstream();};`:`export const getOpenAIClient=()=>{const s=globalThis.aliasSdkFixture;s.events.push('client');if(s.abortAtClient)s.controller.abort();return {responses:{inputTokens:{count:async()=>{s.events.push('count');throw new Error('Counter must never run');}},create:async(request,options)=>{s.events.push('create');return {request,options};}}};};`}));}}]});
 return {state,adapter:await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0]!.text).toString('base64'))};
}

test('SDK sends one complete immutable byte-bounded request with zero counter calls',async()=>{
 const {state,adapter}=await sdkFixture();try {
 const result=await adapter.researchPublicPlaceNames('Yunomine hot spring village','Japan',state.controller.signal);
 assert.deepEqual(state.events,['admitted','client','create']);
 assert.equal(result.request.model,'gpt-6-luna');assert.equal(result.request.store,false);assert.equal(result.request.background,false);assert.equal(result.request.stream,false);assert.equal(result.request.max_output_tokens,1024);assert.equal(result.request.service_tier,'default');assert.deepEqual(result.request.prompt_cache_options,{mode:'explicit'});assert.deepEqual(result.request.reasoning,{effort:'low',mode:'standard'});
 for(const name of ['tools','tool_choice','max_tool_calls','include','conversation','previous_response_id','prompt'])assert.equal(name in result.request,false,name);
 assert.equal(Object.isFrozen(result.request),true);assert.equal(Object.isFrozen(result.request.text.format.schema),true);assert.equal(Object.isFrozen(result.request.input[0]),true);
 assert.ok(Buffer.byteLength(JSON.stringify(result.request),'utf8')<=4096);
 assert.equal(result.options.maxRetries,0);assert.equal(result.options.signal,state.controller.signal);
 assert.deepEqual(JSON.parse(result.request.input[1].content),{public_place_name:'Yunomine hot spring village',country:'Japan'});
 assert.deepEqual(result.request.text.format.schema.properties.candidates.items.required,['alternate_name']);
 }finally{delete (globalThis as any).aliasSdkFixture;}
});

test('abort after client creation still prevents generation',async()=>{
 const {state,adapter}=await sdkFixture(true);try{await assert.rejects(adapter.researchPublicPlaceNames('Yunomine Onsen','Japan',state.controller.signal));assert.deepEqual(state.events,['admitted','client']);}finally{delete (globalThis as any).aliasSdkFixture;}
});

test('SDK rejects oversized or private input before admission, counting or key initialization',async()=>{
 const {state,adapter}=await sdkFixture();try{
 for(const [query,country] of [['x'.repeat(10000),'Japan'],['my home address','Japan'],['Paris',undefined],['Hirayu','unknown country']])await assert.rejects(adapter.researchPublicPlaceNames(query,country,state.controller.signal));
 assert.deepEqual(state.events,[]);
 }finally{delete (globalThis as any).aliasSdkFixture;}
});

test('real resolver and route suppress AI on HTTP, malformed JSON, abort and failed native alias',async()=>{
 const state={researchCalls:0,mode:'http',queries:[] as string[]};
 (globalThis as any).offlinePlaceFailure=state;
 const bundled=await build({entryPoints:['app/api/journey-geocode/route.ts'],bundle:true,write:false,format:'esm',platform:'node',plugins:[{name:'offline-failed-sources',setup(b){
 b.onResolve({filter:/public-place-durable\.server$/},()=>({path:'cache',namespace:'failed'}));
 b.onResolve({filter:/public-place-research-controls\.server(?:\.ts)?$/},()=>({path:'controls',namespace:'failed'}));
 b.onResolve({filter:/^next\/server$/},()=>({path:'next',namespace:'failed'}));b.onResolve({filter:/public-place-research-openai\.server$/},()=>({path:'research',namespace:'failed'}));
 b.onLoad({filter:/.*/,namespace:'failed'},({path})=>({contents:path==='next'?`export const NextResponse={json:(body,options)=>({body,status:options?.status??200,headers:new Headers(options?.headers)})};`:path==='cache'?`export const createReviewedPlaceMappingReader=()=>({read:async()=>[]});`:path==='controls'?`export const defaultPlaceResearchControls=()=>({});export const publicPlaceResearchReady=()=>true;`:`export const researchPublicPlaceNames=async()=>{globalThis.offlinePlaceFailure.researchCalls++;throw new Error('Unexpected paid path');};`}));
 }}]});
 const api=await import('data:text/javascript;base64,'+Buffer.from(bundled.outputFiles[0]!.text).toString('base64'));
 const original=globalThis.fetch;
 globalThis.fetch=async input=>{const q=new URL(String(input)).searchParams.get('q')!;state.queries.push(q);if(state.mode==='alias'&&q==='Hirayu')return new Response('{"features":[]}');if(state.mode==='malformed')return new Response('{"features":null}');if(state.mode==='abort')throw new DOMException('aborted','AbortError');return new Response('{}',{status:503});};
 try{for(const mode of ['http','malformed','abort','alias']){state.mode=mode;state.queries=[];const query=mode==='alias'?'Hirayu':'Yunomine hot spring village';const result=await api.POST(Object.assign(new Request('http://localhost/api/journey-geocode',{method:'POST',headers:{origin:'http://localhost','content-type':'application/json'},body:JSON.stringify({place:query,country:'Japan',research:true,noticeVersion:'public-place-alias-v3'})}),{nextUrl:new URL('http://localhost/api/journey-geocode')}));assert.equal(result.status,503,mode);assert.equal(state.researchCalls,0,mode);if(mode==='alias')assert.deepEqual(state.queries,['Hirayu','平湯温泉']);}}
 finally{globalThis.fetch=original;delete (globalThis as any).offlinePlaceFailure;}
});

test('real SDK boundary remains disabled before client/key initialization',async()=>{
 const bundled=await build({entryPoints:['lib/easyt/public-place-research-openai.server.ts'],bundle:true,write:false,format:'esm',platform:'node',plugins:[{name:'disabled-sdk',setup(b){
 b.onResolve({filter:/^server-only$/},()=>({path:'marker',namespace:'disabled'}));b.onResolve({filter:/openai\.server$/},()=>({path:'client',namespace:'disabled'}));
 b.onLoad({filter:/.*/,namespace:'disabled'},({path})=>({contents:path==='marker'?'':`export const getOpenAIClient=()=>{throw new Error('Client initialization must not happen');};`}));
 }}]});
 const adapter=await import('data:text/javascript;base64,'+Buffer.from(bundled.outputFiles[0]!.text).toString('base64'));
 await assert.rejects(adapter.researchPublicPlaceNames('Yunomine hot spring village','Japan',new AbortController().signal),/Place research unavailable/);
});
