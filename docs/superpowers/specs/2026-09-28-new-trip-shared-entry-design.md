# New Trip Entry: Shared Homepage Planner and Preserved Import

**Date:** 2026-09-28

**Source:** `codex/post-mvp-staging-candidate` at `8fb031993ff701259ad47ddc0f190e1acbd5ebf6`

**Branch:** `codex/new-trip-shared-entry`

**Status:** Technical design for review; no product implementation

## Purpose and approved direction

A traveller starting a new trip should see the familiar homepage planner in the normal New trip page, choose either **Plan with stops** or **Describe my trip**, and continue into the existing Builder once. Import remains a clear secondary path. The founder's screenshots illustrate the current homepage planner and older New trip entry; current accepted production components and copy govern the implementation. This work changes the genuinely empty creation presentation, not the populated **Shape the route** Builder or the trip model.

## Existing ownership and integration boundary

| Concern | Existing owner and intended treatment |
| --- | --- |
| Dual-mode capture, controls, voice, validation, AI disclosure | Reuse `MorroviaTripCapture` with its controlled `homepageEntry` composition. Its tab choice and form submit remain callbacks, not a new canonical trip owner. |
| Multi-stop editing and place identity | Reuse `HomeDestinationEditor`, `HomepageDestinationEntry`, canonical autocomplete and `projectHomepageInput`. Preserve entry IDs/order and selected canonical place records, including repeated destinations. |
| Intake choices and explicit clears | Reuse the existing owner-scoped `HomepageInputSnapshot` choice semantics and projection rules. A narrow controlled intake adapter may be extracted for homepage and New trip; do not clone the snapshot model or projection. |
| Homepage route handoff | `HomeTripStarter` retains its `commitHomepageHandoff`, receipt and `router.push` behaviour. Do not mount its navigation controller unchanged in `/journey/new`. |
| Builder state and save | `TripBuilderDocument` owns the canonical draft, clarification, generation, recovery and persistence. The New trip surface adapter submits the projected intake to this owner once, using existing application paths. It cannot create a second trip document or save path. |
| Spreadsheet import | Keep `/journey/new/import`, its CSV/XLSX/paste parser, review and confirmation. Import creates its canonical trip through the existing recovery/account path. |
| Shared UI | Follow `docs/design-system.md`, current Journey tokens, `EasyTButton`/link, `JourneyEndpointsEditor` and current navigation. Add only a narrow shared extraction if the current controlled capture cannot serve both surfaces safely. |

The homepage's `HomeTripStarter` currently owns an owner-scoped intake snapshot and a navigation receipt. The Builder currently owns its own brief/route state and shows `MorroviaTripCapture` without the dual-mode prop, followed by a separate first-place field. The selected approach is to share **the controlled capture and intake semantics**, while keeping surface-specific submission effects: homepage navigates through its established handoff; New trip commits into its already-mounted Builder. Import remains a route, not a newly invented dialog.

## Entry-state decision

The existing Builder hydration path decides which document is present before the new starter can render. Keep this precedence:

1. An explicit `trip`/`recover` URL loads that exact allowed trip or the current unavailable/recovery state.
2. A queryless current draft recovery resumes its existing trip.
3. A valid `homeDraft=1` receipt or `inspire` route/template handoff applies its current Builder projection, including source route, stop occurrence/order, dates and nights.
4. Clarification, prompt context, inline stop context or a useful route skeleton stays in the existing Builder.
5. Only after hydration, with none of the above, show the fresh dual-mode starter.

No empty starter flashes during session or document hydration. A saved trip elsewhere in the library does not by itself replace an intentionally fresh creation; only the existing current-draft recovery contract does. Account/guest owner changes continue to fail closed where the current Builder does. A restored **intake** that has not become a Builder document appears in its last intended mode with both tabs' data retained; a submitted handoff or document takes the earlier paths.

## Fresh-entry composition

Show one page heading, **New trip**, above the shared `Plan with stops | Describe my trip` capture. Use the neutral Journey page container, homepage planner controls and responsive composition. Do not copy the homepage photographic hero, marketing copy, inspiration content or hero height. Remove the old empty-only eyebrow, repeated Describe/Tell us headings and separate first-place autocomplete once the shared stop editor covers that job. Keep one primary **Plan my trip** action in either mode. Use current accepted EN/ES strings and visible labels.

