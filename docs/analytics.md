# Morrovia analytics setup

Morrovia uses lightweight, optional product analytics. This document covers implementation and deployment; the event contract remains in `docs/product/jtbd-analytics.md`.

## Environment Variables

Add these in the production deployment environment.

```bash
NEXT_PUBLIC_GA_MEASUREMENT_ID=G-XXXXXXXXXX
NEXT_PUBLIC_POSTHOG_KEY=phc_xxxxxxxxxx
NEXT_PUBLIC_POSTHOG_HOST=https://eu.i.posthog.com
NEXT_PUBLIC_ANALYTICS_ENVIRONMENT=production
GOOGLE_SITE_VERIFICATION=your-google-search-console-token
```

All values are optional. If an ID is missing, the site still builds and runs normally.

## Consent behaviour

Google Analytics 4 and PostHog load only when all of the following are true:

- the production build has the relevant provider variables and the analytics environment is production (development and explicitly marked preview builds do not initialize these providers);
- the visitor has explicitly granted optional analytics by choosing it in Morrovia’s privacy controls.

With no current choice or a rejected Product analytics choice, neither provider loads, `trackEvent` does not send events, and analytics-only deduplication keys are not written. Withdrawal disables future GA dispatch, opts out and resets PostHog, and clears Morrovia-owned optional analytics state plus known first-party analytics cookies. Browser code cannot promise deletion of vendor-side records or third-party state.

Functional browser storage is deliberately separate from analytics consent. Trip drafts and active plans, language and UI preferences, travel profile/readiness data, Stamps, finder choices, product-tour state, feedback drafts, theme, and PWA/cache storage continue to work without analytics.

## Google Analytics 4

Create or open a GA4 property in Google Analytics, then go to:

**Admin → Data streams → Web → Measurement ID**

Use the value that starts with `G-` as `NEXT_PUBLIC_GA_MEASUREMENT_ID`.

After consent, GA4 is loaded in production and tracks:

- standard page views
- client-side route changes
- custom portfolio events listed below

## Microsoft Clarity

Clarity is disabled in the application. Its session-replay and project masking configuration could not be verified against Morrovia's private-trip boundary. Do not re-enable `NEXT_PUBLIC_CLARITY_PROJECT_ID` loading until Strict/project masking, selector overrides, URL capture, replay scope and ConsentV2 behaviour are verified and documented.

## PostHog

Set both `NEXT_PUBLIC_POSTHOG_KEY` and `NEXT_PUBLIC_POSTHOG_HOST`. The project token is intended for browser use; do not use a PostHog personal API key. With either value absent, PostHog is a safe no-op and builds/tests continue normally.

PostHog is initialized once after consent. Broad autocapture, dead-click capture, exception capture, heatmaps, performance/web-vitals capture, automatic pageviews, page-leave capture, surveys and feature-flag evaluation remain disabled. Morrovia emits explicit SPA pageviews and typed product events instead. Person profiles are created only for identified accounts. Replay and remote configuration are off by default; the local preparation below does not enable a deployment.

`NEXT_PUBLIC_ANALYTICS_ENVIRONMENT` may be `production`, `preview` or `development` and is attached to each event. When omitted it falls back to `production` for production builds and `development` otherwise. This distinguishes test/internal traffic without hardcoded accounts or email addresses.

### Session replay proposal — default off

`NEXT_PUBLIC_POSTHOG_REPLAY_ENABLED=false` and an empty `NEXT_PUBLIC_POSTHOG_REPLAY_ORIGIN` are the committed examples. Replay requires all of: a production build, explicitly `NEXT_PUBLIC_ANALYTICS_ENVIRONMENT=production` (no fallback), enabled exactly `true`, an exact configured origin of `https://morrovia.com` or `https://www.morrovia.com` matching the browser, both PostHog variables, and current versioned Product analytics consent. Localhost, staging and preview origins cannot pass. No SDK token or environment setting is changed by this proposal.

Automatic replay remains disabled at initialization. Only the gated, consented path calls `startSessionRecording()` with no overrides; project enablement, authorized domains, sample rate, triggers, minimum duration, quota and retention still govern whether a session is recorded. The same gate permits remote configuration by clearing `advanced_disable_flags`; `advanced_disable_feature_flags` stays true. Repeated initialization cannot request duplicate starts. Withdrawal stops the recorder before identity reset/opt-out/storage cleanup, including a rejection saved in another tab. A later grant can request replay again.

The proposed recording is deliberately heavily masked: all inputs, page text and element attributes are masked, media/maps/embeds and explicitly private containers are blocked, and head metadata/scripts/JSON-LD/stylesheets are excluded. Canvas capture, cross-origin frames, font/style inlining, console recording and network headers/bodies are disabled. The network masking callback drops captured requests entirely. SDK page titles, session-entry URLs/paths and full session referrers are also removed or normalized at the event boundary. The installed SDK is retained; there is no dependency upgrade.

Text masking alone does not cover CSSOM changes. The send boundary therefore allows only masked full DOM snapshots, recognized DOM/interaction changes and normalized page metadata. It drops stylesheet/style declarations, canvas, fonts, logs, plugin/custom events and unknown payload forms. It rechecks current consent and the rollout gate for every snapshot send. `compress_events:false` keeps nested rrweb JSON inspectable there; normal HTTP transport compression remains available. Compressed/unknown snapshot schemas fail closed rather than passing unchecked. Revalidate this boundary with actual packets whenever the SDK/protocol changes.

