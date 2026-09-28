# Contextual one-time feedback

**Status:** Approved for implementation planning with account, timing and concurrency clarifications. No product implementation in this document.

**Source:** [Skim-first review](../../product/skim-first-mockup-review.md), section D; revised opened and retry specimens in `docs/product/skim-first-mockups/revisions/`.

## Traveller job and scope

After meaningful planning, an authenticated traveller may share a quick assessment without interrupting the trip. Morrovia needs one deliberate survey response per account. This is a contextual, dismissible invitation within an eligible existing trip workspace, not a Dashboard-only button, dock, automatic modal or new feedback application. Ordinary user-initiated Help/feedback remains a separate path.

## Existing owners and gaps

- Extend `EasyTFeedback` and its existing account-facing form: question, five accessible rating choices, optional note and explicit submit. Use existing controls/tokens. The current component lives only in Dashboard, opens as a form immediately, stores unscoped browser-local dismissal/draft keys, and posts to `/api/easyt/feedback`.
- `requireEasyTOwner`, the feedback API and `createEasyTFeedback` remain the authenticated submission owners. The current table has no survey identity or account-level uniqueness; a browser flag cannot enforce this policy across tabs/devices.
- Existing TripShell/workspace mutations remain the owners of trip state. A survey eligibility signal observes acknowledged meaningful planning success; it does not take ownership of the mutation or count a button click/optimistic change as success.
- Reuse `MorroviaSectionStatus` or existing feedback language only where semantically appropriate. Do not change the separate save, recovery or serious warning treatments.

## Eligibility and quiet placement

The initial beta policy requires **all** of these before an automatic invitation can be offered:

1. An authenticated account whose survey state shows neither dismissal nor successful response.
2. At least **10 minutes of active foreground use** in the current account. This is an initial product choice, not a claim about optimal timing. Hidden/background, idle and unauthenticated time do not count; concurrent tabs must not multiply duration. Route changes do not reset accrued eligibility. Account switches discard the former account's in-memory eligibility and draft from the newly active account's view.
3. At least one successful, meaningful planning action acknowledged by its existing canonical mutation/persistence owner for that account. Examples include a saved activity edit, confirmed route change or saved stay choice. Browsing, sign-in, failed attempts and optimistic updates awaiting acknowledgment do not qualify.
4. An eligible populated workspace and a quiet in-flow location **after** useful content. The invitation waits until typing/editing, dragging/reordering, dialogs, saving/recovery, auth/booking handoff and unresolved actionable errors are clear. It never shifts controls beneath an active pointer or keyboard interaction, steals focus, scrolls the page, or obscures navigation, maps or sticky actions. Eligibility may be met earlier; display waits for this boundary.

The existing feedback/account owner coordinates invitation state. The implementation plan must define an exact conservative local clock: activity signal, idle cutoff, visibility/focus handling, route and reload behaviour, and how simultaneous tabs avoid counting the same elapsed time twice. Activity qualification can remain account-scoped on this device; it does not require cross-device time synchronization or a telemetry pipeline. Dismissal and successful-response state are authoritative server-side across devices. The owner rechecks eligibility before display and submission. Analytics consent/delivery, button clicks, failed writes and optimistic trip changes cannot substitute for an acknowledged successful planning action.

The old `easyt-dashboard-feedback-dismissed` and `easyt-dashboard-feedback-draft` keys are unscoped. Never import their values into the signed-in account currently using the browser. New local timer or draft state must be keyed to the existing authenticated account identity. On account switch, clear the former account's visible response, invalidate its pending UI work, prevent its rating/note from being submitted as the new account, and never replay its pending dismissal under the new account. Do not send note text, rating drafts or raw interaction data to analytics.

If authoritative account survey state cannot be read, defer the invitation; unknown state is not permission to prompt. If a dismissal write fails, hide the invitation for the current session, retain the account-scoped dismissal intent for retry, and do not claim cross-device suppression until the server acknowledges it. The later implementation plan must define recovery for this narrow outage case without reopening the feedback form or interrupting planning.

## Invitation and form states