For a genuinely fresh entry, default to **Plan with stops**, as the homepage does. Plan with stops contains the real multi-stop editor, canonical selections, date range, travellers, budget, interests, optional endpoints and their existing clear states. Describe my trip contains the same prompt/voice control, validation, applicable preferences and AI disclosure. Switching tabs changes only the active mode: it does not erase the other input or silently merge the inactive mode into a submission. Dates and preferences explicitly shared by the existing snapshot remain shared. The active mode is the sole authority for the submitted route/prompt projection.

On submit, validate through the existing capture/projection contracts. Structured stops keep selected canonical IDs, ordering and repeat occurrences; do not reinterpret their labels as a fresh free-text prompt. Describe mode uses the existing abortable capture and clarification path. The Builder applies the resulting brief, endpoints, timing, travellers and explicit preferences using its existing canonical-state transitions. In-flight submission is guarded against double click, stale revision/owner, mode edit, cancellation and late capture response. Show a useful error without losing intake if projection, provider or local preservation fails. Do not mark unsaved intake as account-saved.

The integration should use one explicit surface adapter and a tested projection/application seam. Reusing `HomepageInputSnapshot` does not authorize a second persistent trip draft. Existing owner-scoped intake storage may preserve pre-submit input across navigation and reload, but the adapter must distinguish a resumable unsubmitted intake from a prior completed homepage receipt; a stale receipt cannot silently seed or regenerate a New trip. Home and New trip must not consume the same handoff twice or navigate `/journey/new` back into itself. The implementation plan must pin down this receipt/freshness boundary with tests before code changes.

### Receipt identity and semantic input freshness

Extend the **existing** `HomepageHandoffReceipt` with `semanticInputFingerprint`. One canonical pure helper in `lib/easyt/home-trip-handoff.ts`, `homepageSemanticInputFingerprint(snapshot: HomepageInputSnapshot): string`, computes it before capture or enrichment; both Homepage submission and New trip recovery use that helper. Keep the existing `inputFingerprint` as the projected-draft fingerprint for exact receipt/draft integrity. **Never compare `inputFingerprint` with a newly projected Describe draft to infer an intake edit:** provider capture can differ for identical traveller input.

The semantic fingerprint includes the active entry mode and only traveller-controlled submission meaning. For Describe, normalize the prompt with Unicode NFC, trimmed ends and collapsed whitespace while preserving words, case and punctuation. For Plan with stops, include the ordered sequence of stable occurrence entry IDs and selected canonical place IDs (or the selected canonical name and country only when no canonical ID exists); repeated selections remain distinct by occurrence. Exclude the inactive mode's prompt or stop entries. In both modes include the state and selected value of shared date, traveller, budget, interest, origin and journey-end choices; `untouched`, `cleared` and `selected` stay distinct. Normalize unordered interest IDs consistently. For selected endpoints use canonical identity where available, otherwise the traveller-selected name/country; preserve `unknown`, `same_as_start` and explicit-end distinctions. Exclude provider capture/model output, provider resolution metadata, unselected/generated coordinates and facts, timestamps, generated route state, reserved trip ID, receipt/revision/storage metadata and volatile enrichment. A semantically unchanged snapshot must yield the same fingerprint despite provider response or inactive-tab edits.

Apply this precedence after the existing owner-scoped hydration checks:

1. An existing allowed trip with the reserved receipt trip ID resumes; it is never recreated.
2. A URL handoff with matching owner, URL token, stored receipt, embedded draft receipt and projected-draft `inputFingerprint` applies its still-present draft once. New-format receipts must also carry the semantic fingerprint recorded at submission; the current intake snapshot may have changed since that submission and is not used to invalidate an otherwise exact in-flight handoff.
3. On plain New trip, a completed receipt whose `semanticInputFingerprint` equals the current snapshot's semantic fingerprint marks unchanged previously submitted intake. It cannot seed another trip; show genuinely fresh intake. A repeated Homepage submission with that same semantic input must likewise reuse its exact existing reserved trip or still-valid handoff rather than mint another reserved trip solely because a later provider capture differs; if neither remains available, use the existing recovery/unavailable state.
4. If those semantic fingerprints differ, restore the materially edited snapshot as intake **without** its completed receipt. Its next submission gets a new handoff token and Builder trip identity; it cannot reuse the old reserved trip ID. New trip still applies through the mounted Builder and never calls the homepage navigation handoff.
5. Any other owner, URL token, embedded receipt or draft-fingerprint mismatch fails closed. If the handoff draft is gone, only the exact existing reserved trip may resume; the receipt cannot reconstruct a missing draft.

