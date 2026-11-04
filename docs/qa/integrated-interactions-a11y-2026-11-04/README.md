# Integrated staging interaction and accessibility candidate

Source commit: `bcdd694ed6e7a272093f543efec34a108376dddb`.
Branch: `codex/integrated-interactions-a11y-20261104`.
Base: staging `57757a7abc40bd16c18e32faebbd0653e1185278`.
Workspace: `/Users/shaun/Documents/Codex/2026-11-03/task-4/combined-candidate`.

The branch contains reviewed interactions7307600f, Storybook/accessibility117033f
and test-only contracts3c0f4e3 as true ancestors. No overlapping commit was applied
twice. Local source branch `codex/storybook-contract-reconciliation-20261104` was
imported from `/Users/shaun/Documents/Codex/2026-10-28/task/morrovia-homepage-map-20261103`.
The reviewed interaction source is preserved as `codex/reviewed-interactions-7307600f`.
No other checkout was edited. No deployment, push or real user/recovery data operation.

## Conflict and preservation decisions

Four Git conflicts and one auto-merge import issue required attention:

1. Builder route workspace: retain six-column accessible row/cell/header semantics
   together with reviewed touch/keyboard reorder, guarded menu acceptance/focus and
   Escape handling. No independent reorder controller or persistence path.
2. Builder route stories: retain both accepted/rejected/protected reorder fixtures
   and the accessible long-name/zero-night semantic-controls fixture.
3. Autocomplete: retain scoped context/cancellation/IME/pointer and visible-result
   ownership; use an options-only listbox. Expanded/controls/active-descendant
   reference that list only while suggestions are present. Status/error content
   remains outside the listbox.
4. Generated inventory: regenerate through `storybook:inventory`, retaining both
   story families rather than taking either historical generated file.
5. Shell stories: remove duplicate Storybook test imports introduced by auto-merge;
   retain inline name samples and new metadata/accessibility fixtures.

All auto-merged CSS/semantics were inspected. Existing canonical controls, cards,
fields, calendar, shell and workspace owners are reused. No parallel UI system,
API, save queue or recovery strategy was introduced. Stable planner callback,
card-originated edit focus restoration and async rename guards remain intact.
Analytics URL sanitization, replay masking and storage/persistence/trip-document
core files match577 byte-for-byte; rename/shared shell mutation code and Builder
reorder hook match730. The strict audit baseline only lowers accepted Journey CSS
debt403→398 from the reviewed accessibility branch; no rule was loosened.

## Independent review and correction

A fresh read-only reviewer inspected the combined production and fixture changes.
It found one P2 in both Storybook helpers: cleanup of overlapping managed owners
could restore retired fetch interception or denied storage. Both reproduced with
red tests (8/10 pass). Weak ownership records now skip retired predecessors while
preserving active and unrelated owners. Fetch forwarding also skips a retired
fixture. No original visitor storage values are read or modified. Fixture/card
suite12/12 and full selected suite282/282 pass after repair. Reviewer independently
reran12 checks and found no additional concrete P1/P2 issue in inspected source.

## Fresh verification

- Combined changed-file and targeted regressions:282/282 pass; exact file list saved.
  Includes behavioural contract tests from3c, date/row/card accessibility semantics,
  Storybook fixture isolation/qualification contracts, autocomplete/reorder/rename,
  privacy/replay and canonical acceptance tests.
- Separate recovery/persistence matrix:145/145 pass, including owner/session,
  CAS, mutation persistence, durable store, sync recovery and provenance scenarios.
- Data-safety/known-failure group:36/45 pass. The same nine failures reproduce on
  a fresh untouched577 source snapshot:19/28 pass. Names match exactly. Fixed
  commitment accepted-input scope cases (7) and native existing-input-domain route
  completion for guest/account (2) remain release concerns; not skipped or weakened.
- Typecheck and strict UI audit pass. Official inventory and Storybook build pass.
- Production build:check passes at sourcebcdd694e, buildcRcMijOdj8UfYwjwBGZ_2,
  all51 static pages, client manifest checks and227 offline assets. Generated tracked
  offline manifest restored after validation to avoid machine-specific source drift.
- Git diff checks pass. Exact ancestry and unchanged privacy source hashes recorded.

Saved logs normalize terminal line endings and trailing whitespace only.
Counts are separate overlapping suites and must not be added into a unique total.
The prior four Calendar/source contract failures pass with test-only3c reconciliation;
tests now inspect production structure/behaviour rather than obsolete markup strings.

## Remaining gates

MANUAL HOSTED VERIFICATION REQUIRED. AGENTS.md makes browser automation opt-in;
this integration used repository/Node/build checks and did not launch a browser,
server or deploy. Previous Storybook qualification and the older interaction draft
are historical evidence, not qualification of this exact combined commit. Rendered
axe/contrast, screen-reader operation, physical touch/pen, reduced motion, responsive
focus and account save/error/recovery acceptance need verification on this source
in an authorized isolated environment. Current component-semantic tests are not
claimed as a full WCAG audit.

Resolve or explicitly adjudicate the nine pristine-staging failures before release.
No staging or production publication is authorized or implied by this candidate.
