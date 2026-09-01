# Production resilience and secondary-host runbook

Status: **P0 NOT CLOSED**. The application and runbook are ready for a secondary deployment, but the Vercel project, external monitors, alert recipient, and live failover rehearsal are not yet complete.

Last verified: 2026-09-01. This is an operational recovery guide, not automatic failover. It must not change planner or Builder behaviour.

## Current architecture

| Layer | Verified state |
| --- | --- |
| Source | GitHub `Run-folio/Morrow`; default/production branch `main`; staging branch `staging`. |
| Primary production | Netlify project `morrovia`, serving `https://morrovia.com`; production branch `main`; published commit `ed5913a` at audit time. |
| Staging | Netlify project `morrovia-staging`, serving `https://staging.morrovia.com`; production branch `staging`; published commit `9aaacf5` at audit time. It uses an isolated staging database and provider policy described in `docs/staging-e2e.md`. |
| Primary build | Node.js 24.x; repository root `/`; `npm run build`; publish directory `.next`; Netlify Functions region CMH (Ohio, US East). |
| Secondary | Existing Vercel account can import `Run-folio/Morrow`, but no Morrovia Vercel project or successful Vercel deployment was present at audit time. Use project name `morrovia-secondary`. |
| Database | Neon Postgres through the pooled `DATABASE_URL`; migrations are in `db/migrations/`. Production and the failover host must intentionally use the same production database. |
| Auth | Better Auth backed by Postgres. `NEXT_PUBLIC_APP_URL` and `BETTER_AUTH_URL` must identify the active canonical origin. Google OAuth is optional but must have an authorised callback for every hostname used for sign-in testing. |
| Email | Resend is optional application configuration. Netlify DNS contains email records at `send.morrovia.com` and `resend._domainkey.morrovia.com`; preserve them exactly. |
| Images and APIs | Repository assets plus Cloudinary, Wikimedia, and Unsplash image origins; optional OpenAI, Groq, Google Places, Booking.com Demand, Viator, analytics, and affiliate integrations. |

The exact environment-variable inventory is in `docs/production-environment.md`. There are no committed scheduled workers, Netlify build configuration files, or Vercel cron jobs. `vercel.json` declares only the reproducible Next.js install and build commands.

## DNS ownership and protection boundary

`morrovia.com` is currently hosted in the Netlify DNS zone owned by the founder's Netlify team. Public nameservers were:

- `dns1.p08.nsone.net`
- `dns2.p08.nsone.net`
- `dns3.p08.nsone.net`
- `dns4.p08.nsone.net`

Netlify-managed web records currently serve the apex, `www`, and `staging`. The DNS control plane also showed these custom email records without recording their values here:

- `send.morrovia.com`: MX and TXT
- `resend._domainkey.morrovia.com`: TXT

Public lookup found no root MX/TXT and no `_dmarc.morrovia.com` TXT at audit time. That is an observation, not permission to remove anything. Before every DNS change, capture a fresh control-plane screenshot/export and preserve all MX, TXT, SPF, DKIM, DMARC, CAA, verification, receiving-subdomain, and unrelated subdomain records.

Do not change nameservers during an application outage. The incident action is a narrow change to the web-serving apex/`www` records only, using the exact values Vercel shows after the custom domain has been added to `morrovia-secondary`.

## Health check

`GET /api/health` is the single readiness endpoint. It returns only bounded states:

```json
{"state":"ok","checks":{"auth":"ok","applicationUrl":"ok","database":"ok"}}
```

It returns `200` only when critical auth/base-URL configuration is coherent and a `select 1` database probe succeeds; otherwise it returns `503`. It has `Cache-Control: no-store` and never returns environment values, hostnames, database URLs, provider errors, user counts, secrets, or stack details.

Database connectivity belongs in this readiness check because account access and durable trip read/write are core application availability. A host-only liveness check would report a misleading success while travellers could not load or save trips. The query is read-only and carries no user data.

Verified on 2026-09-01:

- `https://morrovia.com/api/health`: `200`, all three checks `ok`
- `https://staging.morrovia.com/api/health`: `200`, all three checks `ok`
- production homepage: `307` to `/journey/home`, then `200`
- staging homepage: `307` to `/journey/home`, then `200`

## Create the Vercel secondary

These steps create a warm secondary without taking ownership of production DNS:

1. In Vercel, choose **Add New → Project**, select the founder-owned team, and import `Run-folio/Morrow` from GitHub.
2. Name it `morrovia-secondary`. Set framework **Next.js**, root directory `./`, production branch `main`, and Node.js `24.x`.
3. Leave **Domains** empty. Do not add `morrovia.com`, change Netlify's Git integration, or alter DNS during setup.
4. Confirm Vercel is using `npm ci` and `npm run build` from `vercel.json`. Do not set an output override.
5. Add only the Production variables required by `docs/production-environment.md`. Mark server-only secrets Sensitive. Do not place production secrets in Preview or Development unless a separately approved test requires them.
6. For a canonical failover build, set both URL variables to `https://morrovia.com`. This means the generated `vercel.app` URL can prove homepage, assets, APIs, and database readiness, but a full cookie/OAuth sign-in rehearsal must use an explicitly configured test origin or the approved DNS cutover.
7. Deploy `main`, record the full `VERCEL_GIT_COMMIT_SHA`, and compare it with the currently published Netlify production commit. A backup build is not accepted when the SHAs differ.
8. On the generated hostname, verify `/`, `/journey/home`, `/journey/login`, and `/api/health`. `/api/health` must return `200` with `state: "ok"`.
9. Keep the generated hostname and project available. Do not attach the production domain until the founder approves domain staging or a real failover.

For a direct authenticated rehearsal before DNS cutover, temporarily use the generated Vercel origin for both URL variables, add its exact Google callback URI if Google login is in scope, redeploy, test, then return both variables to `https://morrovia.com` and redeploy. Never cut DNS while the backup build still has the generated origin configured.

## UptimeRobot activation

Monitoring is **not verified active**. The browser reached the UptimeRobot login screen but had no authenticated session. The founder must:

1. Sign in to an UptimeRobot account that is independent of the Netlify account.
2. Add an alert contact that remains reachable during a Netlify/account outage. Name the incident owner and a backup recipient in the private operations record; do not commit personal contact details here.
3. Create an HTTP(S) monitor named `Morrovia homepage` for `https://morrovia.com`. Follow redirects; alert on connection/TLS failure, timeout, or non-2xx/3xx response.
4. Create an API monitor named `Morrovia readiness` for `GET https://morrovia.com/api/health`. Assert valid JSON and `$.state` equals `ok`; if the plan lacks JSON assertions, use a Keyword monitor that requires `"state":"ok"` and still treats non-2xx as down.
5. Select every intended alert contact on both monitors. Use the plan's shortest available interval: currently 5 minutes on Free or 1 minute on Solo/Team.
6. Save each monitor, wait for a successful external check, then use UptimeRobot's test-alert function. Record the monitor names, owner role, activation date, and tested alert channel in the private operations record.
7. Do not publish a status page unless a customer-communications decision has been made.

## Failover: Netlify unavailable → Vercel

