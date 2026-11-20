"use client";

import { useState, useEffect, useSyncExternalStore } from "react";
import { buildStay22MapUrl, hasStay22PilotId, type Stay22MapInput } from "@/lib/easyt/stay22-map-pilot";
import { hasAffiliateTrackingConsent, PRIVACY_CONSENT_CHANGE_EVENT } from "@/lib/privacy-consent";
import { EasyTButton, EasyTSelect } from "./easyt-controls";
import styles from "./trip-stay-workspace.module.css";

type Props = Pick<Stay22MapInput, "latitude" | "longitude" | "checkIn" | "checkOut"> & {
  travellers: number;
  stopName: string;
};

function subscribeToConsent(callback: () => void) {
  window.addEventListener(PRIVACY_CONSENT_CHANGE_EVENT, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(PRIVACY_CONSENT_CHANGE_EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}

function affiliateConsentSnapshot() {
  return hasAffiliateTrackingConsent();
}

const noServerConsent = () => false;

export default function TripStay22Pilot(props: Props) {
  if (process.env.NEXT_PUBLIC_MORROVIA_STAY22_PILOT !== "true" || !hasStay22PilotId(process.env.NEXT_PUBLIC_MORROVIA_STAY22_AFFILIATE_ID)) return null;
  return <Stay22Search {...props} />;
}

function Stay22Search({ travellers, stopName, ...stay }: Props) {
  const affiliateId = process.env.NEXT_PUBLIC_MORROVIA_STAY22_AFFILIATE_ID;
  const [adults, setAdults] = useState(Number.isSafeInteger(travellers) && travellers >= 1 && travellers <= 12 ? travellers : 1);
  const [src, setSrc] = useState<string | null>(null);

  const affiliateConsent = useSyncExternalStore(subscribeToConsent, affiliateConsentSnapshot, noServerConsent);
  useEffect(() => {
    if (!affiliateConsent) setSrc(null);
  }, [affiliateConsent]);
  if (!buildStay22MapUrl({ ...stay, affiliateId, adults, approved: true }, "all")) return null;

  return <section className={styles.stay22Pilot} aria-label="Stay22 accommodation search">
    <h3>Browse stays in {stopName}</h3>
    {src && affiliateConsent ? <>
      <EasyTButton type="button" size="small" variant="secondary" onClick={() => setSrc(null)}>Close Stay22 search</EasyTButton>
      <iframe
        className={styles.stay22Frame}
        src={src}
        title={`Stay22 accommodation map and list for ${stopName}`}
        referrerPolicy="no-referrer"
        sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-forms"
      />
      <p>If the map doesn’t load, use the stay options below.</p>
    </> : <>
      <EasyTSelect label="Adults" value={adults} onChange={event => setAdults(Number(event.target.value))}>
        {Array.from({ length: 12 }, (_, index) => index + 1).map(count => <option key={count} value={count}>{count}</option>)}
      </EasyTSelect>
      <p>Loading Stay22 shares this stop’s location, stay dates and adult count with Stay22. Morrovia may earn a commission if you book.</p>
      {!affiliateConsent ? <p>To load Stay22, allow affiliate tracking in Cookie preferences. You can still use the stay options below.</p> : null}
      <EasyTButton type="button" variant="secondary" disabled={!affiliateConsent} onClick={event => {
        if (!hasAffiliateTrackingConsent()) return;
        const width = event.currentTarget.closest("section")?.clientWidth ?? 0;
        setSrc(buildStay22MapUrl({ ...stay, affiliateId, adults, approved: true }, width > 400 ? "all" : "listview"));
      }}>Load Stay22 map and list</EasyTButton>
    </>}
  </section>;
}
