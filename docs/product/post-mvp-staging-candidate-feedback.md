# Post-MVP local staging candidate: contextual feedback integration

This is a **local consolidation record**, not approval to push, migrate or deploy. Branch: `codex/post-mvp-staging-candidate`. The candidate starts from the complete `codex/contextual-feedback` history through `fed3fb979f2c77406c6e867d6b40f551d2eae30c`; #349 through `42a6986a487a39abae23c3086d0728c5463ac908` is already its ancestor and was not replayed. The feedback feature history includes `86764bf`, `4c2fd65`, `7508854`, `0c1f894`, `3c9ddc8`, `761db6b` and `fed3fb9`, including the isolated PostgreSQL and local browser verification evidence.

The candidate merges these accepted local histories, preserving their source commits:

| Owner | Accepted source tip | Integration |
| --- | --- | --- |
| Overview warnings, CTA and V09 copy | `codex/voice-overview-v09` · `2b4ee7562fec3f7859af456dd4c55c91675bcce4` | merge `96635f0` |
| Trips card cleanup, Dashboard and V12 copy | `codex/voice-trips-v12` · `f04a346f09f7488ff62e6b3173a69a98169251a8` | merge `a2e22cc` |
| Shared TripShell V18/V19 copy | `codex/voice-shared-shell` · `d8a36f1d6591feb9c5dc79037ad3b35c9ff0d4f4` | merge `135e43d` |
| Public/Builder, Stay/Transport/Map loading copy | `codex/voice-public-creation` · `48b6088` | merge `9f8fdfe` |
| Accepted Route Detail V03 copy | `codex/voice-route-detail-v03` · `8d69612277cb1789ec51238f5687da415f8c9982` | merge `5f67a78` |

The only content conflict was the generated Storybook inventory when merging Trips. It was regenerated from the combined source with `npm run storybook:inventory`. The feedback rollout assertion for Builder's device-save label was reconciled with the accepted newer Builder wording while continuing to assert that the shared save-status component receives the explicit state and label. No product behavior was changed to satisfy that assertion.

## Staging migration prerequisite

**Before enabling the survey application code on an explicitly approved staging target, apply `db/migrations/0015_easyt_feedback_survey.sql` using the established reviewed migration process.** Do not deploy the survey route/controller against an unmigrated staging database. The combined tree contains `0014_morrovia_email_idempotency.sql` followed by `0015_easyt_feedback_survey.sql`, with no duplicate number. Migration 0015 adds nullable survey columns and a partial unique index to `easyt_feedback` (created by 0003), and `easyt_feedback_survey_state` referencing `easyt_users` (created by 0001); 0008 is the existing feedback triage migration. The isolated DB integration test applies 0001, 0003, 0008 and 0015 in a disposable local schema. No staging or production database write occurred during this consolidation.

After explicit staging approval: verify the staging target and database identity; apply the reviewed migration before new survey code; deploy the consolidated batch once; then test with disposable approved staging accounts for authenticated invitation, deliberate form open, retry/replay, dismissal and successful-response suppression. Keep ordinary Help/feedback separate and preserve account switching behavior. Record the deployed SHA and results before any later release decision.

## Local verification and known separate issue

Combined local verification on this branch:

- Feedback policy, active-use, response-flow, API, presentation and rollout tests with Dashboard, TripShell, Overview and Itinerary consumers: **102 passed, 0 failed, 0 skipped**.
- Additional Itinerary, Dashboard, Stay and Map consumer run: **98 passed, 1 failed, 1 skipped**. The skip is the isolated PostgreSQL test because this worktree was not supplied a guarded local `MORROVIA_FEEDBACK_TEST_DATABASE_URL`; the feedback source branch's isolated PostgreSQL gate had already passed. The failure is the known frozen-base source assertion in `tests/trip-overview-async-lifecycle.test.ts` expecting `surface.variant` in a Map effect dependency list. Both the frozen SHA and this candidate have the same code and assertion; it is unrelated to feedback and has not been changed here.
- `npm run typecheck`, `npm run audit:ui`, `npm run build:check`, `npm run build-storybook`, `npm run storybook:inventory`, and `git diff --check`: **passed**. The Storybook inventory is regenerated for the combined source. Build-only `next-env.d.ts` output was restored.

The previously reported isolated PostgreSQL and local browser gates were passed on `codex/contextual-feedback`; they were not rerun against staging. No staging test, migration or database write is claimed here.
