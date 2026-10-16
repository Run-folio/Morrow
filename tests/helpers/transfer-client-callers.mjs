import fs from 'node:fs';
import ts from 'typescript';
import assert from 'node:assert/strict';
import {reconcileBuilderDependencies} from '../../lib/easyt/trip-builder-reconciliation.ts';
import {geographicallyReady, stopGeographicPlace, guardTripRoutingGeometry} from '../../lib/easyt/geographic-binding.ts';
import {transferAssessmentForLeg} from '../../lib/easyt/planning-evidence-presentation.ts';
import {assessCanonicalTransferJourneys} from '../../lib/easyt/multimodal-transfer-resolution.ts';
const builder=fs.readFileSync(new URL('../../app/journey/new/trip-builder.tsx',import.meta.url),'utf8');
const client=await import('../../lib/easyt/transfer-resolution-client.ts').catch(e=>{if(e.code==='ERR_MODULE_NOT_FOUND')return null;throw e;});
export function actualWorker(){
 const start=builder.indexOf('async function reconcileAcceptedBuilderRequest('),end=builder.indexOf('\nfunction TripBuilderDocument()',start);
 const js=ts.transpileModule(builder.slice(start,end)+'\nreturn reconcileAcceptedBuilderRequest;', {compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
 const scope={reconcileBuilderDependencies,geographicallyReady,stopGeographicPlace,guardTripRoutingGeometry,transferAssessmentForLeg,
  requestCanonicalTransferResolution:client?.requestCanonicalTransferResolution,
  resolveBuilderRecommendation:()=>{throw Error('Unexpected recommendation request');},fetch:(...args)=>globalThis.fetch(...args)};
 return new Function(...Object.keys(scope),js)(...Object.values(scope));
}
export function actualPreview(legs,signalController,onResult){
 const ast=ts.createSourceFile('builder.tsx',builder,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let body;
 function visit(node){if(ts.isCallExpression(node)&&node.expression.getText(ast)==='useEffect'&&node.arguments[0]?.getText(ast).includes('if (canonicalBuilder) return;')&&node.arguments[0].getText(ast).includes('baselineBuilderCanonicalLegs'))body=node.arguments[0].getText(ast);ts.forEachChild(node,visit);}visit(ast);assert.ok(body);
 const js=ts.transpileModule('return ('+body+')();',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
 return new Function('canonicalBuilder','baselineBuilderCanonicalLegs','AbortController','transferResolutionKey','setResolvedBuilderLegs','requestCanonicalTransferResolution',js)(false,legs,class{constructor(){return signalController;}},'current-key',onResult,client?.requestCanonicalTransferResolution);
}
export function realApiGuard(){
 const source=fs.readFileSync(new URL('../../app/api/journey-transfer-resolution/route.ts',import.meta.url),'utf8');
 const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const mod={exports:{}};
 new Function('require','module','exports',js)(id=>{
  if(id==='next/server')return {NextResponse:{json:Response.json}};
  if(id==='@/lib/easyt/multimodal-transfer-resolution.server')return {assessCanonicalTransferJourneys:legs=>assessCanonicalTransferJourneys(legs)};
  throw Error('Unexpected import '+id);
 },mod,mod.exports);
 return mod.exports.POST;
}
