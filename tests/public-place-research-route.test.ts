import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import { searchCompletedPlaceCandidates, searchPublicPlaceCandidates } from '../lib/easyt/completed-place-search.ts';
import { autocompleteRender } from './helpers/autocomplete-component.mjs';

type Fixture={calls:number;failed:boolean;candidates:unknown[];aliases:unknown[];research:unknown;queries:string[]};
const url='https://www.tb-kumano.jp/en/places/yunomine/';
const candidate={providerName:'Yunomine Onsen',providerKey:'place',providerKind:'locality',providerId:'photon:N:2822838506',canonicalName:'Yunomine Onsen',parentCountries:['Japan'],coordinates:[135.7575842,33.8288351],placeType:'town',routability:'direct_destination'};
const response={status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({status:'candidates',candidates:[{alternate_name:'Yunomine Onsen'}]})}]}]};
const scope=globalThis as typeof globalThis & {placeFixture:Fixture};
const bundled=await build({entryPoints:['app/api/journey-geocode/route.ts'],bundle:true,write:false,format:'esm',platform:'node',plugins:[{name:'offline-research',setup(b){
 b.onResolve({filter:/^next\/server$/},()=>({path:'next',namespace:'offline'}));
 b.onResolve({filter:/open-world-place\.server$/},()=>({path:'provider',namespace:'offline'}));
 b.onResolve({filter:/public-place-durable\.server$/},()=>({path:'cache',namespace:'offline'}));
 b.onResolve({filter:/public-place-research-controls\.server$/},()=>({path:'controls',namespace:'offline'}));
 b.onResolve({filter:/public-place-research-openai\.server$/},()=>({path:'research',namespace:'offline'}));
 b.onLoad({filter:/.*/,namespace:'offline'},({path})=>({contents:path==='next'?`export const NextResponse={json:(body,options)=>({body,status:options?.status??200,headers:new Headers(options?.headers)})};`:path==='cache'?`export const createReviewedPlaceMappingReader=()=>({read:async()=>[]});`:path==='controls'?`export const defaultPlaceResearchControls=()=>({});export const publicPlaceResearchReady=()=>true;`:path==='research'?`export async function researchPublicPlaceNames(){globalThis.placeFixture.calls++;if(globalThis.placeFixture.research instanceof Error)throw globalThis.placeFixture.research;return globalThis.placeFixture.research;}`:`
 export const createOpenWorldPlaceProvider=(options)=>options;
 export async function searchOpenWorldTravelCandidates(query,context,options){const f=globalThis.placeFixture;f.queries.push(query);if(f.failed)options.onSourceFailure?.();return query==='Yunomine Onsen'?f.aliases:f.candidates;}
 export const searchOpenWorldNearbyBaseSuggestions=async()=>[];`}));
}}]});
const api=await import('data:text/javascript;base64,'+Buffer.from(bundled.outputFiles[0]!.text).toString('base64'));
function reset(){scope.placeFixture={calls:0,failed:false,candidates:[],aliases:[candidate],research:response,queries:[]};}
const post=(research=false)=>api.POST(Object.assign(new Request('http://localhost/api/journey-geocode',{method:'POST',headers:{origin:'http://localhost','content-type':'application/json'},body:JSON.stringify({place:'Yunomine hot spring village',...(research?{research:true,noticeVersion:'public-place-alias-v3'}:{})})}),{nextUrl:new URL('http://localhost/api/journey-geocode')}));
const get=(extra='')=>extra===''||extra==='research=public-place'?post(Boolean(extra)):api.GET({nextUrl:new URL('http://localhost/api/journey-geocode?place=Yunomine+hot+spring+village&mode=resolve&candidates=1&intent=route-stop&'+extra),signal:new AbortController().signal});

test('explicit public completed search uses Luna aliases then provider identity and returns selectable choice',async()=>{
 reset();const result=await get('research=public-place');assert.equal(scope.placeFixture.calls,1);assert.equal(result.body.candidates[0]?.providerId,candidate.providerId);assert.deepEqual(scope.placeFixture.queries,['Yunomine hot spring village','Yunomine Onsen']);
});
test('route never researches typing, normal submit, imports, failed providers, ambiguity or constrained searches',async()=>{
 for(const extra of ['', 'research=public-place&consumer=spreadsheet-import','research=public-place&parentName=Japan&parentType=country','research=public-place&anchorName=Mountain&nearbyBaseSearch=1','research=public-place&nearLat=33&nearLon=135']){reset();await get(extra);assert.equal(scope.placeFixture.calls,0,extra);}
 reset();scope.placeFixture.failed=true;assert.equal((await get('research=public-place')).status,503);assert.equal(scope.placeFixture.calls,0);
 reset();scope.placeFixture.candidates=[candidate,{...candidate,providerId:'photon:N:999'}];await get('research=public-place');assert.equal(scope.placeFixture.calls,0);
 reset();const request={nextUrl:new URL('http://localhost/api/journey-geocode?place=Yunomine+hot+spring+village&mode=autocomplete&candidates=1&research=public-place'),signal:new AbortController().signal};await api.GET(request);assert.equal(scope.placeFixture.calls,0);
});
test('first-place and Add Stop expose research only after healthy completed miss and user explicitly requests public name search',async()=>{
 reset();let searches=0;
 const original=globalThis.fetch;
 globalThis.fetch=async(input,init)=>{const req=Object.assign(new Request(new URL(String(input),'http://localhost'),{...init,headers:{...init?.headers,origin:'http://localhost'}}),{nextUrl:new URL(String(input),'http://localhost')});const result=await api.POST(req);return new Response(JSON.stringify(result.body),{status:result.status});};
 const ui=autocompleteRender('Yunomine hot spring village',{onFreeTextSearch:async(query,signal)=>{searches++;return searchCompletedPlaceCandidates(query,signal);},onPublicPlaceSearch:searchPublicPlaceCandidates});
 await ui.settle();assert.equal(ui.actions().some((a:any)=>a.label==='Search public place names'),false);assert.equal(scope.placeFixture.calls,0);
 ui.enter();await ui.settle();assert.equal(searches,1);const action=ui.actions().find((a:any)=>a.label==='Search public place names');assert.ok(action);action.click();await ui.settle();assert.equal(scope.placeFixture.calls,1);assert.equal(ui.selected.length,0);assert.equal(ui.rows().length,1);ui.rows()[0]!.choose();assert.equal(ui.selected[0]?.name,'Yunomine Onsen');ui.close();globalThis.fetch=original;
 const source=readFileSync('app/journey/new/trip-builder.tsx','utf8');assert.equal((source.match(/onPublicPlaceSearch=\{searchPublicPlaceCandidates\}/g)??[]).length,2);
});

