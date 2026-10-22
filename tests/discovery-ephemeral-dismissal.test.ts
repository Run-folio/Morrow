import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {builderClosure} from './helpers/qa-persistence-source-fixture.ts';
import {createDiscoveryDraft,readDiscoveryDraft} from '../lib/easyt/discovery-draft.ts';
import {authoredContentKey} from '../lib/easyt/trip-retained-authored-content.ts';
import {discoverySearchStopSuggestion,discoverySearchOutsideMention} from '../lib/easyt/discovery-confirmation.ts';
import {requiresPhysicalIslandVerification} from '../lib/easyt/island-geography.ts';
import {placeSuggestionRequiresBaseSelection,resolvePlaceMentions} from '../lib/easyt/place-intelligence.ts';
import {discoveryDismissedEvent} from '../lib/easyt/discovery-funnel.ts';

const source=readFileSync(new URL('../app/journey/new/trip-builder.tsx',import.meta.url),'utf8');
const ast=ts.createSourceFile('builder.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
function callback(name:string,bindings:Record<string,unknown>){let code='';function visit(node:ts.Node){if(ts.isVariableDeclaration(node)&&node.name.getText(ast)===name&&node.initializer)code=node.initializer.getText(ast);ts.forEachChild(node,visit);}visit(ast);assert.ok(code);return new Function('bindings',`with(bindings){return (${ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText.replace(/;\s*$/,'')});}`)(bindings);}
function modalCallback(attribute:string,member:string,bindings:Record<string,unknown>){let code='';function visit(node:ts.Node){if(ts.isJsxSelfClosingElement(node)&&node.tagName.getText(ast)==='DiscoveryModal'){const attr=node.attributes.properties.filter(ts.isJsxAttribute).find(item=>item.name.getText(ast)===attribute);if(attr?.initializer){const find=(child:ts.Node)=>{if(ts.isPropertyAssignment(child)&&child.name.getText(ast)===member)code=child.initializer.getText(ast);ts.forEachChild(child,find);};find(attr.initializer);}}ts.forEachChild(node,visit);}visit(ast);assert.ok(code);return new Function('bindings',`with(bindings){return (${ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText.replace(/;\s*$/,'')});}`)(bindings);}
function deferred(){let resolve!:(value:boolean)=>void;const promise=new Promise<boolean>(done=>{resolve=done;});return {promise,resolve};}
function fixture({planning=true,recovery=true,changed=false,deferredUpdater=false}:{deferredUpdater?:boolean;planning?:boolean|ReturnType<typeof deferred>;recovery?:boolean|ReturnType<typeof deferred>;changed?:boolean}={}){
 const selected={canonicalPlaceId:'base-exact',name:'Exact selected base',label:'Exact selected base, Japan',country:'Japan',placeType:'town',coordinates:[135.7,33.8],provenance:[{id:'photon:N:exact',kind:'provider',label:'Fixture',supports:'Exact selection'}]};
 const draft={...createDiscoveryDraft(),shortlistIds:['base-exact'],searchSelections:[selected],baseByIntentId:{'mention-a':'base-exact'}};
 const intent={id:'mention-a',kind:'planning_area',sourceText:'  original intent  ',resolution:'needs_base',stopIds:[]};
 let document:any={id:'trip-a',ownerId:null,updatedAt:'2026-10-22T00:00:00Z',brief:{intent:{route:{destinations:[intent]}},structuredBrief:{placeMentions:[{mentionId:'mention-a'}],discoveryDraftByMentionId:{'mention-a':changed?createDiscoveryDraft():draft}}}};
 let revision=4,warning='Existing protected save warning',open=true,planningCalls=0,recoveryCalls=0,analytics=0;
 let queuedUpdate:(()=>void)|undefined;
 const pending={search:'  unfinished base input  ',base:{mentionId:'mention-a',area:selected},outside:{suggestion:selected}};
 const editor={getSnapshot:()=>({trip:document,inputRevision:revision,browserOwnerId:'current-scope',saveState:'error',error:{category:'protected',deviceOutcome:'protected-conflict'}})};
 const bindings:any={discoveryCommitRef:{current:false},planningAreaViewRef:{current:{generation:1}},builderMountedRef:{current:true},builderEditSessionRef:{current:editor},activeBrowserOwnerIdRef:{current:'current-scope'},activeDiscoveryRef:{current:{open:true,mentionId:'mention-a'}},activeTripDocument:document,activeClarificationMention:{mentionId:'mention-a'},discoveryDraft:draft,lastAcknowledgedCanonicalRef:{current:null},tripDocumentsCanonicalEquivalent:()=>false,discoveryEventKind:'country',language:'en',authoredContentKey,discoveryDismissedEvent,
  discoverySearchVersionRef:{current:0},planningBaseSearchIntentVersionRef:{current:0},planningBaseSearchUserIntentVersionRef:{current:0},retireBuilderEntryForInput(){},setBaseSearchInputsState(update:any){const result=typeof update==='function'?update({'mention-a':pending.search}):update;pending.search=result['mention-a'];},setBaseSearchErrorsState(){},setOutsideDiscoveryChoice(value:any){pending.outside=value;},setPendingDiscoveryBase(value:any){pending.base=value;},restoreClarificationResumeFocusRef:{current:false},pendingClarificationIds:['mention-a'],activePlaceMentions:[{mentionId:'mention-a'}],setClarificationSessionIds(){},setClarificationIndex(){},setClarificationAutoOpened(){},setClarificationDismissed(){},setClarificationOpen(value:boolean){open=value;bindings.activeDiscoveryRef.current={open:value,mentionId:'mention-a'};},
  setDeviceRecoveryBlocked(){},setDeviceStorageBlocked(){},setSaveState(){},setCloudSaveError(value:string){warning=value;},trackEvent(){analytics++;},
  window:{requestAnimationFrame(fn:()=>void){queuedUpdate?.();queueMicrotask(fn);}},
  updateDiscoveryPlanningState:async(update:(current:any)=>any)=>{planningCalls++;if(deferredUpdater){queuedUpdate=()=>{const next=update(structuredClone(document.brief.structuredBrief));document={...document,brief:{...document.brief,structuredBrief:next}};bindings.discoveryOwnersRef.current.trip=document;};return true;}const before=document,next=update(structuredClone(document.brief.structuredBrief)),accepted=typeof planning==='boolean'?planning:await planning.promise;if(accepted&&document===before&&JSON.stringify(next)!==JSON.stringify(before.brief.structuredBrief)){document={...before,brief:{...before.brief,structuredBrief:next}};revision++;bindings.discoveryOwnersRef.current.trip=document;}return accepted;},
  discoveryOwnersRef:{current:{trip:document,persistDeviceRecovery:async()=>{recoveryCalls++;return {stored:typeof recovery==='boolean'?recovery:await recovery.promise,blockedByExistingRecovery:true};}}}};
 bindings.setBaseSearchInputs=callback('setBaseSearchInputs',bindings);bindings.setBaseSearchErrors=callback('setBaseSearchErrors',bindings);
 bindings.dismissClarificationSession=callback('dismissClarificationSession',bindings);
 const reopen=callback('openClarificationSession',bindings);
 return {bindings,pending,reopen,get document(){return document;},get warning(){return warning;},get open(){return open;},get planningCalls(){return planningCalls;},get recoveryCalls(){return recoveryCalls;},get analytics(){return analytics;},changeInput(){revision++;},replaceModal(){bindings.activeDiscoveryRef.current={open:true,mentionId:'another-mention'};},reopenSameModal(){bindings.planningAreaViewRef.current.generation++;}};
}
for(const action of ['closed','finish_later'])test(`actual ${action} dismisses protected planning refusal and reopens exact selected bases and pending input`,async()=>{
 const h=fixture({planning:false}),before=structuredClone({document:h.document,pending:h.pending});
 await builderClosure('discovery-close')(h.bindings,action);assert.equal(h.open,false);assert.equal(h.recoveryCalls,0);assert.equal(h.analytics,0);assert.equal(h.warning,'Existing protected save warning');
 assert.deepEqual({document:h.document,pending:h.pending},before,'dismissal must not mutate intent, selected bases or pending search');
 h.reopen('mention-a');assert.equal(h.open,true);assert.deepEqual(readDiscoveryDraft(h.document.brief.structuredBrief,'mention-a').draft,before.document.brief.structuredBrief.discoveryDraftByMentionId['mention-a']);assert.deepEqual(h.pending,before.pending);
});
test('actual refusal after a speculative draft update still dismisses only unchanged source revision',async()=>{
 const h=fixture({planning:false,changed:true}),before=structuredClone(h.document);await builderClosure('discovery-close')(h.bindings,'finish_later');assert.equal(h.open,false);assert.deepEqual(h.document,before);assert.equal(h.recoveryCalls,0);
});
test('actual failed device checkpoint keeps warning and dismisses without claiming a saved event',async()=>{
 const h=fixture({recovery:false}),before=structuredClone({document:h.document,pending:h.pending});await builderClosure('discovery-close')(h.bindings,'closed');assert.equal(h.open,false);assert.equal(h.recoveryCalls,1);assert.match(h.warning,/could not be saved/);assert.equal(h.analytics,0);h.reopen('mention-a');assert.equal(h.open,true);assert.deepEqual({document:h.document,pending:h.pending},before);
});
test('actual healthy save preserves checkpoint then dismissal and saved analytics',async()=>{
 const h=fixture();await builderClosure('discovery-close')(h.bindings,'finish_later');assert.equal(h.open,false);assert.equal(h.recoveryCalls,1);assert.equal(h.warning,'');assert.equal(h.analytics,1);
});
for(const boundary of ['planning','recovery'])for(const change of ['input','modal','reopened-modal'])test(`actual ${boundary} refusal cannot dismiss a replacement ${change} callback scope`,async()=>{
 const gate=deferred(),h=fixture(boundary==='planning'?{planning:gate}:{recovery:gate}),work=builderClosure('discovery-close')(h.bindings,'closed');
 for(let tick=0;tick<20;tick++)await Promise.resolve();if(change==='input')h.changeInput();else if(change==='modal')h.replaceModal();else h.reopenSameModal();gate.resolve(false);await work;assert.equal(h.open,true);assert.equal(h.analytics,0);assert.equal(h.warning,'Existing protected save warning');
});

for(const boundary of ['planning','recovery'])for(const field of ['search','baseChoice'])test(`actual ${field} local typing supersedes held ${boundary} refusal without changing canonical revision`,async()=>{
 const gate=deferred(),h=fixture(boundary==='planning'?{planning:gate}:{recovery:gate}),before=structuredClone(h.document),revision=h.bindings.builderEditSessionRef.current.getSnapshot().inputRevision,work=builderClosure('discovery-close')(h.bindings,'closed');
 for(let tick=0;tick<20;tick++)await Promise.resolve();modalCallback(field,'onChange',h.bindings)('  newer local search  ');assert.equal(h.bindings.builderEditSessionRef.current.getSnapshot().inputRevision,revision);gate.resolve(false);await work;assert.equal(h.open,true);assert.equal(h.warning,'Existing protected save warning');assert.equal(h.pending.search,'  newer local search  ');assert.deepEqual(h.document,before);
});
test('actual pre-actor close checkpoints a draft whose React updater runs before animation-frame publication',async()=>{
 const h=fixture({changed:true,deferredUpdater:true});h.bindings.builderEditSessionRef.current=null;await builderClosure('discovery-close')(h.bindings,'finish_later');assert.equal(h.recoveryCalls,1);assert.equal(h.open,false);assert.equal(h.warning,'');assert.deepEqual(h.document.brief.structuredBrief.discoveryDraftByMentionId['mention-a'],h.bindings.discoveryDraft);
});

for(const boundary of ['planning','recovery'])test(`actual pending planning-area selection supersedes held ${boundary} close through local setter version`,async()=>{
 const gate=deferred(),h=fixture(boundary==='planning'?{planning:gate}:{recovery:gate});Object.assign(h.bindings,{discoveryEntry:{kind:'country'},discoverySearchStopSuggestion,placeSuggestionRequiresBaseSelection});
 const work=builderClosure('discovery-close')(h.bindings,'closed');for(let tick=0;tick<20;tick++)await Promise.resolve();const searchVersion=h.bindings.discoverySearchVersionRef.current,revision=h.bindings.builderEditSessionRef.current.getSnapshot().inputRevision;
 const area={canonicalPlaceId:'new-area',name:'New area',label:'New area, Japan',country:'Japan',placeType:'region',routability:'needs_base_selection',provenance:[]};await modalCallback('search','onSelect',h.bindings)(area);assert.equal(h.bindings.discoverySearchVersionRef.current,searchVersion);assert.equal(h.bindings.builderEditSessionRef.current.getSnapshot().inputRevision,revision);assert.deepEqual(h.pending.base,{mentionId:'mention-a',area});
 gate.resolve(false);await work;assert.equal(h.open,true);assert.deepEqual(h.pending.base,{mentionId:'mention-a',area});assert.equal(h.warning,'Existing protected save warning');
});

for(const boundary of ['planning','recovery'])test(`actual outside-area search choice supersedes held ${boundary} close without canonical mutation`,async()=>{
 const gate=deferred(),h=fixture(boundary==='planning'?{planning:gate}:{recovery:gate}),before=structuredClone(h.document);Object.assign(h.bindings,{discoveryEntry:{kind:'country'},activeClarificationMention:{...resolvePlaceMentions('Japan').mentions[0],mentionId:'mention-a'},discoverySearchStopSuggestion,placeSuggestionRequiresBaseSelection,requiresPhysicalIslandVerification,discoverySearchOutsideMention});
 const work=builderClosure('discovery-close')(h.bindings,'closed');for(let tick=0;tick<20;tick++)await Promise.resolve();const revision=h.bindings.builderEditSessionRef.current.getSnapshot().inputRevision,baseVersion=h.bindings.planningBaseSearchIntentVersionRef.current;
 const suggestion={...h.bindings.discoveryDraft.searchSelections[0],canonicalPlaceId:'open-world:photon:N:outside',name:'Outside town',country:'France',label:'Outside town, France',coordinates:[2.3,48.8]};assert.ok(discoverySearchStopSuggestion(suggestion));assert.equal(discoverySearchOutsideMention(suggestion,h.bindings.activeClarificationMention),true);await modalCallback('search','onSelect',h.bindings)(suggestion);assert.equal(h.bindings.builderEditSessionRef.current.getSnapshot().inputRevision,revision);assert.equal(h.bindings.planningBaseSearchIntentVersionRef.current,baseVersion);assert.deepEqual(h.pending.outside,{mentionId:'mention-a',suggestion});
 gate.resolve(false);await work;assert.equal(h.open,true);assert.deepEqual(h.pending.outside,{mentionId:'mention-a',suggestion});assert.equal(h.warning,'Existing protected save warning');assert.deepEqual(h.document,before);
});
