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
