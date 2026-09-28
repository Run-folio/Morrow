# Contextual One-Time Feedback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Offer one quiet contextual beta-feedback invitation after meaningful authenticated planning, with exactly one successful survey response per account.

**Architecture:** Extend `EasyTFeedback`, its authenticated API/repository and the completed #349 shared TripShell. Keep the active-use clock account-scoped on this device and observe canonical save acknowledgements; enforce dismissal, submission and idempotency in the existing account/feedback database path. Render the same in-flow invitation after populated Itinerary and Overview work via narrow workspace slots.

**Tech Stack:** React/Next.js, TypeScript, Better Auth owner session, existing Neon/PostgreSQL repository, `pg` for isolated SQL tests, Node test runner and Storybook. No new dependency or survey platform.

**Spec:** `docs/superpowers/specs/2026-09-28-contextual-one-time-feedback-design.md` at amendment commit `56422a74695c102b47201e06406afa8a985c873c`.

## Global Constraints

- Start a fresh local `codex/contextual-feedback` branch/worktree at **`42a6986a487a39abae23c3086d0728c5463ac908`**, completed `codex/itinerary-day-view-349` HEAD. Confirm SHA and clean source before editing. Its `TripShell` wraps Overview/Itinerary/Explore; `TripShellCanonicalMutationProvider` is the shared persistence owner. Do not rebuild #349 or merge Explore to prepare this plan.
- Survey policy: authenticated account + **10 minutes active foreground use** + one acknowledged meaningful planning action + populated eligible workspace + quiet moment. Ten minutes is an initial beta choice, not an optimality claim.
- One successful response per account/survey; no automatic invitation after dismissal or success. Rating selection never submits. Ordinary Help/feedback remains independent.
- No note text, rating draft or raw interaction event in analytics; no new trip persistence owner, telemetry pipeline, generic eligibility engine, modal, mobile dock, provider or UI framework.
- No product code until plan review. Local only: no push, deploy, CI, staging/main edit, staging/production migration, external configuration or live submission. Database writes only to a confirmed isolated local/test target.

## Review Focus

1. A timeout after a committed response must replay the same result without inserting twice, even when another tab/device submits (Tasks 1–2).
2. Editing a response after an uncertain send must never reuse the attempt key with a different payload (Tasks 1, 2 and 5).
3. Dismissal racing an in-flight success, and a late dismissal after success, must leave success authoritative and never reopen eligibility (Tasks 1–2 and 5).
4. Reload, route changes, background/idle time, two focused tabs and account switching must not inflate time or expose another account's draft (Tasks 3 and 5).
5. A button click, optimistic trip update, failed save or analytics event must not qualify as a successful action; recovery/dialog/drag/editing suppresses placement (Task 4).

## File map and fixed interfaces

