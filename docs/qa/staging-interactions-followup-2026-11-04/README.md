# Exact deployed interaction follow-up qualification

Deployed artifact: `6ce583d7378d8584db3f6342f63656853d3568d0`.
Unique deployment origin:
https://6aea819b30c8a404bdeb9c32--morrovia-staging.netlify.app/.
Health at this URL confirms exact6ce583d with healthy auth/applicationUrl/database.
This follow-up made no deployment or production-source changes.

## Isolation and hosted results

The per-deploy URL is a separate browser origin from staging.morrovia.com. It serves
the same immutable deployed application. It did not redirect; hydrated inputs were
blank and the first-visit cookie prompt was present. Optional tracking was rejected
only on this origin. The guest signup CTA and Saved on this device status confirmed
our guest/device path. The existing draft on staging.morrovia.com was not accessed,
cleared, reset or imported. All mutations below belong to the newly created synthetic
trip `trip-1fade2b7-0189-4643-99eb-6bbb534252d7` on the unique origin.

- Template japan-slow creates a saved guest route, and Build opens its workspace.
- Inline name Save accepts Synthetic Japan QA 6ce583d and returns focus to its Edit
  trigger. Escape discards a newer draft; hard reload retains the accepted name.
- Add your own creates Synthetic morning walk QA. Card Details and actions → Edit
  activity focuses the existing editor. Save changes it to Synthetic edited walk QA,
  returns focus to its card and closes the editor. Keyboard Enter expands actions;
  Escape cancellation retains the accepted value and focuses Edit activity.
- Remove confirmation → Undo restores that activity. Hard reload retains the
  restored authored activity and trip name. This verifies reversible removal and
  device persistence, not crash/quota/cloud recovery.
- Edit trip brief opens the actual recover=1 device continuation. It retains the
  original trip ID and route: Tokyo4/Kanazawa2/Takayama3/Kyoto4/Osaka2. Space/Down/Enter
  moves Kanazawa to3, announces acceptance and retains grip focus. Space/Up/Enter
  restores2. Builder hard reload retains the exact original order/night counts.
  Reopening Itinerary still shows the accepted name and restored authored activity.
- At390px, document and viewport both measure390; card controls work and Escape
  restores the correct logical focus. A visibility issue remains below.

These are real hosted guest UI actions through the supported browser API. The
primary staging origin and production site were not used for synthetic writes.
Optional provider suggestions were displayed; no booking/affiliate link, sign-in,
account mutation or real-user trip was activated. Synthetic data is left intact on
its unique origin for follow-up; nothing was cleared for cleanup.

## Open P2: mobile returned focus obscured by sticky header

Reproduce on exact6ce at390×844: open an authored card’s Details and actions, choose
Edit activity, alter its draft, press Escape. The editor closes and document focus
returns to Edit activity, but it scrolls under sticky navigation. Measured focused
button top0.695/bottom44.695; navigation top10.5/bottom54.5; button scroll-margin-top0.
Screenshot focus-occluded-390.jpg captures the overlap. Logical focus return passes;
visible focus clearance does not. No production fix is claimed in this follow-up.

Likely repair location: TripItineraryWorkspace.returnFromActivityEdit and/or the
shared card action focus scrolling. Reuse existing --morrovia-sticky-content-offset
instead of inventing header measurements. Verify Save/Cancel, connected/replaced
cards and390/320px sticky-header clearance on the next candidate; do not hide the
finding by calling the current browser run fully green.

## Nine baseline failures reconciled without production changes

A fresh RED run temporarily restored the exact three test/helper files from6ce,
ran them against unchanged deployed production source, and restored the repairs
in finally:28 tests,19 pass,9 fail. The earlier pristine577 failure set matched.

Seven fixed-commitment failures came from a missing extracted-callback dependency:
retireBuilderEntryForInput and its entry ref were absent from the test scope. Six
surfaced ReferenceError; the accepted-clearing case swallowed the same exception
inside the actual production catch and consequently kept input. Tests now bind the
actual production retire function with the mounted-editor/null-entry state. All
15 original tests pass, including pending acceptance, refusal, A→B→A and owner/
trip/editor/mount guards. No production save guard was changed.

The other two came from an obsolete projection response fixture. Its extracted
reconciler omitted completedTransferResolutionLeg, and its claimed healthy provider
returned no transfer assessments. The production client correctly requires matching
completed assessments (or a qualified unchanged retained input). The fixture now
binds the actual completion function and returns per-leg completed/insufficient
attempt assessments, preserving honest lack of travel evidence. Guest/account
negative controls still return no assessments and verify failed leg work, retained
raw draft/generations, cold-read equality and zero account writes. Existing asserts
were not relaxed. No endpoint, chronology, recovery or persistence check was bypassed.

Verification after test-only repair:

- Full projection/fixed/race/acknowledgement group:128/128 pass.
- Independent stable reviewer rerun of four targeted files:109/109 pass; no weakened
  assertion or concrete P1/P2 issue found in test repair. Reviewer’s earlier RED run
  coincided with the intentional baseline swap; final rerun used restored repairs.
- Combined interaction/contracts/privacy/projection regression:410/410 pass.
- Typecheck passes; app/components/lib/.storybook diff against deployed6ce is empty.
- Logs normalize terminal whitespace/line endings only. RED logs remain visibly red.

## Reduced motion and remaining limits

Browser reports prefers-reduced-motion:false and offers only viewport/visibility
capabilities. No supported media override exists, and native Mac remains locked.
No OS-setting or alternate-browser workaround was used. Forced hosted reduced
motion therefore remains unverified. As an independent bounded check, the saved
source-execution script runs the actual deployed selectStop callback:reduce=true
uses auto scrolling;reduce=false uses smooth;reveal=false does not scroll. All3
cases pass. This is contract execution with substituted matchMedia, not native OS
or browser rendering proof.

Hosted quota/storage-denial/crash injection, signed-in/cloud recovery, physical
touch and screen-reader operation remain unverified. CUA evaluation is read-only;
no arbitrary browser storage/fetch fault mutation was attempted. The guest reload,
Undo and device-continuation evidence should not be expanded into those claims.

Remote staging remains6ce583d. Final remote main was observed at7f34a8b9fe8b7087813c27b0df2f4683f06813d2,
independently advanced from priora3ce3a0. This task did not push main, promote the
production site, revert that separate change or push these local test repairs.
