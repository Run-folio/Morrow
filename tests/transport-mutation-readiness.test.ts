import assert from 'node:assert/strict';
import test from 'node:test';
import {tripMutationCanStart} from '../lib/easyt/trip-mutation-persistence.ts';
const ready={enabled:true,sessionPending:false,recoveryReady:true,scopeCurrent:true,ownerId:'owner-a',sessionOwnerId:'owner-a',protectedRecovery:false};
test('transport mutation readiness withholds actions through session and recovery hydration',()=>{
 assert.equal(tripMutationCanStart({...ready,sessionPending:true}),false);
 assert.equal(tripMutationCanStart({...ready,recoveryReady:false}),false);
 assert.equal(tripMutationCanStart({...ready,scopeCurrent:false}),false);
 assert.equal(tripMutationCanStart(ready),true);
});
test('transport mutation readiness preserves account and protected recovery boundaries',()=>{
 for(const patch of [{ownerId:'owner-b'},{sessionOwnerId:null},{protectedRecovery:true},{enabled:false}])assert.equal(tripMutationCanStart({...ready,...patch}),false);
 assert.equal(tripMutationCanStart({...ready,ownerId:null,sessionOwnerId:null}),true);
 assert.equal(tripMutationCanStart({...ready,ownerId:null,sessionOwnerId:'owner-a'}),true);
});
