import assert from 'node:assert/strict';
import test from 'node:test';
import { installStoryStorageFault } from '../components/easyt/storybook/story-storage-fixture.ts';
for (const mode of ['getter','read','write'] as const) test(`isolated ${mode} denial preserves prior storage and restores its descriptor`,()=>{
 let nativeReads=0,nativeWrites=0;
 const original={getItem(){nativeReads++;return 'prior';},setItem(){nativeWrites++;}} as unknown as Storage;
 const host={localStorage:original};
 const descriptor=Object.getOwnPropertyDescriptor(host,'localStorage');
 const cleanup=installStoryStorageFault(mode,host);
 if(mode==='getter')assert.throws(()=>host.localStorage,{name:'SecurityError'});
 else if(mode==='read')assert.throws(()=>host.localStorage.getItem('anything'),{name:'SecurityError'});
 else{assert.equal(host.localStorage.getItem('anything'),null);assert.throws(()=>host.localStorage.setItem('anything','new'),{name:'SecurityError'});}
 assert.equal(nativeReads,0);assert.equal(nativeWrites,0);cleanup();cleanup();
 assert.deepEqual(Object.getOwnPropertyDescriptor(host,'localStorage'),descriptor);assert.equal(host.localStorage,original);
});
