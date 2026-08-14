"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import styles from "./privacy-consent.module.css";

const CONSENT_KEY = "easyt-analytics-consent";

function hasOptionalAnalytics() {
  return Boolean(process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID || process.env.NEXT_PUBLIC_CLARITY_PROJECT_ID);
}

export function setAnalyticsConsent(value: "granted" | "declined") {
  window.localStorage.setItem(CONSENT_KEY, value);
  window.dispatchEvent(new Event("easyt-analytics-consent-change"));
}

export default function PrivacyConsent() {
  const [ready, setReady] = useState(false);
  const [needsChoice, setNeedsChoice] = useState(false);

  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !hasOptionalAnalytics()) return;
    setNeedsChoice(!window.localStorage.getItem(CONSENT_KEY));
    setReady(true);
  }, []);

  if (!ready || !needsChoice) return null;

  return (
    <aside className={styles.notice} aria-label="Analytics privacy choice">
      <div>
        <strong>Choose optional analytics</strong>
        <p>Morrovia can use analytics to understand what is working. You can continue without it.</p>
        <Link href="/journey/privacy">Read the privacy notice</Link>
      </div>
      <div className={styles.actions}>
        <button type="button" onClick={() => { setAnalyticsConsent("declined"); setNeedsChoice(false); }}>Continue without analytics</button>
        <button type="button" className={styles.accept} onClick={() => { setAnalyticsConsent("granted"); setNeedsChoice(false); }}>Allow analytics</button>
      </div>
    </aside>
  );
}
