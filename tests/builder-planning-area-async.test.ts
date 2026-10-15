import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {runInNewContext} from 'node:vm';
import test from 'node:test';
const ts=createRequire(import.meta.url)('typescript');
const text=readFileSync(new URL('../app/journey/new/trip-builder.tsx',import.meta.url),'utf8');
const source=ts.createSourceFile('builder.tsx',text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const declarations=new Map<string,string>();let doneCode='',confirmCode='';
function visit(node:any) {
  if(ts.isVariableDeclaration(node)&&ts.isIdentifier(node.name)&&node.initializer)declarations.set(node.name.text,node.initializer.getText(source));
  if(ts.isJsxAttribute(node)&&node.name.getText(source)==='onDone'&&node.initializer?.expression?.getText(source).includes('completePlanningArea'))doneCode=node.initializer.expression.getText(source);
  if(ts.isJsxAttribute(node)&&node.name.getText(source)==='onConfirm'&&node.initializer?.expression?.getText(source).includes('commitDiscoveryReview'))confirmCode=node.initializer.expression.getText(source);
  ts.forEachChild(node,visit);
}visit(source);
const evaluate=(code:string,context:any)=>runInNewContext(ts.transpileModule(`(${code})`,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,context);
function fixture() {
  let resolve!:(value:boolean)=>void,reject!:(error:Error)=>void,calls=0;
  const gate=new Promise<boolean>((yes,no)=>{resolve=yes;reject=no});
  const view={owner:'owner-a',trip:'trip-a',ids:['mention-a'],index:0,open:true,dismissed:false,raw:'Old search',stopInput:'',editor:true,advances:0,completed:[] as string[],baseErrors:{} as Record<string,string>,automaticHeld:false,releases:0};
  const refSlots:any[]=[],effects:(void|(()=>void))[]=[];let slot=0;
  const context:any={Promise,Set,Map,JSON,structuredClone,language:'en',
    useRef:(value:any)=>refSlots[slot++]??(refSlots[slot-1]={current:value}),useEffect:(fn:()=>void|(()=>void))=>effects.push(fn()),
    builderMountedRef:{current:true},activeBrowserOwnerIdRef:{current:view.owner},builderCurrentDocumentRef:{current:{id:view.trip}},
    builderEditSessionRef:{current:{getSnapshot:()=>({trip:{brief:{intent:{route:{destinations:[]}}}}}),
      deferAutomaticWork:()=>{view.automaticHeld=true;return()=>{view.automaticHeld=false;view.releases++}}}},discoverySearchVersionRef:{current:0},
    planningBaseSearchIntentVersionRef:{current:0},planningBaseSearchUserIntentVersionRef:{current:0},
    capturedStructuredBrief:{placeMentions:[{mentionId:'mention-a'}]},placeSelections:[{mentionId:'mention-a',routeStopId:'stop-a'}],
    dispatchAcceptedBuilderEdit:()=>{calls++;return gate},dispatchAcceptedBuilderEdits:()=>{calls++;return gate},
    placeDisplayName:()=> 'Synthetic area',builderRemoveCommand:()=>null,handoffLookupSessionRef:{current:null},rememberStructuralChange(){},
    discoveryCommitRef:{current:false},setDiscoveryCommitting(){},clarificationSelected:[{id:'stop-a'}],clarificationDiscovery:null,
    clarificationSupportsMultiple:true,clarificationUsesNearbyBases:false,activeClarificationMention:{mentionId:'mention-a'},
    addGuidedPlanningPlace:async()=>({id:'stop-a',name:'Accepted place'}),
    canonicalDiscoveryReview:{canConfirm:true},discoveryDraft:{shortlistIds:['place-a']},discoveryProjection:{places:[]},
    discoveryEventKind:'country',discoveryConfirmedEvent:()=>({}),trackEvent:()=>view.advances+=100,
    window:{requestAnimationFrame:(fn:()=>void)=>fn(),setTimeout:(fn:()=>void)=>fn()},
    commitDiscoveryReview:async()=>({ok:true,committedIds:[]}),setCloudSaveError(){},
    setResolvingPlaceMentionId(){},setTransientPlanningMentionId(){},setShowStopEditor:(v:boolean)=>view.editor=v,
    setBaseSearchInputs:(fn:any)=>{const result=fn({'mention-a':view.raw});view.raw=result['mention-a']??''},
    setBaseSearchErrors:(fn:any)=>{view.baseErrors=fn(view.baseErrors)},
    setCompletedPlanningAreaMentionIds:(fn:any)=>{view.completed=fn(view.completed)},setPlaceSelections(){},setRemovedPlaceMentionIds(){},
    setClarificationSessionIds:(v:string[])=>view.ids=v,setClarificationIndex:(v:number)=>view.index=v,
    setClarificationAutoOpened(){},setClarificationDismissed:(v:boolean)=>view.dismissed=v,setClarificationOpen:(v:boolean)=>view.open=v,
    advanceClarificationSession:()=>{view.advances++;view.open=false},
  };
  const scopeNames=['planningAreaViewKey','planningAreaViewRef','planningAreaPendingRef','planningAreaInputKey','planningAreaInputRef','capturePlanningAreaView','beginPlanningAreaAction'];
  function render() {
    slot=0;context.activeBrowserOwnerId=view.owner;context.tripId=view.trip;context.clarificationSessionIds=view.ids;context.clarificationIndex=view.index;
    context.clarificationOpen=view.open;context.clarificationDismissed=view.dismissed;context.baseSearchInputs={'mention-a':view.raw};context.baseSearchErrors=view.baseErrors;
    context.stopInput=view.stopInput;context.origin='Origin';context.resolvingPlaceMentionId='mention-a';context.showStopEditor=view.editor;
    context.originPlanningMentionId=null;context.transientPlanningMentionId=null;
    context.activeBrowserOwnerIdRef.current=view.owner;context.builderCurrentDocumentRef.current={id:view.trip};
    if(declarations.has('planningAreaViewKey')) {
      const start=text.indexOf('  const planningAreaViewKey ='),end=text.indexOf('  const completePlanningArea =',start);
      const names=scopeNames.filter(name=>declarations.has(name));
      const bindings=evaluate(`()=>{${text.slice(start,end)};return {${names.join(',')}}}`,context)();Object.assign(context,bindings);
    }
    for(const name of ['completePlanningArea','removePlanningArea','reopenPlanningArea'])context[name]=evaluate(declarations.get(name)!,context);
  }
  render();const onDone=()=>evaluate(doneCode,context)(),onConfirm=()=>evaluate(confirmCode,context)();
  return {view,context,render,resolve,reject,get calls(){return calls},complete:()=>context.completePlanningArea({mentionId:'mention-a'}),
    remove:()=>context.removePlanningArea({mentionId:'mention-a'},{ownershipKnown:true,removableStopIds:[]}),reopen:()=>context.reopenPlanningArea({mentionId:'mention-a'}),onDone,onConfirm};
}
for(const action of ['complete','remove','reopen','onDone'] as const) {
  for(const accepted of [false,true])test(`${action}: delayed ${accepted} cannot alter a newer clarification view`,async()=>{
    const ui=fixture(),work=ui[action]();ui.view.ids=['mention-b'];ui.view.raw='New search';ui.view.editor=true;ui.render();ui.resolve(accepted);await work;
    assert.deepEqual(ui.view.ids,['mention-b']);assert.equal(ui.view.raw,'New search');assert.equal(ui.view.editor,true);assert.equal(ui.view.advances,0);
  });
  test(`${action}: rejection leaves the current view and input intact`,async()=>{
    const ui=fixture(),work=ui[action]();ui.reject(new Error('Synthetic refusal'));await work;
    assert.deepEqual(ui.view.ids,['mention-a']);assert.equal(ui.view.raw,'Old search');assert.equal(ui.view.advances,0);
  });
  test(`${action}: render owner cycle retires old completion`,async()=>{
    const ui=fixture(),work=ui[action]();ui.view.owner='owner-b';ui.render();ui.view.owner='owner-a';ui.render();ui.resolve(true);await work;
    assert.deepEqual(ui.view.ids,['mention-a']);assert.equal(ui.view.raw,'Old search');assert.equal(ui.view.advances,0);
  });
  test(`${action}: unmount prevents completion`,async()=>{
    const ui=fixture(),work=ui[action]();ui.context.builderMountedRef.current=false;ui.resolve(true);await work;
    assert.deepEqual(ui.view.ids,['mention-a']);assert.equal(ui.view.raw,'Old search');assert.equal(ui.view.advances,0);
  });
  test(`${action}: repeat clicks do not dispatch a second pending operation`,async()=>{
    const ui=fixture(),first=ui[action](),second=ui[action]();assert.equal(ui.calls,1);ui.resolve(true);await Promise.all([first,second]);
  });
}
test('complete returns literal true only after unchanged accepted persistence',async()=>{
  const ui=fixture(),work=ui.complete();assert.equal(ui.view.raw,'Old search');ui.resolve(true);assert.equal(await work,true);assert.equal(ui.view.raw,'');assert.equal(ui.view.editor,false);
});
test('onDone advances an unchanged dialog only after accepted completion',async()=>{
  const ui=fixture(),work=ui.onDone();assert.equal(ui.view.advances,0);ui.resolve(true);await work;assert.equal(ui.view.advances,1);
});
test('onDone false acceptance keeps even the unchanged dialog open',async()=>{
  const ui=fixture(),work=ui.onDone();ui.resolve(false);await work;assert.equal(ui.view.advances,0);assert.equal(ui.view.open,true);
});
test('same-view new raw search survives an accepted completion',async()=>{
  const ui=fixture(),work=ui.complete();ui.view.raw='New search';ui.render();ui.resolve(true);await work;assert.equal(ui.view.raw,'New search');assert.equal(ui.view.editor,true);
});
test('guided onDone accepts the real returned stop object before completing and advancing',async()=>{
  const ui=fixture();ui.context.clarificationDiscovery={selectedIds:['place-a'],candidates:[{placeId:'place-a'}]};
  const work=ui.onDone();await Promise.resolve();assert.equal(ui.view.advances,0);ui.resolve(true);await work;assert.equal(ui.view.advances,1);
});
test('guided onDone retains new raw search typed during the first deferred addition',async()=>{
  const ui=fixture();ui.context.clarificationDiscovery={selectedIds:['place-a'],candidates:[{placeId:'place-a'}]};
  let accepted!:(value:object)=>void;ui.context.addGuidedPlanningPlace=()=>new Promise(resolve=>{accepted=resolve});
  const work=ui.onDone();ui.view.raw='New search';ui.context.planningBaseSearchUserIntentVersionRef.current++;ui.render();
  accepted({id:'stop-a'});ui.resolve(true);await work;assert.equal(ui.view.raw,'New search');assert.equal(ui.view.advances,0);assert.equal(ui.calls,0);
});
test('complete protects raw input changed before the next render',async()=>{
  const ui=fixture(),work=ui.complete();ui.view.raw='New search';ui.context.planningBaseSearchIntentVersionRef.current++;ui.resolve(true);await work;
  assert.equal(ui.view.raw,'New search');assert.equal(ui.view.editor,true);
});
test('Discovery confirmation does not advance or emit completion on rejected final completion',async()=>{
  const ui=fixture(),work=ui.onConfirm();await Promise.resolve();await Promise.resolve();ui.resolve(false);await work;
  await Promise.resolve();await Promise.resolve();assert.equal(ui.view.advances,0);assert.equal(ui.view.open,true);
});
test('Discovery confirmation retains a newer view during its deferred review',async()=>{
  const ui=fixture();let finish!:(value:object)=>void;ui.context.commitDiscoveryReview=()=>new Promise(resolve=>{finish=resolve});
  const work=ui.onConfirm();for(let i=0;i<8&&!finish;i++)await Promise.resolve();assert.equal(typeof finish,'function');ui.view.ids=['mention-b'];ui.render();
  finish({ok:true,committedIds:[]});ui.resolve(true);await work;await Promise.resolve();await Promise.resolve();
  assert.deepEqual(ui.view.ids,['mention-b']);assert.equal(ui.view.advances,0);
});

for(const action of ['onConfirm','onDone'] as const)for(const result of ['accepted','refused','throw','new-raw','replacement','null-editor'] as const)
test(`${action} releases only its captured editor on ${result}`,async()=>{
  const ui=fixture();const original=ui.context.builderEditSessionRef.current;
  if(result==='null-editor')ui.context.builderEditSessionRef.current=null;
  const work=ui[action]();
  assert.equal(ui.view.automaticHeld,result!=='null-editor');
  let replacementHeld=false;
  if(result==='replacement'||result==='null-editor')ui.context.builderEditSessionRef.current={...original,
    deferAutomaticWork:()=>{replacementHeld=true;return()=>{replacementHeld=false}}};
  if(result==='new-raw'){ui.view.raw='Newest bytes';ui.context.planningBaseSearchUserIntentVersionRef.current++;}
  if(result==='throw')ui.reject(new Error('Synthetic acceptance error'));else ui.resolve(result!=='refused');
  await work;
  assert.equal(ui.view.automaticHeld,false);assert.equal(ui.view.releases,result==='null-editor'?0:1);
  assert.equal(replacementHeld,false);assert.equal(ui.context.discoveryCommitRef.current,false);
  if(result==='new-raw')assert.equal(ui.view.raw,'Newest bytes');
});
