import { TEST_ACCOUNTS, loadStagingConfig, verifyStagingDatabase } from "./staging-safety.mjs";

const apply = process.argv.includes("--apply");
if (apply && process.env.RESET_MORROVIA_STAGING !== "DELETE_ONLY_DISPOSABLE_DATA") {
  throw new Error("Refusing reset: set RESET_MORROVIA_STAGING=DELETE_ONLY_DISPOSABLE_DATA with --apply.");
}

const config = loadStagingConfig();
const { client, report } = await verifyStagingDatabase(config);
const emails = TEST_ACCOUNTS.map((account) => account.email);
try {
  const existing = await client.query('select id from "user" where lower(email) = any($1::text[])', [emails]);
  if (!apply) {
    console.log(JSON.stringify({ ok: true, dryRun: true, ...report, disposableAccountCount: existing.rowCount }));
  } else {
    const ids = existing.rows.map((row) => row.id);
    await client.query("begin");
    try {
      if (ids.length) {
        await client.query('delete from "session" where "userId" = any($1::text[])', [ids]);
        await client.query('delete from account where "userId" = any($1::text[])', [ids]);
        await client.query('delete from easyt_users where id = any($1::text[])', [ids]);
        await client.query('delete from "user" where id = any($1::text[])', [ids]);
      }
      await client.query('delete from verification where lower(identifier) = any($1::text[])', [emails]);
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    }
    console.log(JSON.stringify({ ok: true, reset: true, ...report, deletedDisposableAccounts: ids.length }));
  }
} finally {
  await client.end();
}
