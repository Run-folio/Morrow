// One explicitly approved evaluation only. No automatic retries or production activation.
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {parseEnv} from 'node:util';
import {build} from 'esbuild';
import OpenAI from 'openai';
const reportPath='notes/public-place-alias-acceptance-20261022.json';
const cases=[
 {query:'Hirayu',country:'Japan',expected:{ids:['photon:N:2481035449'],country:'Japan',types:['town'],routability:'direct_destination',source:'https://www.japan.travel/en/spot/1263/'}},
 {query:'Fangjin mountain',country:'China',expected:{ids:['photon:N:699700351','photon:W:626892766'],country:'China',types:['natural_area'],routability:'needs_base_selection',source:'https://whc.unesco.org/en/list/1559/'}},
 {query:'Yunomine',country:'Japan',expected:{ids:['photon:N:2822838506'],country:'Japan',types:['town'],routability:'direct_destination',source:'https://www.tb-kumano.jp/en/places/yunomine/'}},
 {query:'Springfield',country:'United States',expected:{negative:'ambiguous; no suggested specific identity without additional context'}},
];
const bundle=await build({stdin:{resolveDir:process.cwd(),loader:'ts',contents:`export {createPublicPlaceAliasRequest} from './lib/easyt/public-place-alias-request.ts';export {enrichPublicPlaceSearch,parsePlaceResearchResponse} from './lib/easyt/public-place-research.server.ts';export {createOpenWorldPlaceProvider} from './lib/easyt/open-world-place.server.ts';`},bundle:true,write:false,platform:'node',format:'esm'});
const app=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const requests=cases.map(c=>app.createPublicPlaceAliasRequest(c.query,c.country));
for(const request of requests){
 if(!Object.isFrozen(request)||Buffer.byteLength(JSON.stringify(request),'utf8')>4096||request.model!=='gpt-6-luna'||request.service_tier!=='default'||request.max_output_tokens!==1024||request.reasoning.mode!=='standard'||request.background!==false||request.stream!==false||request.store!==false||request.prompt_cache_options.mode!=='explicit'||Object.keys(request.prompt_cache_options).length!==1)throw new Error('Unqualified request');
 for(const field of ['tools','conversation','previous_response_id','prompt','include','tool_choice'])if(field in request)throw new Error('Forbidden request context');
}
const upperMicroUsd=231845; // ceil published full-context+output+10% premium to micro-USD.
if(upperMicroUsd*cases.length>1_000_000)throw new Error('Budget bound exceeds approval');
if(process.argv[2]!=='--run-approved-four'){
 console.log(JSON.stringify({dryRun:true,cases,requestBytes:requests.map(r=>Buffer.byteLength(JSON.stringify(r),'utf8')),counterCalls:0,maxCalls:4,upperMicroUsd,combinedUpperMicroUsd:upperMicroUsd*4}));
}else{
 if(existsSync(reportPath))throw new Error('Evaluation ledger exists; never repeat uncertain or completed calls');
 const report={phase:'approved-counter-free-four-20261022',startedAt:new Date().toISOString(),approvedMaxCalls:4,approvedMaxUsd:1,counterCalls:0,dispatched:0,reservedMicroUsd:0,perCallUpperMicroUsd:upperMicroUsd,combinedUpperMicroUsd:upperMicroUsd*4,costBasis:'Official Luna 1050000 context*.20/M +1024 output*.75/M, plus10%regional; no tools/cache writes/retries/counter',cases,results:[],providerCaptures:[],note:'Isolated generator acceptance; existing deterministic pilot matches can suppress AI in the product. No durable cache publication or live activation.'};
 const save=()=>writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n');save();
 // Read only the existing owner-approved key into evaluator memory. Never set
 // process.env, log it, persist it, or print SDK error/request/header objects.
 const line=readFileSync('/Users/shaun/Documents/Morrovia/.env.local','utf8').split(/\r?\n/).find(line=>/^\s*(?:export\s+)?OPENAI_API_KEY\s*=/.test(line));
 const apiKey=line?parseEnv(line).OPENAI_API_KEY:undefined;
 if(!apiKey)throw new Error('Authorized key unavailable');
 const client=new OpenAI({apiKey,maxRetries:0,timeout:30000,fetch:async(url,init)=>{
  const target=new URL(String(url));
  if(target.origin!=='https://api.openai.com'||target.pathname!=='/v1/responses'||init.method!=='POST')throw new Error('Unexpected API request');
  return fetch(url,{...init,redirect:'error'});
 }});
 const rawCache=new Map();let lastProviderAt=0;let providerRequestCount=0;
 async function lookup(name,country){
  let sourceFailed=false;
  const provider=app.createOpenWorldPlaceProvider({cache:new Map(),onSourceFailure:()=>{sourceFailed=true;},fetchImpl:async(url,init)=>{
   const target=new URL(String(url));if(target.origin!=='https://photon.komoot.io'||target.pathname!=='/api/'||++providerRequestCount>16)throw new Error('Provider request bound');
   if(rawCache.has(target.href))return new Response(rawCache.get(target.href),{status:200});
   const pause=Math.max(0,1100-(Date.now()-lastProviderAt));if(pause)await new Promise(r=>setTimeout(r,pause));lastProviderAt=Date.now();
   const at=Date.now();try{const response=await fetch(url,{...init,redirect:'error'});const text=await response.text();let body;try{body=JSON.parse(text);}catch{body={invalidJson:true};}
    report.providerCaptures.push({query:target.searchParams.get('q'),url:target.href,status:response.status,latencyMs:Date.now()-at,body});save();if(response.ok)rawCache.set(target.href,text);return new Response(text,{status:response.status});
   }catch(error){report.providerCaptures.push({query:target.searchParams.get('q'),url:target.href,error:error?.name==='TimeoutError'||error?.name==='AbortError'?'transport_timeout_or_abort':'transport_unavailable',latencyMs:Date.now()-at});save();throw new Error('Public provider transport unavailable');}
  }});
  const candidates=await provider.lookup(name,{travelIntent:'route-stop',explicitCountryNames:[country],countryNames:[country]});return {candidates,sourceFailed};
 }
 try{
  for(let index=0;index<cases.length;index++){
   const spec=cases[index],row={query:spec.query,country:spec.country,expected:spec.expected,requestBytes:Buffer.byteLength(JSON.stringify(requests[index]),'utf8'),state:'dispatching',startedAt:new Date().toISOString()};report.results.push(row);
   if(report.dispatched>=4||report.reservedMicroUsd+250000>1000000)throw new Error('Evaluation budget exhausted');
   report.dispatched++;report.reservedMicroUsd+=250000;save();const at=Date.now();let response;
   try{response=await client.responses.create(requests[index],{maxRetries:0,signal:AbortSignal.timeout(30000)});}catch(error){row.state='request_failed_or_uncertain';row.latencyMs=Date.now()-at;row.error={status:Number.isInteger(error?.status)?error.status:null,category:Number.isInteger(error?.status)?'http_error':'transport_or_timeout'};save();break;}
   row.latencyMs=Date.now()-at;row.state='response_received';row.response={id:response.id,model:response.model,status:response.status,service_tier:response.service_tier,usage:response.usage,output:response.output};save();
   const u=response.usage,cache=u?.input_tokens_details?.cached_tokens??0,writes=u?.input_tokens_details?.cache_write_tokens??0;
   if(response.model!=='gpt-6-luna'||response.service_tier!=='default'||!u||!Number.isSafeInteger(u.input_tokens)||u.input_tokens<0||u.input_tokens>1050000||!Number.isSafeInteger(u.output_tokens)||u.output_tokens<0||u.output_tokens>1024||!Number.isSafeInteger(cache)||cache<0||cache>u.input_tokens||writes!==0){row.state='usage_or_model_unqualified';save();break;}
   const long=u.input_tokens>272000;row.estimatedTokenCostUsd=((u.input_tokens-cache)*(long?.20:.10)+cache*(long?.02:.01)+u.output_tokens*(long?.75:.50))/1e6;row.estimatedCostIncludingRegionalCeilingUsd=row.estimatedTokenCostUsd*1.1;
   row.aliases=app.parsePlaceResearchResponse(response);row.aliasStatus=(()=>{try{return JSON.parse(response.output.find(x=>x.type==='message').content.find(x=>x.type==='output_text').text).status;}catch{return 'unparseable';}})();save();
   const baseline=await lookup(spec.query,spec.country);row.baseline={sourceFailed:baseline.sourceFailed,candidates:baseline.candidates};
   const checks=[];
   row.verifiedCandidates=await app.enrichPublicPlaceSearch({query:spec.query,country:spec.country,publicPlaceConfirmed:true,deterministicCandidates:[],sourceFailed:false,signal:AbortSignal.timeout(18000)},{research:async()=>response,lookup:async(name)=>{const found=await lookup(name,spec.country);checks.push({alias:name,...found});return found;}});row.providerChecks=checks;
   row.productWouldOfferAi=baseline.sourceFailed?false:baseline.candidates.length===0;
   row.classification=spec.expected.negative?(row.aliasStatus==='ambiguous'&&row.aliases.length===0&&row.verifiedCandidates.length===0?'negative_control_pass':'negative_control_failed'):
    row.verifiedCandidates.some(c=>spec.expected.ids.includes(c.providerId)&&c.parentCountries?.length===1&&c.parentCountries[0]===spec.expected.country&&spec.expected.types.includes(c.placeType)&&c.routability===spec.expected.routability)?'expected_provider_identity_verified':checks.some(c=>c.sourceFailed)?'verification_transport_unavailable':'no_expected_verified_candidate';
   row.state='evaluated';save();
  }
 }finally{report.finishedAt=new Date().toISOString();report.estimatedTokenCostUsd=report.results.reduce((sum,r)=>sum+(r.estimatedTokenCostUsd??0),0);report.estimatedCostIncludingRegionalCeilingUsd=report.results.reduce((sum,r)=>sum+(r.estimatedCostIncludingRegionalCeilingUsd??0),0);save();}
 console.log(JSON.stringify({report:reportPath,dispatched:report.dispatched,counterCalls:report.counterCalls,reservedMicroUsd:report.reservedMicroUsd,results:report.results.map(r=>({query:r.query,state:r.state,classification:r.classification,latencyMs:r.latencyMs})),estimatedTokenCostUsd:report.estimatedTokenCostUsd}));
}
