# Production environment inventory

This inventory records variable names and recovery sources only. Never commit or paste real values into this file, `.env.example`, tickets, build logs, or incident notes.

For failover, Vercel Production must match the enabled Netlify production configuration. Preview and Development must not receive production secrets by default. `NEXT_PUBLIC_*` values are intentionally embedded in browser bundles; every other credential remains server-only.

## Audited primary configuration — names only

Netlify production had these configured names on 2026-09-01. They are therefore the minimum **current parity set** for `morrovia-secondary`, even where the feature is optional in a fresh installation:

- `ADMIN_EMAILS`
- `BETTER_AUTH_SECRET`
- `BETTER_AUTH_URL`
- `DATABASE_URL`
- `EMAIL_FROM`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GROQ_API_KEY`
- `NEON_AUTH_BASE_URL`
- `NEON_AUTH_COOKIE_SECRET`
- `NEXT_PUBLIC_ANALYTICS_ENVIRONMENT`
- `NEXT_PUBLIC_APP_URL`
- `NEXT_PUBLIC_POSTHOG_HOST`
- `NEXT_PUBLIC_POSTHOG_KEY`
- `RESEND_API_KEY`
- `UNSPLASH_ACCESS_KEY`
- `VIATOR_API_ENV`
- `VIATOR_API_KEY_PRODUCTION`

This list proves names and enabled integrations only. It does not prove values are current, independently recoverable, or present in Vercel. Staging has its own 16-name isolated set, including `MORROVIA_STAGING_*`, disposable test passwords, `OPENAI_API_KEY`, and the Viator sandbox key; never copy that set or its values into the production backup.

## Critical application availability

| Variable | Requirement | Exposure | Environment-specific | Purpose and independent recovery source |
| --- | --- | --- | --- | --- |
| `DATABASE_URL` | Required | Server-only secret | Yes | Pooled production Neon Postgres URL. Recover/rotate in Neon and keep a current copy in the private recovery vault; migrations live in `db/migrations/`. |
| `BETTER_AUTH_SECRET` | Required unless the cookie-secret fallback is deliberately used | Server-only secret | Production-wide | Signs/encrypts Better Auth state. Use the same production value on both hosts for session continuity. This generated value must exist in the private recovery vault because no provider can reconstruct it. |
| `NEON_AUTH_COOKIE_SECRET` | Optional fallback for `BETTER_AUTH_SECRET` | Server-only secret | Production-wide | Legacy/provider cookie-secret fallback. Copy only when it is the active production auth secret; store independently. |
| `NEXT_PUBLIC_APP_URL` | Required | Public by design | Yes | Canonical browser origin. Use `https://morrovia.com` for a failover-ready production build. |
| `BETTER_AUTH_URL` | Required | Server-only configuration, not a secret | Yes | Better Auth canonical origin. Must normalise to the same origin as `NEXT_PUBLIC_APP_URL`. |

`/api/health` fails closed when this critical set is absent, invalid, mismatched, or cannot reach Postgres.

## Auth, email, and operations parity

These variables are optional to boot the app but required on the secondary when the feature is enabled in production.

