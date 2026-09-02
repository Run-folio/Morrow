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
| `trip_overview_viewed` / `trip_itinerary_viewed` / `trip_map_viewed` | The corresponding shared Trip Workspace route is visited. | opaque `trip_id`, `workspace_view`, `route_mode`, `stop_count` |
| `trip_reopened` | A saved trip is deliberately opened from the dashboard. | opaque `trip_id`, `source`, `save_state`, `stop_count` |
| `trip_edit_started` | Edit is deliberately opened from the dashboard. | opaque `trip_id`, `source` |
| `route_repair_applied` | An existing map health recommendation is deliberately applied. | opaque `trip_id`, `repair_count`, machine-safe `repair_category`, `source` |
| `accommodation_search_started` | The existing stay finder starts its map/inventory search. | `source`, `destination_count`, `has_dates`, `provider` |

`affiliate_click` remains the generic monetisation handoff event and retains its existing `category` and `provider` contract. The established Omio/Viator `affiliate_link_clicked` event remains a separate source only where it is already in use; do not introduce PostHog-specific aliases for the same click.

## Commercial outbound-click reporting contract

### Canonical KPI

**Commercial outbound clicks** is the count of deliberate, consented clicks that open an affiliate-supported partner destination. It is a click KPI, not a booking, availability check, quote request, or revenue estimate.

Morrovia keeps the established source events rather than migrating working CTA instrumentation solely for naming consistency:

| Source event | Exact trigger | Current partners | Reporting treatment |
| --- | --- | --- | --- |
| `affiliate_click` | A commercial CTA with a generic partner action is deliberately selected. | Trip.com, Booking.com/Booking Demand, Saily, configured activity, car-hire and ground-transport partners. | Included in the commercial outbound-click union. |
| `affiliate_link_clicked` | An Omio or Viator commercial CTA is deliberately selected. | Omio, Viator. | Included in the same union; its legacy camel-case IDs are normalized only in reporting. |

One CTA handler must emit **one** member of this union. Omio and Viator take their dedicated branch; all other affiliate actions take the generic branch. Non-affiliate fallbacks do not emit either event. The production normalizer, `normalizeCommercialOutboundClick`, exists only to define the reporting projection; it does not send a second event or change CTA behaviour.

### Canonical partner taxonomy

| Canonical partner | Source provider/partner values |
| --- | --- |
| `booking_com` | `booking.com`, `booking-demand` |
| `trip_com` | `trip.com` |
| `saily` | `saily` |
| `omio` | `omio` |
| `viator` | `viator` |
| `configured_partner` | A configured optional activity, car-hire or ground-transport provider not in the named set |
| `unknown_legacy` | Historical record with no usable provider/partner value; report separately, never silently map it to a named partner |

### Canonical placement taxonomy

`home_footer`, `homepage_stays`, `homepage_experiences`, `homepage_transport`, `homepage_connectivity`, `trip_readiness`, `booking_readiness`, `trip_prep_accommodation`, `itinerary_accommodation`, `itinerary_transfer`, `itinerary_day_experiences`, `overview_next_action`, `overview_before_you_go`, `map_stay_finder`, `map_see_experiences`, `route_detail_experiences`, and `unknown_legacy` are the only reporting values. Legacy `trip_prep_booking_readiness` and `booking_readiness_transport` both normalize to `booking_readiness`.

### Property allow-list

The reporting projection is:

```text
canonical_event = commercial_outbound_click
source_event    = affiliate_click | affiliate_link_clicked
partner         = canonical partner taxonomy
placement       = canonical placement taxonomy
category        = accommodation | connectivity | transport | ground_transport |
                  activities | car_rental | airport_transfer | flight | other
trip_id?        = opaque product ID
stop_id?        = opaque product ID
transfer_id?    = opaque product ID
workspace_view? = overview | itinerary | map
destination_count? = coarse number
```

Historical commercial events can still contain `workspace_view = prep` and the
legacy preparation placement names. Reporting continues to normalise those
records, but current product code must not emit them.

