import assert from 'node:assert/strict';
import test,{before,after} from 'node:test';
import {beginNewTripNavigation,type EasyTBrowserStorage} from '../lib/easyt/storage.ts';
import {invalidateBrowserRecoveryScope,browserRecoveryDriver} from '../lib/easyt/browser-recovery-persistence.ts';
import {IndexedDbModel} from './helpers/recovery-indexeddb-model.ts';
class NativeModel implements EasyTBrowserStorage {
  values=new Map<string,string>();get length(){return this.values.size}key(i:number){return [...this.values.keys()][i]??null}
  getItem(k:string){return this.values.get(k)??null}setItem(k:string,v:string){this.values.set(k,v)}removeItem(k:string){this.values.delete(k)}
}
const model=new IndexedDbModel(),storage=new NativeModel(),originalWindow=globalThis.window;
before(()=>{Object.defineProperty(globalThis,'window',{configurable:true,value:{localStorage:storage,indexedDB:model.factory(),addEventListener(){},dispatchEvent(){return true}}});});
after(async()=>{(await browserRecoveryDriver()).close?.();if(originalWindow===undefined)Reflect.deleteProperty(globalThis,'window');else Object.defineProperty(globalThis,'window',{configurable:true,value:originalWindow});});
function heldTarget() {
  let resolve!:(value:boolean)=>void,dispatches=0;
  const gate=new Promise<boolean>(done=>{resolve=done});
  const target={dispatchEvent(event:Event){dispatches++;(event as CustomEvent<{waitUntil:(work:Promise<boolean>)=>void}>).detail.waitUntil(gate);return true}};
  return {target,resolve,get dispatches(){return dispatches}};
}
const reset=()=>{model.data=new Map([['generations',new Map()],['heads',new Map()],['acknowledgements',new Map()]]);storage.values.clear();invalidateBrowserRecoveryScope();};
test('new-trip boundary pins owner epoch before preservation so a changed owner cannot clear its old pointer',async()=>{
  reset();const held=heldTarget(),work=beginNewTripNavigation('owner-a',held.target);invalidateBrowserRecoveryScope();held.resolve(true);
  assert.equal(await work,false);assert.equal(model.data.get('heads')!.size,0);assert.equal(storage.values.size,0);
});
test('new-trip caller guard is checked before dispatch and after delayed preservation',async()=>{
  for(const timing of ['before','during']) {
    reset();let active=timing!=='before';const held=heldTarget(),work=beginNewTripNavigation(null,held.target,()=>active);
    active=false;held.resolve(true);assert.equal(await work,false);assert.equal(model.data.get('heads')!.size,0);
    assert.equal(held.dispatches,timing==='before'?0:1);
  }
});
test('unchanged successful preservation clears only durable navigation metadata after the promise resolves',async()=>{
  reset();const held=heldTarget(),work=beginNewTripNavigation(null,held.target,()=>true);
  assert.equal(model.data.get('heads')!.size,0);held.resolve(true);assert.equal(await work,true);
  const pointer=model.data.get('heads')!.get(JSON.stringify([null]));assert.equal(JSON.parse(String(pointer)).backend,'cleared');assert.equal(model.data.get('generations')!.size,0);
});
test('false or rejected preservation never clears navigation and leaves storage untouched',async()=>{
  for(const result of [Promise.resolve(false),Promise.reject(new Error('Synthetic preservation refusal'))]) {
    reset();const target={dispatchEvent(event:Event){(event as CustomEvent<{waitUntil:(work:Promise<boolean>)=>void}>).detail.waitUntil(result);return true}};
    assert.equal(await beginNewTripNavigation(null,target,()=>true),false);assert.equal(model.data.get('heads')!.size,0);assert.equal(storage.values.size,0);
  }
});
test('exact recovery navigation acknowledgement reaches the guard only after accepted preservation',async()=>{
  reset();const acknowledgement={sourceHref:'https://synthetic.test/journey/new?inspire=route-a',tripId:'trip-a'};
  let complete!:(value:unknown)=>void;const pending=new Promise(done=>{complete=done});
  const seen:unknown[]=[];
  const target={dispatchEvent(event:Event){(event as CustomEvent<{waitUntil:(work:Promise<unknown>)=>void}>).detail.waitUntil(pending);return true}};
  const work=beginNewTripNavigation(null,target,(...args)=>{seen.push(args[0]);return true});
  assert.deepEqual(seen,[[]]);assert.equal(model.data.get('heads')!.size,0);
  complete({accepted:true,recoveryNavigation:acknowledgement});assert.equal(await work,true);
  assert.ok(seen.slice(1).every(value=>JSON.stringify(value)===JSON.stringify([acknowledgement])));
});
test('malformed or conflicting preservation acknowledgements and another refusal fail closed',async()=>{
  const acknowledgement={sourceHref:'https://synthetic.test/journey/new?inspire=route-a',tripId:'trip-a'};
  const cases=[
    [{accepted:true,recoveryNavigation:{...acknowledgement,tripId:''}}],
    [{accepted:true,recoveryNavigation:{...acknowledgement,sourceHref:42}}],
    [{accepted:true,recoveryNavigation:acknowledgement},{accepted:true,recoveryNavigation:{...acknowledgement,tripId:'trip-b'}}],
    [{accepted:true,recoveryNavigation:acknowledgement},false],
    [{accepted:'true',recoveryNavigation:acknowledgement}],
  ];
  for(const outcomes of cases) {
    reset();const target={dispatchEvent(event:Event){for(const outcome of outcomes)(event as CustomEvent<{waitUntil:(work:Promise<unknown>)=>void}>).detail.waitUntil(Promise.resolve(outcome));return true}};
    assert.equal(await beginNewTripNavigation(null,target,()=>true),false);assert.equal(model.data.get('heads')!.size,0);
  }
});
