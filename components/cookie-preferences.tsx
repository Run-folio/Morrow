"use client";

import { useEffect, useState } from "react";
import { EasyTButton } from "@/components/easyt/easyt-controls";
import { setPrivacyConsentPreferences } from "@/components/privacy-consent";
import {
  OPTIONAL_PREFERENCES_OFF,
  PRIVACY_CONSENT_CHANGE_EVENT,
  readPrivacyConsent,
  type PrivacyConsentPreferences,
} from "@/lib/privacy-consent";
import styles from "./cookie-preferences.module.css";

function choiceSummary(preferences: PrivacyConsentPreferences, decided: boolean) {
  if (!decided) return "No current optional choice. Optional technologies are off.";
  if (preferences.analytics && preferences.affiliateTracking) return "All optional technologies are allowed.";
  if (!preferences.analytics && !preferences.affiliateTracking) return "All optional technologies are off.";
  return preferences.analytics ? "Product analytics is allowed; affiliate attribution is off." : "Affiliate attribution is allowed; product analytics is off.";
}

export default function CookiePreferences() {
  const [preferences, setPreferences] = useState<PrivacyConsentPreferences>({ ...OPTIONAL_PREFERENCES_OFF });
  const [decided, setDecided] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const refresh = () => {
      const snapshot = readPrivacyConsent();
      setPreferences(snapshot.preferences);
      setDecided(snapshot.source === "current");
    };
    refresh();
    window.addEventListener(PRIVACY_CONSENT_CHANGE_EVENT, refresh);
    return () => window.removeEventListener(PRIVACY_CONSENT_CHANGE_EVENT, refresh);
  }, []);

  const apply = (next: Pick<PrivacyConsentPreferences, "analytics" | "affiliateTracking">) => {
    const record = setPrivacyConsentPreferences(next);
    if (!record) return;
    setPreferences(record);
    setDecided(true);
    setSaved(true);
  };

  return (
    <section id="cookie-settings" className={styles.preferences} aria-labelledby="cookie-settings-title">
      <div className={styles.heading}>
        <div>
          <p>Cookie settings</p>
          <h2 id="cookie-settings-title">Choose what Morrovia may use.</h2>
        </div>
        <strong>{choiceSummary(preferences, decided)}</strong>
      </div>

      <div className={styles.categories}>
        <article className={styles.category}>
          <div><h3>Necessary</h3><p>Authentication, security, trip planning, recovery and your saved privacy choice.</p></div>
          <span>Always on</span>
        </article>
        <label className={styles.category}>
          <div><h3>Product analytics</h3><p>Optional PostHog and, when configured in production, GA4. Morrovia sends deliberately limited product events.</p></div>
          <input type="checkbox" checked={preferences.analytics} onChange={(event) => { setPreferences((current) => ({ ...current, analytics: event.target.checked })); setSaved(false); }} />
        </label>
        <label className={styles.category}>
          <div><h3>Affiliate attribution</h3><p>Optional Omio Impact measurement and link attribution. Omio booking links still work when this is off.</p></div>
          <input type="checkbox" checked={preferences.affiliateTracking} onChange={(event) => { setPreferences((current) => ({ ...current, affiliateTracking: event.target.checked })); setSaved(false); }} />
        </label>
      </div>

      <div className={styles.actions}>
        <EasyTButton variant="secondary" onClick={() => apply(OPTIONAL_PREFERENCES_OFF)}>Reject optional</EasyTButton>
        <EasyTButton variant="secondary" onClick={() => apply({ analytics: true, affiliateTracking: true })}>Accept optional</EasyTButton>
        <EasyTButton onClick={() => apply(preferences)}>Save preferences</EasyTButton>
      </div>
      <p className={styles.status} role="status">{saved ? "Your privacy preferences have been saved." : "Changes take effect when you save them."}</p>
    </section>
  );
}