- `db/migrations/0015_easyt_feedback_survey.sql`: nullable `survey_id`, `attempt_id` and `payload_hash` on `easyt_feedback`; a **partial unique** `(owner_id, survey_id)` index only where both are non-null; account-scoped `easyt_feedback_survey_state(owner_id, survey_id, dismissed_at)` with a primary key and `owner_id` FK `ON DELETE CASCADE`. The existing feedback-row `ON DELETE SET NULL` rule remains. Existing rows remain untouched and non-survey inserts remain unlimited.
- `lib/easyt/feedback-survey.ts`: fixed `CONTEXTUAL_FEEDBACK_SURVEY_ID = "contextual-beta-v1"`, pure policy/input validation and result types. No server credentials or trip mutations.
- `lib/easyt/feedback-survey-store.ts` and `lib/easyt/repository.ts`: a narrow parameterized SQL helper exposes `createFeedbackSurveyStore(sql: FeedbackSurveySql)` so isolated `pg` tests execute the **same SQL** production uses through the existing repository façade. The façade exports `getContextualFeedbackState(ownerId): Promise<{dismissed:boolean;submitted:boolean}>`, `dismissContextualFeedback(ownerId): Promise<void>`, `submitContextualFeedback({ownerId,attemptId,rating,comment}): Promise<"created"|"replayed"|"already-submitted"|"payload-conflict">`. The helper binds immutable normalized payload to attempt ID. It inserts atomically under the partial unique index, then reads the existing row on conflict; the same key+payload replays, a different payload under the same key conflicts, and a different accepted key reports already submitted. `createEasyTFeedback` for ordinary feedback stays unchanged; this helper is not a second product persistence owner.
- `app/api/easyt/feedback/survey/route.ts`: GET status, PATCH dismissal, POST survey submit. Each method calls `requireEasyTOwner`; no client account ID. Preserve rating 1–5, note length ≤1000, request limits/error handling and session protections. Existing `/api/easyt/feedback` keeps its ordinary contract.
- `lib/easyt/feedback-active-use.ts`: pure 60-second idle cutoff, 1-second maximum accrued time per tick, 600,000ms threshold, and account/survey-scoped storage key helpers. `components/easyt/use-feedback-active-use.ts`: trusted pointer/keyboard/wheel activity, visible + focused document, Web Locks exclusive increment when available and a conservative focused-tab lease fallback. Persist elapsed time and acknowledged-action flag per account on this device; after reload wait for fresh interaction. Unknown storage/lock state fails closed; do not count idle, hidden or catch-up time.
- `components/easyt/use-trip-mutation-persistence.ts`: expose `lastAcknowledgedMutation: {ownerId:string; tripId:string; pendingKey:string; writeId:string} | null` only after a matching canonical account-save acknowledgment. Do not derive it from `mutateTrip()`'s optimistic boolean or generic `saveState="saved"`.
- `components/easyt/easyt-feedback.tsx` and a narrow `components/easyt/contextual-feedback-controller.tsx`: reuse five-face rating/note/send form, add explicit invitation/open/retry states, account-scoped eligibility and request lifecycle. Ignore old unscoped `easyt-dashboard-feedback-dismissed` and `easyt-dashboard-feedback-draft` keys; do not migrate their contents to a signed-in account. `ContextualFeedbackSlot({workspace,hasContent,blocked})` reads the single controller and renders in flow; it does not own independent persistence.
- `components/easyt/trip-shell.tsx`, `components/easyt/trip-itinerary-workspace.tsx`, `components/easyt/trip-overview-workspace.tsx`, `app/journey/dashboard/dashboard-client.tsx`, and relevant CSS: mount the narrow controller once under TripShell, insert slots after populated work, and retire Dashboard's fixed automatic placement. Existing TripShell identity, navigation, photo and #349 day planner remain unchanged.
- Tests: new `tests/feedback-survey-policy.test.ts`, `tests/feedback-survey-db.test.ts`, `tests/feedback-survey-api.test.ts`, `tests/feedback-active-use.test.ts`, `tests/contextual-feedback-presentation.test.ts`; retain `tests/feedback-rollout.test.ts`, persistence, privacy and UI-audit tests. Add production-component Storybook states to existing feedback/Itinerary/Overview story families.

## Database test boundary

`tests/feedback-survey-db.test.ts` uses existing `pg`, but **only** when `MORROVIA_FEEDBACK_TEST_DATABASE_URL` names database `morrovia_feedback_test` on `localhost`, `127.0.0.1` or `::1`; the guard checks those parsed fields before connecting. It must never silently fall back to `DATABASE_URL` or read `.env.staging`. The test creates a disposable schema, applies prerequisite foundation/feedback migrations `0001`, `0003` and `0008` there, then `0015`; it exercises `createFeedbackSurveyStore` against the same SQL as production, checks concurrent writes, then cleans that schema. Confirm target identity before the first write. If no safe target exists, run pure/API tests and report the DB integration gate as **not verified**; do not substitute a live database. Release application of the migration is outside this plan.

---

### Task 1: Atomic survey state, migration and repository contract

**Files:** migration, `lib/easyt/feedback-survey.ts`, `lib/easyt/feedback-survey-store.ts`, `lib/easyt/repository.ts`, `tests/feedback-survey-policy.test.ts`, `tests/feedback-survey-db.test.ts`, `tests/privacy-operations.test.mjs`.

