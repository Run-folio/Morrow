import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { checkRuntimeHealth, runtimeDeploymentProvenance, runtimeHealthConfiguration } from "../lib/easyt/runtime-health.ts";

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
    deployment: { commit: "unknown", context: "unknown" },
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
    deployment: { commit: "unknown", context: "unknown" },
  });
});

test("health exposes a valid hosting commit without changing readiness", async () => {
  const commit = "A1B2C3D4E5F6789012345678901234567890ABCD";
  const health = await checkRuntimeHealth({ ...criticalEnvironment, COMMIT_REF: commit, CONTEXT: "production" }, async () => undefined);
  assert.deepEqual(health, {
    state: "ok",
    checks: { database: "ok", auth: "ok", applicationUrl: "ok" },
    deployment: { commit: commit.toLowerCase(), context: "production" },
  });
});

test("empty or malformed hosting metadata reports unknown without exposing its value", () => {
  for (const value of ["", "   ", "main", "abc123", "g".repeat(40), "a".repeat(39), "a".repeat(41)]) {
    assert.equal(runtimeDeploymentProvenance({ COMMIT_REF: value }).commit, "unknown");
  }
  assert.deepEqual(runtimeDeploymentProvenance({ COMMIT_REF: "not-a-secret-but-not-a-sha", CONTEXT: "private-context-name" }), {
    commit: "unknown",
    context: "unknown",
  });
});

test("build configuration forwards only bounded hosting provenance to the runtime", () => {
  const configuration = readFileSync(new URL("../next.config.ts", import.meta.url), "utf8");
  const route = readFileSync(new URL("../app/api/health/route.ts", import.meta.url), "utf8");
  assert.match(configuration, /process\.env\.COMMIT_REF \?\? process\.env\.VERCEL_GIT_COMMIT_SHA/);
  assert.match(configuration, /MORROVIA_BUILD_COMMIT: buildCommit/);
  assert.match(configuration, /MORROVIA_BUILD_CONTEXT: buildContext/);
  assert.doesNotMatch(configuration, /env:\s*process\.env/);
  assert.match(route, /MORROVIA_BUILD_COMMIT: process\.env\.MORROVIA_BUILD_COMMIT/);
  assert.match(route, /MORROVIA_BUILD_CONTEXT: process\.env\.MORROVIA_BUILD_CONTEXT/);
});

test("a database failure is a 503-ready unhealthy state without provider error detail", async () => {
  const health = await checkRuntimeHealth(criticalEnvironment, async () => { throw new Error("connection text must not escape"); });
  assert.deepEqual(health, {
    state: "unhealthy",
    checks: { database: "unreachable", auth: "ok", applicationUrl: "ok" },
    deployment: { commit: "unknown", context: "unknown" },
  });
});
