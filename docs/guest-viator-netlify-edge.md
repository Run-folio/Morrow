# Inventory Edge rule: local readiness

`netlify/edge-functions/viator-inventory-guard.ts` prepares a native Netlify rule
for `/api/journey-activity-inventory` and its trailing-slash alias. It requests
20 incoming requests per 60 seconds, aggregated by host-owned IP and domain,
across all methods. Other APIs and assets are outside the declared path. The
handler calls `context.next()` once without reading the body, changing headers,
fetching another URL, inspecting forwarding headers, or adding an application
counter. Next.js retains method handling and the destination-body validation.

The native bundler adds an optional trailing slash to an exact `path`. One
declaration emits `^/api/journey-activity-inventory/?$`. Declaring both aliases
would overlap on the slash request and additionally match a double slash; local
native-artifact regression coverage prevents that duplication.

This rule complements the SQL outbound budget. It is not a global Viator
allowance, authentication mechanism or complete bot defense. Shared public IPs
share the client limit; distinct domains have distinct incoming buckets.

## Local evidence and its limits

The tests execute the actual guard and verify unread-body pass-through, exact
downstream response, path/method scope and public fallback for a plain-text 429.
A clearly labeled synthetic host enforcer consumes the declared rule to exercise
20/60 rejection and forged-forwarding-header scenarios. That fixture does not
prove Netlify's real IP extraction, distributed counting, response headers or
enforcement timing.

An already cached `@netlify/edge-bundler` 16.1.2 discovers the actual function,
then its native declaration merger, manifest generator and schema validator emit
the path binding and traffic rule. `scripts/verify-viator-netlify-edge.mjs`
reproduces this intermediate artifact offline. It imports the config with Node
type stripping; it does not claim the native Deno extraction step or a deployable
Edge bundle. No new package is required by the application.

The attempted full native bundle is **blocked**: no compatible Deno binary is
installed or cached. Its attempted download was prevented, and the optional
remote-types lookup was blocked before any network request. No OpenNext/Netlify
Next.js adapter package was found in the existing app dependencies or inspected
tool caches. A normal Next.js build does not establish Edge deployment binding.

Before staging activation, run the full native Edge bundle and actual Next.js
adapter pipeline using the approved host tooling, inspect the emitted artifact
alongside framework routes, and verify the deploy's post-processing log accepts
the rule. Then verify both aliases, unrelated paths, pass-through and rejection
on disposable staging traffic. Bounded HEAD/OPTIONS probes can exercise the
all-method rule without starting Viator searches. Do not infer acceptance from a successful deploy
alone: invalid rate rules need not fail deployment. All plans support code rules;
available slots depend on plan, and enforcement may lag by up to ten seconds.
No rule, deploy, environment or database migration is activated by this patch.

## Non-secret quota evidence still needed

The existing filtered host metadata and repository evidence contain no
account-specific Viator quota or real provider-response headers. The public
Partner Dashboard entry did not expose readable quota data without login; no
login or new access was attempted. The public technical-guide page does not
establish this account's search/taxonomy allowance, and the large API technical
specification could not be read by the available web tool. Generic access-cost
FAQ text is not proof of this account's contractual terms.

Obtain only the relevant quota/terms text, with account IDs and secrets omitted:

- Sandbox/production environment and affiliate access level.
- Limits applicable to `/products/search` and `/destinations`: requests per
  second/minute/day, window/reset semantics and timezone, burst/concurrency
  allowances, and whether failed requests count.
- Whether those limits are per endpoint, key, account or application, and
  whether other callers share the allowance.
- Any account-specific request charges, overage behavior or nonstandard terms.
- From an **already available**, sanitized provider response: HTTP status,
  endpoint, environment, observation time, `Date`, `Retry-After`, and every
  present `RateLimit-*` or `X-RateLimit-*` field with its documented units/reset
  semantics. These are requested header patterns, not a claim that Viator emits
  particular names. Do not send keys, cookies, request bodies, booking records
  or customer data, and do not make a new provider call just to collect them.

Sources checked: [Netlify rate limiting](https://docs.netlify.com/manage/security/secure-access-to-sites/rate-limiting/),
[Edge API](https://docs.netlify.com/build/edge-functions/api/),
[Edge declarations](https://docs.netlify.com/build/edge-functions/declarations/),
[Next.js adapter](https://docs.netlify.com/build/frameworks/framework-setup-guides/nextjs/overview/),
[Viator technical guide](https://partnerresources.viator.com/travel-commerce/technical-guide/),
[affiliate API FAQ](https://partnerresources.viator.com/travel-commerce/affiliate/),
and [Partner Dashboard entry](https://partners.viator.com/).
