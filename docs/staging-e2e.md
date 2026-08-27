# Isolated staging for destructive E2E QA

This environment is solely for Morrovia launch QA. It must never use the
production hostname, a production Neon branch/database/role, a production
Better Auth secret, or a production provider credential.

## One-time platform setup

1. Create a separate Neon project or a branch named `morrovia-staging`. In it,
   create database `morrovia_staging` and a least-privilege app role such as
   `morrovia_staging_app`. Do not use `neondb`.
2. Apply the repository migrations to `morrovia_staging`, then add this
   startup option to the dedicated staging `DATABASE_URL`:

   ```text
   options=-c%20app.morrovia_environment%3Dstaging
   ```

   Neon does not permit the staging role to persist this custom parameter with
   `ALTER DATABASE`. `pg` sends the URL option when it opens each connection,
   and the preflight reads the resulting `app.morrovia_environment` setting.

3. Create a dedicated Netlify staging site/deploy or a protected `staging`
   branch deploy with the permanent URL `https://staging.morrovia.com`. It is
   not an alias, redirect, or proxy to `morrovia.com`.
4. Add the values from `.env.staging.example` to the staging deploy only.
   Generate a new `BETTER_AUTH_SECRET`; leave Google, Neon Auth, email,
   admin, affiliate, research, mapping, and analytics provider secrets unset.
   Set `MORROVIA_STAGING_PROVIDER_MODE=openai-only` and configure the
   server-only `OPENAI_API_KEY` for the Luna co-pilot acceptance scenarios.
   Set `NEXT_PUBLIC_ANALYTICS_ENVIRONMENT=preview`.
5. Deploy, then run the preflight from a shell with the same staging values:

   ```bash
   npm run staging:preflight
   ```

   The command fails closed unless the URL is non-production, all auth URLs
   agree, the database is named `morrovia_staging*`, the database itself says
   `app.morrovia_environment=staging`, required tables exist, and the configured
   provider policy is either fully disabled or explicitly OpenAI-only.

## Disposable test data

The only fixed accounts are:

| Account | Email |
| --- | --- |
| Test User A | `test-user-a@morrovia-staging.test` |
| Test User B | `test-user-b@morrovia-staging.test` |

Passwords are unique staging secrets in the deploy secret manager and in the
ignored `.env.staging` file. They are never production passwords and are not
committed. Account seeding deliberately creates no trip: the persistence
matrix creates the minimum disposable trip needed to test promotion, conflict,
ownership, deletion, recovery, and retry.

Run, in order:

```bash
npm run staging:reset
RESET_MORROVIA_STAGING=DELETE_ONLY_DISPOSABLE_DATA npm run staging:reset -- --apply
npm run staging:seed
```

The reset defaults to a dry run. Its apply path is double-gated and can delete
only the two exact `.test` accounts and records owned by them; it refuses any
database that does not satisfy the staging preflight.

## QA handoff

Only after `staging:preflight` and `staging:seed` both return `ok: true`, hand
the following to the persistence browser matrix and Smoke/Core gate tickets:

- URL: `https://staging.morrovia.com`
- Account A: `test-user-a@morrovia-staging.test` (password from staging secret manager)
- Account B: `test-user-b@morrovia-staging.test` (password from staging secret manager)
- Evidence: saved preflight and seed JSON, including the staging host and
   database name and explicit `openai-only` provider policy—never a connection
   string, API key, or password.
- Reset command: the three-command sequence above.

Do not start destructive browser tests if preflight cannot prove the staging
URL and database identity. At the end of each QA run, execute the same reset
sequence to restore the known empty test-account state.
