import assert from 'node:assert/strict';
import test from 'node:test';
import * as analytics from '../lib/easyt/trip-save-analytics.ts';

const trip = {id:'synthetic-trip',ownerId:'owner-a',updatedAt:'2026-11-11T01:00:00Z'};
const scope = {ownerId:'owner-a',isCurrent:true};
test('only a consented exact account acknowledgement emits, once per revision within this mount',()=>{
  const calls:unknown[]=[];let consent=false;
  const record=analytics.createBuilderSaveAcknowledgementTracker({hasConsent:()=>consent,emit:p=>calls.push(p)});
  record({accountAcknowledged:true,outcome:'acknowledged'},trip,scope);assert.equal(calls.length,0);
  consent=true;
  record({accountAcknowledged:false,outcome:'storage-failed'},trip,scope);
  record({accountAcknowledged:true,outcome:'invalid-canonical'},trip,scope);
  record({accountAcknowledged:true,outcome:'acknowledged'},trip,{...scope,isCurrent:false});
  record({accountAcknowledged:true,outcome:'acknowledged'},trip,{...scope,ownerId:'owner-b'});
  record({accountAcknowledged:true,outcome:'acknowledged'},{...trip,ownerId:null},{ownerId:null,isCurrent:true});
  assert.equal(calls.length,0,'ownership and a client save label cannot establish an account acknowledgement');
  record({accountAcknowledged:true,outcome:'acknowledged'},trip,scope);
  record({accountAcknowledged:true,outcome:'acknowledged'},{...trip},scope);
  assert.deepEqual(calls,[{trip_id:'synthetic-trip',trip_source:'builder'}]);
  record({accountAcknowledged:true,outcome:'acknowledged'},{...trip,updatedAt:'2026-11-11T01:01:00Z'},scope);
  assert.equal(calls.length,2);
});
test('server acknowledgement remains measurable when later device cleanup fails; analytics failure cannot affect saving',()=>{
  const calls:unknown[]=[];
  const record=analytics.createBuilderSaveAcknowledgementTracker({hasConsent:()=>true,emit:p=>{calls.push(p);throw Error('vendor failed');}});
  assert.doesNotThrow(()=>record({accountAcknowledged:true,outcome:'storage-failed'},trip,scope));
  assert.deepEqual(calls,[{trip_id:'synthetic-trip',trip_source:'builder'}]);
});