**Interfaces:** Produce repository methods and fixed survey ID from the file map; Task 2 consumes them. Legacy/null survey rows and `createEasyTFeedback` remain unaffected.

- [ ] **RED:** Add tests for partial uniqueness, old rows, ordinary unlimited feedback, successful insert, same-key/same-payload replay, same-key/different-payload conflict, different-key already-submitted, failed write then success, two concurrent clients, dismissal before/during/after success, and account deletion/retention. Make the isolated DB guard fail closed before any SQL write.
- [ ] **Run:** `node --experimental-strip-types --test tests/feedback-survey-policy.test.ts tests/feedback-survey-db.test.ts` with only the verified test URL supplied to the DB test → expected failures for missing migration/functions. Without the URL, DB tests must report an explicit skip/block, never connect to `DATABASE_URL`.
- [ ] **GREEN:** Add migration and narrow SQL helper consumed by the existing repository façade and the isolated `pg` test adapter. Unique `(owner_id,survey_id)` controls concurrent success; immutable normalized payload hash and attempt ID classify replay/conflict. Read submission first when deriving state so a late dismissal never erases success. Keep survey state tied to the authenticated owner supplied by the server route, not request JSON.
- [ ] **Run:** the same tests against the verified disposable database; run `tests/privacy-operations.test.mjs`. Record target as local/test without printing credentials. If DB target unavailable, leave this gate open and do not claim Task 1 verified.
- [ ] **Commit:** `git commit -m "feat: store one contextual survey response per account"` with task files only.

### Task 2: Authenticated survey endpoint and race semantics

**Files:** Create `app/api/easyt/feedback/survey/route.ts`, `tests/feedback-survey-api.test.ts`; modify repository method only if tests expose a race.

**Interfaces:** GET `{dismissed:boolean,submitted:boolean}`; PATCH records dismissal; POST `{attemptId:string,rating:number,comment?:string}` returns created/replayed/already-submitted or a payload conflict. `requireEasyTOwner()` supplies owner ID; no `ownerId` input is accepted. Same survey ID constant on all operations.

- [ ] **RED:** Test unauthenticated requests, invalid rating/attempt ID, note over 1000 characters, no client owner override, GET failure, double POST, two-tab/device concurrent POST, accepted-then-timeout replay, mismatched-payload retry, dismissal racing POST and late PATCH after success. Confirm ordinary POST to `/api/easyt/feedback` remains separate.
- [ ] **Run:** `node --experimental-strip-types --test tests/feedback-survey-api.test.ts` → new route/behaviour fails. Use isolated DB only for actual concurrent SQL tests from Task 1.
- [ ] **GREEN:** Reuse existing auth, validation and response conventions. Return a stable already-submitted state when a different attempt won; never claim that the losing payload was stored. Keep PATCH idempotent and success monotonic. Do not leak account IDs or note contents to logs/analytics.
- [ ] **Run:** focused API and DB tests → pass on safe test target.
- [ ] **Commit:** `git commit -m "feat: authenticate contextual survey state and submission"`.

### Task 3: Conservative account-scoped active-use clock

**Files:** Create `lib/easyt/feedback-active-use.ts`, `components/easyt/use-feedback-active-use.ts`, `tests/feedback-active-use.test.ts`.

**Interfaces:** `advanceFeedbackActiveUse(snapshot, nowMs, qualifying): ActiveUseSnapshot` adds at most 1000ms per tick; `qualifying` requires visible, focused, a trusted activity in the preceding 60 seconds and exclusive local tab ownership. `feedbackActiveUseStorageKey(ownerId, surveyId)` scopes elapsed milliseconds and acknowledged-action boolean to the existing session owner ID. The hook returns `{elapsedMs, qualifiedTime:boolean, acknowledgedAction:boolean, markAcknowledgedAction():void}`.

