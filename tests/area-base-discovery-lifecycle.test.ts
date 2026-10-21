import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {createAbortableEffectScope} from '../lib/easyt/abortable-effect.ts';
import {withProviderTimeout} from '../lib/easyt/provider-timeout.ts';
import {nearbyBaseAnchorForMention, type CanonicalPlaceSuggestion} from '../lib/easyt/place-intelligence.ts';
import {discoveryBaseForSearchedArea,discoverySearchStopSuggestion} from '../lib/easyt/discovery-confirmation.ts';
import {requiresPhysicalIslandVerification} from '../lib/easyt/island-geography.ts';
import {destinationPlanningDecision} from '../lib/easyt/destination-planning-policy.ts';
import {searchReferencePlaces,referenceSnapshotId} from '../lib/easyt/place-reference.server.ts';
import {countryCodeFor} from '../lib/easyt/country-registry.ts';
const source=readFileSync('app/journey/new/trip-builder.tsx','utf8');
const ast=ts.createSourceFile('builder.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let effect='';
function visit(n:ts.Node){if(ts.isCallExpression(n)&&n.expression.getText(ast)==='useEffect'&&n.arguments[0]?.getText(ast).includes('"Discovery area base search"'))effect=n.arguments[0].getText(ast);ts.forEachChild(n,visit);}visit(ast);assert(effect);
const evaluate=new Function('scope',`with(scope){${ts.transpileModule('return ('+effect+');',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText}}`);
const area:CanonicalPlaceSuggestion={canonicalPlaceId:'synthetic-island',name:'Synthetic Island',country:'Greece',label:'Synthetic Island',placeType:'island',routability:'needs_base_selection',provenance:[]};
const settle=()=>new Promise(resolve=>setTimeout(resolve,35));
function harness(fetchImpl:(url:string,init?:RequestInit)=>Promise<Response>,open=true,selected=area){
 const states:any[]=[],requests:Array<{url:string;signal?:AbortSignal|null}>=[];
 const context={discoveryBaseArea:selected,activeClarificationMention:{mentionId:'one'},clarificationOpen:open,
  nearbyBaseAnchorForMention,createAbortableEffectScope,requiresPhysicalIslandVerification,countryCodeFor,destinationPlanningDecision,
  discoveryBaseForSearchedArea,discoverySearchStopSuggestion,
  setSearchedAreaBases:(value:any)=>states.push(value),
  withProviderTimeout:(options:Parameters<typeof withProviderTimeout>[0])=>withProviderTimeout({...options,timeoutMs:15}),
  fetch:(url:string,init?:RequestInit)=>{requests.push({url,signal:init?.signal});return fetchImpl(url,init);}};
 const dispose=evaluate(context)() as (()=>void)|undefined;
 return {states,requests,dispose,context};
}
test('actual Builder discovers a missing-coordinate island by identity without manufacturing an anchor',async()=>{
 const h=harness(async()=>Response.json({candidates:[]}));await settle();
 assert.equal(h.requests.length,1,'missing anchor currently skips discovery entirely');
 const params=new URL(h.requests[0]!.url,'http://local').searchParams;
 assert.equal(params.get('areaBases'),'1');assert.equal(params.get('parentName'),area.name);
 assert.equal(params.has('anchorLon'),false);assert.equal(h.states.at(-1).status,'empty');h.dispose?.();
});
for(const failure of ['headers','body','http','json','shape'] as const)test(`actual area discovery settles ${failure} to retryable unavailable`,async()=>{
 const h=harness(async()=>{
  if(failure==='headers')return new Promise(()=>{});
  if(failure==='body')return {ok:true,json:()=>new Promise(()=>{})} as unknown as Response;
  if(failure==='http')return new Response('',{status:503});
  if(failure==='json')return new Response('{');
  return Response.json({candidates:'wrong-shape'});
 });await settle();assert.equal(h.states.at(-1).status,'unavailable');h.dispose?.();
});
test('closing and switching mention disposes the request and suppresses noncooperative late completion',async()=>{
 let finish!:(response:Response)=>void;
 const old=harness(()=>new Promise(resolve=>{finish=resolve;}));
 assert.equal(old.requests.length,1);old.dispose?.();
 const next=harness(async()=>Response.json({candidates:[]}));
 finish(Response.json({candidates:[]}));await settle();
 assert.equal(old.requests[0]!.signal?.aborted,true);assert.equal(old.states.length,1);
 assert.equal(next.states.at(-1).status,'empty');next.dispose?.();
 const closed=harness(async()=>{throw Error('closed modal fetched');},false);assert.equal(closed.requests.length,0);assert.equal(closed.states.length,0);
});
test('retry starts a fresh request and can recover from prior failure without changing the area',async()=>{
 const initial=harness(async()=>new Response('',{status:503}));await settle();initial.dispose?.();
 const retry=harness(async()=>Response.json({candidates:[]}));await settle();
 assert.equal(initial.states.at(-1).status,'unavailable');assert.equal(retry.states.at(-1).status,'empty');assert.equal(retry.context.discoveryBaseArea,area);retry.dispose?.();
});
test('anchored island requests physical area bases instead of proximity discovery',async()=>{
 const h=harness(async()=>Response.json({candidates:[]}),true,{...area,coordinates:[124.2,9.8]});await settle();
 assert.equal(h.requests.length,1);const params=new URL(h.requests[0]!.url,'http://local').searchParams;
 assert.equal(params.get('areaBases'),'1');assert.equal(params.has('nearbyBases'),false);assert.equal(params.get('parentName'),area.name);assert.equal(params.has('anchorLon'),false);h.dispose?.();
});

test('actual Builder offers a verified server settlement without auto-selecting or moving the island',async()=>{
 const seed=searchReferencePlaces('Fira',{explicitCountryNames:['Greece']}).find(c=>c.canonicalPlaceId==='reference:geonames:252920')!;
 const suggestion={canonicalPlaceId:seed.canonicalPlaceId!,name:seed.canonicalName,label:seed.canonicalName,country:'Greece',placeType:seed.placeType,
  routability:seed.routability,coordinates:seed.coordinates,referenceSnapshotId:referenceSnapshotId(),
  provenance:[{kind:'provider',id:seed.providerId,label:'GeoNames',supports:'Injected verified API result; geometry independently tested in API tests'}]};
 const h=harness(async()=>Response.json({candidates:[suggestion]}));await settle();
 assert.equal(h.states.at(-1).status,'ready');assert.deepEqual(h.states.at(-1).suggestions,[suggestion]);
 assert.equal(h.context.discoveryBaseArea.coordinates,undefined);assert.equal(h.context.discoveryBaseArea.canonicalPlaceId,'synthetic-island');h.dispose?.();
});
test('changing area within the same mention hides earlier candidates before the replacement effect runs',()=>{
 let expression='';
 function find(n:ts.Node){if(ts.isPropertyAssignment(n)&&n.name.getText(ast)==='candidates'&&n.initializer.getText(ast).includes('searchedAreaBases'))expression=n.initializer.getText(ast);ts.forEachChild(n,find);}find(ast);assert(expression);
 const read=new Function('scope',`with(scope){return (${expression});}`);
 const previous={mentionId:'one',areaKey:'old-area',suggestions:[{name:'Old base'}]};
 assert.deepEqual(read({searchedAreaBases:previous,activeClarificationMention:{mentionId:'one'},discoveryBaseAreaKey:'new-area'}),[]);
 assert.deepEqual(read({searchedAreaBases:previous,activeClarificationMention:{mentionId:'one'},discoveryBaseAreaKey:'old-area'}),previous.suggestions);
});

test('existing non-island natural area preserves nearby-anchor discovery',async()=>{
 const h=harness(async()=>Response.json({candidates:[]}),true,{...area,placeType:'natural_area',coordinates:[124.2,9.8]});await settle();
 assert.equal(h.requests.length,1);const params=new URL(h.requests[0]!.url,'http://local').searchParams;
 assert.equal(params.get('nearbyBases'),'1');assert.equal(params.has('areaBases'),false);assert.equal(params.get('anchorLon'),'124.2');h.dispose?.();
});
