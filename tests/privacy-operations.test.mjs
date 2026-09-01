import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  createDisposablePrivacyFixture,
  simulateAccessRequest,
  simulateCurrentDeletion,
  summarizeExercise,
} from "../scripts/privacy-rights-mock.mjs";

const root = new URL("../", import.meta.url);

test("disposable access exercise finds every operational search category without exporting secrets", () => {
  const access = simulateAccessRequest(createDisposablePrivacyFixture());
  assert.equal(access.account.length, 1);
  assert.equal(access.trips.length, 1);
  assert.equal(access.booking.candidates.length, 1);
  assert.equal(access.feedback.length, 1);
  assert.equal(access.emailEvents.length, 1);
  assert.equal(access.gifts.length, 1);
  assert.equal(access.auditReferences.length, 1);
  assert.equal(access.localDevice.length, 1);
  assert.equal(access.providerCopies.length, 1);
  assert.equal(JSON.stringify(access).includes("NEVER_EXPORT_A_HASH"), false);
  assert.equal(JSON.stringify(access).includes("NEVER_EXPORT_A_TOKEN"), false);
});

test("current deletion simulation exposes rather than hides known residuals", () => {
  const after = simulateCurrentDeletion(createDisposablePrivacyFixture());
  assert.equal(after.users.length, 0);
  assert.equal(after.authUsers.length, 0);
  assert.equal(after.authAccounts.length, 0);
  assert.equal(after.sessions.length, 0);
  assert.equal(after.verifications.length, 0);
  assert.equal(after.trips.length, 0);
  assert.equal(after.bookingCandidates.length, 0);
  assert.equal(after.feedback.length, 0);
  assert.equal(after.emailEvents.length, 1);
  assert.equal(after.gifts.length, 1);
  assert.equal(after.bookingImportEvents[0].ownerId, null);
  assert.equal(after.bookingImportEvents[0].candidateId, null);
  assert.equal(after.localDevice.length, 1);
  assert.equal(after.providerCopies.length, 1);
  assert.equal(after.adminAudit.some((row) => row.action === "account_deleted"), true);
});

test("exercise is explicitly disposable and reports manual follow-up", () => {
  const result = summarizeExercise();
  assert.equal(result.fixture.disposable, true);
  assert.equal(result.fixture.databaseOpened, false);
  assert.equal(result.fixture.providerCalled, false);
  assert.equal(result.access.passwordHashExported, false);
  assert.equal(result.access.verificationTokenExported, false);
  assert.equal(result.deletion.canonicalAccountRemaining, false);
  assert.equal(result.deletion.emailEventResiduals, 1);
  assert.equal(result.deletion.recipientGiftResiduals, 1);
  assert.equal(result.verdict, "manual_residual_search_required");
});

test("operations document contains every launch gate and canonical identity", async () => {
  const document = await readFile(new URL("docs/privacy-operations.md", root), "utf8");
  for (const required of [
    "Shaun Whiting Limited, trading as Morrovia",
    "PUBLIC LAUNCH NOT READY",
    "Processing inventory",
    "Processor, recipient and subprocessor register",
    "International-transfer map",
    "Retention schedule",
    "Data-rights workflow",
    "Account-closure reality",
    "Incident and personal-data-breach runbook",
    "ICO data-protection fee action",
    "EU Article 27 representative question",
    "Public-notice reconciliation",
    "PENDING HUMAN ACTION",
  ]) assert.match(document, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("documented deletion reality matches the production deletion transaction", async () => {
  const implementation = await readFile(new URL("lib/easyt/admin-content.ts", root), "utf8");
  const document = await readFile(new URL("docs/privacy-operations.md", root), "utf8");
  for (const fragment of [
    "delete from easyt_feedback",
    'delete from "session"',
    "delete from account",
    "delete from verification",
    "delete from easyt_users",
    'delete from "user"',
    "'account_deleted'",
  ]) assert.match(implementation, new RegExp(fragment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.doesNotMatch(implementation, /delete from easyt_email_events/);
  assert.match(document, /current account deletion does not remove email events/i);
});
