import { openIndexedDbRecoveryDriver } from './durable-recovery-indexeddb.ts';
import { createTwoStoreTripPersistence, type TwoStoreContext } from './two-store-trip-persistence.ts';
import type { RecoveryDomainDriver } from './durable-recovery-domain.ts';
import { RECOVERY_DOMAIN_OVERFLOW_ENABLED, RECOVERY_DOMAIN_ACCOUNT_OVERFLOW_QUALIFIED } from './recovery-domain-policy.ts';
import { EASYT_LAST_OWNER_KEY, EASYT_TRIP_STORAGE_CHANGE_EVENT, type EasyTBrowserStorage, type TripStorageChange } from './storage.ts';

let driver: Promise<RecoveryDomainDriver> | null = null;
let ownerEpoch = 0;
let observedWindow: Window | null = null;
let channel: BroadcastChannel | null = null;

export class BrowserRecoveryReadError extends Error {
  readonly kind:'protected'|'unavailable';readonly reason:string;
  constructor(kind: 'protected' | 'unavailable', reason: string) {
    super(kind === 'protected' ? 'The device recovery needs review before continuing.' : 'Device recovery could not be checked. Keep this tab open and try again.');
    this.name = 'BrowserRecoveryReadError';
    this.kind=kind;this.reason=reason;
  }
}
/** Auth scope changes invalidate pending work; a remembered address grants no authority. */
export function invalidateBrowserRecoveryScope() { ownerEpoch++; }
export function browserRecoveryGuard(guard?: () => boolean) {
  observeBrowser(); const epoch=ownerEpoch;
  return () => { try { return epoch===ownerEpoch&&(!guard||guard()===true); } catch { return false; } };
}
function observeBrowser() {
  if (typeof window === 'undefined' || observedWindow === window) return;
  observedWindow = window;
  window.addEventListener('storage', event => { if (event.key === EASYT_LAST_OWNER_KEY && event.oldValue !== event.newValue) invalidateBrowserRecoveryScope(); });
  try {
    if (typeof window.BroadcastChannel !== 'undefined') {
      channel = new window.BroadcastChannel('morrovia-recovery-domain-v1');
      channel.onmessage = event => {
        const value: unknown = event.data;
        if (!value || typeof value !== 'object') return;
        const detail = value as TripStorageChange;
        if (!['recovery','cache','resolved','current-cleared'].includes(detail.kind)
          || !(detail.ownerId === null || typeof detail.ownerId === 'string') || !(detail.tripId === null || typeof detail.tripId === 'string')) return;
        window.dispatchEvent(new CustomEvent(EASYT_TRIP_STORAGE_CHANGE_EVENT, { detail: { kind: detail.kind, ownerId: detail.ownerId, tripId: detail.tripId } }));
      };
    }
  } catch { /* Notifications are invalidation hints, never durable ACKs or fences. */ }
}
export function broadcastRecoveryChange(detail: TripStorageChange) {
  observeBrowser(); try { channel?.postMessage({ kind: detail.kind, ownerId: detail.ownerId, tripId: detail.tripId }); } catch { /* Fresh reads remain authoritative. */ }
}
export function browserRecoveryStorage(): EasyTBrowserStorage {
  try { if (typeof window !== 'undefined') return window.localStorage; } catch { /* Unknown native source cannot be treated as empty. */ }
  throw new BrowserRecoveryReadError('unavailable','native-storage-access');
}
export async function browserRecoveryDriver(): Promise<RecoveryDomainDriver> {
  observeBrowser();
  if (!driver) {
    let factory: IDBFactory | undefined;
    try { factory = typeof window === 'undefined' ? undefined : window.indexedDB; } catch { /* Open will refuse absence. */ }
    driver = openIndexedDbRecoveryDriver(factory).catch(error => { driver = null; throw error; });
  }
  return driver;
}
export async function browserTripPersistence(ownerId: string | null, guard?: () => boolean) {
  const isCurrent=browserRecoveryGuard(guard),storage = browserRecoveryStorage();
  const context: TwoStoreContext = { ownerId, isCurrent,
    overflowEnabled: RECOVERY_DOMAIN_OVERFLOW_ENABLED, accountOverflowQualified: RECOVERY_DOMAIN_ACCOUNT_OVERFLOW_QUALIFIED };
  return createTwoStoreTripPersistence(storage, await browserRecoveryDriver(), context);
}
