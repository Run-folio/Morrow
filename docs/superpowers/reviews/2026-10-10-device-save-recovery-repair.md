# Device save and recovery repair

Local repair candidate based on accepted staging `9dabf1e57d1fbaa1a861086f34ea0a1ac5d6d4b4`, branch `codex/batch14-device-save-diagnosis`. No push or deployment. MAIN remains HOLD. Island-data work remains paused on its separate checkpoint.

## Diagnosis and bounded changes

1. An edit made before session hydration wrote a durable device record, but the later authenticated save did not register that exact record as an active account save. The modern shell could therefore advertise separate device changes while the same edit was saving. The hydration effect now registers the exact owner/trip/write handle before enqueueing. The shell also uses the existing current-write classification during device/saving states. This process-local classification does not hide historical pending records after reload or failed saves.
2. Deliberate discard of a separate load-time recovery removed the record and warning but left the mounted mutation guard blocked. The shell now handles the storage resolution event by adopting its known canonical cache through the existing revision-checked adopter. Adoption requires no remaining same-owner/trip recovery, no pending save, and no live cloud-conflict document. The adopter rechecks storage. It does not write the cloud trip or apply discarded optimistic changes.
3. Modern device-review actions used the legacy planner recovery URL. TripShell, its resolver conflict fallback, Itinerary and the modern map action now explicitly select the existing Builder recovery context, preserving encoded trip identity and `recover=1`. Legacy defaults remain valid.
4. The discard dialog previously acted on whichever recovery was visible when confirmed. A newer write arriving during confirmation could become its deletion target. The dialog now captures the exact reviewed record; storage still validates the immutable owner/trip/write handle. Newer or sibling records remain protected and continue blocking editing.
5. A failed current save retained its optimistic body after deliberate discard, so a subsequent edit could resave discarded content. After successful deletion of the exact reviewed current failed write, the handler now adopts its known acknowledged canonical cache. All owner/trip/write fields must match; missing or stale cache rejects discard and preserves the durable record. Pending saves reject all discard attempts. Remaining recovery or live cloud conflict prevents canonical adoption. The existing revision-checked adopter rechecks storage and document identity.

If a separate newer copy arrives during failed-current confirmation, the adopter retains that copy and arms the historical barrier. Resolving it later returns to the acknowledged account body. A failing-first two-discard sequence verifies neither deliberately discarded body can reappear in the next saved full document.

Existing serialized saves, compare-and-swap revisions, exact acknowledgements, occurrence IDs, route order, nights, commitments and itinerary mutation rules remain in use. Shared status banners, buttons and confirmation dialog were reused; no styles, component variants, Calendar layout or hotel behaviour were added.

## Evidence and practical limits

The five supplied screenshots were visually inspected. They show a device-review warning, the old map with PDF export, and an Add-plan rejection while recovery guards are active. They do not establish a lost cloud edit or capture a drag gesture.

Authorized QA-session reuse used cookie-only initialization of isolated disposable browser contexts. No password, credentials, real-user trip or real-user browser storage was changed. Hosted writes were restricted to newly created disposable QA fixtures. Their creation used the existing promotion API, not the ordinary homepage flow.

The strongest deployed-9dab trace is `batch14-device-save-repro-1791636294090` alongside this checkout. It records successful normal additions, subsequent navigation and another successful addition. A real mouse Calendar drag moved “QA save one” from Day 2 to Day 1: native drag/drop events occurred, actual cloud and canonical cache reflected the move, and no recovery remained at that snapshot. This does not establish that the user's guarded trip can drag successfully. The aggregate trace ended with a driver locator error expecting a link where Back to trip is a button; it must remain marked incomplete. No candidate code was hosted in this trace.

An earlier fixture-promotion 500 was classified as reused globally unique child IDs in the QA fixture; the runner was corrected to use the existing duplicate-document helper. It is not evidence of a repository outage. No personal-trip data loss has been demonstrated or ruled out by these disposable tests.

## Validation

- The final mounted suite passes 9/9 with no skips or cancellations. Meaningful failing-first tests reproduced delayed-session misclassification, wrong recovery destination/stranded discard, the newer-write discard race, subsequent resaving of a discarded failed edit, unsafe discard with missing/stale cache, and the two-discard sequence. Existing same-owner/different-owner Builder recovery cases also pass. Rejected edits preserve recovery records byte-for-byte; a surviving newer copy continues blocking mutations; accepted deliberate discard permits a subsequent account save without reload. Failed-current cases assert the next persisted full body omits deliberately discarded content.
- Focused storage, shell queue, continuity, map recovery and itinerary mutation suites pass 106/106.
- Repository typecheck, `build:check`, UI audit and Storybook build pass. Build-generated `next-env.d.ts` change was restored.
- Presentation plus continuity checks pass 39/41. The two failing presentation source assertions also fail on immutable 9dab (32/34 presentation tests): contextual-rail map surface literal and practical-facts expression. They were not weakened or repaired as unrelated work.
- Standalone ESLint cannot run because this checkout lacks an ESLint configuration. No lint-success claim is made.

Logs and raw trace receipts live in `/Users/shaun/Documents/Codex/2026-10-06/task-2/`, prefixed `batch14-device-save-`. Independent diagnosis and implementation review are separate artifacts in that directory.

Independent implementation review returned scoped LOCAL GO with no remaining Critical or Important findings. See `batch14-device-save-implementation-independent-review.md` and its reviewed-blob JSON in the evidence directory. This verdict does not qualify a deployment or release.

## Remaining gates

MANUAL HOSTED VERIFICATION REQUIRED for this local candidate: qualify recovery-open/save/reload, navigation, blocked/cancelled discard, storage errors, auth/network/409 and a real drag with actual cloud/cache checks. A live 409 cloud-save conflict remains protected until explicit cloud reconciliation; this repair releases resolved historical barriers and returns deliberately discarded failed current edits to the acknowledged account copy. Do not interpret this checkpoint as release signoff or fresh 20/20 regression qualification. A11 island resolution remains blocked and paused.

## PDF placement proposal — read-only

The old map already offers Export PDF in its Trip actions menu. The shared modern map menu only exposes playback. `GET /api/easyt/trips/[tripId]/pdf` requires an authenticated owner, fetches that owner's canonical trip and returns the existing deterministic PDF with `private, no-store`; Itinerary currently exposes no PDF action.

Recommended next scope: expose the existing export capability through the shared TripShell More/trip actions menu so it is available from Overview and Itinerary. Reuse the endpoint and shared action/status patterns. Await pending saves, make clear which acknowledged account version will export, and reject or explicitly resolve outstanding recovery/conflict rather than silently exporting a discarded or stale optimistic version. The current canonical map exporter attempts a recommendations mutation before awaiting saves; that sequencing needs review when extracting the action. No new renderer or Calendar redesign is required. This proposal has not been implemented or verified by downloading a PDF.
