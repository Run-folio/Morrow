# Tier 1 core journey browser regression

The release workflow runs `test:core-journey-browser` against a production build served on the same CI runner. The suite is a deterministic local app test, not a hosted production smoke test.

It covers a fresh guest choosing Madrid, Lisbon and Porto on Homepage, the first Homepage → New trip handoff, canonical stop order and night allocation in Builder, Build into recoverable device state, Overview and Itinerary, a direct Morning activity and day note saved exactly once through hard reload, MapLibre mount and pan, the legacy Prep redirect, and no horizontal overflow at 390, 430, 768 and 1440 px. A second scenario checks that Discovery treats the Taj Mahal as a visit and Agra as the overnight base.

The browser context declines both optional analytics and affiliate attribution. The suite supplies fixed geocoding responses and forces the bundled MapLibre fallback style, so it does not rely on geocoding, map tiles, PostHog or affiliate providers. It retains a screenshot and Playwright trace only when a case fails. The CI job installs pinned Playwright Chromium, starts its own local server, has an eight-minute limit, and uploads failure evidence.

Authenticated My Trips reopen and cloud persistence remain outside Tier 1. The repository has a staging-account browser test, but this CI job has no isolated local database, account fixture or credentials. Add that coverage only after a disposable local auth/database fixture exists; do not use a personal account or staging/production data. Hosted production smoke must separately verify deployment, real providers and the actual account boundary.
