import { markDisposableTestAccountEmailVerified, loadStagingConfig, TEST_ACCOUNTS, verifyStagingDatabase } from "./staging-safety.mjs";
import { runStagingSeed } from "./staging-seed-workflow.mjs";

let client;
let clientClosed = false;
let report;

async function postAuth(config, path, body) {
  const response = await fetch(`${config.stagingUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: config.stagingUrl },
    body: JSON.stringify(body),
  });
  await response.body?.cancel();
  return { ok: response.ok, status: response.status };
}

try {
  const config = loadStagingConfig();
  const staging = await verifyStagingDatabase(config);
  client = staging.client;
  report = staging.report;

  const seeded = await runStagingSeed({
    accounts: TEST_ACCOUNTS,
    getPassword: (key) => process.env[key],
    signUp: ({ name, email, password }) => postAuth(config, "/api/auth/sign-up/email", { name, email, password }),
    markVerified: (email) => markDisposableTestAccountEmailVerified(client, email),
    closeDatabase: async () => {
      await client.end();
      clientClosed = true;
    },
    signIn: ({ email, password }) => postAuth(config, "/api/auth/sign-in/email", { email, password }),
  });

  console.log(JSON.stringify({ ok: true, ...report, ...seeded }));
} catch (error) {
  const message = error instanceof Error ? error.message : "Staging seed failed.";
  console.error(JSON.stringify({ ok: false, ...(report ?? {}), error: message }));
  process.exitCode = 1;
} finally {
  if (client && !clientClosed) {
    try {
      await client.end();
    } catch {
      // The primary failure is already reported without exposing connection details.
    }
  }
}
