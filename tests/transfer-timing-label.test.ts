import assert from 'node:assert/strict';
import test from 'node:test';
import {aggregateTransferTimingLabel,transferTimingLabel} from '../lib/easyt/transfer-timing-label.ts';

const input=(confidence='estimated',precision='planning-allowance',rangeMinutes:unknown=null)=>({mode:'flight',doorToDoorMinutes:240,headlineMinutes:null,transferImpact:{version:1,mode:'flight',doorToDoor:{status:'known',confidence,value:{planningMinutes:240,precision,rangeMinutes}},headline:{status:'unknown',value:null,confidence:'unknown'}}});
test('total allowances, verified points, ranges and unknown airborne timing stay distinct',()=>{
 assert.equal(transferTimingLabel(input()),'~4h');
 assert.equal(transferTimingLabel(input(),'headline','Not available'),'Not available');
 assert.equal(transferTimingLabel(input('verified','verified-point')),'4h');
 assert.equal(transferTimingLabel(input('estimated','estimated-range',{minimum:210,maximum:270})),'~3h 30m–4h 30m');
 assert.equal(transferTimingLabel({doorToDoorMinutes:null,durationMinutes:null}),'Timing to confirm');
});
test('malformed or stale impact cannot invent a range or replace a selected total',()=>{
 for(const malformed of [null,[],{doorToDoor:{status:'known'}},{doorToDoor:{status:'known',value:{planningMinutes:NaN}}}]){
  assert.equal(transferTimingLabel({doorToDoorMinutes:240,transferImpact:malformed}),'~4h');
 }
 assert.equal(transferTimingLabel({...input('estimated','estimated-range',{minimum:210,maximum:270}),doorToDoorMinutes:825}),'~13h 45m');
 assert.equal(transferTimingLabel(input('estimated','estimated-range',{minimum:999,maximum:1})),'~4h');
});

test('a different mode or metadata version cannot lend verified precision to the current leg',()=>{
 const stale=input('verified','verified-point');stale.transferImpact.mode='road';assert.equal(transferTimingLabel(stale),'~4h');
 stale.transferImpact.mode='flight';stale.transferImpact.version=2;assert.equal(transferTimingLabel(stale),'~4h');
});

test('mixed and walking timing use the existing impact mode convention',()=>{
 const mixed={...input('estimated','estimated-range',{minimum:210,maximum:270}),mode:'mixed',segments:[{mode:'road'},{mode:'flight'}]};
 assert.equal(transferTimingLabel(mixed),'~3h 30m–4h 30m');
 const walk={...input('estimated','estimated-range',{minimum:210,maximum:270}),mode:'walk'};walk.transferImpact.mode='road';
 assert.equal(transferTimingLabel(walk),'~3h 30m–4h 30m');
});

test('aggregate totals preserve exact points, defensible ranges and explicit unknowns',()=>{
 assert.equal(aggregateTransferTimingLabel([input('verified','verified-point'),input('verified','verified-point')]),'8h');
 assert.equal(aggregateTransferTimingLabel([input('estimated','estimated-range',{minimum:210,maximum:270}),input('estimated','estimated-range',{minimum:210,maximum:270})]),'~7h–9h');
 assert.equal(aggregateTransferTimingLabel([input(),input('estimated','estimated-range',{minimum:210,maximum:270})]),'~8h');
 const unknown=input();unknown.transferImpact.doorToDoor={status:'unknown',confidence:'unknown',value:null} as any;assert.equal(aggregateTransferTimingLabel([input(),unknown]),'Timing to confirm');
});
