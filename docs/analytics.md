# Morrovia analytics setup

Morrovia uses lightweight, optional product analytics. This document covers implementation and deployment; the event contract remains in `docs/product/jtbd-analytics.md`.

## Environment Variables

Add these in the production deployment environment.

```bash
NEXT_PUBLIC_GA_MEASUREMENT_ID=G-XXXXXXXXXX
NEXT_PUBLIC_CLARITY_PROJECT_ID=xxxxxxxxxx
GOOGLE_SITE_VERIFICATION=your-google-search-console-token
```

All values are optional. If an ID is missing, the site still builds and runs normally.

## Consent behaviour

Google Analytics 4 and Microsoft Clarity load only when all of the following are true:

- the production build has the relevant environment variable;
- the visitor has explicitly granted optional analytics by choosing it in Morrovia’s privacy controls.

With no choice or a declined choice, neither provider loads, `trackEvent` does not send events, and analytics-only deduplication keys are not written to browser storage. If consent is later withdrawn, future Morrovia events stop; existing third-party vendor cookies are not removed by the application.

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

`trackEvent` in `lib/analytics.ts` is the client event boundary. It adds `page_path`, removes empty properties, and only emits after analytics consent. The current product events and permitted properties are defined by `docs/product/jtbd-analytics.md`.

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