test('client helper sends only public place and explicit country by POST, with notice version only for explicit research',async()=>{
 const original=globalThis.fetch;const requests:{url:string;options:RequestInit|undefined}[]=[];
 globalThis.fetch=async(input,options)=>{requests.push({url:String(input),options});return new Response('{"candidates":[],"publicResearchAvailable":false}');};
 try {await searchCompletedPlaceCandidates('湯の峰温泉, Japan',new AbortController().signal);await searchPublicPlaceCandidates('湯の峰温泉, Japan',new AbortController().signal);
 assert.equal(requests[0]?.url,'/api/journey-geocode');assert.equal(requests[0]?.options?.method,'POST');assert.equal(requests[0]?.options?.cache,'no-store');
 assert.deepEqual(JSON.parse(String(requests[0]?.options?.body)),{place:'湯の峰温泉',country:'Japan'});
 assert.deepEqual(JSON.parse(String(requests[1]?.options?.body)),{place:'湯の峰温泉',country:'Japan',research:true,noticeVersion:'public-place-alias-v3'});
 }finally{globalThis.fetch=original;}
});

test('route leaves incomplete, refused, malformed and ambiguous research unresolved without alias lookup',async()=>{
 for(const output of [{...response,status:'incomplete'},{status:'completed',output:[{type:'message',content:[{type:'refusal',refusal:'no'}]}]},
  {...response,output:[response.output[0],{type:'message',content:[{type:'output_text',text:'not JSON'}]}]},
  {...response,output:[response.output[0],{type:'message',content:[{type:'output_text',text:'{"status":"ambiguous","candidates":[]}'}]}]}]){
  reset();scope.placeFixture.research=output;const result=await get('research=public-place');assert.deepEqual(result.body.candidates,[]);assert.equal(scope.placeFixture.calls,1);assert.deepEqual(scope.placeFixture.queries,['Yunomine hot spring village']);
 }
});
test('editing during public research cancels it and a stale result never reaches picker',async()=>{
 let complete:((value:any[])=>void)|undefined;let signal:AbortSignal|undefined;
 const ui=autocompleteRender('Yunomine hot spring village',{onFreeTextSearch:async()=>({suggestions:[],publicResearchAvailable:true}),onPublicPlaceSearch:async(_query,s)=>{signal=s;return new Promise(resolve=>{complete=resolve;});}});
 await ui.settle();ui.enter();await ui.settle();ui.actions().find((action:any)=>action.label==='Search public place names')!.click();
 ui.change('Other village');assert.equal(signal?.aborted,true);complete?.([{canonicalPlaceId:'stale',name:'Yunomine Onsen',label:'Yunomine Onsen',country:'Japan',placeType:'town',coordinates:[135.7,33.8],provenance:[]}]);await ui.settle();assert.equal(ui.rows().some((row:any)=>row.label.includes('Yunomine')),false);ui.close();
});

test('parent-driven clear aborts in-flight public research',async()=>{
 let signal:AbortSignal|undefined;
 const ui=autocompleteRender('Yunomine hot spring village',{onFreeTextSearch:async()=>({suggestions:[],publicResearchAvailable:true}),onPublicPlaceSearch:async(_query,s)=>{signal=s;return new Promise(()=>{});}});
 await ui.settle();ui.enter();await ui.settle();ui.actions().find((action:any)=>action.label==='Search public place names')!.click();ui.render({value:''});assert.equal(signal?.aborted,true);ui.close();
});

test('research service failure is unavailable, not a false successful no-match',async()=>{
 reset();scope.placeFixture.research=new Error('fixture service unavailable');const result=await get('research=public-place');assert.equal(result.status,503);assert.equal(scope.placeFixture.calls,1);
});

test('missing server research capability never exposes paid action after a healthy completed miss',async()=>{
 const ui=autocompleteRender('Yunomine hot spring village',{onFreeTextSearch:async()=>({suggestions:[],publicResearchAvailable:false}),onPublicPlaceSearch:async()=>{throw new Error('must stay hidden');}});
 await ui.settle();ui.enter();await ui.settle();assert.equal(ui.actions().some((action:any)=>action.label==='Search public place names'),false);ui.close();
});
