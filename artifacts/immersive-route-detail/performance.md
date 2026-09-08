# Route Detail performance evidence

Baseline: isolated archive of SHA 9cbd4ea137914948d769dda6fb5cb005b48de8d1, production build, same runtime environment. Final: production build on staging. Browser: Codex in-app browser, fixed 390×844 and 1440×1000 iframe viewports. Same-origin local proxy buffers HTML and exposes PerformanceObserver readings in a hidden QA-only DOM element. No instrumentation ships in the product. Cookies: optional analytics rejected.

Use final-390-metrics.json, baseline-390-final-metrics.json, final-1440-repeat-metrics.json and baseline-1440-metrics.json for the quoted warm comparisons. final-1440-metrics.json retains the earlier 836 ms / 0.108 CLS sample. Early after-* files predate the Builder-prefetch fix and are historical. baseline-mobile-metrics.json has an invalid 234px viewport and is excluded. Baseline mobile resource counters returned zero encoded bytes for cached images; the 1,067,000 B budget is verified from the five requested production files and desktop readings, not interpreted as zero mobile imagery.

| Measurement | Before | After |
|---|---:|---:|
| Next First Load JS | 327 kB | 328 kB |
| Route chunk | 9.05 kB | 7.38 kB |
| Destination-image payload initiated on entry | 1,067,000 B | 42,186 B mobile / 323,906 B desktop |
| Explicitly eager final hero | — | 42,186 B mobile / 125,986 B desktop |
| Warm 390 LCP | 624 ms | 424 ms |
| Warm 1440 LCP | 400 ms | 504 ms |
| Warm CLS | 0 | 0 |
| Earlier final desktop observation | — | 836 ms LCP / 0.108 CLS |
| Stop/connection/reset to two frames | — | 26–35 ms |

The deferred ca4dcb09 and e919c1aa chunks are absent from final opening logs and present in final-map-metrics.json after map engagement. Combined 971,355 raw / 250,318 gzip bytes. Existing worker and shared module: 498,435 raw / 139,243 gzip bytes, loaded with the map. Map tiles/fonts/sprites are external and vary by view/cache; this is not their total network budget.

No cache-clearing, CPU throttling, field percentile, INP attribution or statistical performance claim. Click-to-two-frames is an interaction proxy, not INP. Local HTML proxy buffering, server TTFB, Next prefetch and browser cache affect comparisons. The prefetch integration fix removed an observed eager Builder/map fetch. Recheck the slight cold CLS outlier and LCP on hosted staging after an explicitly authorized deployment.