This is structural/interaction replay, not a promise of pixel-accurate playback: blocking CSS and masking attributes removes original styling and can affect layout/pointer alignment. Verify actual playback usefulness before any rollout; do not loosen masking merely to improve fidelity.

EN/ES wording lives in `lib/analytics-replay-copy.ts`, used by the privacy notice and cookie inventory. It states that replay is off by default, requires Product analytics permission when enabled, explains masking and withdrawal, and does not claim that a provider-held recording is deleted on withdrawal. Existing consent policy version/defaults are retained in this local preparation. Before any rollout, review whether the changed purpose requires renewed consent and approve the final notices, retention and project privacy controls.

Live verification remains separate: confirm the actual deployed artifact/project/region; review project replay/privacy/retention settings; approve and explicitly configure the rollout; use an approved disposable test session to verify diagnostics, sampling, full/incremental snapshots and withdrawal without private content. Do not enable recordings merely to test this patch. Local tests use a synthetic token, locally fulfilled remote configuration and intercepted ingestion with no outbound requests.

Official references: [replay privacy](https://posthog.com/docs/session-replay/privacy), [recording controls](https://posthog.com/docs/session-replay/how-to-control-which-sessions-you-record), [advanced configuration](https://posthog.com/docs/libraries/js/config#advanced-configuration), [network recording](https://posthog.com/docs/session-replay/network-recording), [console recording](https://posthog.com/docs/session-replay/console-log-recording).

## Google Search Console

In Google Search Console, add `https://shaunwhiting.com` as a property and choose the HTML meta tag verification method.

Copy only the verification token from:

```html
<meta name="google-site-verification" content="your-google-search-console-token" />
```

Use that token as `GOOGLE_SITE_VERIFICATION`.

The site also exposes:

- `/robots.txt`
- `/sitemap.xml`
- canonical URLs through Next metadata

## Product events and deduplication

Events are sent through `trackEvent` in `lib/analytics.ts`.

`trackEvent` in `lib/analytics.ts` is the client event boundary. Launch events have typed property shapes. The helper adds a normalized `page_path` and `environment`, removes empty properties, and only emits after analytics consent. Query strings are excluded and shared-workspace trip IDs are collapsed in page paths. PostHog's automatically supplied current URL is sanitized and its full referrer URL is removed before sending.

Never add raw trip prompts, itinerary or note text, traveller names, emails, passport/nationality details, booking references, precise addresses, AI bodies, serialized trips or full URLs to event properties.

Luna and speech interactions do not create content-bearing analytics events. If coarse state events such as speech started/succeeded/failed are introduced later, they must use the typed analytics boundary, obey Product analytics consent and contain no prompt, question, answer, transcript, audio, traveller or trip-document content. Current semantic-intent and co-pilot server logs contain aggregate model/usage/count/state diagnostics only; user questions, full projections and speech transcripts are not logged.

Authenticated travellers are identified with the existing opaque application user ID, never email. `posthog.reset()` runs on logout before a new anonymous identity is used, so identities do not leak between accounts. Anonymous-to-authenticated merging uses PostHog's standard `identify` call.

## Launch event set

The PostHog launch funnel is intentionally small:

- Planning/generation: `homepage_prompt_started` is a leading prompt-engagement signal; `trip_generation_started` is the submitted planning action; `trip_intent_created`, `route_generated`, `trip_generated` and `trip_generation_failed` measure the resulting journey stages.
- Persistence: `trip_saved`, `trip_save_failed`, `trip_reopened`.
- Shared workspace: `trip_overview_viewed`, `trip_itinerary_viewed`, `trip_map_viewed`, `trip_transport_viewed`.
- Monetisation: the documented commercial outbound-click reporting union (`affiliate_click` plus established Omio/Viator `affiliate_link_clicked`) and `accommodation_search_started`.
- Supported edits/repairs: `trip_refined`, `trip_edit_started`, `route_repair_applied` and `trip_ready`.

`easyt_trip_started`, `easyt_trip_capture_reviewed`, `easyt_trip_capture_place_unresolved`, `easyt_trip_capture_failed`, `easyt_accommodation_inventory_viewed`, `easyt_accommodation_affiliate_clicked` and `easyt_readiness_affiliate_clicked` are retired: each was either a duplicate of the retained product milestone or implementation-detail noise. Historical data remains in PostHog; new traffic uses the canonical event above. `affiliate_click` keeps its existing `category`/`provider` property contract rather than creating a duplicate PostHog-specific variant.

Commercial reporting uses a documented union of `affiliate_click` and the established Omio/Viator `affiliate_link_clicked` event. The reporting projection, stable partner/placement taxonomies, privacy allow-list, and cross-event dedupe rule are defined in [the JTBD analytics contract](product/jtbd-analytics.md#commercial-outbound-click-reporting-contract). Do not add a second event for the same CTA.

First-reached planning events use namespaced local/session storage only after consent, so deduplication never creates analytics-specific browser state for visitors who have not opted in. Deliberate interaction events do not need deduplication storage.

## Adding Future Events

Use `trackEvent` from `lib/analytics.ts` inside a client component:

```tsx
trackEvent("route_accepted", {
  method: "recommended_order",
  stop_count: 3,
  duration_days: 14,
});
```

For links rendered from server components, use `TrackedLink` or `TrackedAnchor` from `components/tracked-link.tsx`.
