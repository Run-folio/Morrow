import assert from "node:assert/strict";
import test from "node:test";

import { runStagingSeed } from "../scripts/staging-seed-workflow.mjs";
import { TEST_ACCOUNTS } from "../scripts/staging-safety.mjs";

const credentials = Object.fromEntries(TEST_ACCOUNTS.map((account, index) => [
  account.passwordKey,
  `disposable-test-password-${index}-never-output`,
]));

function successfulOperations(events: string[] = []) {
  return {
    getPassword: (key: string) => credentials[key],
    signUp: async ({ email }: { email: string }) => { events.push(`signup:${email}`); return { ok: true, status: 200 }; },
    markVerified: async (email: string) => { events.push(`verify:${email}`); },
    closeDatabase: async () => { events.push("close-database"); },
    signIn: async ({ email }: { email: string }) => { events.push(`signin:${email}`); return { ok: true, status: 200 }; },
  };
}

test("staging seed verifies both allowlisted accounts before requiring successful sign-ins", async () => {
  const events: string[] = [];
  const result = await runStagingSeed({ ...successfulOperations(events) });

  assert.deepEqual(events, [
    `signup:${TEST_ACCOUNTS[0].email}`,
    `verify:${TEST_ACCOUNTS[0].email}`,
    `signup:${TEST_ACCOUNTS[1].email}`,
    `verify:${TEST_ACCOUNTS[1].email}`,
    "close-database",
    `signin:${TEST_ACCOUNTS[0].email}`,
    `signin:${TEST_ACCOUNTS[1].email}`,
  ]);
  assert.deepEqual(result, {
    verified: true,
    seededAccounts: TEST_ACCOUNTS.map(({ name, email }) => ({ name, email })),
  });
});

test("staging seed rejects any account set other than the two exact disposable accounts", async () => {
  const operations = successfulOperations();
  await assert.rejects(
    runStagingSeed({ ...operations, accounts: [{ name: "Other", email: "other@example.com", passwordKey: "OTHER_PASSWORD" }] }),
    /exact disposable staging accounts/,
  );
});

test("staging seed cannot report success until every account signs in", async () => {
  const events: string[] = [];
  const operations = successfulOperations(events);
  operations.signIn = async ({ email }: { email: string }) => {
    events.push(`signin:${email}`);
    return { ok: email === TEST_ACCOUNTS[0].email, status: email === TEST_ACCOUNTS[0].email ? 200 : 403 };
  };

  await assert.rejects(runStagingSeed(operations), /Test User B sign-in failed \(HTTP 403\)/);
  assert.equal(events.filter((event) => event.startsWith("signin:")).length, 2);
});

test("staging seed errors and its success report never serialize passwords or provider secrets", async () => {
  const secret = credentials[TEST_ACCOUNTS[0].passwordKey];
  const token = "provider-private-token-value";
  const report = await runStagingSeed(successfulOperations());
  assert.equal(JSON.stringify(report).includes(secret), false);
  assert.equal(JSON.stringify(report).includes(token), false);

  const operations = successfulOperations();
  operations.signIn = async () => { throw new Error(`${secret} ${token}`); };
  await assert.rejects(async () => {
    try {
      await runStagingSeed(operations);
    } catch (error) {
      const serialized = JSON.stringify(error);
      assert.equal(serialized.includes(secret), false);
      assert.equal(serialized.includes(token), false);
      throw error;
    }
  }, /sign-in failed/);
});
