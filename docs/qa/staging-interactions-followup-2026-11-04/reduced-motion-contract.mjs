// Source-level execution of the deployed handoff callback; not OS/browser emulation.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const source=readFileSync('app/journey/new/trip-builder-route-workspace.tsx','utf8');
const tree=ts.createSourceFile('workspace.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const callbacks=[];
function visit(node){if(ts.isVariableDeclaration(node)&&node.name.getText(tree)==='selectStop')callbacks.push(node.initializer.getText(tree));ts.forEachChild(node,visit);}
visit(tree);assert.equal(callbacks.length,1);
const js=ts.transpileModule('const callback='+callbacks[0],{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
for(const [reduced,reveal,expected] of [[true,true,'auto'],[false,true,'smooth'],[true,false,null]]){
 const selected=[],scroll=[];
 const bindings={onSelectStop:id=>selected.push(id),rowRefs:{current:new Map([['synthetic-stop',{scrollIntoView:options=>scroll.push(options)}]])},window:{matchMedia:query=>{assert.equal(query,'(prefers-reduced-motion: reduce)');return {matches:reduced};}}};
 const callback=new Function('bindings',`with(bindings){${js};return callback;}`)(bindings);
 callback('synthetic-stop',reveal);assert.deepEqual(selected,['synthetic-stop']);
 assert.deepEqual(scroll,expected?[{block:'nearest',behavior:expected}]:[]);
 console.log(JSON.stringify({reduced,reveal,scrollBehavior:expected,result:'pass'}));
}
