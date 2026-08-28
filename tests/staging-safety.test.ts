import assert from "node:assert/strict";
import test from "node:test";

import { missingStagingSchemaColumns, validateStagingProviderPolicy } from "../scripts/staging-safety.mjs";

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
