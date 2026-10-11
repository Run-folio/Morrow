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
  assert.deepEqual(Object.keys(detail).sort(), ["version","sequence","stage","outcome","deviceCopyVerified","pointerAcknowledged","nativeFailure","acknowledgement","scopeMatches","receiptPresent"].sort());
  assert.equal(detail.nativeFailure,"unknown");
  assert.equal(detail.acknowledgement,null);
  assert.equal(detail.deviceCopyVerified,false);
  assert.equal(detail.receiptPresent,true);
  assert.doesNotMatch(JSON.stringify(detail), /secret|private|token/);
});
