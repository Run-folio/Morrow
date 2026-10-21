import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import React from 'react';
import * as clarification from '../lib/easyt/builder-clarification.ts';
import {resolvePlaceMentions} from '../lib/easyt/place-intelligence.ts';
import {captureJourneyBrief} from '../lib/easyt/journey-capture.ts';
import {canonicalRouteFixture} from './fixtures/batch14-route-documents.ts';
import {requireReadableTripDocument} from '../lib/easyt/trip-document.ts';
import {authoredContentKey} from '../lib/easyt/trip-retained-authored-content.ts';
import {geographicallyReady, geographicCandidateMatches, stopGeographicPlace} from '../lib/easyt/geographic-binding.ts';
import {findCatalogPlaceById} from '../lib/easyt/place-catalog.ts';

const source=readFileSync(new URL('../app/journey/new/trip-builder.tsx',import.meta.url),'utf8');
const ast=ts.createSourceFile('builder.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
function expression(name:string){let found:string|undefined;function visit(node:ts.Node){if(ts.isVariableDeclaration(node)&&node.name.getText(ast)===name)found=node.initializer?.getText(ast);ts.forEachChild(node,visit);}visit(ast);return found;}
function actual(code:string,scope:Record<string,any>){return new Function('scope','with(scope){'+ts.transpileModule('const actual = '+code+';return actual;',{compilerOptions:{target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}}).outputText+'}')(scope);}
function dialogAttribute(name:string){let found:string|undefined;function visit(node:ts.Node){if(ts.isJsxSelfClosingElement(node)&&node.tagName.getText(ast)==='BuilderClarificationDialog'){
 const attrs=node.attributes.properties.filter(ts.isJsxAttribute),title=attrs.find(a=>a.name.getText(ast)==='title')?.initializer;
 if(title?.getText(ast)==='{clarificationTitle}'){
  const value=attrs.find(a=>a.name.getText(ast)===name)?.initializer;if(value&&ts.isJsxExpression(value)&&value.expression)found=value.expression.getText(ast);
 }
 }ts.forEachChild(node,visit);}visit(ast);assert(found,`production clarification ${name}`);return found;}
function fixture(){
 const trip=requireReadableTripDocument(canonicalRouteFixture()),mention={...resolvePlaceMentions('Beijing').mentions[0]!,mentionId:'qa-beijing'};
 trip.stops[0]={...trip.stops[0],name:'Beijing',country:'China',canonicalPlaceId:'beijing',providerId:undefined,geographicBinding:undefined,longitude:null,latitude:null};
 trip.brief.structuredBrief={...captureJourneyBrief('Beijing').structuredBrief,placeMentions:[mention]};
 trip.brief.intent.route.destinations=[{id:mention.mentionId,sourceText:'Beijing',kind:'overnight_place',selectedPlace:{name:'Beijing',country:'China',canonicalPlaceId:'beijing'},resolution:'unresolved',requestedNights:null,routeMembership:'required',stopIds:[trip.stops[0].id]}];
 return {trip,mention,entry:{mention,choices:[],scope:{tripId:trip.id,ownerId:'owner-a'}}};
}
function observe(h:ReturnType<typeof fixture>,options:{active?:boolean;owner?:string;scopeTrip?:string;review?:boolean}={}){
 const active=options.active===false?[]:[h.mention];
 const scope:any={...clarification,authoredContentKey,geographicallyReady,geographicCandidateMatches,stopGeographicPlace,
  useMemo:(read:()=>unknown)=>read(),locationChoices:[h.entry],activePlaceMentions:active,canonicalBuilder:h.trip,
  activeBrowserOwnerId:options.owner??'owner-a',tripId:options.scopeTrip??h.trip.id,
  contextMentionIds:new Set(),geographyReviewPlaceMentions:options.review?[h.mention]:[],effectiveStructuredBrief:h.trip.brief.structuredBrief,
  stops:h.trip.stops,sourceRouteKey:undefined,currentCuratedRoute:undefined,reviewedRouteDraft:undefined,
  clarificationSessionIds:[h.mention.mentionId],clarificationIndex:0,mountedBuilder:{snapshot:{trip:h.trip,browserOwnerId:options.owner??'owner-a',inputRevision:1}},
  placeIssues:[],isOriginMention:(m:any)=>m.role==='origin'||m.role==='fixed_start',
  ui:{unavailable:"We couldn't check that place just now. Please try again."},
 };
 scope.builderEditSessionRef={current:{getSnapshot:()=>scope.mountedBuilder.snapshot}};
 scope.activeBrowserOwnerIdRef={current:scope.activeBrowserOwnerId};
 for(const name of ['currentLocationChoices','retiredProviderMentionIds','providerClarificationMentionIds','pendingClarificationIds','activeClarificationId','activeProviderClarification','providerClarificationScope','activeClarificationMention','activeProviderStop','activeProviderChoices']){
  const body=expression(name);if(body)scope[name]=actual(body,scope);
 }
 return {pending:scope.pendingClarificationIds,provider:scope.activeProviderClarification,ownedStop:scope.activeProviderStop,issues:actual(expression('buildPlaceIssues')!,scope),scope};
}
test('removed canonical intent cannot remain an orphan provider Build blocker',()=>{
 const h=fixture();h.trip.brief.intent.route.destinations=[];
 const state=observe(h,{active:false});assert.deepEqual(state.pending,[]);assert.deepEqual(state.issues,[]);assert.equal(state.provider,undefined);
});
test('a retained source cannot reopen a retired provider session as a new Discovery intent',()=>{
 const h=fixture();h.trip.brief.intent.route.destinations=[];
 const state=observe(h,{review:true});assert.deepEqual(state.pending,[]);assert.equal(state.scope.activeClarificationMention,undefined);
});
test('an older provider entry cannot retire newly authored source content in the same mention slot',()=>{
 const h=fixture();h.trip.brief.intent.route.destinations=[];
 h.mention={...h.mention,sourceText:'Newly authored Beijing',status:'unresolved'};
 h.trip.brief.structuredBrief!.placeMentions=[h.mention];
 const state=observe(h,{review:true});assert.deepEqual(state.pending,[h.mention.mentionId]);assert.equal(state.scope.activeClarificationMention,h.mention);
 const issues=actual(expression('buildPlaceIssues')!,{...state.scope,placeIssues:[{mentionId:h.mention.mentionId,blocksRoute:true}]});assert.equal(issues.length,1);
});
test('explicitly removed source cannot be reopened by a retained provider result',()=>{
 const h=fixture();h.trip.brief.structuredBrief!.removedPlaceMentionIds=[h.mention.mentionId];
 assert.deepEqual(observe(h,{active:false}).pending,[]);
 assert.equal(geographicallyReady(stopGeographicPlace(h.trip.stops[0])),false,'unverified saved stop remains unverified');
});
for(const change of ['owner','trip','source'] as const)test(`provider clarification rejects a changed ${change} scope`,()=>{
 const h=fixture();if(change==='source')h.trip.brief.structuredBrief!.placeMentions![0]={...h.mention,sourceText:'New Beijing input'};
 const state=observe(h,{...(change==='owner'?{owner:'owner-b'}:{}),...(change==='trip'?{scopeTrip:'other-trip'}:{})});
 assert.deepEqual(state.pending,[]);assert.deepEqual(state.issues,[]);
});
test('owned unverified city uses its existing occurrence and compatible confirmation choices',()=>{
 const h=fixture(),before=structuredClone(h.trip),state=observe(h);
 assert.equal(state.ownedStop?.id,h.trip.stops[0].id);assert.equal(state.issues.length,1);assert.deepEqual(h.trip,before);
});
test('current unverified city with no provider choices has explicit unavailable status',()=>{
 const h=fixture(),state=observe(h),scope={...state.scope,clarificationUsesNearbyBases:false,clarificationDiscovery:null,activeCountryEnrichment:null,language:'en',nearbySuggestions:[],activeNearbyBaseAnchor:null,activeNearbyDiscovery:null,clarificationParentName:'Beijing',activeProviderChoices:[]};
 const status=actual(expression('clarificationSuggestionsStatus')!,scope);assert.match(status,/confirm|unavailable|couldn't/i);
});
test('direct city identity recovery is not scoped as planning inside that city',()=>{
 const h=fixture(),state=observe(h),scope={...state.scope,clarificationUsesNearbyBases:false,clarificationSupportsMultiple:false,clarificationIsAmbiguity:true};
 const body=expression('clarificationIsCityIdentity');assert(body,'production city identity routing');assert.equal(actual(body,scope),true);
});
test('owned city unavailable dialog offers a working explicit retry for its existing stop',()=>{
 const h=fixture(),state=observe(h),calls:string[]=[],scope={...state.scope,activeProviderChoices:[],clarificationUsesNearbyBases:false,
  activeNearbyDiscovery:null,confirmSavedLocation:(id:string)=>calls.push(id)};
 actual(dialogAttribute('onSuggestionsAction'),scope)();assert.deepEqual(calls,[h.trip.stops[0].id]);
});
for(const change of ['owner','trip','revision'])test(`owned city retry rejects stale ${change} before another lookup`,()=>{
 const h=fixture(),state=observe(h),calls:string[]=[],snapshot={trip:h.trip,browserOwnerId:'owner-a',inputRevision:1},scope={...state.scope,
  activeProviderChoices:[],clarificationUsesNearbyBases:false,activeNearbyDiscovery:null,activeBrowserOwnerIdRef:{current:'owner-a'},
  builderEditSessionRef:{current:{getSnapshot:()=>snapshot}},confirmSavedLocation:(id:string)=>calls.push(id)};
 const retry=actual(dialogAttribute('onSuggestionsAction'),scope);
 if(change==='owner')scope.activeBrowserOwnerIdRef.current='owner-b';
 if(change==='trip')snapshot.trip={...snapshot.trip,id:'new-trip'};
 if(change==='revision')snapshot.inputRevision++;
 retry();assert.deepEqual(calls,[]);
});
test('an unresolved direct city without a stop searches identity without a city parent constraint',()=>{
 const h=fixture();h.trip.brief.intent.route.destinations[0].stopIds=[];const state=observe(h),scope:any={...state.scope,
  clarificationIsAmbiguity:true,clarificationUsesNearbyBases:false,clarificationSupportsMultiple:false,clarificationParentName:'Beijing',
  language:'en',baseSearchInputs:{},baseSearchErrors:{},activeNearbyBaseAnchor:undefined,OVERNIGHT_BASE_PLACE_TYPES:['city','town'],
  planningParentForMention:()=>assert.fail('identity search must not search within a city'),
 };
 scope.clarificationIsCityIdentity=actual(expression('clarificationIsCityIdentity')!,scope);
 scope.clarificationNeedsSearch=actual(expression('clarificationNeedsSearch')!,scope);
 const search=actual(dialogAttribute('search'),scope);assert(search);assert.equal(search.parentConstraint,undefined);assert.equal(search.label,'Search for a place');
});
test('optional failed lookup cannot label an already verified settlement as needing confirmation',()=>{
 const h=fixture(),city=findCatalogPlaceById('berlin')!;assert(city.coordinates);
 h.mention={...resolvePlaceMentions('Berlin').mentions[0]!,mentionId:h.mention.mentionId};h.entry.mention=h.mention;
 h.trip.brief.structuredBrief!.placeMentions=[h.mention];h.trip.stops[0]={...h.trip.stops[0],name:'Berlin',country:'Germany',canonicalPlaceId:'berlin',longitude:city.coordinates[0],latitude:city.coordinates[1]};
 h.trip.brief.intent.route.destinations[0]={...h.trip.brief.intent.route.destinations[0],sourceText:'Berlin',resolution:'resolved',selectedPlace:stopGeographicPlace(h.trip.stops[0])};
 const state=observe(h);assert.deepEqual(state.pending,[]);
 const scope={...state.scope,React,language:'en',styles:{inlinePlaceResolution:'status'},EasyTButton:'button',placeDisplayName:(m:any)=>m.canonicalName,
  handoffResolutionStatuses:{[h.mention.mentionId]:'needs-confirmation'},handoffLookupSessionRef:{current:null}};
 assert.equal(actual(expression('renderPlaceResolution')!,scope)(h.mention),null);
});