| Variable | Exposure | Environment-specific | Purpose and recovery source |
| --- | --- | --- | --- |
| `GOOGLE_CLIENT_ID` | Server-only configuration, not a secret | Yes | Google OAuth client ID from Google Cloud. Pair with the secret and authorised callback URIs. |
| `GOOGLE_CLIENT_SECRET` | Server-only secret | Yes | Google OAuth secret from Google Cloud/private recovery vault. |
| `RESEND_API_KEY` | Server-only secret | Yes | Transactional/inbound email API key from Resend/private recovery vault. |
| `EMAIL_FROM` | Server-only configuration | Yes | Verified sender identity. Reconstruct from the verified Resend domain; do not change email DNS during failover. |
| `RESEND_WEBHOOK_SECRET` | Server-only secret | Production-wide | Verifies outbound email lifecycle webhooks. Recover or rotate in Resend and the private recovery vault. |
| `BOOKING_IMPORT_ENABLED` | Server-only configuration | Yes | Enables deliberate forwarded-booking import only when exactly `true`. Default `false`. |
| `BOOKING_IMPORT_RECEIVING_DOMAIN` | Server-only configuration | Yes | Dedicated inbound receiving subdomain. Recover from Resend/Netlify DNS; never substitute the root mail domain. |
| `RESEND_INBOUND_WEBHOOK_SECRET` | Server-only secret | Production-wide | Separately signs inbound booking webhooks. Recover or rotate in Resend/private recovery vault. |
| `ADMIN_EMAILS` | Server-only sensitive configuration | Yes | Comma-separated feedback-dashboard allow-list. Recover from the private operations record, not application logs. |
| `NEON_AUTH_BASE_URL` | Server-only configuration | Yes | Provider-managed Neon Auth value if that integration is enabled. The current app does not use it as the canonical Better Auth URL. |

Google callback for the canonical site: `https://morrovia.com/api/auth/callback/google`. A generated Vercel hostname needs its own callback only for an explicitly approved direct-login rehearsal.

## Planner, place, image, inventory, and affiliate parity

| Variable | Exposure | Requirement/purpose | Recovery source |
| --- | --- | --- | --- |
| `OPENAI_API_KEY` | Server-only secret | Optional; enables configured semantic-intent/co-pilot provider paths. | OpenAI project/private recovery vault. |
| `MORROVIA_SEMANTIC_INTENT_MODE` | Server-only configuration | Optional environment switch: `off`, `shadow`, or `active`; copy the deliberate production mode. | Primary configuration/private operations record. |
| `GROQ_API_KEY` | Server-only secret | Optional; planner research/shadow provider. Production planner shadow remains off by code policy. | Groq/private recovery vault. |
| `MORROVIA_PLANNER_SHADOW_MODE` | Server-only configuration | Development/test only; omit in production. | Repository default. |
| `UNSPLASH_ACCESS_KEY` | Server-only secret | Optional live destination imagery. | Unsplash/private recovery vault. |
| `GOOGLE_PLACES_API_KEY` | Server-only secret | Optional nearby-place/status search. | Google Cloud/private recovery vault. |
| `BOOKING_DEMAND_API_KEY` | Server-only secret | Optional Booking.com Demand inventory; requires affiliate ID. | Booking.com partner account/private recovery vault. |
| `BOOKING_DEMAND_AFFILIATE_ID` | Server-only sensitive configuration | Optional Booking.com Demand attribution; requires API key. | Booking.com partner account/private recovery vault. |
| `BOOKING_DEMAND_BOOKER_COUNTRY` | Server-only configuration | Optional two-letter pricing/tax country; defaults to `gb`. | Primary configuration. |
| `BOOKING_DEMAND_API_BASE_URL` | Server-only configuration | Optional approved sandbox/proxy override; otherwise repository default. | Provider contract/private operations record. |
| `VIATOR_API_ENV` | Server-only configuration | Optional `sandbox` or `production` selection; use production only with the approved production key. | Viator partner configuration. |
| `VIATOR_API_KEY_SANDBOX` | Server-only secret | Optional sandbox activity inventory. | Viator/private recovery vault. |
| `VIATOR_API_KEY_PRODUCTION` | Server-only secret | Optional production activity inventory. | Viator/private recovery vault. |
| `SAILY_AFFILIATE_URL` | Server-only sensitive configuration | Optional approved tracked destination URL. | Affiliate account/private recovery vault. |
| `SAILY_AFFILIATE_ENABLED` | Server-only configuration | Optional intent flag; URL alone also enables the partner. Default `false`. | Primary configuration. |
| `GROUND_TRANSPORT_AFFILIATE_URL` | Server-only sensitive configuration | Optional approved tracked destination URL. | Affiliate account/private recovery vault. |
| `GROUND_TRANSPORT_AFFILIATE_ENABLED` | Server-only configuration | Optional intent flag. Default `false`. | Primary configuration. |
| `CAR_HIRE_AFFILIATE_URL` | Server-only sensitive configuration | Optional approved tracked destination URL. | Affiliate account/private recovery vault. |
| `CAR_HIRE_AFFILIATE_ENABLED` | Server-only configuration | Optional intent flag. Default `false`. | Primary configuration. |
| `NORDVPN_AFFILIATE_URL` | Server-only sensitive configuration | Reserved optional tracked URL; do not enable without reviewed product use. | Affiliate account/private recovery vault. |
| `TRAVEL_INSURANCE_AFFILIATE_URL` | Server-only sensitive configuration | Reserved optional tracked URL. | Affiliate account/private recovery vault. |
| `EXPEDIA_RAPID_API_KEY` | Server-only secret | Reserved; no current production adapter consumes it. Do not copy unless the adapter is activated. | Expedia/private recovery vault. |

