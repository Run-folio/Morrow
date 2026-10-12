# Durable Recovery Domain Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Save and reopen protected guest/authenticated work through IndexedDB after LS quota refusal, with exact durable acceptance and unchanged legacy bytes.

**Architecture:** Retain LS persistence with a two-store readiness/provenance barrier for every updated writer; add an awaited recovery-domain continuation for fallback, transactional record/input/entry metadata and authoritative hydration. Legacy raw copies are never migrated or deleted. Shaun approved refreshed-client support and a permanent IDB-capable rollback floor after the immutable-f6 incompatibility proof. Old tabs cannot be fenced and may produce raw divergence; updated consumers preserve both and block ambiguous action.

**Tech Stack:** Existing TypeScript/React, native IndexedDB, existing canonical/owner/CAS codecs and Node tests. No new dependency.

**Spec:** `docs/superpowers/specs/2026-10-12-durable-recovery.md`.

## Global Constraints

- Base `f6e692ee7839d2aed026f128f45f286cc309ee77`; unrelated codec isolated, no encoded writes.
- Standard speed; no reset/auto-resume.
- Preserve every existing raw recovery and both failed tabs/shared auth; no live mutation or migration.
- Only native setter quota admits overflow; unknown/security/validation/scope refusal remains protected.
- No acceptance before committed exact readback and applicable entry/receipt checks; no LS locator prerequisite.
- No timestamp winner across stores; ambiguous provenance remains protected conflict.
- No push/deploy/main edits; independent exact-pin review before staging.

## Review Focus

- Old raw writer creates a smaller conflicting document while a newer sole copy exists only in IDB: no downgrade or stale success.
- Hard rollback to the actual f6 reader, guest/offline, no LS locator: the only accepted draft cannot disappear from supported recovery.
- Transaction commits but pointer/receipt completion or later readback fails: no false Saved/Undo/cloud queue acceptance.
- Owner/input revision changes while async work is pending: keep prior bytes and reject stale result.
- Trusted account ACK arrives after a newer edit or optional cache refusal: preserve the later recovery and report authority accurately.

---

### Task 0: Isolation, baseline and immutable legacy compatibility gate

**Files:** Create `scripts/recovery-overflow-compatibility-preflight.ts`; evidence in the task's external `evidence/idb-recovery/` directory.

**Interfaces:** Produces a sanitized compatibility packet `{lsQuotaRefused,rawCopiesUnchanged,oldReaderRecovered,oldWriterAcceptedConflict,rollbackRecovered}` using the actual f6 module. Does not implement or claim native IDB durability.

- [x] Confirm clean f6 worktree and run existing recovery/editor/intake baseline (128 passed).
- [x] Build public synthetic 76-copy LS pressure plus a valid sole overflow record model; invoke actual immutable f6 reader/writer.
- [x] Record immutable old-reader/rollback and divergent unobserved writer incompatibility. Independent review confirmed the exact source seam; production writer remains held pending an architecture decision.

**Run:** `node --experimental-strip-types scripts/recovery-overflow-compatibility-preflight.ts`.
**Expected:** This immutable-consumer incompatibility reproducer intentionally exits 2 after its assertions pass. It is not a general completed-store qualification gate; changing the supported-client/rollback contract requires a separately approved strategy and new qualification. Do not proceed by enabling writes or adding a voluntary flag.

**Status:** Diagnosis complete; original immutable-f6 requirement superseded by explicit human approval of the revised supported-client policy. Independent review: `../evidence/idb-recovery/INDEPENDENT-COMPATIBILITY-REVIEW.md` from the worktree root. Continue Tasks 1–4 locally; activation/publication remain held. Test supported conflict handling and reader-capable/offline rollback, not an impossible retrofit of old JS.

### Task 1: Transactional domain store and quota adapter (only after Task 0 gate)

**Files:** Create `lib/easyt/durable-recovery-store.ts`, `tests/durable-recovery-store.test.ts`; modify `lib/easyt/storage.ts` without changing raw codecs.

