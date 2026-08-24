import { TEST_ACCOUNTS, loadStagingConfig, verifyStagingDatabase } from "./staging-safety.mjs";

const config = loadStagingConfig();
const { client, report } = await verifyStagingDatabase(config);
await client.end();

for (const account of TEST_ACCOUNTS) {
  const password = process.env[account.passwordKey];
  if (!password || password.length < 16) {
    throw new Error(`${account.passwordKey} must be a unique staging-only password of at least 16 characters.`);
  }
  const signUp = await fetch(`${config.stagingUrl}/api/auth/sign-up/email`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: config.stagingUrl },
    body: JSON.stringify({ name: account.name, email: account.email, password }),
  });
  if (!signUp.ok) throw new Error(`Could not create ${account.name} (HTTP ${signUp.status}). Run staging:reset first if it already exists.`);

  const signIn = await fetch(`${config.stagingUrl}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: config.stagingUrl },
    body: JSON.stringify({ email: account.email, password }),
  });
  if (!signIn.ok) throw new Error(`${account.name} was created but could not sign in (HTTP ${signIn.status}).`);
}

console.log(JSON.stringify({ ok: true, ...report, seededAccounts: TEST_ACCOUNTS.map(({ name, email }) => ({ name, email })) }));
