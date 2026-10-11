import assert from "node:assert/strict";
import test from "node:test";
import { recoveryPersistenceOutcome, recoveryFailureMessage, reportPersistenceOutcome } from "../lib/easyt/persistence-outcome.ts";

test("entry bookkeeping, protected copies, native rejection and unknown evidence stay distinct", () => {
  const cases = [
    [{stored:true}, "device-confirmed"],
    [{stored:false,failureReason:"device-unavailable"}, "unknown"],
    [{stored:false,nativeFailure:"security"}, "native-write-failed"],
    [{stored:false,blockedByExistingRecovery:true}, "protected-conflict"],
    [{stored:false,failureReason:"receipt-incomplete",recoveryDurable:true}, "receipt-incomplete"],
    [{stored:true,pointerAcknowledged:false}, "pointer-incomplete"],
  ] as const;
  for (const [evidence, expected] of cases) {
    assert.equal(recoveryPersistenceOutcome(evidence), expected);
    if (!evidence.stored) for (const language of ["en","es"] as const) {
      assert.doesNotMatch(recoveryFailureMessage(evidence,language), /storage is blocked|quota|saved to.*account|guardado en.*cuenta/i);
    }
  }
});

test("local diagnostic serialization drops sensitive extras and arbitrary exception names", () => {
  const evidence = { stored:false, nativeFailure:"private-name", acknowledgement:"token", ownerId:"secret-owner", trip:"private-document", message:"private-message", receiptPresent:true };
  const detail = reportPersistenceOutcome("intake-ack", evidence as never);
  assert.deepEqual(Object.keys(detail).sort(), ["version","sequence","stage","phase","outcome","failureBoundary","writeAttempted","readbackConfirmed","deviceCopyVerified","pointerAcknowledged","nativeFailure","acknowledgement","scopeMatches","receiptPresent"].sort());
  assert.equal(detail.nativeFailure,"unknown");
  assert.equal(detail.acknowledgement,null);
  assert.equal(detail.deviceCopyVerified,false);
  assert.equal(detail.receiptPresent,true);
  assert.doesNotMatch(JSON.stringify(detail), /secret|private|token/);
});

test('diagnostic results identify first refusal without treating initial scope probes as writes',()=>{
 const probe=reportPersistenceOutcome('builder-entry',{stored:false,phase:'probe',scopeMatches:false,writeAttempted:false} as never);
 assert.equal(probe.phase,'probe');assert.equal(probe.writeAttempted,false);assert.equal(probe.failureBoundary,null);
 const refused=reportPersistenceOutcome('device-recovery',{stored:false,writeAttempted:true,readbackConfirmed:false,failureBoundary:'recovery-readback'} as never);
 assert.equal(refused.phase,'result');assert.equal(refused.failureBoundary,'recovery-readback');assert.equal(refused.writeAttempted,true);assert.equal(refused.readbackConfirmed,false);
 const incomplete=reportPersistenceOutcome('intake-ack',{stored:false,recoveryDurable:true,writeAttempted:true,readbackConfirmed:false,failureBoundary:'receipt-readback',failureReason:'receipt-incomplete'} as never);
 assert.equal(incomplete.deviceCopyVerified,true);assert.equal(incomplete.failureBoundary,'receipt-readback');
 const scope=reportPersistenceOutcome('builder-entry',{stored:false,failureReason:'scope-mismatch',writeAttempted:false} as never);
 assert.equal(scope.failureBoundary,'entry-scope');assert.equal(scope.writeAttempted,false);
});

test('diagnostic phase, boundary and write/readback metadata whitelist arbitrary values',()=>{
 const detail=reportPersistenceOutcome('builder-entry',{stored:false,phase:'private-phase',failureBoundary:'secret-boundary',writeAttempted:'private-value',readbackConfirmed:'private-value'} as never);
 assert.equal(detail.phase,'result');assert.equal(detail.failureBoundary,'unknown');assert.equal(detail.writeAttempted,null);assert.equal(detail.readbackConfirmed,null);
 assert.doesNotMatch(JSON.stringify(detail),/private|secret/);
});