**Interfaces:** `openRecoveryDomain(ownerId): Promise<RecoveryDomainSnapshot>`; `commitRecoveryDomain(input: RecoveryDomainWrite): Promise<RecoveryDomainOutcome>`; `RecoveryDomainWrite` freezes scope/trip/write ID, exact full raw payload, baseline provenance and required input/entry metadata. Outcome distinguishes committed+verified, protected conflict, unavailable/security/quota/abort/readback/schema failure.

- [ ] RED: 77th quota refusal succeeds in domain while all 76 bytes remain exact; blocked/abort/corrupt/schema/readback faults fail honestly.
- [ ] Implement native IDB transaction plus exact independent readback and canonical/scope verification; no LS locator or legacy deletion.
- [ ] GREEN: focused store tests; declare a result pending until durable verification finishes.

### Task 2: Awaited editor/input/receipt acceptance

**Files:** Modify `lib/easyt/trip-builder-edit-session.ts`, `lib/easyt/trip-builder-input-draft.ts`, `lib/easyt/home-trip-handoff.ts`, `app/journey/new/trip-builder.tsx`; focused existing/new tests.

**Interfaces:** Existing LS path may remain immediate; fallback returns an explicit pending operation and commits through a scoped async continuation. Consumer-visible accepted revisions, Undo/navigation/queue change only after `RecoveryDomainOutcome` verifies the same frozen operation.

- [ ] RED: pending fallback cannot accept edit/Undo/cloud queue; owner or input revision change rejects completion; raw input and frozen receipt/pointer reopen without LS writes.
- [ ] Implement staged durable continuation and atomic domain metadata; retain raw input and prior accepted snapshots on any fault.
- [ ] GREEN: existing editor/intake tests plus reordered completion, receipt and raw-input faults.

### Task 3: Authoritative reader/reopen/claim/ACK integration

**Files:** Modify domain/shared storage plus entry readers in dashboard, homepage, Builder/import, TripShell/resolver, mutation hook, legacy map/Trip mode/Plan next and personal-route access.

**Interfaces:** Hydration readiness is required before deciding missing/fresh. `findRecoveryDomain(ownerId, tripId)` resolves provenance, never arbitrary timestamp order; `claimRecoveryDomain` and `acknowledgeRecoveryDomain` use exact handles and preserve other copies.

- [ ] RED: fresh hydrate/reload finds sole overflow copy while LS full; mixed-store divergent history is protected; guest/A-B/claim and delayed ACK preserve bytes.
- [ ] Implement ready barrier, reader/claim/status/ACK backend addressing and explicit cross-tab invalidation.
- [ ] GREEN: shared persistence, legacy caller and domain integration controls; account authority separate from cache completion.

### Task 4: Complete compatibility/native qualification and review

**Files:** Add only focused compatibility/native synthetic tests and evidence; do not alter unrelated codec or baseline failures.

- [ ] Reuse established immutable-old-reader/writer incompatibility evidence; qualify supported conflict preservation, three account CAS/claim cases, concurrent distinct edits and no-locator reopen.
- [ ] Establish independently reviewed reader floor and qualify retained offline shell/assets plus sole-domain reopen. No rollback below the floor after activation.
- [ ] Native browser tests in a fresh isolated synthetic context only; no protected tabs/profile/auth access.
- [ ] Focused suite, typecheck, audit, one exact-candidate build; document inherited failures without waiving them.
- [ ] Pin local candidate; fresh independent whole-branch review. Fix bounded reviewed defects with RED→GREEN; no staging/push yet.

## Execution ruling

Shaun explicitly approved plan-then-implementation; no additional plan confirmation is needed. Native managed worktree creation is unavailable in this thread, so the task's existing private bare Git repository supplies the fresh isolated worktree. Installed dependencies are reused by symlink; no install, environment file or credential copy.
