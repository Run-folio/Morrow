export const PRIVACY_CONSENT_STORAGE_KEY = "easyt-analytics-consent";
export const PRIVACY_CONSENT_CHANGE_EVENT = "easyt-analytics-consent-change";
export const PRIVACY_CONSENT_POLICY_VERSION = "2026-08-30.1";

export type PrivacyConsentPreferences = {
  necessary: true;
  analytics: boolean;
  affiliateTracking: boolean;
};

export type PrivacyConsentRecord = PrivacyConsentPreferences & {
  version: typeof PRIVACY_CONSENT_POLICY_VERSION;
  decidedAt: string;
};

export type PrivacyConsentSnapshot = {
  preferences: PrivacyConsentPreferences;
  record: PrivacyConsentRecord | null;
  source: "current" | "legacy-granted" | "legacy-declined" | "none" | "invalid";
};

export const OPTIONAL_PREFERENCES_OFF: PrivacyConsentPreferences = {
  necessary: true,
  analytics: false,
  affiliateTracking: false,
};

const OPTIONAL_ANALYTICS_LOCAL_STORAGE_PREFIXES = [
  "morrovia:trip-intent-tracked:",
  "morrovia:route-generated:",
  "morrovia:route-accepted:",
  "morrovia:trip-ready:",
  "ph_",
] as const;

const OPTIONAL_ANALYTICS_SESSION_STORAGE_PREFIXES = [
  "morrovia:budget-viewed:",
  "morrovia:health-shown:",
  "morrovia:attraction-viewed:",
  "morrovia:accommodation-viewed:",
] as const;

type StorageReader = Pick<Storage, "getItem">;
type StorageWriter = Pick<Storage, "getItem" | "setItem">;
type StorageCleaner = Pick<Storage, "key" | "length" | "removeItem">;

function isCurrentRecord(value: unknown): value is PrivacyConsentRecord {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<PrivacyConsentRecord>;
  return record.version === PRIVACY_CONSENT_POLICY_VERSION
    && record.necessary === true
    && typeof record.analytics === "boolean"
    && typeof record.affiliateTracking === "boolean"
    && typeof record.decidedAt === "string"
    && !Number.isNaN(Date.parse(record.decidedAt));
}

/** Parse the established key without treating an old analytics choice as consent to new affiliate tracking. */
export function parsePrivacyConsent(rawValue: string | null): PrivacyConsentSnapshot {
  if (rawValue === null) return { preferences: { ...OPTIONAL_PREFERENCES_OFF }, record: null, source: "none" };
  if (rawValue === "granted") return { preferences: { ...OPTIONAL_PREFERENCES_OFF }, record: null, source: "legacy-granted" };
  if (rawValue === "declined") return { preferences: { ...OPTIONAL_PREFERENCES_OFF }, record: null, source: "legacy-declined" };

  try {
    const parsed: unknown = JSON.parse(rawValue);
    if (isCurrentRecord(parsed)) return {
      preferences: {
        necessary: true,
        analytics: parsed.analytics,
        affiliateTracking: parsed.affiliateTracking,
      },
      record: parsed,
      source: "current",
    };
  } catch {
    // Invalid or obsolete values fail closed below.
  }
  return { preferences: { ...OPTIONAL_PREFERENCES_OFF }, record: null, source: "invalid" };
}

export function readPrivacyConsent(storage?: StorageReader): PrivacyConsentSnapshot {
  if (!storage) {
    if (typeof window === "undefined") return parsePrivacyConsent(null);
    storage = window.localStorage;
  }
  try {
    return parsePrivacyConsent(storage.getItem(PRIVACY_CONSENT_STORAGE_KEY));
  } catch {
    return parsePrivacyConsent(null);
  }
}

export function createPrivacyConsentRecord(
  preferences: Pick<PrivacyConsentPreferences, "analytics" | "affiliateTracking">,
  decidedAt = new Date().toISOString(),
): PrivacyConsentRecord {
  return {
    version: PRIVACY_CONSENT_POLICY_VERSION,
    decidedAt,
    necessary: true,
    analytics: preferences.analytics,
    affiliateTracking: preferences.affiliateTracking,
  };
}

export function storePrivacyConsent(
  storage: StorageWriter,
  preferences: Pick<PrivacyConsentPreferences, "analytics" | "affiliateTracking">,
  decidedAt?: string,
): PrivacyConsentRecord {
  const record = createPrivacyConsentRecord(preferences, decidedAt);
  storage.setItem(PRIVACY_CONSENT_STORAGE_KEY, JSON.stringify(record));
  return record;
}

export function hasAnalyticsConsent(storage?: StorageReader) {
  return readPrivacyConsent(storage).record?.analytics === true;
}

export function hasAffiliateTrackingConsent(storage?: StorageReader) {
  return readPrivacyConsent(storage).record?.affiliateTracking === true;
}

function clearMatchingStorage(storage: StorageCleaner, prefixes: readonly string[]) {
  const keys: string[] = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key && prefixes.some((prefix) => key.startsWith(prefix))) keys.push(key);
  }
  keys.forEach((key) => storage.removeItem(key));
  return keys;
}

/** Clear only Morrovia/vendor analytics state. Planner, auth, recovery and preference keys are deliberately excluded. */
export function clearOptionalAnalyticsStorage(input?: {
  localStorage: StorageCleaner;
  sessionStorage: StorageCleaner;
}) {
  if (!input && typeof window === "undefined") return { localStorage: [], sessionStorage: [] };
  const target = input ?? { localStorage: window.localStorage, sessionStorage: window.sessionStorage };
  return {
    localStorage: clearMatchingStorage(target.localStorage, OPTIONAL_ANALYTICS_LOCAL_STORAGE_PREFIXES),
    sessionStorage: clearMatchingStorage(target.sessionStorage, OPTIONAL_ANALYTICS_SESSION_STORAGE_PREFIXES),
  };
}

export function dispatchPrivacyConsentChange(record: PrivacyConsentRecord) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(PRIVACY_CONSENT_CHANGE_EVENT, { detail: record }));
}
