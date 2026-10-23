# P0 receipts and acknowledgement implementation plan

> **For agentic workers:** Use superpowers:executing-plans for inline implementation; independent higher-reasoning review is required before readiness.

**Goal:** Save a distinct guest trip beside existing account history without replacing input, and prevent generic cache reads from acknowledging pending saves.

**Architecture:** Keep completed intake provenance in an independent owner/trip entry using existing codecs and paired persistence. Only the exact save acknowledgement retires a native recovery; generic cache/equivalence reads preserve it. Existing documents remain readable without migration.

**Tech Stack:** TypeScript, native storage, existing IndexedDB entry protocol, Node tests and isolated loopback browser fixtures.

**Spec:** `../staging-diagnostics-search-release-20261022/P0-RECEIPT-COMPATIBILITY-DECISION-20261022.md` and parent's accepted contract.

## Global constraints

- No commit, push, build, deployment, paid calls, owner-data mutation, adoption or cleanup.
- No server migration, IndexedDB upgrade, implicit overwrite or new account authority.
- Preserve Home input, every guest byte and all unrelated recovery branches.
- Missing new metadata does not invalidate legacy saved trips.
- Refresh is not a concurrency fence; older tabs remain potentially buggy.

## Review focus

- Same-trip differing receipt or input refuses before remote promotion.
- Owner/source changes during cloud acknowledgement cannot earn local completion.
- Old readers/writers ignore but cannot erase independent completed provenance.
- Genuine quota path retains receipt atomically with body/input; native path verifies each.
- Native pending saves in another document cannot be retired by matching cached bodies.

### Task 1: Independent completed receipt

**Files:** `durable-entry-protocol.ts`, `private-browser-context.ts`, new `trip-receipt-persistence.ts`, `two-store-entry-persistence.ts`, `two-store-trip-persistence.ts`, `durable-recovery-store.ts`, `storage.ts`; tests `explicit-guest-history.test.ts`, new `trip-receipt-persistence.test.ts`.

**Interfaces:** `tripReceiptStorageKey(ownerId,tripId)`; `completedTripReceipt(raw,ownerId,tripId)`; `createTripReceiptPersistence(storage,driver,context)` exposing read/prepare with existing entry contracts.

- [x] Capture guest-history refusal with clean-account and true-conflict controls; actual two-tab UI reproduces it.
- [x] Add receipt validation, retention, quota, concurrent-write and old-reader/writer regressions; observe red.
- [x] Add `trip-receipt` scope and codec adapter, requiring completed matching owner/trip/fingerprint with no pending/review.
- [x] Pair receipt with new body/input and leave account Home untouched; retain exact source/Home/receipt witnesses across ACK.
- [x] Read back receipt after native acknowledgement and qualify retry/legacy compatibility.

### Task 2: Save ownership at retirement

**Files:** `storage.ts`; affected storage and pending-cache tests.

- [x] Reproduce second-document cache retirement through actual broker and equivalence-reconciliation bypass.
- [x] Generic cache may cache; equivalence classification is read-only; both they must not retire a recovery without its exact save ACK.
- [x] Preserve explicit save acknowledgement retirement, including exact retries and differing concurrent recovery handles.
- [x] Update prior tests that assumed equivalence grants ACK to the accepted contract; retain their data checks and verify explicit-ACK controls.

### Task 3: Integrated qualification

- [x] Run relevant persistence/entry/claim/guest/Builder regressions and typecheck without a production build.
- [x] Run isolated guest/history and signed-in two-tab sequences, save/reopen/edit/reload with controlled auth and server; no real OAuth/SQL claim.
- [x] Obtain independent implementation review; address proven findings, preserve baseline failures and report unrun gates.
- [x] Export exact diff/manifest and staged-build recommendation; publication remains held.


## Implementation qualification notes

- Independent review found and corrected receipt codec disagreement, generic native immutability, consumer cache-event recursion, stale retained bookkeeping after adoption, no-op status, automatic import-repair retry admission, owner-generation revival and native/IDB completion readback windows. Each reproduced boundary has a focused regression.
- Explicit workspace mutation may retry the exact retained account submission via existing strict CAS and exact ACK. It does not enter the rebase queue, retry on hydration, create claim authority or invoke its new mutation twice.
- Guest promotion uses the existing paired-scope driver for a read-only completion witness. `trip-receipt` is admitted there only for target-owner read-only requests; write admission is unchanged. The destination native witness precedes final reads.
- Local qualification uses controlled auth/account responses and isolated native Chromium storage. It does not prove real OAuth, SQL or hosted asset behaviour.
- Existing main/f894 source adapters preserve independent receipt bytes through native and modelled IDB read/edit/ACK/rollback. Already-running old clients retain their earlier recovery-retirement behaviour; refresh is not a concurrency fence.
- Publication remains held. No commit, hosted build, paid call, deployment or owner-storage mutation was performed.
