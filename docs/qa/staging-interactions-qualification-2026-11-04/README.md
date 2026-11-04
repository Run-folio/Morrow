# Staging qualification of integrated interactions

Candidate pushed to staging: `6ce583d7378d8584db3f6342f63656853d3568d0`.
Staging site: `854ed510-cdd4-48cb-abb3-31b53ad9999f`, https://staging.morrovia.com.
Netlify deploy: `6aea819b30c8a404bdeb9c32`.

## Preflight and release checks

Remote Git, hosted health and Netlify agreed on previous staging57757a7.
Remote main was and remains a3ce3a0, independently rechecked after rollout. The local named staging
refaf1b964 was an older ancestor, not a newer remote release; it was not deployed.
Relevant other qualification tasks were idle and the five latest Netlify deploys
were ready; no active Netlify build was overwritten. Candidate is a fast-forward
of the exact remote staging revision. No force push or manual deploy was used.

Analytics URL sanitization/replay and storage/persistence/trip-document files match
577 byte-for-byte. No migration, auth, environment, lockfile or CI configuration
changed. Previous282 selected interaction/contracts checks and145 recovery checks
passed. A fresh88-check protection suite also passes.

The nine known failures have exactly matching names and assertion details on
pristine577 and candidate:6 missing test binding references,1 same accepted-input
clearing assertion and2 same input-domain assertions. These are retained and not
counted as passes. This is bounded staging qualification, not production approval.

Full release:gate initially found a separate outdated autocomplete focus harness:
its extracted actual onBlur callback referenced completionVisibleRef absent from
the fixture. The test-only fix supplies that ref and adds assertions that leaving
the root retires completion visibility while inside-root focus retains it. Original
menu-close and focus assertions remain. Red failure is saved; focused suite11/11
passes. Production code did not change. Re-running the complete release gate
passes:650 collected checks,626 passed,24 browser skips; strict UI audit,2 independent
typechecks (including stale generated-type contamination), prompt/shadow/Builder
checks, full production build/client manifests/offline assets all succeed.
The local gate build stamp is9f1e185a, whose production code is identical to6ce583d7;
6ce583d7 adds only the test-harness correction. Netlify builds6ce583d7 afresh.

## Hosted test boundaries

The available browser contains a pre-existing staging draft. It was not edited,
removed, reset, exported or used for test mutation. No database/reset/seed command
was run. Public read-only visual/keyboard checks are the safe scope of this browser.
The CUA browser API exposes viewport and visibility only, with no disposable-profile
or motion-emulation control. Native desktop is locked. Therefore synthetic hosted
recovery/fault injection and forced reduced-motion checks cannot safely run here.
No alternate browser or storage-mutation workaround is attempted. Physical touch,
screen-reader and signed-in account checks remain unverified.

Rollout and public hosted observations are recorded after publication below.


## Published result and bounded hosted observations

Netlify published6ce583d7378d8584db3f6342f63656853d3568d0 at
2026-11-04T00:54:34.506Z. `/api/health` confirms that exact served revision and
healthy auth/applicationUrl/database. Git confirms only staging advanced;
main remainsa3ce3a049477b5275afe64ab1cb7207d79790591. Netlify calls the staging
site's main context `production`; the site ID/domain above are staging, and the
separate production site was not deployed or changed.

On the deployed public `/journey/about` page, desktop and390px reflow were visually
inspected. At390px, document width and innerWidth are both390; heading uses49.14px
font and358px available width. Screenshots show the fully reflowed layout rather
than the immediate stale frame after viewport resize. Desktop Account and mobile
navigation each open with Enter, close with Escape and retain focus on their
trigger. No link into profile/trips was activated. Temporary viewport reset.

These checks do not qualify itinerary card editing, account saves or recovery on
the deployed version. The available browser already held a draft; it was excluded
from mutations. Browser motion preference wasfalse, and the API lacks motion
emulation or disposable contexts; the native Mac is locked. No OS setting,
consent, existing storage, user record or recovery copy was changed. No physical
touch, screen-reader, signed-in persistence or reduced-motion pass is claimed.

Next gate: qualify exact6ce583d7 in a fresh disposable browser profile, using only
synthetic guest/device data (and separately authorized test accounts for account
save/recovery); exercise card Save/Cancel/focus, rename, touch reorder, forced
reduced motion, quota refusal/retry, reload and recovery. The nine unchanged
baseline failures remain explicitly unresolved; no production promotion follows.
