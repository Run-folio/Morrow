import assert from 'node:assert/strict';import test from 'node:test';
import {completeOwnerSignOut as finish} from '../lib/easyt/durable-owner-address.ts';
test('explicit sign-out cannot silently clear auth after failed address revocation; retry completes once retirement verifies',async()=>{let retired=false,signedOut=0;const retire=async()=>retired,signOut=async()=>{signedOut++;};assert.equal(await finish(retire,signOut),false);assert.equal(signedOut,0);retired=true;assert.equal(await finish(retire,signOut),true);assert.equal(signedOut,1);});
