# Morrovia analytics setup

Morrovia uses lightweight, optional product analytics. This document covers implementation and deployment; the event contract remains in `docs/product/jtbd-analytics.md`.

## Environment Variables

Add these in the production deployment environment.

```bash
NEXT_PUBLIC_GA_MEASUREMENT_ID=G-XXXXXXXXXX
NEXT_PUBLIC_CLARITY_PROJECT_ID=xxxxxxxxxx
NEXT_PUBLIC_POSTHOG_KEY=phc_xxxxxxxxxx
NEXT_PUBLIC_POSTHOG_HOST=https://eu.i.posthog.com
NEXT_PUBLIC_ANALYTICS_ENVIRONMENT=production
GOOGLE_SITE_VERIFICATION=your-google-search-console-token
```

All values are optional. If an ID is missing, the site still builds and runs normally.

## Consent behaviour

Google Analytics 4, Microsoft Clarity and PostHog load only when all of the following are true:

- the environment has the relevant provider variables (GA4 and Clarity remain production-only; an explicitly configured PostHog test project may run in development or preview);
- the visitor has explicitly granted optional analytics by choosing it in Morrovia’s privacy controls.

With no choice or a declined choice, no provider loads, `trackEvent` does not send events, and analytics-only deduplication keys are not written to browser storage. Withdrawing consent opts PostHog out of future capture and persistence. Existing third-party vendor cookies from GA4 or Clarity are not removed by the application.

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

Create or open a project in Microsoft Clarity, then copy the project ID from the tracking code or project settings.

Use that value as `NEXT_PUBLIC_CLARITY_PROJECT_ID`.

After consent, Clarity is loaded only in production and is skipped when the ID is missing.

## PostHog

Set both `NEXT_PUBLIC_POSTHOG_KEY` and `NEXT_PUBLIC_POSTHOG_HOST`. The project token is intended for browser use; do not use a PostHog personal API key. With either value absent, PostHog is a safe no-op and builds/tests continue normally.

PostHog is initialized once after consent. Broad autocapture, automatic pageviews, page-leave capture, session replay, surveys and feature-flag polling are disabled. Morrovia emits explicit SPA pageviews and typed product events instead. Person profiles are created only for identified accounts.

`NEXT_PUBLIC_ANALYTICS_ENVIRONMENT` may be `production`, `preview` or `development` and is attached to each event. When omitted it falls back to `production` for production builds and `development` otherwise. This distinguishes test/internal traffic without hardcoded accounts or email addresses.

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

Authenticated travellers are identified with the existing opaque application user ID, never email. `posthog.reset()` runs on logout before a new anonymous identity is used, so identities do not leak between accounts. Anonymous-to-authenticated merging uses PostHog's standard `identify` call.

## Launch event set

The PostHog launch funnel is intentionally small:

- Planning/generation: `homepage_prompt_started` is a leading prompt-engagement signal; `trip_generation_started` is the submitted planning action; `trip_intent_created`, `route_generated`, `trip_generated` and `trip_generation_failed` measure the resulting journey stages.
- Persistence: `trip_saved`, `trip_save_failed`, `trip_reopened`.
- Shared workspace: `trip_overview_viewed`, `trip_itinerary_viewed`, `trip_map_viewed`, `trip_prep_viewed`.
- Monetisation: the existing `affiliate_click` contract (`category`, `provider`, and optional opaque trip/stop context) plus `accommodation_search_started`.
- Supported edits/repairs: `trip_refined`, `trip_edit_started`, `route_repair_applied` and `trip_ready`.

`easyt_trip_started`, `easyt_trip_capture_reviewed`, `easyt_trip_capture_place_unresolved`, `easyt_trip_capture_failed`, `easyt_accommodation_inventory_viewed`, `easyt_accommodation_affiliate_clicked` and `easyt_readiness_affiliate_clicked` are retired: each was either a duplicate of the retained product milestone or implementation-detail noise. Historical data remains in PostHog; new traffic uses the canonical event above. `affiliate_click` keeps its existing `category`/`provider` property contract rather than creating a duplicate PostHog-specific variant.

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
