import assert from 'node:assert/strict';import test from 'node:test';import {readFileSync} from 'node:fs';import ts from 'typescript';
import {japanTrip} from './fixtures/transport-choice.ts';
import {compareCanonicalTransferJourney} from '../lib/easyt/multimodal-transfer-resolution.ts';
import {syntheticRoad} from './fixtures/transport-comparison.ts';
import {validateTransportComparison,adoptTransportComparison} from '../lib/easyt/transport-comparison.ts';

test('actual queued adoption callback rejects a cancelled view before running its mutation',async()=>{
 const source=readFileSync('components/easyt/trip-transport-workspace.tsx','utf8'),ast=ts.createSourceFile('workspace.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 let expression:ts.Expression|undefined;function visit(node:ts.Node){if(ts.isJsxAttribute(node)&&node.name.getText(ast)==='onAdoptComparison'&&node.initializer&&ts.isJsxExpression(node.initializer))expression=node.initializer.expression;ts.forEachChild(node,visit);}visit(ast);assert.ok(expression);
 const trip=japanTrip();delete trip.legs[0].routeMetadata.multimodalResolution;
 const comparison=validateTransportComparison(trip,trip.legs[0].id,await compareCanonicalTransferJourney(trip.legs[0],{provider:syntheticRoad()}))!;assert.ok(comparison);
 const road=comparison.candidates.find(c=>c.summaryMode==='road')!;let queued:((current:typeof trip)=>typeof trip)|undefined;let current=true;
 const js=ts.transpileModule('return ('+expression.getText(ast)+');',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
 const action=new Function('mutation','adoptTransportComparison','leg','pendingKey',js)({mutateTrip:(update:(current:typeof trip)=>typeof trip)=>{queued=update;return Promise.resolve(false);}},adoptTransportComparison,trip.legs[0],'fixture');
 await action(comparison,road.id,()=>current);current=false;
 assert.throws(()=>queued!(trip),/changed|cancelled/i);assert.equal(trip.brief.decisionSelections?.transportByLeg[trip.legs[0].id],undefined);
});
