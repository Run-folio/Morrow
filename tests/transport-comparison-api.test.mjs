import assert from 'node:assert/strict';import test from 'node:test';
import {realApiGuard} from './helpers/transfer-client-callers.mjs';
import {comparisonLeg} from './fixtures/transport-comparison.ts';
const request=body=>new Request('http://fixture.invalid/api/journey-transfer-resolution',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
test('actual API guard routes explicit single-leg comparison without replacing the input',async()=>{
 const leg=comparisonLeg(),response=await realApiGuard()(request({operation:'compare',legs:[leg]}));assert.equal(response.status,200);
 const result=await response.json();assert.deepEqual(result.leg,JSON.parse(JSON.stringify(leg)));assert.ok(result.diagnostic.candidates.some(c=>c.summaryMode==='train'));
 assert.equal(response.headers.get('cache-control'),'no-store');
});
for(const body of [{operation:'compare',legs:[]},{operation:'compare',legs:[comparisonLeg(),{...comparisonLeg(),id:'other'}]},{operation:'unrecognized',legs:[comparisonLeg()]}])test(`API rejects unsupported comparison envelope ${body.operation}/${body.legs.length}`,async()=>{assert.equal((await realApiGuard()(request(body))).status,400);});
