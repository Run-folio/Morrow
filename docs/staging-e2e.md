# Isolated staging for destructive E2E QA

This environment is solely for Morrovia launch QA. It must never use the
production hostname, a production Neon branch/database/role, a production
Better Auth secret, or a production provider credential.

## One-time platform setup

1. Use the independently reviewed staging target: Neon project
   `frosty-mode-70756654`, branch `br-lingering-sunset-arw7uok8`, database
   `morrovia_staging`, and direct endpoint
   `ep-fancy-credit-ar0ithc8.c-4.us-west-2.aws.neon.tech`. The matching `-pooler`
   endpoint is accepted for application preflight; the isolated concurrency
   qualification requires the direct endpoint. Do not substitute another branch
   or production database.
2. Apply the reviewed migrations only after independently checking the target.
   Migration `0017_morrovia_place_research.sql` records the pinned staging tuple
   in `morrovia_deployment_metadata`. Preflight checks this metadata and
   `current_database()` before checking persistence tables. Do not add custom
   `app.morrovia_environment` connection options or use `ALTER DATABASE`/role
   grants to create a marker. Missing or mismatched metadata fails closed.
   Use an existing authorized staging runtime role; no new permissions are
   implied by the metadata. Concurrency qualification separately checks ownership
   of its isolated test objects and must never use application trips or accounts.

3. Create a dedicated Netlify staging site/deploy or a protected `staging`
   branch deploy with the permanent URL `https://staging.morrovia.com`. It is
   not an alias, redirect, or proxy to `morrovia.com`.
4. Add the values from `.env.staging.example` to the staging deploy only.
   Generate a new `BETTER_AUTH_SECRET`; leave Google, Neon Auth, email,
   admin, affiliate, research, mapping, and analytics provider secrets unset.
   Set `MORROVIA_STAGING_PROVIDER_MODE=openai-only` and configure the
   server-only `OPENAI_API_KEY` for the Luna co-pilot acceptance scenarios.
   For the approved photo acceptance scenarios, use `openai-and-unsplash`
   (or `unsplash-only` when co-pilot access is disabled). Configure a dedicated
   staging `UNSPLASH_ACCESS_KEY` and declare
   `MORROVIA_STAGING_UNSPLASH_CREDENTIAL_ENVIRONMENT=staging` only after
   confirming its scope. Key presence alone does not prove isolation; this
   declaration records operator confirmation, not automatic credential validation.
   All other provider restrictions remain in place.
   Set `NEXT_PUBLIC_ANALYTICS_ENVIRONMENT=preview`.
5. Deploy, confirm `/api/health` returns the exact intended SHA in
   `deployment.commit` (a `200` response alone is insufficient), then run the
   preflight from a shell with the same staging values:

   ```bash
   npm run staging:preflight
   ```

   The command fails closed unless the URL is non-production, all auth URLs
   agree, the connection targets the exact reviewed staging database and endpoint,
   the pinned deployment metadata matches, required tables exist, and the configured
   provider policy explicitly allows only the selected OpenAI/Unsplash providers.

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
   database name and explicit selected provider policy—never a connection
   string, API key, or password.
- Reset command: the three-command sequence above.

Do not start destructive browser tests if preflight cannot prove the staging
URL and database identity. At the end of each QA run, execute the same reset
sequence to restore the known empty test-account state.