| State | Visible behaviour | Persistence/transition |
| --- | --- | --- |
| Ineligible/deferred | No invitation | Re-evaluate when account, activity, action success or quiet state changes; do not reserve a blank area |
| Eligible invitation | One compact question with **Share feedback** and an accessible dismiss control after populated work | Deliberate Share feedback opens the form. Dismiss records account + survey dismissal and ends automatic invitations |
| Form open | Question, accessible selected rating choices, optional note, **Send feedback**, dismiss | The Share feedback invitation action disappears. Rating choice alone never submits. Preserve selected state and focus order |
| Sending | Retain the response, indicate progress, prevent accidental duplicate sends | Send an idempotent request through the existing authenticated feedback API |
| Confirmed success | Quiet acknowledgement; no further automatic invitation | Exactly one successful response for this survey/account, enforced atomically server-side |
| Failed or uncertain submission | Keep rating and note with a concise error and **Try again**; keep dismiss | Retry the same submission identity. Do not claim an account save or successful response until confirmed |

Five rating choices retain meaningful spoken labels (“1 out of 5” through “5 out of 5”) and expose selection with a coherent single-choice pattern. Keyboard users can select, review the note and deliberately submit; the dismiss target remains reachable. The optional note is labelled and constrained as in the existing API. Removing the expanded Share feedback summary must not leave an inaccessible focus target; focus moves into the opened form or question, and dismissal returns focus sensibly to the workspace.

## One account, one survey response

Use a stable survey identity distinct from ordinary user-initiated feedback. The existing feedback/account owner stores account-scoped dismissal and enforces a unique successful response per `(account, survey)` in the database. Submission uses an idempotency identity so network timeout followed by retry returns the same result rather than inserting twice. The server derives account identity from the authenticated session, never from a client-supplied account ID. Legacy and nullable/non-survey feedback rows remain valid and do not exhaust this survey or become subject to its unique constraint. Preserve existing request validation, protections and account-deletion/retention behaviour.

An attempt's idempotency key binds to one immutable rating/note payload. Double submit, concurrent tabs/devices and retry after an accepted-but-timed-out response produce at most one successful row. While an outcome is uncertain, retain that exact payload for retry and do not reuse its key with edited content. To edit after uncertainty, first reconcile the original attempt: if accepted, show success and do not send another response; if confirmed not accepted, generate a new key for the changed payload. A definite failed write leaves the successful-response slot free. Dismissal during an in-flight submission hides the form but cannot cancel an already accepted server response; success wins over a later dismissal write. Neither a late dismissal nor a failed retry can reopen eligibility.

Dismissal prevents later automatic invitation for that account across pages, reloads, tabs and devices. Confirmed success does the same and prevents another survey response. Failed submission is neither dismissal nor success; the rating/note stay available for retry. A page change must not reset the invitation or duplicate a pending request. Account switching cannot show or submit another account's response. Existing Help/feedback may still be initiated by the user and is not silently counted as this one-time survey.

## Acceptance evidence for implementation planning

- Test authenticated and unauthenticated states; foreground activity at just below/above 10 minutes; background/idle exclusion; successful versus failed or optimistic planning action; eligible populated Itinerary and second workspace; empty first trip; and every quiet-moment suppression condition.
- Test deliberate open, no repeated invitation action in the form, accessible rating selection, optional note, explicit send, dismiss, failed send with preserved content, retry, timeout/idempotency, success, navigation, reload, multiple tabs/devices and account switching.
- Prove atomic account + survey uniqueness in repository/API tests: double submit, concurrent tabs and devices, timeout after acceptance, exact-payload retry, edit after uncertain outcome, dismissal during submission and late dismissal after success. Confirm legacy/non-survey rows stay independent, failed requests do not consume the successful-response slot and duplicate retries cannot create a second row.
- The implementation plan must name the schema migration for survey identity, account dismissal and account/survey uniqueness. Migration and concurrent-write tests may write only to a confirmed isolated local/test database. No staging/production migration, external survey configuration or live feedback submission is authorized.
- Use production components in Storybook for invitation, opened form, failure and success. Review 390px/430px and desktop placement after populated Itinerary and another workspace; no overlay, layout jump under interaction, clipped controls or page overflow.
- Local focused tests, typecheck, `audit:ui`, relevant Storybook build, build check and `git diff --check` precede a founder-review handoff. Existing serious recovery/save messages and UI audit baselines remain intact.

## Boundaries

No new feedback product, trip persistence owner, dashboard-only placement, automatic modal, booking flow, or rework of completed #349 design. This spec has a separate implementation plan and review gate; the Explore spec has no shared implementation dependency beyond existing design-system components.
