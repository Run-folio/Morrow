import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
test('motion policy gates replay, reduction and disabled controls',async()=>{
 assert.ok(existsSync(new URL('../lib/easyt/app-motion.ts',import.meta.url)), 'shared motion policy exists');
 const {createRevealGate,canSpring}=await import('../lib/easyt/app-motion.ts');
 const gate=createRevealGate();
 assert.equal(gate(false,false),false);
 assert.equal(gate(true,false),false);
 assert.equal(gate(true,true),true);
 assert.equal(gate(true,true),false);
 assert.equal(gate(true,false),false);
 assert.equal(gate(true,true),false,'query replacement must not replay');
 gate(false,false);assert.equal(gate(true,true),true,'new opening reveals');
 assert.equal(canSpring({reduced:true}),false);
 assert.equal(canSpring({disabled:true}),false);
 assert.equal(canSpring({excluded:true}),false);
 assert.equal(canSpring({}),true);
});

test('StrictMode transient setup does not consume the first painted reveal',async()=>{
 const {createRevealGate,scheduleReveal}=await import('../lib/easyt/app-motion.ts');
 const gate=createRevealGate(); let id=0; let plays=0; const frames=new Map();
 const request=fn=>{frames.set(++id,fn);return id;}; const cancel=id=>frames.delete(id);
 const flush=()=>{const pending=[...frames.values()];frames.clear();pending.forEach(fn=>fn(0));};
 const setup=()=>scheduleReveal(gate,()=>plays++,request,cancel);
 setup()(); // StrictMode setup -> cleanup before paint
 setup(); flush(); assert.equal(plays,1,'real setup still reveals');
 setup(); flush(); assert.equal(plays,1,'refinement does not replay');
 gate(false,false); const cleanup=setup(); gate(true,true); cleanup(); flush();
 assert.equal(plays,1,'immediate input cancels pre-paint reveal');
 gate(false,false); setup(); flush(); assert.equal(plays,2,'next opening reveals');
});
