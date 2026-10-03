import assert from "node:assert/strict";
import test from "node:test";

import {
  loadStagingConfig,
  markDisposableTestAccountEmailVerified,
  missingStagingSchemaColumns,
  missingStagingSchemaConstraints,
  TEST_ACCOUNTS,
  validateStagingProviderPolicy,
} from "../scripts/staging-safety.mjs";

test("staging provider policy makes Luna-only access explicit", () => {
  assert.equal(validateStagingProviderPolicy({ MORROVIA_STAGING_PROVIDER_MODE: "disabled" }), "disabled");
  assert.throws(
    () => validateStagingProviderPolicy({ MORROVIA_STAGING_PROVIDER_MODE: "disabled", OPENAI_API_KEY: "configured" }),
    /OPENAI_API_KEY must be unset/,
  );
  assert.throws(
    () => validateStagingProviderPolicy({ MORROVIA_STAGING_PROVIDER_MODE: "openai-only" }),
    /OPENAI_API_KEY is required/,
  );
  assert.equal(
    validateStagingProviderPolicy({ MORROVIA_STAGING_PROVIDER_MODE: "openai-only", OPENAI_API_KEY: "configured" }),
    "openai-only",
  );
  assert.throws(
    () => validateStagingProviderPolicy({ MORROVIA_STAGING_PROVIDER_MODE: "openai-only", OPENAI_API_KEY: "configured", GROQ_API_KEY: "configured" }),
    /GROQ_API_KEY must be unset/,
  );
});

test("staging preflight rejects an old persistence schema even when its tables exist", () => {
  const missing = missingStagingSchemaColumns([
    { table_name: "easyt_users", column_name: "id" },
    { table_name: "easyt_users", column_name: "email" },
    { table_name: "easyt_trips", column_name: "id" },
    { table_name: "easyt_country_stamps", column_name: "owner_id" },
    { table_name: "easyt_country_memories", column_name: "owner_id" },
  ]);

  assert.deepEqual(missing, [
    "easyt_users.preferences",
    "easyt_trips.owner_id",
    "easyt_trips.document",
    "easyt_trips.deleted_at",
    "easyt_legs.id",
    "easyt_legs.trip_id",
    "easyt_legs.from_stop_id",
    "easyt_legs.to_stop_id",
    "easyt_legs.from_endpoint_id",
    "easyt_legs.to_endpoint_id",
    "easyt_legs.from_endpoint_kind",
    "easyt_legs.to_endpoint_kind",
    "easyt_copilot_previews.id",
    "easyt_copilot_previews.owner_id",
    "easyt_copilot_previews.trip_id",
    "easyt_copilot_previews.action",
    "easyt_copilot_previews.status",
    "easyt_copilot_previews.expires_at",
    "easyt_country_stamps.country_id",
    "easyt_country_memories.country_id",
  ]);
});

test("staging preflight accepts the current persistence schema contract", () => {
  const rows = [
    ["easyt_users", "id"], ["easyt_users", "email"], ["easyt_users", "preferences"],
    ["easyt_trips", "id"], ["easyt_trips", "owner_id"], ["easyt_trips", "document"], ["easyt_trips", "deleted_at"],
    ["easyt_legs", "id"], ["easyt_legs", "trip_id"], ["easyt_legs", "from_stop_id"], ["easyt_legs", "to_stop_id"],
    ["easyt_legs", "from_endpoint_id"], ["easyt_legs", "to_endpoint_id"], ["easyt_legs", "from_endpoint_kind"], ["easyt_legs", "to_endpoint_kind"],
    ["easyt_copilot_previews", "id"], ["easyt_copilot_previews", "owner_id"], ["easyt_copilot_previews", "trip_id"],
    ["easyt_copilot_previews", "action"], ["easyt_copilot_previews", "status"], ["easyt_copilot_previews", "expires_at"],
    ["easyt_country_stamps", "owner_id"], ["easyt_country_stamps", "country_id"],
    ["easyt_country_memories", "owner_id"], ["easyt_country_memories", "country_id"],
  ].map(([table_name, column_name]) => ({ table_name, column_name }));

  assert.deepEqual(missingStagingSchemaColumns(rows), []);
});

