import assert from 'node:assert/strict';import test from 'node:test';import{readFileSync}from'node:fs';import ts from'typescript';
import{explicit}from'./helpers/transport-revision-server.ts';import{japanTrip}from'./fixtures/transport-choice.ts';import{transportComparisonInput}from'../lib/easyt/transport-comparison.ts';
test('actual POST guard sends explicit comparison through real server revision finalizer, preserving envelope/source leg',async()=>{
 const source=readFileSync('app/api/journey-transfer-resolution/route.ts','utf8'),js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const mod={exports:{}};new Function('require','module','exports',js)(id=>{if(id==='next/server')return{NextResponse:{json:Response.json}};if(id==='@/lib/easyt/multimodal-transfer-resolution.server')return{compareTransferJourney:(leg,signal)=>explicit(leg,undefined,signal),assessCanonicalTransferJourneys:()=>assert.fail('must stay on explicit branch')};throw Error(id)},mod,mod.exports);
 const t=japanTrip(),leg=transportComparisonInput(t,t.legs[0].id),response=await mod.exports.POST(new Request('http://fixture.invalid/api/journey-transfer-resolution',{method:'POST',body:JSON.stringify({operation:'compare',legs:[leg]})}));
 assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');const raw=await response.json();assert.deepEqual(raw.leg,JSON.parse(JSON.stringify(leg)));assert.match(raw.diagnostic.candidates.find(c=>c.evidence==='routed_road').id,/^road:routed:revision-v1:/);
});
