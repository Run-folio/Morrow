# Combined staging interaction candidate

Isolated worktree: `/Users/shaun/Documents/Codex/2026-11-03/task-4/combined-candidate`.
Combined source commit: `a7e2f044cb12808aba419d8b9f5c4a14f325e302`.

[Open the synthetic interaction review](https://interaction-review-a7e2f044--morrovia-staging.netlify.app/review.html).
This is an isolated static Storybook draft, not the deployed application.

This candidate is based on reviewed Builder commit
`491055a018c321c7afaa551817c44eb6266aeca2`, whose parent is staging
`662a42e520d4db67ee644a2e35973d002c42f89d`. It adapts the itinerary interaction
work from `0522d0972b6572769e7adfa94b18b46af37eeeab` to current staging.
Builder commit `fac3b9b` is superseded and is not applied alongside `491055a0`.
The other worker's checkout and original itinerary worktree were not edited.

## Conservative integration decisions

The older itinerary patch cannot be applied wholesale: staging has a newer
shared asynchronous mutation owner, recovery classification, versioned trip
documents, scoped rename handling, responsive detail panels and activity
actions. Those owners remain authoritative. No older save queue, synchronous
storage call, Map save gate, trip-name model or alternative mutation context
was carried forward.

- Direct inline name editing reuses staging's existing rename session, request,
  document and mount guards and its `trip-title` mutation. The menu dialog still
  works. Save/Enter, Cancel/Escape, raw-draft retention on refusal, 80-character
  validation and destination-name fallback retain current staging semantics.
- Existing card organisation controls become an in-flow native disclosure with
  a labelled summary, 44px target and Escape/focus return. The existing primary
  card selection still opens the canonical detail panel. `Open details` uses
  that same panel and its validated map, source and booking actions.
- Unbooked authored activities can hand off to the existing async row editor,
  including a day with only one editable activity. Acceptance or cancellation
  restores the editor's previous disclosure state and returns focus to the
  originating card. Canonical protection and action-scope checks remain intact.
- Builder touch reorder, search, night hierarchy, protected IDs and acceptance
  announcements come directly from `491055a0`; no interim adaptation or duplicate
  reorder implementation remains.

Reused components: canonical controls/fields, shared mutation provider,
`ItineraryDraggableCard`, `ItineraryItemDetail`, existing activity editor,
native disclosure, current Journey tokens and Storybook owners. A read-only
review found no concrete P1/P2 regression in the integration port.

## Verification

- Focused combined run: **119 passed, 0 failed**. This includes reviewed Builder
  hook/search tests, rename async/canonical mutation tests, itinerary and card
  presentation regressions, plus three direct inline-name callback tests.
- Wider combined run: **361 tests: 335 passed, 9 failed, 17 browser tests skipped**.
- The same nine failures were independently reproduced on pristine staging
  `662a42e`: **28 tests: 19 passed, 9 failed**. Baseline-only and candidate-only
  failure sets are both empty; see `failure-comparison.json`.
- Strict `npm run audit:ui` passes on pristine staging and this candidate.
  `scripts/ui-convergence-baseline.json` is byte-for-byte unchanged from staging
  (Git blob `d80c83217db6b3fae910038d1731bf90577f4265`). The older branch's
  281-to-280 Builder colour-count failure is obsolete for this staging base.
  The audit script and baseline have not been weakened or increased.
- UI convergence tests pass (7 enforcement + 4 presentation tests).
- Full `npm run typecheck` passes. Static Storybook build passes.
- Full `npm run build:check` passes with
  `COMMIT_REF=a7e2f044cb12808aba419d8b9f5c4a14f325e302`: compilation, type/lint
  checks, 51 static pages, 15 client-manifest boundaries and 227 offline assets.
  The first local build without commit metadata passed compilation and page
  generation but failed the offline-marker gate. Supplying the existing
  build-provenance environment input resolved it; no build check or config was
  relaxed. Both logs are retained.
- Locked dependencies were installed in this isolated
  worktree with install scripts and browser downloads disabled; shared dependency
  folders and environment files were not modified or copied.
- `git diff --check` passes.

The rename test's existing extracted-callback harness needed the current
`renderScope` and `retainedEquivalentRef` inputs; production persistence was not
changed to satisfy it. Stale source-only presentation assertions were updated
for the new disclosure/ref, the one-activity editor and the existing drag/map
contracts. Browser-dependent tests were not enabled.

### Existing wider-suite failures

- actual fixed commitment keeps raw input until held true acceptance
- actual fixed commitment preserves label during accepted persistence
- actual fixed commitment preserves date during accepted persistence
- actual fixed commitment preserves label-before-render during accepted persistence
- actual fixed commitment preserves date-before-render during accepted persistence
- actual fixed commitment label A to B to A cannot clear a later scope
- actual fixed commitment date A to B to A cannot clear a later scope
- native body with existing input domain completes healthy route work for guest
- native body with existing input domain completes healthy route work for isolated-account

These concern existing fixed-commitment draft/acceptance and input-domain
projection behavior. They remain release concerns and were not dismissed,
skipped, relaxed or fixed by changing unrelated persistence code.

## Remaining risks and manual checks

**MANUAL HOSTED VERIFICATION REQUIRED.** No browser, native focus, visual or real
touch pass is claimed. Existing socket/file-browser restrictions were respected;
no browser, debug port, alternate file navigation or local-server bypass was
attempted. New Storybook states (`InlineNameCancel`, `ExpandedActivityActions`,
`ExpandedActivityMobile320`) compile but their browser play functions are unrun.

Check desktop and 320/390px layouts, native summary/field focus and Escape,
screen-reader announcements, real touch/pen reorder and cancellation, reduced
motion, slow/refused saves, storage denial, account/document/view changes during
an edit, rapid rename plus itinerary/Map changes, and reload of a synthetic saved
trip. Confirm protected bookings remain unchanged and the card-to-editor return
works after renaming the only editable activity.

The UI changes do not migrate data, write real recovery records or introduce a
new persistence owner. Tests model storage and use synthetic fixtures. The nine
baseline failures and unrun native interaction checks prevent a release-ready
claim. No application deployment or Git push was performed. The separately
packaged static Storybook review is ready at the link above. Netlify deploy
`6aea636b359541b296d62558` has zero functions and is not published to the primary
site. The staging project's published deploy remains
`6aea475869734d93efb59ccc` before and after this draft upload. Production was
not changed. HTTPS checks verified HTTP 200, the synthetic-data label, CSP and
noindex headers, and a static API-unavailable response. See `static-review.json`.

The review upload is at
`/Users/shaun/Documents/Codex/2026-11-03/task-4/interaction-review-upload` and
contains only built static files, a labelled landing page, no functions, and
forced static `/api/*` responses. Its CSP prevents external connections and
form submission. No environment files or credentials were included. `.netlify`
is ignored in that upload directory. Native browser rendering and Storybook
play execution remain unverified despite the successful HTTPS checks.

The generated offline manifest from the app build was restored to its source
version after validation rather than committing a machine-specific build output.
`build-provenance.json` records the exact source commit, build ID and offline
asset count validated by the successful build.
