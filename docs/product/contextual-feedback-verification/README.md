# Contextual feedback verification (local only)

The screenshots in this directory show the production feedback component inside the production Itinerary and Overview Storybook workspaces. The browser uses Storybook authentication fixtures and intercepts the survey API on loopback. These screenshots are UI and interaction evidence, not a claim of authenticated application end-to-end coverage.

## Reproduce the database gate

Use a disposable PostgreSQL 16 server with `pgcrypto` available and a separate `morrovia_feedback_test` database on an unused loopback port. The September 28 verification used PostgreSQL 16.15 built from its official source release, plus task-local OpenSSL 3.0.15 for the `pgcrypto` prerequisite. The binary, password file, socket and cluster data lived under the task-owned `/tmp/morrovia-feedback-pg.K9va9m` directory. The server listened only at `127.0.0.1:60969`; the connected role was `feedback_test`. This directory and server were removed after verification. No shared PostgreSQL service or application database was used.

With PostgreSQL 16 binaries available as `$PG_BIN` and an unused loopback port selected as `$FB_PORT`, an equivalent disposable cluster can be prepared with:

```sh
FB_TMP="$(mktemp -d /tmp/morrovia-feedback-pg.XXXXXX)"
mkdir -m 700 "$FB_TMP/socket"
python3 -c 'import pathlib,secrets,sys; pathlib.Path(sys.argv[1]).write_text(secrets.token_urlsafe(30))' "$FB_TMP/password"
chmod 600 "$FB_TMP/password"
"$PG_BIN/initdb" -D "$FB_TMP/data" -U feedback_test --pwfile="$FB_TMP/password" --auth-host=scram-sha-256 --auth-local=scram-sha-256 --encoding=UTF8
"$PG_BIN/pg_ctl" -D "$FB_TMP/data" -o "-h 127.0.0.1 -p $FB_PORT -k $FB_TMP/socket" start
PGPASSWORD="$(cat "$FB_TMP/password")" "$PG_BIN/createdb" -h 127.0.0.1 -p "$FB_PORT" -U feedback_test morrovia_feedback_test
```

Before running the test, verify the target with the test credential and `psql`:

```sql
select current_database(), current_user, inet_server_addr(), inet_server_port(), current_setting('data_directory'), version();
```

Confirm `current_database() = 'morrovia_feedback_test'`, the unused loopback port, and the task-owned temporary `data_directory`. Then supply **only** the guarded variable (keep its value out of logs):

```sh
LOCAL_FEEDBACK_TEST_URL="$(python3 -c 'import pathlib,sys,urllib.parse; print("postgresql://feedback_test:"+urllib.parse.quote(pathlib.Path(sys.argv[1]).read_text())+"@127.0.0.1:"+sys.argv[2]+"/morrovia_feedback_test")' "$FB_TMP/password" "$FB_PORT")"
MORROVIA_FEEDBACK_TEST_DATABASE_URL="$LOCAL_FEEDBACK_TEST_URL" \
  node --experimental-strip-types --test tests/feedback-survey-db.test.ts
```

The test itself checks the database URL guard before its first SQL statement, creates a disposable schema, applies `0001_easyt_foundation.sql`, `0003_easyt_feedback.sql`, `0008_easyt_feedback_triage.sql` and `0015_easyt_feedback_survey.sql`, uses two independent PostgreSQL connections for concurrent operations, inspects stored rows and drops its schema. A missing or unsafe target skips the SQL test, so a passing guard test alone does not close the database gate. Stop the task-owned server with `"$PG_BIN/pg_ctl" -D "$FB_TMP/data" stop -m fast`, confirm it stopped, then remove only its disposable directory.

## Reproduce the browser gate

```sh
npx storybook dev -p 8790 --no-open
MORROVIA_FEEDBACK_STORYBOOK_URL=http://localhost:8790 \
  node --experimental-strip-types --test tests/contextual-feedback-browser.test.ts
```

The browser test accepts only loopback Storybook URLs. It uses the existing active-use storage seam to represent 10 minutes and one acknowledged planning action; production timing remains unchanged. It checks invitation timing, account separation, deliberate opening, accessible rating, explicit send, retry identity, dismissal, reload, normal Help access, mobile content order and horizontal overflow. `itinerary-shell-390.png` records the compact trip shell and day navigation; the remaining PNGs record invitations, form, failure, success and dismissal at 390px, 430px and desktop.

## September 28 result

- Real PostgreSQL 16.15: two database tests passed; no failed or skipped database tests. The four migrations applied successfully in the isolated schema. Stored-row checks covered replay, payload conflict, competing attempts, injected write failure followed by retry, dismissal races, ordinary feedback isolation and account deletion retention. A final identity query returned `morrovia_feedback_test|feedback_test|127.0.0.1|60969|/tmp/morrovia-feedback-pg.K9va9m/data|0` (the last value is remaining test schemas).
- Focused feedback, canonical-save and account-isolation suites including the real database tests: 82 passed, zero failed, zero skipped.
- Loopback Storybook browser: five tests passed; no failed or skipped browser tests. These checks use production components with controlled local authentication and survey API fixtures.
- Typecheck, strict UI audit, Storybook build, application `build:check` and `git diff --check` passed. The separate known frozen-base Map source assertion in `tests/trip-itinerary-workspace-presentation.test.ts` remains at 31 passed and one failed; the Map source and assertion were not changed in this task.
- The authenticated application plus real survey HTTP API was not exercised as one browser end-to-end chain. The real SQL gate and local production-component browser gate were verified separately.
