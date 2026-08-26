# Production resilience and secondary-host runbook

This document prepares a Vercel backup deployment without changing the live Netlify site, DNS, account access, or secrets. It is an operational runbook, not an automatic failover system.

## Audited baseline — 2026-08-26

- **Primary production:** `https://morrovia.com` is served by Netlify. `GET /` returns `307` to `/journey/home`; `GET /journey/home` returns `200`. The response exposes Netlify, Next.js, HSTS, and `X-Content-Type-Options: nosniff` headers.
- **Staging:** `https://staging.morrovia.com/journey/home` returns `200` from Netlify. Repository staging guidance requires a separate database and non-production providers.
- **Health:** the primary had no `/api/health` endpoint and returned `404` at audit time. This repository now provides one; it becomes externally checkable after the next primary/secondary deployment.
- **DNS:** the apex nameservers resolve to Netlify/NSONE (`dns1`–`dns4.p08.nsone.net`). Public MX/TXT lookup returned no records at audit time; preserve any record shown in the DNS control plane during a real failover.
- **Source:** the configured Git remote is `https://github.com/Run-folio/Morrow.git`; the checked-out deployment branch is `main`. Netlify branch/build settings are not represented in the repository and require account confirmation.

## Runtime dependency inventory

| Dependency | Secondary-host requirement | Failure behaviour |
| --- | --- | --- |
| Next.js / Node | `npm ci`, then `npm run build` | Build fails on compile/type errors. |
| Database | Production Neon `DATABASE_URL`, network access, migrations already applied | `/api/health` returns `503`; persistence/auth cannot operate. |
| Auth | `BETTER_AUTH_SECRET` or `NEON_AUTH_COOKIE_SECRET`, and matching `NEXT_PUBLIC_APP_URL` / `BETTER_AUTH_URL` | `/api/health` returns `503`; auth fails closed. |
| Google sign-in | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and approved callback for the active host | Email/password remains available if configured; Google sign-in is absent otherwise. |
| Email | `RESEND_API_KEY`, `EMAIL_FROM`, `RESEND_WEBHOOK_SECRET` when password-reset/verification email is enabled | Authentication remains available; mail delivery functions do not. |
| Image/research/maps/providers | Unsplash, Google Places, Booking Demand, affiliate URLs, Groq, analytics | Optional features retain their existing degraded behaviour; do not treat them as availability prerequisites. |
| Static assets and remote images | Repository assets plus allowed Cloudinary, Wikimedia, and Unsplash origins in `next.config.ts` | A remote image/provider outage should not prevent the app shell or health endpoint. |

There are no committed Netlify redirects/headers configuration files, Vercel cron configuration, or scheduled/background workers. Application redirects come from Next.js routes; production header parity needs confirmation in the host control planes before a real switch.

## Vercel secondary target

`vercel.json` deliberately contains only reproducible Next.js commands:

```text
install: npm ci
build:   npm run build
```

Manual setup, requiring an authorized Vercel account:

1. Import the existing GitHub repository and set `main` as the production branch. Do not alter the Netlify Git integration.
2. Keep the Vercel project on its generated hostname until a failover is authorized. Do not attach or move `morrovia.com` yet.
3. Add production values in Vercel’s encrypted environment settings only. Never copy them into `.env.example`, documentation, source, logs, or preview variables.
4. Use the environment checklist below. Deploy from the same commit as production, then check `/`, `/journey/home`, and `/api/health` on the Vercel hostname.
5. For authenticated backup testing, configure matching Vercel-host base URLs and add the exact Google callback URI. For an actual canonical-domain failover, set both base-URL variables to `https://morrovia.com` before the DNS change, redeploy, then verify auth after DNS propagation.

### Environment checklist

**Critical — health must fail closed if absent:**

- `DATABASE_URL`
- one of `BETTER_AUTH_SECRET` or `NEON_AUTH_COOKIE_SECRET`
- `NEXT_PUBLIC_APP_URL`
- `BETTER_AUTH_URL`

The two URL values must be valid HTTP(S) origins and match after normalisation. The health endpoint reports only `ok`, `missing`, `invalid`, `mismatch`, `not_checked`, or `unreachable`; it never returns connection strings, hosts, secrets, or provider errors.

**Production parity where enabled:**

- Google OAuth: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
- Email: `RESEND_API_KEY`, `EMAIL_FROM`, `RESEND_WEBHOOK_SECRET`
- Admin access: `ADMIN_EMAILS`
- Analytics: `NEXT_PUBLIC_GA_MEASUREMENT_ID`, `NEXT_PUBLIC_CLARITY_PROJECT_ID`, `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST`, `NEXT_PUBLIC_ANALYTICS_ENVIRONMENT=production`
- Optional providers: values documented in `.env.example` for image, research, places, inventory, and affiliate integrations.

Do not use staging credentials or a staging database for a production failover. Do not enable any optional provider solely to satisfy this runbook.

## Monitoring

Create external HTTPS checks for:

| URL | Expected result | Frequency | Alert condition |
| --- | --- | --- | --- |
| `https://morrovia.com` | `307` to `/journey/home` or an eventual `200` page response | 1 minute | Two consecutive failures, TLS failure, unexpected redirect, or 5xx. |
| `https://morrovia.com/api/health` | `200` with `state: "ok"` | 1 minute | Any `503`, non-200, invalid JSON/state, or TLS failure. |

Configure an alert destination owned by the operations team; no address is assumed here. Treat a single failed probe as transient while DNS/TLS and a second independent probe are healthy. Treat two consecutive failures, a failing health endpoint, or an origin-wide 5xx pattern as an outage. Monitor after any DNS change at the reduced TTL appropriate to the DNS provider’s actual settings.

## Failover runbook

1. Detect the alert and capture timestamp, URL, status, response headers, and probe region. Do not expose session data or secrets.
2. Confirm whether the failure is Netlify/origin, DNS, certificate, database, auth, or an upstream provider by comparing `/`, `/journey/home`, and `/api/health` from an independent probe.
3. On the Vercel deployment URL, verify the same commit, `npm run build` result, `/` redirect, `/journey/home` response, and `/api/health` `200`/`state: ok`.
4. Confirm Vercel production environment parity and the canonical auth URLs. Confirm the production database is intentionally shared and migrations are compatible.
5. Change only the application-serving apex/`www` DNS record(s) required by the DNS provider’s Vercel instructions. Do not change nameservers unless a separately approved migration requires it.
6. Verify Vercel certificate issuance and HTTPS for `https://morrovia.com` and `https://www.morrovia.com` if that hostname is in use.
7. Verify the homepage redirect and `/journey/home` from an uncached browser/probe.
8. Verify email/password auth; verify Google sign-in only after its canonical callback is confirmed. Test a safe signed-in page without changing traveller data.
9. Verify `/api/health` returns `200` and `state: ok`, then verify a read-only authenticated trip load if available.
10. Preserve **all MX, TXT, DKIM, SPF, DMARC, domain-verification, email, and unrelated subdomain records**. Never delete or replace them during application failover.
11. When Netlify recovers, deploy the same verified commit there, verify HTTPS/home/auth/health, restore only the application DNS records, and keep the Vercel deployment available until monitoring is stable.

## Real failover test prerequisites

A non-disruptive real failover test still needs: an authorized Vercel project connected to the GitHub repository; production-equivalent encrypted variables; approved Google callback(s); confirmed production Neon connectivity; Vercel deployment health evidence; DNS-control-plane access; an agreed low-traffic window; named alert recipients; and explicit approval to change the exact application DNS records. This task does not authorize any of those external changes.
