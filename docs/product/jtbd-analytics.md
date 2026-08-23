# Morrovia JTBD analytics contract

Last reviewed: 23 August 2026

This measures whether Morrovia helps an independent traveller move from a rough multi-stop idea to a route they can trust and act on. It is not an ad-impression schema.

Analytics remain optional: events are sent only after the visitor has allowed optional analytics. Do not send free-text trip briefs, addresses, passport/nationality details, booking references, email addresses, full affiliate URLs, payment information, or live prices to analytics.

## Shared event rules

- All client events use `trackEvent` and inherit `page_path`.
- `trip_id` and `stop_id`, where used, are opaque product identifiers only. They must never be replaced with a trip title, destination list, email or booking reference.
- Counts and categorical values are preferred: `stop_count`, `duration_days`, `change_type`, `provider`, `category`, `severity`.
- Browser-side "first reached" events use a namespaced `localStorage` or `sessionStorage` key. Interaction events represent a deliberate interaction and are not deduplicated across separate clicks.
- A provider conversion must be deduplicated on the server by the provider's immutable conversion/transaction ID. A click is never a booking.

## Launch activation and workspace events

These typed events answer the minimum launch questions without replacing the existing route-quality events below.

| Event | Exact trigger | Safe properties |
| --- | --- | --- |
| `route_started` | A traveller deliberately selects **Plan this route** on a public Route Detail page. | public `route_id`, `stop_count`, `duration_days`, `placement` (`hero` or `final`) |
| `homepage_prompt_started` | A homepage prompt first reaches three non-whitespace characters, whether typed or dictated. | `source`, `input_method`, `is_authenticated` |
| `trip_generation_started` | The homepage planning request is submitted, or a direct builder trip is submitted. | `trip_source`, `has_dates`, `traveller_count`, `is_authenticated` |
| `trip_generated` | The builder has produced a usable trip with at least one stop and plan item. | opaque `trip_id`, `trip_source`, `stop_count`, `duration_days`, `traveller_count`, `has_dates`, `save_state`, `result` |
| `trip_generation_failed` | Capture fails or the builder cannot produce a usable result. | `trip_source`, coarse `error_type`, `is_authenticated` |
| `trip_saved` | A meaningful local generation save or cloud persistence boundary succeeds. Passive local autosaves do not emit it. | opaque `trip_id`, `trip_source`, `save_state`, `stop_count`, `is_authenticated` |
| `trip_save_failed` | The same meaningful persistence boundary fails. | opaque `trip_id`, `trip_source`, `save_state`, coarse `error_type`, `is_authenticated` |
| `trip_overview_viewed` / `trip_itinerary_viewed` / `trip_map_viewed` / `trip_prep_viewed` | The corresponding shared Trip Workspace route is visited. | opaque `trip_id`, `workspace_view`, `route_mode`, `stop_count` |
| `trip_reopened` | A saved trip is deliberately opened from the dashboard. | opaque `trip_id`, `source`, `save_state`, `stop_count` |
| `trip_edit_started` | Edit is deliberately opened from the dashboard. | opaque `trip_id`, `source` |
| `route_repair_applied` | An existing map health recommendation is deliberately applied. | opaque `trip_id`, `repair_count`, machine-safe `repair_category`, `source` |
| `accommodation_search_started` | The existing stay finder starts its map/inventory search. | `source`, `destination_count`, `has_dates`, `provider` |

`affiliate_click` remains the single monetisation handoff event and retains its existing `category` and `provider` contract. Do not introduce PostHog-specific aliases for the same click.

### First-trip activation definition

- **Basic activation:** the same opaque `trip_id` records `trip_generated(result="usable")` and then `trip_overview_viewed(route_mode="shell")`. This represents a traveller reaching a usable route in the canonical workspace, not completing onboarding UI.
- **Strong activation:** the same opaque `trip_id` records `trip_saved(save_state="cloud")` and `trip_overview_viewed`. This represents a usable trip that can continue across devices.
- **Return signal:** a later deliberate `trip_reopened` for that trip.

