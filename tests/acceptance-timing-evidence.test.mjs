import assert from 'node:assert/strict';
import test from 'node:test';
import {acceptanceWindowEvidence,timingTraceOptions} from './helpers/acceptance-timing-evidence.mjs';

test('keeps acceptance long tasks including tasks that started before activation',()=>{
 const record={start:100,end:300},tasks=[{start:20,duration:20},{start:80,duration:30},{start:130,duration:60},{start:290,duration:50},{start:300,duration:60},{start:400,duration:100}];
 assert.deepEqual(acceptanceWindowEvidence(record,tasks),{start:100,end:300,elapsedMs:200,longTasks:[{start:80,duration:30},{start:130,duration:60},{start:290,duration:50}]});
 assert.deepEqual(record,{start:100,end:300});assert.equal(tasks.length,6);
});
test('retains a trace for a timing failure even when functional assertions pass',()=>{
 assert.deepEqual(timingTraceOptions('/tmp/evidence','multi-area-390',true),{path:'/tmp/evidence/multi-area-390-timing.zip'});
 assert.equal(timingTraceOptions('/tmp/evidence','multi-area-390',false),undefined);
});
for(const record of [null,{start:null,end:100},{start:200,end:100},{start:100,end:Infinity}])test(`rejects incomplete timing ${JSON.stringify(record)}`,()=>{
 assert.throws(()=>acceptanceWindowEvidence(record,[]),TypeError);
});
