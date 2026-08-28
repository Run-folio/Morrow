import { Client } from "pg";

export const TEST_ACCOUNTS = [
  { name: "Test User A", email: "test-user-a@morrovia-staging.test", passwordKey: "STAGING_TEST_PASSWORD_A" },
  { name: "Test User B", email: "test-user-b@morrovia-staging.test", passwordKey: "STAGING_TEST_PASSWORD_B" },
];

export const REQUIRED_STAGING_SCHEMA_COLUMNS = {
  easyt_users: ["id", "email", "preferences"],
  easyt_trips: ["id", "owner_id", "document", "deleted_at"],
  easyt_legs: ["id", "trip_id", "from_stop_id", "to_stop_id", "from_endpoint_id", "to_endpoint_id", "from_endpoint_kind", "to_endpoint_kind"],
  easyt_copilot_previews: ["id", "owner_id", "trip_id", "action", "status", "expires_at"],
  easyt_country_stamps: ["owner_id", "country_id"],
  easyt_country_memories: ["owner_id", "country_id"],
};

export function missingStagingSchemaColumns(rows) {
  const columnsByTable = new Map();
  for (const row of rows) {
    const columns = columnsByTable.get(row.table_name) ?? new Set();
    columns.add(row.column_name);
    columnsByTable.set(row.table_name, columns);
  }
  return Object.entries(REQUIRED_STAGING_SCHEMA_COLUMNS).flatMap(([table, columns]) =>
    columns.filter((column) => !columnsByTable.get(table)?.has(column)).map((column) => `${table}.${column}`),
  );
}

const STAGING_PROVIDER_KEYS = [
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "NEON_AUTH_BASE_URL",
  "NEON_AUTH_COOKIE_SECRET",
  "RESEND_API_KEY",
  "EMAIL_FROM",
  "RESEND_WEBHOOK_SECRET",
  "ADMIN_EMAILS",
  "GROQ_API_KEY",
  "OPENAI_API_KEY",
  "UNSPLASH_ACCESS_KEY",
  "GOOGLE_PLACES_API_KEY",
  "BOOKING_DEMAND_API_KEY",
  "BOOKING_DEMAND_AFFILIATE_ID",
  "EXPEDIA_RAPID_API_KEY",
  "SAILY_AFFILIATE_URL",
  "BOOKING_AFFILIATE_URL",
  "ACTIVITIES_AFFILIATE_URL",
  "GROUND_TRANSPORT_AFFILIATE_URL",
  "NORDVPN_AFFILIATE_URL",
  "TRAVEL_INSURANCE_AFFILIATE_URL",
  "CAR_HIRE_AFFILIATE_URL",
];

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name}.`);
  return value;
}

function sameOrigin(left, right) {
  return new URL(left).origin === new URL(right).origin;
}

/** @param {Record<string, string | undefined>} environment */
export function validateStagingProviderPolicy(environment = process.env) {
  const providerMode = environment.MORROVIA_STAGING_PROVIDER_MODE?.trim();
  if (providerMode !== "disabled" && providerMode !== "openai-only") {
    throw new Error("Refusing to run: staging provider mode must be disabled or openai-only.");
  }
  if (providerMode === "openai-only" && !environment.OPENAI_API_KEY?.trim()) {
    throw new Error("OPENAI_API_KEY is required in staging openai-only mode.");
  }
  for (const key of STAGING_PROVIDER_KEYS) {
    if (providerMode === "openai-only" && key === "OPENAI_API_KEY") continue;
    if (environment[key]?.trim()) throw new Error(`${key} must be unset in staging ${providerMode} mode.`);
  }
  return providerMode;
}

export function loadStagingConfig() {
  if (process.env.MORROVIA_ENVIRONMENT !== "staging") {
    throw new Error("Refusing to run: MORROVIA_ENVIRONMENT must be exactly staging.");
  }
  const providerMode = validateStagingProviderPolicy();

  const stagingUrl = required("MORROVIA_STAGING_URL");
  const publicUrl = required("NEXT_PUBLIC_APP_URL");
  const authUrl = required("BETTER_AUTH_URL");
  if (!sameOrigin(stagingUrl, publicUrl) || !sameOrigin(stagingUrl, authUrl)) {
    throw new Error("Staging, public, and Better Auth URLs must use one exact origin.");
  }
  const stagingHost = new URL(stagingUrl).hostname.toLowerCase();
  if (stagingHost === "morrovia.com" || stagingHost === "www.morrovia.com") {
    throw new Error("Refusing to run against the production Morrovia host.");
  }

  const databaseUrl = required("DATABASE_URL");
  const database = new URL(databaseUrl);
  const expectedDbName = required("MORROVIA_STAGING_DB_NAME");
  const expectedDbHost = required("MORROVIA_STAGING_DB_HOST").toLowerCase();
  const databaseName = decodeURIComponent(database.pathname.replace(/^\//, ""));
  if (databaseName !== expectedDbName || expectedDbName === "neondb" || !expectedDbName.startsWith("morrovia_staging")) {
    throw new Error("Staging must use a separately named morrovia_staging database, never neondb.");
  }
  if (database.hostname.toLowerCase() !== expectedDbHost) {
    throw new Error("DATABASE_URL host does not match MORROVIA_STAGING_DB_HOST.");
  }
  if (required("MORROVIA_STAGING_DATABASE_ENVIRONMENT") !== "staging") {
    throw new Error("MORROVIA_STAGING_DATABASE_ENVIRONMENT must be exactly staging.");
  }
  if (!required("BETTER_AUTH_SECRET") || required("BETTER_AUTH_SECRET").length < 32) {
    throw new Error("Use a new staging-only BETTER_AUTH_SECRET of at least 32 characters.");
  }
  return { databaseUrl, expectedDbName, expectedDbHost, stagingUrl: new URL(stagingUrl).origin, providerMode };
}

export async function verifyStagingDatabase(config) {
  const client = new Client({ connectionString: config.databaseUrl });
  await client.connect();
  try {
    const result = await client.query(`
      select
        current_database() as database_name,
        current_setting('app.morrovia_environment', true) as environment,
        to_regclass('public.easyt_users') is not null as has_users,
        to_regclass('public.easyt_trips') is not null as has_trips,
        to_regclass('public.easyt_copilot_previews') is not null as has_copilot_previews,
        to_regclass('public.easyt_country_stamps') is not null as has_country_stamps,
        to_regclass('public.easyt_country_memories') is not null as has_country_memories
    `);
    const row = result.rows[0];
    if (row.database_name !== config.expectedDbName) {
      throw new Error("Connected database name does not match the staging allow-list.");
    }
    if (row.environment !== "staging") {
      throw new Error("Database is missing app.morrovia_environment=staging.");
    }
    if (!row.has_users || !row.has_trips || !row.has_copilot_previews || !row.has_country_stamps || !row.has_country_memories) {
      throw new Error("Staging migrations have not created the required persistence tables.");
    }
    const schemaResult = await client.query(`
      select table_name, column_name
      from information_schema.columns
      where table_schema = 'public'
        and table_name = any($1::text[])
    `, [Object.keys(REQUIRED_STAGING_SCHEMA_COLUMNS)]);
    const missingColumns = missingStagingSchemaColumns(schemaResult.rows);
    if (missingColumns.length) {
      throw new Error(`Staging schema does not match the application migrations: missing ${missingColumns.join(", ")}.`);
    }
    return { client, report: { stagingUrl: config.stagingUrl, database: row.database_name, databaseHost: config.expectedDbHost } };
  } catch (error) {
    await client.end();
    throw error;
  }
}