- [ ] **RED:** Fake-clock tests at 599,999/600,000ms; keyboard/pointer/wheel activity; untrusted/programmatic events; 60-second idle boundary; blur/hidden/sleep; route change; reload and fresh input; two tabs contending for ownership; owner switch; storage unavailable and legacy unscoped keys ignored. Assert no note/rating/event stream reaches analytics.
- [ ] **Run:** `node --experimental-strip-types --test tests/feedback-active-use.test.ts` → missing helper/hook contract fails.
- [ ] **GREEN:** Count only focused, visible, recently active time. Persist only bounded cumulative milliseconds and the acknowledged-action flag locally per account/survey. Use `navigator.locks` for exclusive read/increment/write; where unavailable, a short owner-tab lease plus focus test pauses on contention rather than double-crediting. Reset last-tick/last-input on reload, retain cumulative elapsed; route changes preserve it; account change invalidates old work. Do not synchronize active time across devices.
- [ ] **Run:** focused clock tests → pass, with deterministic fake timers and two-tab store.
- [ ] **Commit:** `git commit -m "feat: measure local active feedback eligibility"`.

### Task 4: Acknowledged planning signal and quiet workspace slots

**Files:** Modify `components/easyt/use-trip-mutation-persistence.ts`, `components/easyt/trip-shell-client.tsx`, `components/easyt/trip-shell.tsx`, `components/easyt/trip-itinerary-workspace.tsx`, `components/easyt/trip-overview-workspace.tsx`; create `components/easyt/contextual-feedback-controller.tsx`; test `tests/trip-shell-canonical-mutation.test.ts`, `tests/contextual-feedback-presentation.test.ts`.

**Interfaces:** Consume Task 3's hook and Task 2 GET state. `ContextualFeedbackSlot({workspace:"itinerary"|"overview",hasContent:boolean,blocked:boolean})` uses the one TripShell-mounted controller. The controller gates on account state, 600,000ms, and an acknowledged key beginning `itinerary-day-`, `itinerary-suggestion-`, `itinerary-activity-place-` or `stay-select-`, plus populated content and no blocker. Overview's unresolved-intent dismissal does not qualify. No action is counted from optimistic `mutateTrip` return, a generic saved banner or analytics.

- [ ] **RED:** Test a successful matching canonical save qualifies; an optimistic click, failed save, device-only recovery, unrelated hydration and analytics event do not. Test empty day/empty trip, typing/contenteditable focus, dragging/reordering, dialogs, pending save, recovery/error, auth/booking handoff and active pointer/focus suppress placement. Test navigating Overview ↔ Itinerary retains eligibility and never inserts under an interaction.
- [ ] **Run:** focused canonical mutation and presentation tests → fail for absent acknowledgment/slot.
- [ ] **GREEN:** Emit the narrow acknowledgement only after `cacheSavedTrip` confirms the current recovery handle; include the existing pending key and owner ID. Mount controller inside the #349 shared TripShell once. Place the Itinerary slot after saved day work and an Overview slot after its populated route/progress work; pass existing edit/drag/dialog state and save/recovery blockers. Require 3 seconds with no consequential interaction and no focused editable field; insert only before the traveller reaches that section or while its following controls are outside the viewport. If already reading/acting below it, defer until a later route/section entry. Do not scroll or steal focus. Do not alter TripItineraryWorkspace's day selection or persistence ownership.
- [ ] **Run:** focused tests → pass, including existing `tests/trip-itinerary-workspace-presentation.test.ts` and `tests/itinerary-workspace-mutations.test.ts`.
- [ ] **Commit:** `git commit -m "feat: gate contextual feedback on acknowledged planning"`.

### Task 5: Invitation, form, dismissal and uncertain retry

**Files:** Modify `components/easyt/easyt-feedback.tsx`, `app/journey/account.module.css` or move only its relevant selectors to a shared module, `components/easyt/contextual-feedback-controller.tsx`, `app/journey/dashboard/dashboard-client.tsx`, `tests/contextual-feedback-presentation.test.ts`; add feedback Storybook stories.

**Interfaces:** Consume Tasks 1–4. The invitation has **Share feedback**; expanded form has the question, five labelled selected rating choices, optional note, **Send feedback** or **Try again**, and dismiss, with **no repeated invitation action**. One immutable `{attemptId,rating,comment}` snapshot per send. `submit`/`dismiss` responses belong to the owner identity captured when the operation began.

