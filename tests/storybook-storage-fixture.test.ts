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
test('overlapping managed storage fixtures restore the original descriptor after out-of-order cleanup',()=>{
 const original={} as Storage,host={localStorage:original};
 const descriptor=Object.getOwnPropertyDescriptor(host,'localStorage');
 const cleanupA=installStoryStorageFault('getter',host);
 const cleanupB=installStoryStorageFault('write',host);
 cleanupA();assert.throws(()=>host.localStorage.setItem('x','y'),{name:'SecurityError'});
 cleanupB();
 assert.deepEqual(Object.getOwnPropertyDescriptor(host,'localStorage'),descriptor);
 cleanupA();cleanupB();
 assert.deepEqual(Object.getOwnPropertyDescriptor(host,'localStorage'),descriptor);assert.equal(host.localStorage,original);
});
test('nested storage cleanup preserves a still-active predecessor and unrelated later owners',()=>{
 const original={} as Storage,host={localStorage:original};
 const cleanupA=installStoryStorageFault('read',host),ownedA=Object.getOwnPropertyDescriptor(host,'localStorage');
 const cleanupB=installStoryStorageFault('write',host);cleanupB();
 assert.deepEqual(Object.getOwnPropertyDescriptor(host,'localStorage'),ownedA);
 const later={get:()=>original,configurable:true};Object.defineProperty(host,'localStorage',later);cleanupA();
 assert.equal(Object.getOwnPropertyDescriptor(host,'localStorage')?.get,later.get);
});
