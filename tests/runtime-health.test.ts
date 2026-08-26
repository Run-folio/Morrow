import assert from "node:assert/strict";
import test from "node:test";

import { checkRuntimeHealth, runtimeHealthConfiguration } from "../lib/easyt/runtime-health.ts";

const criticalEnvironment = {
  DATABASE_URL: "postgresql://app:secret@db.example/morrovia?sslmode=require",
  BETTER_AUTH_SECRET: "test-secret",
  NEXT_PUBLIC_APP_URL: "https://morrovia.example",
  BETTER_AUTH_URL: "https://morrovia.example",
};

test("health fails closed when critical database, auth, or base-url configuration is absent", async () => {
  const health = await checkRuntimeHealth({}, async () => { throw new Error("must not probe"); });
  assert.deepEqual(health, {
    state: "unhealthy",
    checks: { database: "missing", auth: "missing", applicationUrl: "missing" },
  });
});

test("health rejects invalid or mismatched public/auth URLs without revealing their values", () => {
  assert.equal(runtimeHealthConfiguration({ ...criticalEnvironment, BETTER_AUTH_URL: "javascript:alert(1)" }).checks.applicationUrl, "invalid");
  assert.equal(runtimeHealthConfiguration({ ...criticalEnvironment, BETTER_AUTH_URL: "https://backup.example" }).checks.applicationUrl, "mismatch");
});

test("health does not claim a configured database is unreachable when another critical check prevents probing it", async () => {
  const health = await checkRuntimeHealth({ ...criticalEnvironment, BETTER_AUTH_SECRET: undefined }, async () => { throw new Error("must not probe"); });
  assert.equal(health.checks.database, "not_checked");
  assert.equal(health.checks.auth, "missing");
});

test("health reports a successful database probe only after complete critical configuration", async () => {
  const health = await checkRuntimeHealth(criticalEnvironment, async () => undefined);
  assert.deepEqual(health, {
    state: "ok",
    checks: { database: "ok", auth: "ok", applicationUrl: "ok" },
  });
});

test("a database failure is a 503-ready unhealthy state without provider error detail", async () => {
  const health = await checkRuntimeHealth(criticalEnvironment, async () => { throw new Error("connection text must not escape"); });
  assert.deepEqual(health, {
    state: "unhealthy",
    checks: { database: "unreachable", auth: "ok", applicationUrl: "ok" },
  });
});
