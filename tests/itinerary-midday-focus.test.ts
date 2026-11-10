import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";

test("closing the Midday composer restores its own Add trigger", () => {
 const file=ts.createSourceFile("planner.tsx",readFileSync(new URL("../components/easyt/rich-itinerary-day-planner.tsx",import.meta.url),"utf8"),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 let callback:ts.Node|undefined;
 const visit=(node:ts.Node)=>{if(ts.isCallExpression(node)&&node.expression.getText(file)==="useEffect"&&node.arguments[0]?.getText(file).includes('focusAfterAddRef.current = {'))callback=node.arguments[0];ts.forEachChild(node,visit);};visit(file);assert.ok(callback);
 const focused:string[]=[];
 const context={addComposerOpen:true,addComposerDayPart:"midday" as string|null,focusAfterAddRef:{current:null as {dayId:string;part:string}|null},composition:{day:{id:"day-1"}},titleId:"planner",document:{getElementById:(id:string)=>({focus:()=>focused.push(id)})}};
 const effect=runInNewContext(`(${callback.getText(file)})`,context) as ()=>void;
 effect();context.addComposerOpen=false;context.addComposerDayPart=null;effect();
 assert.deepEqual(focused,["planner-add-midday"]);
});
