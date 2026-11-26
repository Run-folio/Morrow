"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { PRIVACY_CONSENT_CHANGE_EVENT, PRIVACY_CONSENT_STORAGE_KEY } from "@/lib/privacy-consent";
import { mayLoadStay22TesterMap, STAY22_TESTER_ORIGIN, type Stay22TesterSample } from "@/lib/easyt/stay22-tester-preview";
import { EasyTButton, EasyTLinkButton } from "./easyt-controls";
import { MorroviaContentDialog } from "./morrovia-feedback";
import styles from "./stay22-tester-preview.module.css";

function subscribe(callback: () => void) {
  window.addEventListener(PRIVACY_CONSENT_CHANGE_EVENT, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(PRIVACY_CONSENT_CHANGE_EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}

function consent() {
  try { return mayLoadStay22TesterMap(window.localStorage.getItem(PRIVACY_CONSENT_STORAGE_KEY)); }
  catch { return false; }
}
const noConsent = () => false;

export default function Stay22TesterPreview() {
  const [sample, setSample] = useState<Stay22TesterSample | null>(null);
  const [open, setOpen] = useState(false);
  const [mapUrl, setMapUrl] = useState<string | null>(null);
  const allowed = useSyncExternalStore(subscribe, consent, noConsent);

  useEffect(() => {
    if (window.location.origin !== STAY22_TESTER_ORIGIN) return;
    const controller = new AbortController();
    fetch("/api/easyt/stay22-tester", { cache: "no-store", signal: controller.signal })
      .then(response => response.ok ? response.json() : null)
      .then(result => { if (!controller.signal.aborted) setSample(result); })
      .catch(() => {});
    return () => controller.abort();
  }, []);

  useEffect(() => { if (!allowed) setMapUrl(null); }, [allowed]);
  if (!sample) return null;

  function close() { setMapUrl(null); setOpen(false); }

  return <>
    <div className={styles.launcher}>
      <EasyTButton type="button" size="small" variant="secondary" onClick={() => setOpen(true)}>Try Stay22</EasyTButton>
    </div>
    <MorroviaContentDialog ariaLabel="Stay22 test preview" autoFocusSelector="[data-stay22-close]" open={open} onClose={close}>
      {open ? <div className={styles.content}>
        <div className={styles.header}>
          <h2>Stay22 test preview</h2>
          <EasyTButton type="button" size="small" variant="secondary" onClick={close} data-stay22-close>Close</EasyTButton>
        </div>
        <p>Sample only: Kyoto · {sample.checkIn} to {sample.checkOut} · 2 adults</p>
        {mapUrl && allowed ? <iframe
          className={styles.map}
          title="Stay22 sample accommodation in Kyoto"
          src={mapUrl}
          referrerPolicy="no-referrer"
          sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-forms"
        /> : <>
          <p>Loading the map sends the sample search to Stay22, not your trip details. Stay22 may use analytics and affiliate cookies. Morrovia may earn a commission if you book.</p>
          {!allowed ? <div><p>Enable Analytics and Affiliate Tracking to try the map.</p><EasyTLinkButton href="/journey/cookies" target="_blank" rel="noopener noreferrer" size="small" variant="quiet">Cookie preferences (new tab)</EasyTLinkButton></div> : null}
          <EasyTButton type="button" disabled={!allowed} onClick={event => {
            if (!consent()) return;
            const width = event.currentTarget.closest("dialog")?.clientWidth ?? 0;
            setMapUrl(width > 400 ? sample.wideUrl : sample.narrowUrl);
          }}>Load Stay22 map</EasyTButton>
        </>}
      </div> : null}
    </MorroviaContentDialog>
  </>;
}