`originStopId` and `destinationStopId` may remain on the existing dedicated Omio source event for operational continuity, but are ignored by the commercial reporting projection. Do not add URLs, partner query parameters, destination names, origin/destination text, raw prompts, traveller names, booking details, notes, passport/profile context, email, payment data, prices or availability to either source event or the projection.

### Dedupe rule

Count one normalized record for each source event in the union. Current CTA handlers are mutually exclusive, so a legitimate click enters only one source event. Never dedupe separate deliberate clicks merely because their trip and placement match.

If a future release accidentally emits both source event names for the same interaction, keep the earliest event in a one-second window only when partner, placement, category, opaque trip/stop/transfer context match **and the two source event names differ**. Prefer the vendor event UUID (`$insert_id` in PostHog or the exported GA event ID) when available. Treat a same-name duplicate as an instrumentation defect to investigate, not as a revenue conversion.

### Example warehouse query / pseudocode

```sql
WITH commercial_source AS (
  SELECT event_id, event_timestamp, user_or_session_id, event_name, properties
  FROM analytics_events
  WHERE consented = TRUE
    AND event_name IN ('affiliate_click', 'affiliate_link_clicked')
), normalized AS (
  SELECT event_id, event_timestamp, user_or_session_id,
         normalizeCommercialOutboundClick(event_name, properties) AS click
  FROM commercial_source
), sequenced AS (
  SELECT event_id, event_timestamp, user_or_session_id, click.*,
         LAG(source_event) OVER interaction_window AS previous_source_event,
         LAG(event_timestamp) OVER interaction_window AS previous_timestamp
  FROM normalized
  WINDOW interaction_window AS (
    PARTITION BY user_or_session_id, partner, placement, category,
                 COALESCE(trip_id, ''), COALESCE(stop_id, ''), COALESCE(transfer_id, '')
    ORDER BY event_timestamp
  )
)
SELECT partner, placement, category,
       COUNT(*) AS commercial_outbound_clicks,
       COUNT(DISTINCT trip_id) AS trips_with_commercial_click
FROM sequenced
WHERE NOT (
  source_event <> previous_source_event
  AND event_timestamp - previous_timestamp <= INTERVAL '1 second'
)
GROUP BY partner, placement, category;
```

Use a vendor event UUID to remove exact ingestion duplicates first when one is available; the query shows the fallback for a historical dual-emitter incident. Retain a dashboard annotation for that incident. Do not use this click KPI as a booking or commission measure; confirmed provider conversion data remains server-side and separately deduplicated by immutable provider transaction ID.

### First-trip activation definition

- **Basic activation:** the same opaque `trip_id` records `trip_generated(result="usable")` and then `trip_overview_viewed(route_mode="shell")`. This represents a traveller reaching a usable route in the canonical workspace, not completing onboarding UI.
- **Strong activation:** the same opaque `trip_id` records `trip_saved(save_state="cloud")` and `trip_overview_viewed`. This represents a usable trip that can continue across devices.
- **Return signal:** a later deliberate `trip_reopened` for that trip.