Count distinct trip IDs rather than raw event totals because workspace views can repeat on reload. Segment `trip_saved` by `save_state`; local and cloud saves are intentionally separate persistence boundaries. No orientation-completion event is required, and prompt text, place phrases and traveller details remain excluded.

## Stamps events

The consent-gated pageview for `/journey/stamped` is the Stamps view measurement. Do not add a duplicate `stamps_viewed` event.

The production Stamps handlers emit the following typed interaction events at the exact triggers below.

| Event | Exact trigger | Safe properties |
| --- | --- | --- |
| `stamp_status_changed` | Once after a deliberate country-status transition is successfully saved, either to guest device state or the authenticated account. Reopening the country or rendering the resulting state does not emit it. | `previous_status`, `next_status`, `source` (`map`, `explorer`, or `country_card`), `is_authenticated` |
| `stamp_note_added` | Once when a previously empty country note is deliberately saved with content. Editing an existing note or blurring an unchanged field does not emit it. | `source` (`country_card`), `is_authenticated` |

These events never include country names, country codes or country IDs; note or memory text; photo content, filenames or metadata; or trip titles, destinations, notes or other private trip text. Status values, interaction source and authentication state are sufficient for the measurement job.

## Funnel events

| Event | Exact trigger | Required properties | Duplicate prevention |
| --- | --- | --- | --- |
| `trip_intent_created` | First point at which origin, at least one stop, timing and traveller count make route generation possible. | `traveller_count`, `stop_count`, `duration_days`, `dates_flexible`, `fixed_commitment_count`, `avoid_driving` | Once per local trip ID after the intent becomes ready. |
| `route_generated` | Route intelligence has enough data to assess the entered route. | `stop_count`, `duration_days`, `has_recommendation`, `shortfall_days`, `has_fixed_commitments` | Once per route signature: trip, ordered stops, dates and hard-constraint state. |
| `route_accepted` | Traveller explicitly uses Morrovia's order, keeps their entered order, or continues after review. | `method`, `stop_count`, `duration_days`, `has_recommendation` | Once per trip and reviewed route signature. |
| `trip_refined` | Traveller makes one structural change: stop, sequence, nights, dates, or transport decision. | `change_type`, `affected_stop_count` | Every deliberate edit is meaningful; no cross-edit dedupe. UI handlers must emit once per action. |
| `health_check_shown` | Map-plan health summary is first shown for a particular health state. | `blocking_count`, `caution_count`, `issue_count` | Once per trip and health-state signature per browser session. |
| `health_issue_resolved` | Traveller applies a safe health recommendation. | `rule` | Once per explicit apply action. |
| `trip_ready` | Trip first meets the existing readiness rule: no blocking issue and core booking decisions can be actioned. | `stop_count`, `duration_days` | Once per trip in browser storage. It is not re-fired merely because the view is reopened. |
| `budget_viewed` | The optional per-trip budget control is visible in the Time step. | `budget_band`, `stop_count`, `duration_days` | Once per trip per browser session. |
| `accommodation_action_viewed` | A destination's itinerary accommodation action is shown. | `trip_id`, `stop_id`, `sorted_count`, `stay_count` | Once per trip, stop and browser session. |
| `accommodation_map_opened` | Traveller opens the existing Stay Finder from itinerary accommodation. | `trip_id`, `stop_id` | Every deliberate open. |
| `attraction_refinement_viewed` | A destination's itinerary refinement panel is shown. | `trip_id`, `stop_id`, `selected_count` | Once per trip, stop and browser session. |
| `attraction_selected` / `attraction_removed` | Traveller adds or removes a destination attraction. | `trip_id`, `stop_id` | Every deliberate change. |
| `attraction_filter_used` | Traveller narrows the destination shortlist by category. | `trip_id`, `stop_id`, `filter` | Every deliberate filter change away from All. |
| `attraction_map_opened` | Traveller opens deeper map discovery from destination refinement. | `trip_id`, `stop_id` | Every deliberate open. |
| `affiliate_click` | Traveller deliberately opens an affiliate-supported next action. | `category`, `provider`, plus `trip_id` and `stop_id` when the surface has them | Each outbound click is counted; do not infer a booking from it. |
| `booking_attributed` | A partner webhook, reporting export, or approved server-to-server attribution identifies a completed booking. | `provider`, `category`, `trip_id` when available, `commission_amount`, `commission_currency`, `commission_status` | Server-only. Unique provider conversion ID; updates amend the same conversion rather than creating a new event. |

