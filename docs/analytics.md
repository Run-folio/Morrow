# Analytics and Search Setup

This portfolio uses a lightweight analytics setup for GA4, Microsoft Clarity, Search Console verification and a few portfolio-specific events.

## Environment Variables

Add these in Netlify project settings under **Site configuration → Environment variables**.

```bash
NEXT_PUBLIC_GA_MEASUREMENT_ID=G-XXXXXXXXXX
NEXT_PUBLIC_CLARITY_PROJECT_ID=xxxxxxxxxx
GOOGLE_SITE_VERIFICATION=your-google-search-console-token
```

All values are optional. If an ID is missing, the site still builds and runs normally.

## Google Analytics 4

Create or open a GA4 property in Google Analytics, then go to:

**Admin → Data streams → Web → Measurement ID**

Use the value that starts with `G-` as `NEXT_PUBLIC_GA_MEASUREMENT_ID`.

GA4 is loaded only in production and tracks:

- standard page views
- client-side route changes
- custom portfolio events listed below

## Microsoft Clarity

Create or open a project in Microsoft Clarity, then copy the project ID from the tracking code or project settings.

Use that value as `NEXT_PUBLIC_CLARITY_PROJECT_ID`.

Clarity is loaded only in production and is skipped when the ID is missing.

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

## Custom Events

Events are sent through `trackEvent` in `lib/analytics.ts`.

Current event names:

- `cv_download_clicked`
- `email_contact_clicked`
- `linkedin_clicked`
- `case_study_opened`
- `case_study_cta_clicked`
- `scroll_depth_reached`
- `copy_email_clicked`
- `book_call_clicked`

Common metadata:

- `page_path`
- `case_study_slug`
- `case_study_title`
- `cta_label`
- `destination_url`
- `location`
- `scroll_percentage`

## Adding Future Events

Use `trackEvent` from `lib/analytics.ts` inside a client component:

```tsx
trackEvent("case_study_cta_clicked", {
  cta_label: "Read case study",
  destination_url: "/case-study/returns-kiosk",
});
```

For links rendered from server components, use `TrackedLink` or `TrackedAnchor` from `components/tracked-link.tsx`.