1. **Verify the outage.** Capture UTC time, affected URLs, HTTP/TLS result, and probe region. Compare `https://morrovia.com`, `/journey/home`, and `/api/health` from UptimeRobot and one independent connection.
2. **Classify it.** Distinguish DNS/TLS, Netlify origin, database, auth, or upstream-provider failure. Do not switch hosts for a Neon/database outage that will follow the application to Vercel.
3. **Verify the backup.** On the generated Vercel hostname, confirm the deployed commit matches the intended Netlify production commit, `/journey/home` loads, static/external images render, and `/api/health` returns `200`/`ok`.
4. **Verify failover configuration.** Confirm both application/auth URL variables equal `https://morrovia.com`; the production Neon database and Better Auth secret are the intended shared values; enabled provider variables match the inventory; and the build after the last variable change succeeded.
5. **Prepare domain/TLS.** Add `morrovia.com` and `www.morrovia.com` to `morrovia-secondary` only under founder approval. Use the exact DNS targets shown by Vercel and wait until Vercel is ready to issue a certificate.
6. **Change DNS narrowly.** In the existing Netlify DNS zone, change only the application-serving apex and `www` records required by Vercel. Do not change nameservers, `staging`, MX, TXT, DKIM, SPF, DMARC, receiving subdomains, or unrelated records.
7. **Verify TLS and routing.** From an uncached connection, confirm HTTPS for apex and `www`, the expected `www` redirect, `/journey/home`, `/journey/login`, and `/api/health`.
8. **Verify critical journey.** Sign in with an approved non-admin test account; load one existing disposable trip read-only. Only if a disposable production test trip and explicit approval exist, make a reversible edit and confirm read/write. Do not mutate a traveller's production trip.
9. **Verify integrations.** Check public assets, one remote image, map/place behaviour, auth cookies/callbacks, transactional email only if a safe recipient is approved, and the provider features currently enabled in production.
10. **Monitor.** Watch UptimeRobot and Vercel logs until the agreed stability window has passed. Record the DNS change, propagation observations, and verification results.

A real DNS cutover always requires explicit founder approval immediately before step 6.

## Restore primary: Vercel → Netlify

1. Confirm the Netlify account and project are accessible and the incident cause is resolved.
2. Deploy the same verified commit currently running on Vercel to Netlify `morrovia`.
3. On the Netlify deploy URL, verify build success, `/journey/home`, `/journey/login`, `/api/health`, database access, assets, and enabled integrations.
4. Confirm the Netlify production environment inventory and canonical auth URLs still match the recovery record.
5. With founder approval, restore only the apex/`www` application records to the exact pre-incident values captured before failover. Preserve every email and unrelated DNS record.
6. Confirm TLS, auth, homepage, health, and the same safe disposable-trip checks on `https://morrovia.com`.
7. Keep Vercel live and unchanged through the stability window. Then remove the production domain from Vercel if operational policy requires it; keep the generated backup deployment available.
8. Record timings, unexpected dependencies, and runbook corrections. Never copy secrets into the incident log.

## Non-disruptive rehearsal record — 2026-09-01

Completed without changing production:

- live production and staging DNS, TLS, homepage redirects, and health endpoints verified;
- Netlify projects, source repository, branches, published commits, build command, Node version, and production/staging separation verified in the control plane;
- exact production commit `ed5913a` extracted into a clean temporary directory, installed with `npm ci`, and built successfully with Next.js 15.5.21 on Node 24.14.1;
- build output included the dynamic `/api/health` route;
- Vercel account inspected: no Morrovia project exists, while `Run-folio/Morrow` is visible and reaches the final import configuration screen;
- DNS cutover simulated from the documented control-plane sequence only; no DNS, nameserver, domain, email, auth, database, or production-user state changed.

Not yet proven:

- a successful Vercel build and runtime on a generated Vercel hostname;
- production environment parity in Vercel;
- direct Vercel database/auth/provider behaviour;
- active UptimeRobot monitors and alert delivery;
- Vercel custom-domain TLS readiness and actual DNS propagation time;
- a safe disposable production trip read/write on the secondary.

## Incident ownership

- Primary owner role: **Founder**.
- Backup owner role: **must be assigned before closure**.
- Contact details and alert destinations: store in the founder-controlled private operations record and UptimeRobot, independent of Netlify and Vercel. Do not commit them.

## Closure checklist

- [ ] `morrovia-secondary` exists and has a successful Vercel build of the same production commit.
- [ ] Required/parity environment names and values are verified from the independent recovery source.
- [ ] Generated Vercel URL passes homepage, login entry, assets, API health, and database checks.
- [ ] Auth/cookie/callback behaviour is verified through an approved test origin or cutover rehearsal.
- [ ] UptimeRobot homepage and readiness monitors are active and a test alert is received.
- [ ] Incident backup owner and independent alert destination are recorded privately.
- [ ] A founder-approved failover rehearsal records DNS/TLS timing and the critical recovery checklist.

Until every item is complete, report **P0 NOT CLOSED**.
