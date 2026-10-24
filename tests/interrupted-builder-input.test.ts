import assert from 'node:assert/strict';
import test from 'node:test';
import {retainInterruptedBuilderInput,readInterruptedBuilderInputs,interruptedInputKey,type InterruptedBuilderInput} from '../lib/easyt/interrupted-builder-input.ts';
import {createBuilderInputDraft,updateBuilderInputDraft} from '../lib/easyt/trip-builder-input-draft.ts';
import {requireReadableTripDocument} from '../lib/easyt/trip-document.ts';
import {saveReopenTripFixture} from './fixtures/save-reopen-trip.ts';
class Memory {values=new Map<string,string>();get length(){return this.values.size;}key(i:number){return [...this.values.keys()][i]??null;}getItem(k:string){return this.values.get(k)??null;}setItem(k:string,v:string){this.values.set(k,v);}removeItem(k:string){throw Error('deletion forbidden');}}
const capture=(id='capture-a'):InterruptedBuilderInput=>{const trip=requireReadableTripDocument(saveReopenTripFixture());return{version:1,ownerId:trip.ownerId,tripId:trip.id,captureId:id,entryKey:'entry-a',draft:updateBuilderInputDraft(createBuilderInputDraft(trip,0,trip.ownerId),trip,{kind:'origin'},'unfinished origin',trip.ownerId)};};
test('immutable retention survives reopen, isolates owner and trip, and never rewrites existing branches',()=>{
 const storage=new Memory(),record=capture();storage.setItem('existing-active-draft','protected bytes');
 assert.deepEqual(retainInterruptedBuilderInput(storage,record),{kind:'verified'});
 const before=new Map(storage.values);assert.deepEqual(retainInterruptedBuilderInput(storage,record),{kind:'verified'});assert.deepEqual(storage.values,before);
 assert.deepEqual(readInterruptedBuilderInputs(storage,record.ownerId,record.tripId),{records:[record],unreadable:false});
 assert.deepEqual(readInterruptedBuilderInputs(storage,'owner-b',record.tripId),{records:[],unreadable:false});
 assert.deepEqual(readInterruptedBuilderInputs(storage,record.ownerId,'different-trip'),{records:[],unreadable:false});
 assert.equal(storage.getItem('existing-active-draft'),'protected bytes');
});
test('occupied ID and malformed or foreign payload cannot overwrite a record',()=>{
 const storage=new Memory(),record=capture();retainInterruptedBuilderInput(storage,record);const before=new Map(storage.values);
 assert.equal(retainInterruptedBuilderInput(storage,{...record,entryKey:'other'}).kind,'protected');
 assert.equal(retainInterruptedBuilderInput(storage,{...record,captureId:'foreign',draft:{...record.draft,ownerId:'owner-b'}}).kind,'protected');
 assert.deepEqual(storage.values,before);
 storage.setItem(interruptedInputKey({...record,captureId:'corrupt'}),'{broken');
 assert.equal(readInterruptedBuilderInputs(storage,record.ownerId,record.tripId).unreadable,true);
 assert.equal(storage.getItem(interruptedInputKey({...record,captureId:'corrupt'})),'{broken');
});
test('quota is not an ACK and retry retains the same identity',()=>{
 const storage=new Memory(),record=capture(),setter=storage.setItem.bind(storage);
 storage.setItem=()=>{throw new DOMException('quota','QuotaExceededError');};
 assert.deepEqual(retainInterruptedBuilderInput(storage,record),{kind:'unavailable',reason:'storage'});assert.equal(storage.length,0);
 storage.setItem=setter;assert.equal(retainInterruptedBuilderInput(storage,record).kind,'verified');assert.equal(storage.length,1);
});
test('uncertain readback does not claim retention and same-ID retry never duplicates',()=>{
 const storage=new Memory(),record=capture(),getter=storage.getItem.bind(storage);let hidden=true;
 storage.getItem=k=>hidden?null:getter(k);
 assert.deepEqual(retainInterruptedBuilderInput(storage,record),{kind:'unavailable',reason:'readback'});assert.equal(storage.length,1);
 hidden=false;assert.equal(retainInterruptedBuilderInput(storage,record).kind,'verified');assert.equal(storage.length,1);
});
test('bounded retention refuses capacity without evicting any capture',()=>{
 const storage=new Memory();for(let i=0;i<16;i++)assert.equal(retainInterruptedBuilderInput(storage,capture('capture-'+i)).kind,'verified');
 const before=new Map(storage.values);assert.deepEqual(retainInterruptedBuilderInput(storage,capture('overflow')),{kind:'unavailable',reason:'capacity'});assert.deepEqual(storage.values,before);
});
test('a decoder never adopts malformed field bindings or selects a newer-looking branch',()=>{
 const storage=new Memory(),first=capture('one'),second=capture('two');
 retainInterruptedBuilderInput(storage,first);retainInterruptedBuilderInput(storage,second);
 assert.equal(readInterruptedBuilderInputs(storage,first.ownerId,first.tripId).records.length,2);
 const invalid={...first,captureId:'bad',draft:{...first.draft,fields:[{...first.draft.fields[0],basisKey:'wrong'}]}};
 assert.equal(retainInterruptedBuilderInput(storage,invalid).kind,'protected');assert.equal(storage.length,2);
});
