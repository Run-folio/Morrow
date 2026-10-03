import { TEST_ACCOUNTS } from "./staging-safety.mjs";

function hasExactDisposableAccountSet(accounts) {
  return Array.isArray(accounts)
    && accounts.length === TEST_ACCOUNTS.length
    && TEST_ACCOUNTS.every((expected, index) => {
      const candidate = accounts[index];
      return candidate?.name === expected.name
        && candidate?.email === expected.email
        && candidate?.passwordKey === expected.passwordKey;
    });
}

function partialStateMessage(completed, total) {
  return `${completed} of ${total} disposable accounts may have been created; run staging:reset before retrying.`;
}

/**
 * Orchestrates the staging-only seed. Network calls are injected by the CLI
 * entrypoint; account identity and the success report remain fixed here.
 */
export async function runStagingSeed({
  accounts = TEST_ACCOUNTS,
  getPassword,
  signUp,
  markVerified,
  closeDatabase,
  signIn,
}) {
  if (!hasExactDisposableAccountSet(accounts)) {
    throw new Error("Staging seed accepts only the exact disposable staging accounts.");
  }

  let completed = 0;
  let setupError;
  try {
    for (const account of accounts) {
      const password = getPassword(account.passwordKey);
      if (typeof password !== "string" || password.length < 16) {
        throw new Error(`Missing a valid staging-only password for ${account.name}.`);
      }

      let signupResult;
      try {
        signupResult = await signUp({ name: account.name, email: account.email, password });
      } catch {
        throw new Error(`Could not create ${account.name}; ${partialStateMessage(completed, accounts.length)}`);
      }
      if (!signupResult?.ok) {
        throw new Error(`Could not create ${account.name} (HTTP ${Number(signupResult?.status) || "unknown"}); ${partialStateMessage(completed, accounts.length)}`);
      }

      completed += 1;
      try {
        await markVerified(account.email);
      } catch {
        throw new Error(`Could not verify ${account.name}; ${partialStateMessage(completed, accounts.length)}`);
      }
    }
  } catch (error) {
    setupError = error instanceof Error ? error.message : "Staging account setup failed.";
  }

  try {
    await closeDatabase();
  } catch {
    if (!setupError) setupError = "Could not safely close the staging database connection; run staging:reset.";
  }
  if (setupError) throw new Error(setupError);

  for (const account of accounts) {
    const password = getPassword(account.passwordKey);
    let signInResult;
    try {
      signInResult = await signIn({ email: account.email, password });
    } catch {
      throw new Error(`Test User sign-in failed for ${account.name}; run staging:reset before retrying.`);
    }
    if (!signInResult?.ok) {
      throw new Error(`${account.name} sign-in failed (HTTP ${Number(signInResult?.status) || "unknown"}); run staging:reset before retrying.`);
    }
  }

  return {
    verified: true,
    seededAccounts: accounts.map(({ name, email }) => ({ name, email })),
  };
}