test("staging preflight requires the canonical journey-end persistence constraint", () => {
  assert.deepEqual(missingStagingSchemaConstraints([{
    constraint_name: "easyt_legs_to_endpoint_kind_check",
    definition: "CHECK ((to_endpoint_kind = ANY (ARRAY['origin'::text, 'stop'::text])))",
  }]), ["easyt_legs_to_endpoint_kind_check:end"]);
  assert.deepEqual(missingStagingSchemaConstraints([{
    constraint_name: "easyt_legs_to_endpoint_kind_check",
    definition: "CHECK ((to_endpoint_kind = ANY (ARRAY['origin'::text, 'stop'::text, 'end'::text])))",
  }]), []);
});

test("the verified seed mutation accepts only exact disposable account emails", async () => {
  const seen: Array<{ sql: string; params: unknown[] }> = [];
  const client = { query: async (sql: string, params: unknown[] = []) => {
    seen.push({ sql, params });
    if (sql.includes("information_schema.columns")) {
      return { rowCount: 1, rows: [{ column_name: "emailVerified", data_type: "boolean", is_nullable: "NO" }] };
    }
    if (sql.startsWith('select id, email from "user"')) {
      return { rowCount: 1, rows: [{ id: "user-a", email: TEST_ACCOUNTS[0].email }] };
    }
    return { rowCount: 1, rows: [{ id: "user-a" }] };
  } };

  await markDisposableTestAccountEmailVerified(client, TEST_ACCOUNTS[0].email);
  const update = seen.at(-1);
  assert.ok(update);
  assert.equal(update.params[1], TEST_ACCOUNTS[0].email);
  assert.match(update.sql, /update "user" set "emailVerified" = true/i);
});

test("the verified seed mutation rejects arbitrary emails before querying", async () => {
  let queries = 0;
  const client = { query: async () => { queries += 1; return { rowCount: 0, rows: [] }; } };
  await assert.rejects(
    markDisposableTestAccountEmailVerified(client, "traveller@example.com"),
    /not an approved disposable staging account/,
  );
  assert.equal(queries, 0);
});

test("staging seed configuration rejects a production environment", () => {
  assert.throws(() => loadStagingConfig({ MORROVIA_ENVIRONMENT: "production" }), /must be exactly staging/);
});

test("verified seed mutation fails closed when the Better Auth field is absent", async () => {
  const client = { query: async (sql: string) => sql.includes("information_schema.columns")
    ? { rowCount: 0, rows: [] }
    : { rowCount: 0, rows: [] } };
  await assert.rejects(markDisposableTestAccountEmailVerified(client, TEST_ACCOUNTS[0].email), /emailVerified.*boolean column/);
});

test("verified seed mutation fails closed when the Better Auth user is missing or ambiguous", async (t) => {
  for (const rows of [[], [
    { id: "user-a", email: TEST_ACCOUNTS[0].email },
    { id: "user-a-duplicate", email: TEST_ACCOUNTS[0].email.toUpperCase() },
  ]]) {
    await t.test(rows.length ? "ambiguous" : "missing", async () => {
      const client = { query: async (sql: string) => sql.includes("information_schema.columns")
        ? { rowCount: 1, rows: [{ column_name: "emailVerified", data_type: "boolean", is_nullable: "NO" }] }
        : { rowCount: rows.length, rows } };
      await assert.rejects(markDisposableTestAccountEmailVerified(client, TEST_ACCOUNTS[0].email), /exactly one Better Auth user/);
    });
  }
});

test("verified seed mutation requires exactly one updated Better Auth row", async (t) => {
  for (const rowCount of [0, 2]) {
    await t.test(`row count ${rowCount}`, async () => {
      const client = { query: async (sql: string) => {
        if (sql.includes("information_schema.columns")) return { rowCount: 1, rows: [{ column_name: "emailVerified", data_type: "boolean", is_nullable: "NO" }] };
        if (sql.startsWith('select id, email from "user"')) return { rowCount: 1, rows: [{ id: "user-a", email: TEST_ACCOUNTS[0].email }] };
        return { rowCount, rows: [] };
      } };
      await assert.rejects(markDisposableTestAccountEmailVerified(client, TEST_ACCOUNTS[0].email), /exactly one Better Auth user row/);
    });
  }
});
