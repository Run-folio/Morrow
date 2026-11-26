"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { PRIVACY_CONSENT_CHANGE_EVENT, PRIVACY_CONSENT_STORAGE_KEY } from "@/lib/privacy-consent";
import { hasStay22PilotId, type Stay22MapInput } from "@/lib/easyt/stay22-map-pilot";
import { mayLoadStay22TesterMap, stay22TesterSearch, STAY22_TESTER_ORIGIN } from "@/lib/easyt/stay22-tester-preview";
import { EasyTButton, EasyTLinkButton, EasyTSelect } from "./easyt-controls";
import styles from "./stay22-tester-preview.module.css";

type Props = Pick<Stay22MapInput, "latitude" | "longitude" | "checkIn" | "checkOut"> & { travellers: number; stopName: string; currency: string };

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

export default function Stay22TesterPreview(props: Props) {
  const [affiliateId, setAffiliateId] = useState<string | null>(null);
  useEffect(() => {
    if (window.location.origin !== STAY22_TESTER_ORIGIN) return;
    const controller = new AbortController();
    fetch("/api/easyt/stay22-tester", { cache: "no-store", signal: controller.signal })
      .then(response => response.ok ? response.json() : null)
      .then(result => {
        if (!controller.signal.aborted && typeof result?.affiliateId === "string" && hasStay22PilotId(result.affiliateId)) setAffiliateId(result.affiliateId);
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);
  return affiliateId ? <PartnerSearch {...props} affiliateId={affiliateId} /> : null;
}

function PartnerSearch({ stopName, travellers, affiliateId, ...stay }: Props & {affiliateId: string}) {
  const region = useRef<HTMLElement>(null);
  const [adults, setAdults] = useState(Number.isSafeInteger(travellers) && travellers >= 1 && travellers <= 12 ? travellers : null);
  const [loaded, setLoaded] = useState(false);
  const [width, setWidth] = useState(0);
  const allowed = useSyncExternalStore(subscribe, consent, noConsent);
  useEffect(() => { if (!allowed) setLoaded(false); }, [allowed]);
  useEffect(() => {
    const el = region.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const search = stay22TesterSearch({ ...stay, affiliateId, adults: adults ?? 0 }, width);
  const available = Boolean(stay22TesterSearch({ ...stay, affiliateId, adults: 1 }, width));
  const showFrame = allowed && loaded && Boolean(search);
  return <section ref={region} className={styles.panel} aria-label={`Accommodation search in ${stopName}`}>
    <div className={styles.toolbar}>
      <div className={styles.heading}>
        <h3>Find accommodation</h3>
        <p>{available ? "Compare stays with Stay22." : "This search needs a mapped stop with upcoming check-in and check-out dates."}</p>
      </div>
      {available ? <div className={styles.actions}>
        <EasyTSelect label="Adults" value={adults ?? ""} onChange={event => { setLoaded(false); setAdults(Number(event.target.value)); }}>
          {adults === null ? <option value="" disabled>Select</option> : null}
          {Array.from({ length: 12 }, (_, index) => index + 1).map(count => <option key={count} value={count}>{count}</option>)}
        </EasyTSelect>
        {showFrame
          ? <EasyTButton type="button" variant="secondary" onClick={() => setLoaded(false)}>Hide results</EasyTButton>
          : <EasyTButton type="button" disabled={!allowed || !search || width <= 0} onClick={() => { if (consent() && search) setLoaded(true); }}>Show stays</EasyTButton>}
      </div> : null}
    </div>
    {available ? <div className={styles.disclosure}>
      <p>Showing stays shares this stop’s location, dates and adult count with Stay22, using your trip currency when supported. Morrovia may earn a commission if you book.</p>
      {!allowed ? <p>Allow Analytics and Affiliate Tracking in <EasyTLinkButton href="/journey/cookies" target="_blank" rel="noopener noreferrer" size="small" variant="quiet">Cookie preferences (new tab)</EasyTLinkButton> to show results.</p> : null}
    </div> : null}
    {showFrame && search ? <iframe
      className={styles.map} title={`Stay22 accommodation in ${stopName}`}
      src={search} referrerPolicy="no-referrer"
      sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-forms"
    /> : null}
  </section>;
}