Count distinct trip IDs rather than raw event totals because workspace views can repeat on reload. Segment `trip_saved` by `save_state`; local and cloud saves are intentionally separate persistence boundaries. Workspace orientation uses only `workspace_orientation_started`, `workspace_orientation_completed` and `workspace_orientation_dismissed`, with workspace, version, source, total-step count and last step reached. Prompt text, place phrases, trip IDs and traveller details remain excluded from these events.

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
| `affiliate_link_clicked` | Traveller deliberately opens the established Omio or Viator next action. | `partner`, `placement`, plus opaque trip/stop/transfer IDs where the existing surface has them | Included in the same commercial outbound-click reporting union; do not emit alongside `affiliate_click`. |
| `booking_import_reviewed` | Traveller explicitly adds or dismisses a reviewable imported booking candidate. | `source` (`forwarded_email`), categorical `type`, categorical `confidence`, and `result` (`confirmed`, `dismissed`, or `unmatched`) | Once per successful review action. Never include subject, body, sender, provider, property/operator title, location, booking reference or confirmation URL. |
| `booking_import_opened` | Traveller opens a deliberate Calendar or forwarded-confirmation import path from the itinerary. | Categorical `source`, `booking_type` (`accommodation`), and `surface` (`itinerary`) | Once per explicit open/check action. Never include event, property, destination, address, email or reference data. |
| `booking_candidate_confirmed` | Traveller confirms a possible stay into canonical trip state. | Categorical `source` (`calendar`, `forwarded_email`, or `multiple`), `booking_type`, `confidence`, and `surface` | After the validated canonical write succeeds. |
| `booking_candidate_dismissed` | Traveller rejects a possible stay. | The same categorical fields as confirmation. | After the owner-scoped candidate update succeeds; no trip mutation is implied. |
| `booking_added_manual` | Traveller saves a stay manually from the itinerary. | `booking_type` (`accommodation`) and `surface` (`itinerary`) | After the canonical local/recovery mutation is accepted. Never include the property name or booking details. |
| `booking_attributed` | A partner webhook, reporting export, or approved server-to-server attribution identifies a completed booking. | `provider`, `category`, `trip_id` when available, `commission_amount`, `commission_currency`, `commission_status` | Server-only. Unique provider conversion ID; updates amend the same conversion rather than creating a new event. |

## Collaboration events

These names are reserved for the collaboration MVP. They must not be emitted until the server-side permission model exists.

| Event | Exact trigger | Required properties | Duplicate prevention |
| --- | --- | --- | --- |
| `trip_shared` | Owner successfully creates an email-bound, revocable shared-trip invitation. | `invite_method`, `collaborator_count` | Once per successfully created invitation ID. |
| `collaborator_joined` | Invited account joins the shared trip after email-bound verification. | `invite_method`, `collaborator_count` | Once per invitation and joining account. |
| `decision_resolved` | A shared route, transport or stop decision moves from unresolved to resolved. | `decision_type`, `resolution` | Once for each transition into `resolved`; reopening later is a new state transition. |

## What the current product emits

The public Route Detail page emits `route_started` only when a traveller deliberately selects its planner CTA; the consent-gated pageview already measures route views. The builder already emits intent, route generation, route acceptance and structural-refinement events. The map plan emits health and readiness events. Commercial CTAs emit exactly one member of the documented outbound-click union: the generic event for supported partners and the established dedicated event for Omio or Viator. Saily uses the generic event only. Stamps uses the shared consent-gated pageview and emits `stamp_status_changed` and `stamp_note_added` only from their successful production save paths.

`booking_attributed`, and the collaboration events remain intentionally inactive until Morrovia receives a partner conversion signal or ships authenticated shared trips. Do not create a synthetic event from a click, a redirect or an estimated commission.

## Reporting view / GA4 query specification

Use GA4 Explorations initially; configure a BigQuery export before relying on revenue reporting. Apply the qualified-planner filter to `trip_intent_created` events with `traveller_count >= 1`, `stop_count between 2 and 6`, and `duration_days between 7 and 21`. This reflects the Year-1 wedge rather than generic travel browsing.

| Question | Numerator | Denominator | Notes |
| --- | --- | --- | --- |
| Qualified MAU | Distinct GA user pseudo IDs with a qualified `trip_intent_created` in calendar month | — | Track against ~1,000 Year-1 and ~10,000 Year-3 qualified MAU targets. |
| Route acceptance rate | Qualified trips with `route_accepted` | Qualified trips with `route_generated` | Segment by `has_recommendation`, stop count and fixed commitments. |
| Trip-ready rate | Qualified trips with `trip_ready` | Qualified trips with `trip_intent_created` | Treat this as planning completion, not a booking. |
| Planner → commercial outbound-click rate | Qualified trips with a canonical commercial outbound click after intent | Qualified trips with intent | Report by canonical partner, placement and category. |
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