- [ ] **RED:** Test deliberate open and focus, accessible single-choice rating, no auto-submit on rating, no repeated Share action when open, 44px targets, note max length, explicit send, double-click lock, uncertain timeout preserving key/payload, edit-after-uncertainty reconciliation, definite failure plus new payload/key, dismiss during send, late success, failed dismissal retry, account switch with outstanding requests/draft, and absence of fixed Dashboard placement.
- [ ] **Run:** focused feedback presentation/API tests → fail for missing lifecycle.
- [ ] **GREEN:** Extend the existing five-face form; keep an in-flow contextual invitation and existing dismiss semantics. On uncertain send keep the payload immutable for exact retry or reconcile before edits. On account switch cancel/invalidate outstanding UI callbacks, hide old draft and do not transfer old legacy keys. Suppress this survey after server-confirmed dismissal/success; retry failed dismissal under its original account only. Retain ordinary Help feedback separately.
- [ ] **Run:** focused tests and existing `tests/feedback-rollout.test.ts` → pass; inspect Storybook invitation/open/failure/success.
- [ ] **Commit:** `git commit -m "ui: offer contextual feedback once per account"`.

### Task 6: Integrated local acceptance and release boundary report

**Files:** Extend production-component Storybook fixtures for populated Itinerary and Overview, and focused account/privacy tests only where an observed gap remains. No new disconnected mockup.

**Interfaces:** Exercise Tasks 1–5 as an integrated system, including auth owner changes and existing #349 TripShell composition.

- [ ] **RED:** Add source/story assertions requiring a populated #349 Itinerary composition and a populated Overview composition to render the **same** `ContextualFeedbackSlot`, plus the four invitation/open/failure/success states. Capture the missing-fixture failure. Include selected-rating and note preservation after retry failure.
- [ ] **Run:** `node --experimental-strip-types --test tests/contextual-feedback-presentation.test.ts` → new production-story assertions fail.
- [ ] **GREEN:** Add production-component Storybook fixtures and only integration fixes exposed by this acceptance. Recheck route switch, reload, two tabs/devices, unreadable account state, legacy browser keys, concurrent submission/dismissal and ordinary feedback. Use a verified isolated local/test DB for migration/concurrency acceptance; if unavailable, report that gate as unverified and do not apply schema anywhere else.
- [ ] **Run:** `node --experimental-strip-types --test tests/feedback-survey-policy.test.ts tests/feedback-survey-db.test.ts tests/feedback-survey-api.test.ts tests/feedback-active-use.test.ts tests/contextual-feedback-presentation.test.ts tests/feedback-rollout.test.ts tests/privacy-operations.test.mjs tests/trip-shell-canonical-mutation.test.ts`; then `npm run typecheck`, `npm run audit:ui`, `npm run build-storybook`, `npm run build:check`, `git diff --check`. Inspect 390/430/768/desktop Storybook and local app states using the repository's non-browser checks first; follow `AGENTS.md` opt-in rule if browser verification becomes necessary. No CI.
- [ ] **Commit:** `git commit -m "test: cover contextual feedback in shared workspaces"` with the new story/test files.

## Final review gate and rollout dependency

Report task commits, exact base, tests passed/skipped/failed, isolated database identity check, migration SQL/results, Storybook references, local responsive evidence and unresolved risks. The migration must be reviewed and applied in a later separately authorised release process **before** serving the new survey route; do not deploy application code against an unmigrated database. This plan does not authorize a staging/production migration or product implementation. Explore remains a separate plan.

**Material uncertainty at planning time:** this host currently has no `psql`, `pg_ctl` or Docker executable, and no isolated feedback test database has been identified. Task 1's SQL concurrency gate needs a confirmed disposable local PostgreSQL target during execution; a source-only test is insufficient for release confidence. The narrow canonical-save acknowledgement must also be checked against #349's serialized save queue so optimistic changes cannot qualify.
