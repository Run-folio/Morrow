import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source=readFileSync('components/easyt/trip-itinerary-workspace.tsx','utf8');
const tree=ts.createSourceFile('workspace.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
let expression:ts.Expression|undefined;
function visit(node:ts.Node){if(ts.isVariableDeclaration(node)&&node.name.getText(tree)==='returnFromActivityEdit')expression=node.initializer;ts.forEachChild(node,visit);}
visit(tree);assert.ok(expression);
const js=ts.transpileModule('const actual='+expression.getText(tree),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
function fixture({connected=true,sameDay=true,found=true,editorWasOpen=false}={}){
 const events:unknown[]=[],frames:Array<()=>void>=[];
 const button={isConnected:connected,focus:(options?:FocusOptions)=>events.push(['focus',options]),scrollIntoView:(options?:ScrollIntoViewOptions)=>events.push(['scroll',options])};
 const replacement={...button,isConnected:true};
 const handoff={dayId:'day-1',trigger:button,noteIndex:3,editorWasOpen};
 const scope={activeDayId:sameDay?'day-1':'day-2',activityEditHandoffRef:{current:handoff as typeof handoff|null},sequenceEditorRef:{current:{open:true}},plannerElementRef:{current:{querySelector:(selector:string)=>{assert.equal(selector,'[data-activity-note-index="3"] button');return found?replacement:null;}}},window:{requestAnimationFrame:(frame:()=>void)=>frames.push(frame)}};
 const run=new Function('scope',`with(scope){${js};return actual;}`)(scope);
 return {run,scope,frames,events};
}
for(const connected of [true,false])test(`card edit return reveals ${connected?'original':'replacement'} focus without smooth motion`,()=>{
 const f=fixture({connected});f.run();assert.equal(f.scope.activityEditHandoffRef.current,null);assert.equal(f.scope.sequenceEditorRef.current.open,true);
 assert.deepEqual(f.events,[]);assert.equal(f.frames.length,1);f.frames[0]();
 assert.deepEqual(f.events,[['focus',{preventScroll:true}],['scroll',{block:'nearest',inline:'nearest',behavior:'instant'}]]);
 f.run();assert.equal(f.frames.length,1);
});
test('card return preserves an already open sequence editor',()=>{const f=fixture({editorWasOpen:true});f.run();f.frames[0]();assert.equal(f.scope.sequenceEditorRef.current.open,true);});
test('card return does not focus a different day or invent a missing replacement',()=>{
 const other=fixture({sameDay:false});other.run();assert.equal(other.frames.length,0);assert.deepEqual(other.events,[]);
 const missing=fixture({connected:false,found:false});missing.run();missing.frames[0]();assert.deepEqual(missing.events,[]);
});
test('original and replaced card targets share the existing sticky-header scroll clearance token',()=>{
 const css=readFileSync('components/easyt/rich-itinerary-day-planner.module.css','utf8');
 assert.match(css,/\.activitySelect,\s*\.activityExpansion\s*>\s*summary,\s*\.activityExpansion button\s*\{\s*scroll-margin-block:\s*var\(--morrovia-sticky-content-offset\);\s*\}/);
});

test('card return restores disclosure after the accepted edit render, before revealing focus',()=>{
 const f=fixture();f.run();
 // The async save render can reapply the editor disclosure before the frame.
 f.scope.sequenceEditorRef.current.open=true;
 f.frames[0]();
 assert.equal(f.scope.sequenceEditorRef.current.open,false);
 assert.deepEqual(f.events,[['focus',{preventScroll:true}],['scroll',{block:'nearest',inline:'nearest',behavior:'instant'}]]);
});

test('focus return waits for the editor-closed layout commit',()=>{
 let effect:ts.Expression|undefined;
 function find(node:ts.Node){
  if(ts.isCallExpression(node)&&node.expression.getText(tree)==='useLayoutEffect'&&node.arguments[0]?.getText(tree).includes('returnFromActivityEdit()'))effect=node.arguments[0];
  ts.forEachChild(node,find);
 }
 find(tree);assert.ok(effect);
 const effectJs=ts.transpileModule('const effect='+effect.getText(tree),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
 let calls=0;
 const scope={editingActivity:{} as object|null,returnFromActivityEdit:()=>{calls++;}};
 const run=new Function('scope',`with(scope){${effectJs};return effect;}`)(scope);
 run();assert.equal(calls,0);
 scope.editingActivity=null;run();assert.equal(calls,1);
});

test('focus commit hook is registered before every workspace early return',()=>{
 const component=tree.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='TripItineraryWorkspace');
 assert.ok(component&&ts.isFunctionDeclaration(component)&&component.body);
 const statements=component.body.statements;
 const effectIndex=statements.findIndex(node=>ts.isExpressionStatement(node)&&ts.isCallExpression(node.expression)&&node.expression.expression.getText(tree)==='useLayoutEffect'&&node.getText(tree).includes('returnFromActivityEdit()'));
 assert.ok(effectIndex>=0);
 for(let i=0;i<effectIndex;i++){
  const node=statements[i];
  if(ts.isIfStatement(node))assert.doesNotMatch(node.getText(tree),/\breturn\b/);
  assert.equal(ts.isReturnStatement(node),false);
 }
});
