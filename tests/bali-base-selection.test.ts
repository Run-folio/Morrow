import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import * as confirmation from '../lib/easyt/discovery-confirmation.ts';
import {canonicalPlaceSuggestionsForQuery, placeSuggestionRequiresBaseSelection, resolvePlaceMentions, type CanonicalPlaceSuggestion} from '../lib/easyt/place-intelligence.ts';
import {referencePlaceById} from '../lib/easyt/place-reference.server.ts';
import {countryCodeFor} from '../lib/easyt/country-registry.ts';
import {requiresPhysicalIslandVerification} from '../lib/easyt/island-geography.ts';
import {verifyPhysicalIslandSuggestion} from '../lib/easyt/destination-resolution.ts';
import {createDiscoveryDraft, reduceDiscoveryDraft} from '../lib/easyt/discovery-draft.ts';

function settlement(id:string):CanonicalPlaceSuggestion {
  const record=referencePlaceById(id);assert.ok(record);
  return {canonicalPlaceId:id,name:record.canonicalName,label:record.canonicalName,country:record.countryCode==='ID'?'Indonesia':'China',
    placeType:record.placeType,coordinates:[...record.coordinates],routability:'direct_destination',
    provenance:[{id:record.providerId,kind:'provider',label:'GeoNames',supports:'Pinned settlement identity'}]};
}
const cities=[settlement('reference:geonames:1645528'),settlement('reference:geonames:1626932'),settlement('reference:geonames:1622846')];
const bali=resolvePlaceMentions('Bali').mentions[0]!;
const area:CanonicalPlaceSuggestion={canonicalPlaceId:bali.canonicalPlaceId!,name:bali.canonicalName,label:'Bali, Indonesia',country:'Indonesia',placeType:bali.placeType,routability:'needs_base_selection',provenance:bali.provenance};
const text=readFileSync(new URL('../app/journey/new/trip-builder.tsx',import.meta.url),'utf8');
const ast=ts.createSourceFile('builder.tsx',text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let selectCode='',areaCode='',actionCode='';
function visit(node:ts.Node){
  if(ts.isPropertyAssignment(node)&&node.name.getText(ast)==='onSelect'&&node.initializer.getText(ast).includes('discoveryBaseForSearchedArea'))selectCode=node.initializer.getText(ast);
  if(ts.isVariableDeclaration(node)&&node.name.getText(ast)==='discoveryBaseArea'&&node.initializer)areaCode=node.initializer.getText(ast);
  if(ts.isJsxAttribute(node)&&node.name.getText(ast)==='onAction'&&node.initializer&&ts.isJsxExpression(node.initializer)
    &&node.initializer.expression?.getText(ast).includes('updateDiscoveryPlanningState'))actionCode=node.initializer.expression.getText(ast);
  ts.forEachChild(node,visit);
}visit(ast);assert.ok(selectCode);
test('the actual Builder chooser expression is empty before hydration and ignores another mention\'s pending area',()=>{
  assert.ok(areaCode);
  const js=ts.transpileModule(`return (${areaCode});`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
  const read=new Function('scope',`with(scope){${js}}`);
  assert.equal(read({pendingDiscoveryBase:null,activeClarificationMention:undefined,discoveryBaseRead:null}),null);
  const result=read({pendingDiscoveryBase:{mentionId:'other-mention',area:{...area,name:'Other area'}},activeClarificationMention:bali,
    discoveryBaseRead:{status:'current',draft:createDiscoveryDraft()},discoveryBaseAreaForMention:confirmation.discoveryBaseAreaForMention});
  assert.equal(result.canonicalPlaceId,'bali');assert.equal(result.name,'Bali');
});
function chooser(input:{response?:(suggestion:CanonicalPlaceSuggestion)=>object;unavailable?:boolean;held?:boolean}={}){
  const state={current:true,draft:createDiscoveryDraft(),added:[] as CanonicalPlaceSuggestion[],errors:{},fetches:0};
  let finish!:(response:Response)=>void;
  const fetchImpl=async()=>{state.fetches++;if(input.held)return new Promise<Response>(resolve=>{finish=resolve});return payload(selected);};
  const payload=(suggestion=cities[0]!)=>new Response(JSON.stringify({candidates:[input.response?.(suggestion)??{
    ...suggestion,providerId:suggestion.provenance[0]!.id,region:'Bali',normalizationReason:'Synthetic server verification response; not a live island proof',
  }]}),{status:input.unavailable?503:200});
  let selected=cities[0]!;
  const context={...confirmation,requiresPhysicalIslandVerification,countryCodeFor,
    discoveryBaseArea:area,pendingDiscoveryBase:{mentionId:bali.mentionId,area},activeClarificationMention:bali,
    language:'en',discoveryCommitRef:{current:false},discoverySearchVersionRef:{current:0},planningBaseSearchUserIntentVersionRef:{current:0},
    capturePlanningAreaView:()=>{const version=context.discoverySearchVersionRef.current;return()=>state.current&&context.discoverySearchVersionRef.current===version},
    verifyPhysicalIslandSuggestion:(parent:Parameters<typeof verifyPhysicalIslandSuggestion>[0],suggestion:CanonicalPlaceSuggestion)=>verifyPhysicalIslandSuggestion(parent,suggestion,{fetchImpl:async()=>{selected=suggestion;return fetchImpl();}}),
    setBaseSearchErrors:(fn:(value:object)=>object)=>{state.errors=fn(state.errors)},setPendingDiscoveryBase:()=>{},setOutsideDiscoveryChoice:()=>{},
    addDiscoverySearchSelection:async(suggestion:CanonicalPlaceSuggestion)=>{state.added.push(suggestion);state.draft=reduceDiscoveryDraft(state.draft,{type:'add-search-shortlist',suggestion,outsideAccepted:false});},
  };
  const js=ts.transpileModule(`return (${selectCode});`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
  const select=new Function('scope',`with(scope){${js}}`)(context) as (suggestion:CanonicalPlaceSuggestion)=>Promise<void>;
  return {state,context,select,finish:()=>finish(payload(selected))};
}

test('Bali Indonesia remains island intent and requires explicit settlement selection',()=>{
  const suggestion=canonicalPlaceSuggestionsForQuery('Bali',['Indonesia'],8,true).find(item=>item.canonicalPlaceId==='bali')!;
  assert.equal(suggestion.placeType,'island');assert.equal(suggestion.country,'Indonesia');
  assert.equal(placeSuggestionRequiresBaseSelection(suggestion),true);
  assert.equal(confirmation.discoverySearchStopSuggestion(suggestion),null);
  assert.equal(typeof confirmation.discoveryBaseAreaForMention,'function');
  const root=confirmation.discoveryBaseAreaForMention(bali,createDiscoveryDraft());
  assert.equal(root?.canonicalPlaceId,'bali');assert.equal(root?.placeType,'island');
  assert.equal(root?.coordinates,undefined,'do not invent an island centre for the chooser');
  assert.deepEqual(createDiscoveryDraft().shortlistIds,[]);
});

test('actual Reset choices retires a held verification before it can repopulate the cleared shortlist',async()=>{
  const h=chooser({held:true});
  h.state.draft={...createDiscoveryDraft(),removedIds:['reference:geonames:1622846']};
  Object.assign(h.context,{planningAreaViewKey:'view',planningAreaViewRef:{current:{key:'view'}},
    discoveryRead:{status:'current'},discoveryDraft:h.state.draft,discoveryEventKind:'region',discoveryProjection:{places:[]},
    discoveryEntry:{step:'places'},discoveryChoiceEvent:()=>null,reduceDiscoveryDraft,
    readDiscoveryDraft:(brief:any,id:string)=>({status:'current',draft:brief.discoveryDraftByMentionId[id]}),
    updateDiscoveryPlanningState:async(update:(brief:any)=>any)=>{const next=update({discoveryDraftByMentionId:{[bali.mentionId]:h.state.draft}});h.state.draft=next.discoveryDraftByMentionId[bali.mentionId];return true;}});
  assert.ok(actionCode);const js=ts.transpileModule(`return (${actionCode});`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
  const onAction=new Function('scope',`with(scope){${js}}`)(h.context);
  const pending=h.select(cities[0]!);await Promise.resolve();assert.equal(h.state.fetches,1);
  assert.equal(await onAction({type:'reset'}),true);assert.deepEqual(h.state.draft.removedIds,[]);
  h.finish();await pending;
  assert.deepEqual(h.state.draft.shortlistIds,[]);assert.equal(h.state.added.length,0);
});

test('same-name Bali China cities and an ordinary city do not become island base decisions',()=>{
  const china=settlement('reference:geonames:7516858');assert.equal(china.name,'Bali');assert.equal(china.country,'China');assert.equal(china.placeType,'city');
  assert.equal(placeSuggestionRequiresBaseSelection(china),false);assert.deepEqual(confirmation.discoverySearchStopSuggestion(china),china);
  assert.equal(typeof confirmation.discoveryBaseAreaForMention,'function');
  assert.equal(confirmation.discoveryBaseAreaForMention({...bali,canonicalPlaceId:china.canonicalPlaceId,canonicalName:china.name,placeType:'city',parentCountries:['China'],routability:'direct_destination'},createDiscoveryDraft()),null);
  assert.equal(confirmation.discoveryBaseAreaForMention(resolvePlaceMentions('Paris').mentions[0]!,createDiscoveryDraft()),null);
});

for(const [index,name,type] of [[0,'Denpasar','city'],[1,'Singaraja','city'],[2,'Ubud','town']] as const)
test(`actual base chooser requires exact verification before shortlisting ${name} as ${type}`,async()=>{
  const h=chooser(),before=structuredClone(bali),candidate=cities[index]!;
  assert.equal(candidate.name,name);assert.equal(candidate.placeType,type);assert.equal(h.state.added.length,0);
  await h.select(candidate);assert.equal(h.state.fetches,1);assert.equal(h.state.added.length,1);
  assert.equal(h.state.added[0]!.canonicalPlaceId,candidate.canonicalPlaceId);assert.equal(h.state.added[0]!.placeType,type);
  assert.deepEqual(h.state.draft.shortlistIds,[candidate.canonicalPlaceId]);assert.deepEqual(bali,before);
  assert.equal(confirmation.discoveryBaseAreaForMention(bali,h.state.draft),null,'show the explicit shortlist after a choice');
});

for(const boundary of ['unavailable','wrong-point','wrong-identity','new-input','retired-view','wrong-country','island'] as const)
test(`actual Bali base chooser refuses ${boundary} without changing choices`,async()=>{
  const h=chooser({unavailable:boundary==='unavailable',held:boundary==='new-input'||boundary==='retired-view',
    response:suggestion=>({...suggestion,providerId:suggestion.provenance[0]!.id,region:'Bali',normalizationReason:'Synthetic response',
      ...(boundary==='wrong-point'?{coordinates:[0,0]}:{}),...(boundary==='wrong-identity'?{canonicalPlaceId:'reference:geonames:1626932'}:{})})});
  const candidate=boundary==='island'?area:boundary==='wrong-country'?settlement('reference:geonames:7516858'):cities[0]!;
  const work=h.select(candidate);await Promise.resolve();
  if(boundary==='new-input'){assert.equal(h.state.fetches,1);h.context.planningBaseSearchUserIntentVersionRef.current++;h.finish();}
  if(boundary==='retired-view'){assert.equal(h.state.fetches,1);h.state.current=false;h.finish();}
  await work;assert.deepEqual(h.state.added,[]);assert.deepEqual(h.state.draft.shortlistIds,[]);
});
