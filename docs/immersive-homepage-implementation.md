# Immersive homepage implementation

Status: implementation in progress; current homepage remains the default.

## Parity checklist (written before implementation)

| Capability | Production owner to preserve | Verification |
| --- | --- | --- |
| New trip, account, Routes, language, mobile dock | EasyTNavigation | existing component retained; browser pass pending |
| Text/speech, AI disclosure, dates, travellers, interests | HomeTripStarter → MorroviaTripCapture | capture parity tests + browser pass |
| Origin/end/same-as-start and canonical suggestions | JourneyEndpointsEditor | existing callbacks retained |
| Submission/error/retry/latest-request protection | HomeTripStarter | existing capture request gate retained |
| Homepage → Builder | createHomeTripDraft / HOME_TRIP_DRAFT_KEY | existing handoff retained |
| Reviewed route → Builder | RoutePlanLink / routePlannerPayload | no replacement handoff |
| Route availability | publicRoutePublishedFamilies / release workflow | unpublished routes excluded |
| Demo views | isolated reducer using public route detail | no storage, fetch or TripDocument writes |
| Affiliates and attribution | getCurrentPartnerAction / MorroviaAffiliateLink | canonical click owner only |
| Privacy, consent, legal | existing app shell / MorroviaFooter | retained |
| Motion and keyboard | local Quiet view + system media query | static endpoint; explicit controls |
| Responsive hero | scoped composition around canonical capture | 320/390/430 and desktop review |

## Content blockers found before implementation

The published Japan route has Tokyo → Takayama → Kyoto, not the approved five-stop sequence. Balkans, Vietnam/Cambodia and Iceland have `needs-review` confidence and are excluded by the canonical publication boundary. Do not promote them by changing confidence or inventing reviewer metadata. The independent reviewer required by docs/public-route-editorial-release.md has been requested.

Prototype Peru, Portugal and Japan background asset rights are unresolved. Those binaries are not copied into the candidate. Original generated landscape replacements have explicit provenance; destination media must use documented licensed assets or the existing attributed photo resolver.

## Architecture

One server-only `IMMERSIVE_HOMEPAGE_V2=true` request branch. No query-string override, localStorage flag or client randomization. Default/off renders the existing tree unchanged. Existing navigation and form behavior remain shared; the immersive chapters are page-specific composition, not new UI primitives. A route DTO is derived on the server and passed to an isolated client controller.

## Rollout

Keep the flag off until content, visual, functional, accessibility and performance review is complete. Staging uses its existing environment configuration; rollback is removing the variable or setting it to `false`, followed by the platform's normal environment redeploy. Do not change the main/production default.
