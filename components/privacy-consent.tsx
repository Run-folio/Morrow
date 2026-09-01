"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { EasyTButton, EasyTLinkButton } from "@/components/easyt/easyt-controls";
import { updateAnalyticsConsent } from "@/lib/analytics";
import {
  dispatchPrivacyConsentChange,
  OPTIONAL_PREFERENCES_OFF,
  PRIVACY_CONSENT_CHANGE_EVENT,
  readPrivacyConsent,
  storePrivacyConsent,
  type PrivacyConsentPreferences,
  type PrivacyConsentRecord,
} from "@/lib/privacy-consent";
import styles from "./privacy-consent.module.css";

export function setPrivacyConsentPreferences(
  preferences: Pick<PrivacyConsentPreferences, "analytics" | "affiliateTracking">,
): PrivacyConsentRecord | null {
  try {
    const record = storePrivacyConsent(window.localStorage, preferences);
    updateAnalyticsConsent(record.analytics ? "granted" : "declined");
    dispatchPrivacyConsentChange(record);
    return record;
  } catch {
    return null;
  }
}

/** Compatibility wrapper for older call sites; it never silently enables affiliate attribution. */
export function setAnalyticsConsent(value: "granted" | "declined") {
  const current = readPrivacyConsent();
  return setPrivacyConsentPreferences({
    analytics: value === "granted",
    affiliateTracking: current.record?.affiliateTracking ?? false,
  });
}

export default function PrivacyConsent() {
  const [ready, setReady] = useState(false);
  const [needsChoice, setNeedsChoice] = useState(false);

  useEffect(() => {
    const snapshot = readPrivacyConsent();
    if (snapshot.source === "legacy-declined") {
      setPrivacyConsentPreferences(OPTIONAL_PREFERENCES_OFF);
      setNeedsChoice(false);
    } else {
      setNeedsChoice(snapshot.source !== "current");
    }
    setReady(true);
  }, []);

  useEffect(() => {
    const refresh = () => setNeedsChoice(readPrivacyConsent().source !== "current");
    window.addEventListener(PRIVACY_CONSENT_CHANGE_EVENT, refresh);
    return () => window.removeEventListener(PRIVACY_CONSENT_CHANGE_EVENT, refresh);
  }, []);

  if (!ready || !needsChoice) return null;

  return (
    <aside className={styles.notice} aria-label="Cookie preferences">
      <div>
        <strong>Your privacy choices</strong>
        <p>Morrovia uses necessary browser technology to keep trips and accounts working. With your permission, we can also use product analytics and affiliate attribution.</p>
        <p className={styles.links}><Link href="/journey/cookies">Cookie notice</Link><Link href="/journey/privacy">Privacy notice</Link></p>
      </div>
      <div className={styles.actions}>
        <EasyTButton size="small" variant="secondary" onClick={() => { setPrivacyConsentPreferences(OPTIONAL_PREFERENCES_OFF); setNeedsChoice(false); }}>Reject optional</EasyTButton>
        <EasyTButton size="small" variant="secondary" onClick={() => { setPrivacyConsentPreferences({ analytics: true, affiliateTracking: true }); setNeedsChoice(false); }}>Accept optional</EasyTButton>
        <EasyTLinkButton size="small" variant="quiet" href="/journey/cookies#cookie-settings">Manage preferences</EasyTLinkButton>
      </div>
    </aside>
  );
}
