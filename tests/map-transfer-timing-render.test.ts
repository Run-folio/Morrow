import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {build} from 'esbuild';
import ts from 'typescript';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {mapRouteLegsFromTrip, type MapRouteLeg} from '../lib/easyt/map-spatial-context.ts';
import {transferTimingLabel} from '../lib/easyt/transfer-timing-label.ts';
import type {EasyTTrip, TripLeg} from '../lib/easyt/trip.ts';

// Optional exact-release red witness: render its real popup JSX without running MapLibre.
const baseline = process.env.MORROVIA_MAP_PREVIEW_BASELINE;
let contents = "export {MapTransferPreview as Preview} from './components/map-transfer-preview';";
if (baseline) {
 const text=readFileSync(baseline,'utf8');
 const ast=ts.createSourceFile(baseline,text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 let jsx='';
 function visit(node:ts.Node) {
  if(ts.isJsxElement(node) && node.openingElement.attributes.properties.some(p=>ts.isJsxAttribute(p)&&p.name.getText(ast)==='className'&&p.initializer&&ts.isStringLiteral(p.initializer)&&p.initializer.text==='planner-map__leg-card')) jsx=node.getText(ast);
  ts.forEachChild(node,visit);
 }
 visit(ast); assert.ok(jsx,'baseline popup must be found');
 contents=`import React from 'react';import {formatMapDuration} from './lib/easyt/map-spatial-context.ts';export function Preview({leg}) { return (${jsx}); }`;
}
const bundle=await build({stdin:{contents,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,platform:'node',format:'cjs',jsx:'automatic',packages:'external',logLevel:'silent'});
const loaded={exports:{} as {Preview:React.ComponentType<{leg:MapRouteLeg}>}};
new Function('require','module','exports',bundle.outputFiles[0]!.text)(createRequire(import.meta.url),loaded,loaded.exports);
const stops=[{id:'one',name:'Paris',country:'France',latitude:48.85,longitude:2.35},{id:'two',name:'Madrid',country:'Spain',latitude:40.42,longitude:-3.7}] as EasyTTrip['stops'];
function leg(overrides:Record<string,unknown>={}) {
 return {id:'one-two',fromStopId:'one',toStopId:'two',mode:'flight',distanceKm:1050,durationMinutes:240,doorToDoorMinutes:240,headlineMinutes:120,routeMetadata:{},...overrides} as TripLeg;
}
function impact(status='known',precision='estimated-range',confidence='estimated') {
 const fact=(point:number,min:number,max:number)=>({status,confidence,value:status==='known'?{planningMinutes:point,precision,rangeMinutes:precision==='estimated-range'?{minimum:min,maximum:max}:null}:null});
 return {version:1,mode:'flight',headline:fact(120,100,140),doorToDoor:fact(240,210,270)};
}
function preview(value:TripLeg) {
 const before=structuredClone(value);
 const mapped=mapRouteLegsFromTrip({stops,legs:[value]})[0]!;
 const html=renderToStaticMarkup(createElement(loaded.exports.Preview,{leg:mapped}));
 assert.deepEqual(value,before,'render and projection must not mutate the source leg');
 return html;
}
test('map preview retains the same qualified ranges as the list formatter',()=>{
 const value=leg({routeMetadata:{transferImpact:impact()}});
 const html=preview(value);
 assert.ok(html.includes(transferTimingLabel(value,'headline')));
 assert.ok(html.includes(`Door-to-door ${transferTimingLabel(value)}`));
 assert.match(html,/Planning estimate/);
});
test('explicit unknown timing overrides stale numeric fields in map preview',()=>{
 const html=preview(leg({routeMetadata:{transferImpact:impact('unknown')}}));
 assert.match(html,/Not available/);
 assert.match(html,/Door-to-door Timing to confirm/i);
 assert.doesNotMatch(html,/~2h|~4h|Planning estimate/);
});
test('verified points are not relabelled approximate in the map',()=>{
 const html=preview(leg({routeMetadata:{transferImpact:impact('known','verified-point','verified')}}));
 assert.match(html,/<em>2h<\/em>/);
 assert.match(html,/Door-to-door 4h/);
 assert.doesNotMatch(html,/~2h|~4h/);
});
test('different-mode or malformed impact does not supply a missing headline',()=>{
 for(const data of [{...impact(),mode:'road'},{...impact(),version:2},{headline:{status:'known',value:{planningMinutes:120}}}]){
  const value=leg({headlineMinutes:null,routeMetadata:{transferImpact:data}});
  assert.match(preview(value),/<em>Not available<\/em>/);
 }
});
test('legacy numeric-only map input is not treated as qualified timing',()=>{
 const mapped=mapRouteLegsFromTrip({stops,legs:[leg()]})[0]!;
 delete mapped.headlineLabel; delete mapped.totalLabel;
 const before=structuredClone(mapped);
 const html=renderToStaticMarkup(createElement(loaded.exports.Preview,{leg:mapped}));
 assert.match(html,/Door-to-door Timing to confirm/i);
 assert.doesNotMatch(html,/~2h|~4h|Planning estimate/);
 assert.deepEqual(mapped,before);
});
test('road reference remains separate from an unavailable selected service',()=>{
 const value=leg({mode:'unknown',headlineMinutes:null,doorToDoorMinutes:null,durationMinutes:null,roadEstimate:{durationMinutes:825,distanceKm:1200,routeGeometry:[],warnings:['Check crossing restrictions.'],attribution:'Synthetic routing reference'}});
 const html=preview(value);
 assert.match(html,/Door-to-door Timing to confirm/i);
 assert.match(html,/Road estimate only · about 13h 45m driving/);
 assert.doesNotMatch(html,/Door-to-door ~13h/);
});
