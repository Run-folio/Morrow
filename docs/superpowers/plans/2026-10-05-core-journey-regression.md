# #322 core journey regression

1. Reuse the existing Node test + Playwright browser pattern against a locally served Next app. Stub only external geocoding and map tile requests so guest planning is deterministic; keep consent declined.
2. Cover a fresh three-stop Homepage handoff, Builder order/night allocation and Build recovery, Overview/Itinerary/Map/Prep availability, one direct daypart Add and note through hard reload, responsive widths and MapLibre pan. Add a short separate Discovery scenario.
3. Add a bounded CI browser job with a pinned Playwright dependency, Chromium installation, local production build/server, failure-only artifact capture and no account/database fixture. Run focused tests, typecheck, build, UI audit and diff checks; report inherited failures and authenticated coverage dependency.
