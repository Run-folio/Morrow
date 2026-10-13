import type { EasyTTrip, CanonicalEasyTTrip } from './trip.ts';
import type { TripRecoveryHandle, TripRecoveryRecord, TripRecoveryWriteResult } from './storage.ts';
import { sameRecoveryDocument } from './storage.ts';

function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze); Object.freeze(value);
  }
  return value;
}
const sameHandle = (a: TripRecoveryHandle | null | undefined, b: TripRecoveryHandle | null | undefined) =>
  !a && !b || Boolean(a && b && a.ownerId === b.ownerId && a.tripId === b.tripId && a.writeId === b.writeId && a.backend === b.backend);

/** One frozen pre-editor source; storage callbacks retain all persistence authority. */
export function createBuilderEntrySession<Receipt>(options: {
  key: string; ownerId: string | null; candidate: CanonicalEasyTTrip; receipt: Receipt | null;
  initialCanonical: EasyTTrip | null; openedRecovery: TripRecoveryHandle | null;
  isCurrent(): boolean;
}) {
  const candidate = freeze(structuredClone(options.candidate)), receipt = freeze(structuredClone(options.receipt));
  const initialCanonical = freeze(structuredClone(options.initialCanonical)), openedRecovery = freeze(structuredClone(options.openedRecovery));
  const scheduledWork = new Set<() => void>();
  let workReleased = false;
  let retired = false, phase: 'selected' | 'writing' | 'reading' | 'ready' | 'handed-off' | 'failed' = 'selected';
  let checkpoint: Promise<TripRecoveryWriteResult> | null = null, accepted: TripRecoveryWriteResult | null = null;
  let readback: Promise<boolean> | null = null, seedClaimed = false, checkpointClaimed = false, mountedSession: object | null = null;
  let seed: { initialTrip: CanonicalEasyTTrip; initialRecovery: TripRecoveryRecord | null; initialCanonicalTrip: EasyTTrip | null } | null = null;
  const isCurrent = () => !retired && options.isCurrent();
  const refused = (): TripRecoveryWriteResult => ({ stored: false, writeAttempted: false, blockedByExistingRecovery: false,
    failureReason: 'unknown', handle: { ownerId: options.ownerId, tripId: candidate.id, writeId: 'retired-builder-entry' } });
  return {
    key: options.key, ownerId: options.ownerId, candidate, receipt,
    isCurrent, retire() { retired = true; scheduledWork.clear(); },
    holdScheduledWork(callback: () => void) {
      if (!isCurrent()) return () => {};
      if (workReleased) { callback(); return () => {}; }
      scheduledWork.add(callback); return () => { scheduledWork.delete(callback); };
    },
    releaseScheduledWork(session: object, ownerId: string | null) {
      if (!isCurrent() || phase!=='handed-off' || mountedSession!==session || ownerId!==options.ownerId) return false;
      workReleased=true;
      for (const callback of [...scheduledWork]) { scheduledWork.delete(callback); callback(); }
      return true;
    },
    failInitialization() { if(isCurrent() && phase==='ready')phase='failed'; },
    get phase() { return phase; },
    isMountedSession(session: object, ownerId: string | null) { return isCurrent() && mountedSession===session && ownerId===options.ownerId; },
    ownsSession(session: object, ownerId: string | null) { return isCurrent() && mountedSession === session && ownerId === options.ownerId
      && Boolean(accepted || openedRecovery); },
    async checkpoint(write: (candidate: CanonicalEasyTTrip, receipt: Receipt | null, isCurrent: () => boolean) => Promise<TripRecoveryWriteResult>) {
      if (!isCurrent()) return refused();
      if (checkpoint) return checkpoint;
      phase = 'writing';
      checkpoint = (async () => {
        try {
          const result = await write(candidate, receipt, isCurrent);
          if (!isCurrent()) return { ...result, stored: false, failureReason: 'unknown' as const };
          if (!result.stored || result.recoveryDurable === false || result.readbackConfirmed === false
            || result.pointerAcknowledged === false || receipt && result.receiptAcknowledged !== true
            || result.handle.ownerId !== options.ownerId || result.handle.tripId !== candidate.id || !result.handle.writeId) {
            phase = 'failed'; return { ...result, stored: false, failureReason: result.pointerAcknowledged === false ? 'pointer-incomplete' : receipt && result.receiptAcknowledged !== true ? 'receipt-incomplete' : result.failureReason ?? 'unknown' };
          }
          accepted = freeze(structuredClone(result)); return accepted;
        } catch (cause) { if (isCurrent()) phase = 'failed'; throw cause; }
      })();
      return checkpoint;
    },
    async verifyReadback(read: (tripId: string, ownerId: string | null, isCurrent: () => boolean) => Promise<TripRecoveryRecord | null>) {
      if (!isCurrent() || !accepted && !initialCanonical) return false;
      if (readback) return readback;
      phase = 'reading';
      readback = (async () => {
        let recovery: TripRecoveryRecord | null;
        try { recovery=await read(candidate.id, options.ownerId, isCurrent); }
        catch(cause) { if(isCurrent())phase='failed'; throw cause; }
        if (!isCurrent()) return false;
        const expected = accepted?.handle ?? openedRecovery;
        if (expected && !recovery || recovery && (!expected || !sameHandle(expected, recovery)
          || recovery.ownerId !== options.ownerId || recovery.tripId !== candidate.id || !sameRecoveryDocument(recovery.trip, candidate))) {
          phase = 'failed'; return false;
        }
        seed = freeze(structuredClone({ initialTrip: (recovery?.trip ?? candidate) as CanonicalEasyTTrip,
          initialRecovery: recovery, initialCanonicalTrip: recovery ? null : candidate }));
        phase = 'ready'; return true;
      })();
      return readback;
    },
    claimCheckpoint() { if (!isCurrent() || !seed || !accepted || checkpointClaimed) return null; checkpointClaimed=true; return accepted; },
    claimSeed() { if (!isCurrent() || phase !== 'ready' || seedClaimed || !seed) return null; seedClaimed = true; return seed; },
    peekSeed() { return isCurrent() ? seed : null; },
    handoff(session: object, snapshot: { trip: EasyTTrip; browserOwnerId: string | null; recovery: TripRecoveryHandle | null;
      error?: { category?: string; deviceOutcome?: unknown } | null }) {
      if (!isCurrent() || !seed || !seedClaimed || phase !== 'ready' || snapshot.browserOwnerId !== options.ownerId
        || !sameRecoveryDocument(snapshot.trip, seed.initialTrip) || !sameHandle(snapshot.recovery, seed.initialRecovery)
        || snapshot.error?.deviceOutcome || ['storage', 'protected'].includes(snapshot.error?.category ?? '')) return false;
      mountedSession = session; phase = 'handed-off'; return true;
    },
  };
}
export type BuilderEntrySession<Receipt = unknown> = ReturnType<typeof createBuilderEntrySession<Receipt>>;