## Collaboration events

These names are reserved for the collaboration MVP. They must not be emitted until the server-side permission model exists.

| Event | Exact trigger | Required properties | Duplicate prevention |
| --- | --- | --- | --- |
| `trip_shared` | Owner successfully creates an email-bound, revocable shared-trip invitation. | `invite_method`, `collaborator_count` | Once per successfully created invitation ID. |
| `collaborator_joined` | Invited account joins the shared trip after email-bound verification. | `invite_method`, `collaborator_count` | Once per invitation and joining account. |
| `decision_resolved` | A shared route, transport or stop decision moves from unresolved to resolved. | `decision_type`, `resolution` | Once for each transition into `resolved`; reopening later is a new state transition. |

## What the current product emits

The public Route Detail page emits `route_started` only when a traveller deliberately selects its planner CTA; the consent-gated pageview already measures route views. The builder already emits intent, route generation, route acceptance and structural-refinement events. The map plan emits health and readiness events. Booking Readiness emits the common `affiliate_click` event for contextual partner actions. This pass adds `budget_viewed` and normalises the Saily readiness link to `affiliate_click` as well as its existing partner-specific event. Stamps uses the shared consent-gated pageview and emits `stamp_status_changed` and `stamp_note_added` only from their successful production save paths.

`booking_attributed`, and the collaboration events remain intentionally inactive until Morrovia receives a partner conversion signal or ships authenticated shared trips. Do not create a synthetic event from a click, a redirect or an estimated commission.

## Reporting view / GA4 query specification

Use GA4 Explorations initially; configure a BigQuery export before relying on revenue reporting. Apply the qualified-planner filter to `trip_intent_created` events with `traveller_count >= 1`, `stop_count between 2 and 6`, and `duration_days between 7 and 21`. This reflects the Year-1 wedge rather than generic travel browsing.

| Question | Numerator | Denominator | Notes |
| --- | --- | --- | --- |
| Qualified MAU | Distinct GA user pseudo IDs with a qualified `trip_intent_created` in calendar month | — | Track against ~1,000 Year-1 and ~10,000 Year-3 qualified MAU targets. |
| Route acceptance rate | Qualified trips with `route_accepted` | Qualified trips with `route_generated` | Segment by `has_recommendation`, stop count and fixed commitments. |
| Trip-ready rate | Qualified trips with `trip_ready` | Qualified trips with `trip_intent_created` | Treat this as planning completion, not a booking. |
| Planner → affiliate-click rate | Qualified trips with `affiliate_click` after intent | Qualified trips with intent | Report by category and provider. |
| Planner → attributed-booking conversion | Qualified trips with a confirmed `booking_attributed` | Qualified trips with intent | The planning assumption is ~12%; show `not available` until verified conversion data exists. |
| Average affiliate revenue per monetised trip | Sum of confirmed commission amounts | Distinct trips with confirmed positive commission | Keep pending/estimated revenue in a separate metric. Planning assumption: ~£70 per monetised trip. |

For a warehouse export, aggregate by opaque `trip_id` only within the analytics retention policy. A report must separately expose:

```text
estimated_commission = partner-reported provisional amount, if any
confirmed_commission = paid/approved provider conversion amount only
```

Never add estimated commission to confirmed revenue, and never multiply affiliate clicks by an assumed commission in product reporting.

## Pre-launch operating checklist

1. Add the production GA4 measurement ID and obtain consent before testing.
2. Register the listed event parameters as GA4 custom dimensions only where they are useful for a decision; avoid high-cardinality destination names and free text.
3. Configure BigQuery export before revenue dashboards are treated as decision-grade.
4. When a partner supports attribution, build a signed server-side webhook/CSV importer that writes a unique provider conversion record and emits `booking_attributed` only after validation.
5. Review the schema whenever a new partner, collaboration feature or sensitive trip field is introduced.