Legacy receipts lacking `semanticInputFingerprint` remain readable for exact existing reserved-trip recovery and a still-present, otherwise valid URL handoff under the old receipt/draft integrity checks. On plain New trip, a legacy completed receipt cannot prove that current intake was edited: show fresh intake and do not auto-reseed it. Do not convert its volatile projected-draft fingerprint into a semantic input fingerprint. New submissions must write the new field through the same receipt/storage owner; no second receipt, storage namespace or persistence model is introduced.

## Import preservation

Place one secondary **Import existing trip** link below the capture, outside its `<form>`, visible from both modes. It opens the existing `/journey/new/import` route; its back link returns to New trip. Save the current owner-scoped intake snapshot before leaving, then restore its mode, text, selected canonical stops, date/preferences and explicit clears when returning from import or cancelling. Opening import must neither submit the capture nor replace a recoverable Builder document.

The existing importer continues to accept CSV, XLSX and pasted tables; invalid file, parser or review state stays on the import route with its useful error and leaves New trip intake intact. Successful confirmation follows the importer's current canonical recovery/account-save and workspace navigation exactly once. Existing conflict/recovery prompts take priority over replacing other work. A deliberate successful import need not merge the abandoned planner intake into the imported trip.

## Responsive, language and accessibility

At 1440/1024px the shared planner fits the normal page width; at 768px it reflows without crowding the action; at 430/390px use the capture's stacked treatment. Keep a single mode selector, a single primary submit and the secondary import discoverable. Allow the stop editor, autocomplete, calendar, personalization and import review to grow naturally; no fixed-height clipping, nested form scrolling or page-wide overflow masking. Preserve 44px mobile custom targets, visible focus, tab/arrow-key mode operation, accurate form labels, voice fallback and accessible errors. Check long destination names and supported EN/ES layouts without inventing a new localization layer.

## Acceptance and verification

Use production components in Storybook states for both fresh modes, restored input, repeated stops, long names, error and import-return context; do not create a disconnected mockup. Verify in the local application at 390, 430, 768, 1024 and 1440 CSS pixels and capture matched before/after New trip screenshots at 390/430 and desktop.

Functional cases: fresh default; mode switching retains each mode's input; canonical multi-stop submission enters Builder once with repeat identity/order; Describe submission enters existing interpretation/clarification; dates, travellers, budget, interests, endpoint and explicit-clear precedence; import open/back, invalid and successful paths; reload/restoration; fresh creation in the presence of another saved trip; homepage, route/template and imported handoffs; existing populated Builder; guest/account switch; duplicate submit/cancel/late response. Test identical Describe input with different provider capture outputs, actual prompt/shared-choice edits, identical versus reordered/replaced canonical stop occurrences, completed same versus edited intake, legacy completed receipts, exact unconsumed handoff and reserved-trip recovery. Confirm homepage capture and receipt behaviour still work after any shared extraction. Keyboard, accessible labels, touch targets and locale copy are acceptance criteria, not only screenshot details.

Run focused homepage/intake/Builder/import/recovery tests, Storybook production-component stories, typecheck, `audit:ui`, `build:check`, Storybook build if shared UI changes, and `git diff --check`. Do not weaken tests or audit allowances. Report passed, failed, skipped and unavailable checks separately. No push, deployment, CI, staging/main modification or staging database write belongs to this work.

## Review and integration boundary

This spec records the technical design for review. It is not the implementation plan and authorizes no product-code changes yet. After written-spec approval, prepare a test-first implementation plan under `docs/superpowers/plans/`; review of that plan and selection of execution method precede implementation. The resulting local branch is a candidate for the existing consolidated staging batch, not an independent release.
