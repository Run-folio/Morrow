# EasyT accessibility and privacy audit

Last reviewed: 10 August 2026

## Scope and evidence

This is a practical product audit of the current EasyT codebase and live local views, including desktop and a 390px mobile viewport. It covered the home page, trip builder, navigation, account/authentication, nearby finder, maps, stamps, sharing gifts, analytics, feedback and email records.

It is not a legal opinion, a penetration test or formal WCAG conformance certification. Before a public launch, obtain legal advice for the regions in which EasyT operates and run a keyboard, screen-reader and automated accessibility test against the deployed production site.

## Changes delivered in this pass

- Added `/journey/privacy`, a responsive English and Spanish privacy notice with a skip link, structured headings, contact path and analytics choices.
- Added the Privacy notice to the account submenu, sign-in screen and XML sitemap.
- Changed Google Analytics and Microsoft Clarity to opt-in. They do not load on production until the visitor allows optional analytics.
- Added accessible error announcements to shared EasyT form controls and sign-in errors.
- Corrected segmented controls that presented as tabs without tab panels. They now expose their selected state as pressable choices.
- Masked the recipient email shown by a trip-gift link unless the signed-in account matches that recipient.

## Accessibility findings

### High priority before beta

1. Run a keyboard and screen-reader pass on the interactive map planner.
   Map controls, map pins, drawn routes, popovers and the finder should all have visible focus, usable keyboard actions and an equivalent text path for users who cannot operate the map canvas.

2. Add a shared skip-to-main-content link to every EasyT route.
   The new Privacy notice has one, but it should be provided by the shared EasyT layout so keyboard users do not tab through navigation on each page.

3. Make language server-aware.
   The language preference currently begins as English and changes client-side from browser storage. The document language should match the rendered language on first load, ideally through a locale route or cookie, and set the root `lang` attribute accordingly.

### Medium priority

4. Standardise async status announcements.
   Saving, loading finder results, route generation, map errors and upload results should use concise `aria-live` status messages. Validation errors should continue using `role="alert"` where immediate interruption is appropriate.

5. Validate every focus state and contrast pair in production.
   The visual review found consistent controls and generally strong heading contrast. Automated contrast checks still need to cover pink-on-light surfaces, muted text, map labels and hover/focus states.

6. Test fixed mobile UI with zoom and large text.
   The bottom navigation and consent banner must not cover focused controls, the keyboard or essential content at 200% zoom and with operating-system large text settings.

## Privacy and data-protection findings

### High priority before public launch

1. Define retention periods and account-deletion operations.
   The product currently lets people remove individual trips and stamp memories, while account deletion is handled through support. Establish documented retention periods for accounts, backups, feedback and email logs; then add a verified self-service deletion request or an operational runbook with response SLAs.

2. Add a vendor register and data-processing review.
   EasyT sends data to its database/auth provider, Resend, OpenStreetMap-based services (Nominatim, Overpass and Photon), map providers, and optionally Google Analytics and Microsoft Clarity. Confirm data-processing terms, transfer locations, retention and consent requirements for each live vendor.

3. Complete consent withdrawal.
   New analytics are opt-in. Add cookie cleanup for pre-existing Google/Clarity cookies when a visitor declines or withdraws consent, and confirm production scripts do not run before the choice.

### Medium priority

4. Make device-local draft data more visible.
   A pre-sign-in trip draft, language preference and finder selections can remain in browser storage. The notice now explains this; add an in-product “clear local draft” action for shared devices.

5. Review photos stored with Stamps.
   Stamp photos are personal content. Keep file limits and content validation, document image retention and deletion behaviour, and ensure storage access is scoped to the owning account.

6. Maintain data inventory and incident procedures.
   Document who can access production data, how access is revoked, backup handling, incident response, privacy-request verification and a release checklist for new third-party integrations.

## Positive controls observed

- Account-scoped trip, feedback and stamps endpoints are implemented.
- Admin feedback and email screens check authenticated admin access.
- Location is requested through browser permission and is described in the privacy notice.
- Gift claim tokens are random, time-limited and now do not expose a full recipient email to non-matching viewers.
- Transactional email delivery is logged for operational troubleshooting.

## Release checklist

- [ ] Legal review of the notice, terms, retention and processor agreements.
- [ ] Production cookie/analytics verification in an incognito browser.
- [ ] Automated accessibility scan plus keyboard and screen-reader test of home, builder, map, finder, account and gift flows.
- [ ] Test Spanish loading on a fresh browser session.
- [ ] Test account deletion and data-export support workflow.
- [ ] Verify map/provider attributions and external-link privacy disclosures.