## Public analytics and site metadata

| Variable | Exposure | Requirement/purpose | Recovery source |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_GA_MEASUREMENT_ID` | Public by design | Optional GA4 measurement ID. | GA4 property. |
| `NEXT_PUBLIC_POSTHOG_KEY` | Public by design | Optional PostHog project token; never use a personal API key. | PostHog project settings. |
| `NEXT_PUBLIC_POSTHOG_HOST` | Public by design | Optional PostHog ingest host; required with the project token. | PostHog project settings. |
| `NEXT_PUBLIC_ANALYTICS_ENVIRONMENT` | Public by design | Environment label; use `production` on both production hosts. | Constructed value. |
| `GOOGLE_SITE_VERIFICATION` | Public by design | Optional Google site-verification token emitted as metadata. | Google Search Console. |
| `NEXT_PUBLIC_CLARITY_PROJECT_ID` | Public by design | Reserved; loader remains disabled until privacy verification is complete. Omit from production unless that code path is deliberately enabled. | Microsoft Clarity. |

## Host-provided or non-production variables

Do not manually copy these into Vercel Production unless a documented build change requires them:

- `NODE_ENV`: set by the host.
- `NEXT_DIST_DIR`: local build/test output override.
- `STATIC_EXPORT`: alternate static-export build switch; production is a server-rendered Next.js deployment.
- `MORROVIA_CAPTURE_DIAGNOSTICS`: non-production diagnostics only.
- `MORROVIA_ENVIRONMENT`, `MORROVIA_STAGING_*`, `RESET_MORROVIA_STAGING`, and `STAGING_TEST_PASSWORD_*`: isolated staging tooling only.
- `MORROVIA_SEMANTIC_INTENT_SMOKE`, other `MORROVIA_*_SMOKE`/`MORROVIA_*_AUDIT`/`MORROVIA_*_EVAL*` values, and `MORROVIA_GLOBAL_ROUTING_*`: local benchmark/test authorisation only.

## Recovery storage and parity procedure

1. Maintain a founder-controlled private recovery record outside Netlify and Vercel. It contains values or direct vendor retrieval instructions, the incident owner/backup, and alert destinations.
2. Treat Netlify's encrypted environment settings as a live configuration source, not the only backup. A Netlify account lockout must not block recovery.
3. Store generated secrets that vendors cannot reconstruct (`BETTER_AUTH_SECRET` and independently generated webhook secrets) in the private recovery vault.
4. Recover provider credentials from their vendor consoles when possible and rotate them if account compromise is suspected.
5. In Vercel, scope secret values to Production and mark them Sensitive. Do not use `NEXT_PUBLIC_` for any secret.
6. Compare variable **names and enabled/disabled intent**, never values, between Netlify production, this inventory, and Vercel Production.
7. After any environment-variable change, create a new deployment; do not assume an already-built deployment picked up the change.
8. Verify `/api/health`, then the enabled integration checklist in `docs/production-resilience.md`.
