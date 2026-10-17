# Public activity inventory readiness

`POST /api/journey-activity-inventory` accepts destination-only public searches.
It does not load an owner, account or saved trip. Existing Save/Add owners and
private APIs retain their own protections. Provider authentication failure is
provider unavailability, never a request to sign into Morrovia.

The request accepts at most 16 KiB of actual UTF-8 JSON, destination identity
and bounded identity hints, `map`/`itinerary`, English/Spanish locale variants,
and GBP/USD/EUR/AUD/CAD/NZD/CHF/JPY. It rejects arbitrary pagination, URLs and
trip documents. Map requests 12 results; itinerary/Explore requests 4. Existing
taxonomy qualification, exact product URLs and provenance remain in place.

Successful/empty product results retain the 55-minute cache (one-hour maximum).
Taxonomy retains its seven-day cache. Identical product requests sharing a
process cache share one promise; each consumer gets a separate projection.
Failures are not successful-empty cache entries. Browser cancellation does not
cancel another consumer's server work.

Every taxonomy/product dispatch first claims a permit using existing Neon HTTP
SQL. Migration `0016_morrovia_viator_budget.sql` provides one operational row per
`NEXT_PUBLIC_APP_URL` origin and Viator sandbox/production environment. Claims
serialize under a row lock, consume minute/day counters, and lease at most two
slots. A bounded history of at most 1,000 timestamps enforces 20 claims per trailing
60 seconds and 1,000 claims per trailing 24 hours. Claims include failures; there are no automatic retries
or application queues. A local two-slot shedder limits coordinator work but is
not the global ceiling. Coordination has a two-second response deadline. Its local work slot remains
occupied until the underlying SQL settles; a late granted permit is released
without dispatch. A stalled coordinator therefore cannot accumulate unbounded
background claims in a process.

Lease lifetime is 60 seconds, beyond the client's maximum 30-second timeout
(normal timeout eight seconds). Release follows the underlying operation's
settlement; timeout alone cannot release a still-running request. Expiry recovers
dead workers. This is a lease-based concurrency limit, not proof that an upstream
operation cannot outlive its aborted HTTP connection or expired lease.
Upstream 429 records the full valid Retry-After cooldown (default one minute).
Values beyond one year fail closed with an indefinite cooldown pending operational
review rather than resuming earlier; public retry feedback is at most one day. Admission rejection returns 429 and Retry-After; unavailable
coordination returns 503. Neither response claims zero stock. Valid cache and
local ideas remain usable, with existing generic public affiliate handoffs.

## Before any hosted activation

1. Review and separately apply the operational migration to the intended
   environment. The application never creates or migrates tables. Verify the
   runtime role can execute the function and update only this operational state.
   Missing database/schema/origin fails closed before a new provider dispatch.
2. Confirm the configured application origins separate staging/production and
   stay consistent across their serverless instances. Other applications or
   credentials sharing a provider allowance must share a budget or be accounted
   for separately. This patch cannot bound unrelated callers.
3. Verify non-secret account-specific limits and window semantics; lower these
   conservative defaults if required. These limits are not a provider entitlement
   or proof of account billing terms.
4. Prepare/verify a host-enforced path-scoped 20 requests/minute/client rule using
   host-authenticated requester identity. No per-client rule is activated or
   claimed here. An arbitrary forwarding header is not trusted. A Next.js route
   export alone is not evidence of Netlify enforcement; verify emitted binding
   and then deployed behavior separately. The database budget protects outbound
   usage independently of any host enforcement lag.
5. Separately approve staging publication, then verify disposable guest/session
   transitions, fresh inventory and exact affiliate destinations there. Local
   synthetic transport and React rendering do not prove live provider acceptance,
   browser layout, deployed rate enforcement or booking completion.

Local SQL verification uses only a disposable PostgreSQL Unix socket:

```sh
MORROVIA_VIATOR_TEST_SOCKET=/tmp/morrovia-guest-viator-pg/socket \
  node --experimental-strip-types --test tests/viator-admission-sql.test.ts
node --experimental-strip-types --test tests/guest-viator-public.test.ts \
  tests/guest-viator-render.test.ts tests/viator-affiliate-api.test.ts \
  tests/planning-assessment-api.test.ts tests/trip-explore-async-acceptance.test.ts
npm run typecheck
npm run build:check
npm run audit:ui
```

The SQL test never reads `DATABASE_URL`, accepts no hosted DSN and cleans up its
own schema. It races independent database connections and ten isolated actual
client modules against the same SQL state. Provider/configuration boundaries use
synthetic fixtures; no real provider request, credential or user-trip mutation is
needed. Run the broader repository suite as well and report baseline failures.
