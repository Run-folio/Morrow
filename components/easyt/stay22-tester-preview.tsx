"use client";

import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { PRIVACY_CONSENT_CHANGE_EVENT, PRIVACY_CONSENT_STORAGE_KEY } from "@/lib/privacy-consent";
import { hasStay22PilotId, type Stay22MapInput, type Stay22MapView } from "@/lib/easyt/stay22-map-pilot";
import { mayLoadStay22TesterMap, stay22TesterSearch, STAY22_TESTER_ORIGIN } from "@/lib/easyt/stay22-tester-preview";
import { EasyTButton, EasyTLinkButton, EasyTSelect, EasyTSegmentedControl } from "./easyt-controls";
import styles from "./stay22-tester-preview.module.css";

type Props = Pick<Stay22MapInput, "latitude" | "longitude" | "checkIn" | "checkOut"> & { travellers: number; stopName: string; currency: string; testerAffiliateId: string };
type CompactView = Exclude<Stay22MapView, "all">;
const COMBINED_VIEW_MIN_WIDTH = 720;

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
const subscribeToFixedOrigin = () => () => {};
const browserIsTesterHost = () => window.location.origin === STAY22_TESTER_ORIGIN;
const buildIsTesterHost = () => process.env.NEXT_PUBLIC_APP_URL === STAY22_TESTER_ORIGIN;

/** Undefined until we know if this browser is eligible; null means no preview. */
export function useStay22TesterAffiliateId(): string | null | undefined {
  const candidate = useSyncExternalStore(subscribeToFixedOrigin, browserIsTesterHost, buildIsTesterHost);
  const [affiliateId, setAffiliateId] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    if (!candidate || !browserIsTesterHost()) return;
    const controller = new AbortController();
    fetch("/api/easyt/stay22-tester", { cache: "no-store", signal: controller.signal })
      .then(response => response.ok ? response.json() : null)
      .then(result => {
        if (controller.signal.aborted) return;
        const id = result?.affiliateId;
        setAffiliateId(typeof id === "string" && hasStay22PilotId(id) ? id : null);
      })
      .catch(() => { if (!controller.signal.aborted) setAffiliateId(null); });
    return () => controller.abort();
  }, [candidate]);
  return candidate ? affiliateId : null;
}

export default function Stay22TesterPreview({ stopName, travellers, testerAffiliateId: affiliateId, ...stay }: Props) {
  const region = useRef<HTMLElement>(null);
  const [adults, setAdults] = useState(Number.isSafeInteger(travellers) && travellers >= 1 && travellers <= 12 ? travellers : null);
  const [loaded, setLoaded] = useState(false);
  const [width, setWidth] = useState(0);
  const [compactView, setCompactView] = useState<CompactView>("map");
  const resultsId = useId();
  const allowed = useSyncExternalStore(subscribe, consent, noConsent);
  useEffect(() => { if (!allowed) setLoaded(false); }, [allowed]);
  useEffect(() => {
    const el = region.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const compact = width < COMBINED_VIEW_MIN_WIDTH;
  const view = compact ? compactView : "all";
  const search = stay22TesterSearch({ ...stay, affiliateId, adults: adults ?? 0 }, view);
  const available = Boolean(stay22TesterSearch({ ...stay, affiliateId, adults: 1 }, view));
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
    {showFrame && compact ? <EasyTSegmentedControl
      className={styles.view} ariaLabel="Accommodation view" value={compactView} onChange={setCompactView}
      options={[
        { label: "Map", value: "map", controls: resultsId },
        { label: "List", value: "listview", controls: resultsId },
      ]}
    /> : null}
    {showFrame && search ? <iframe
      id={resultsId} className={styles.map} title={`Stay22 accommodation in ${stopName}`}
      src={search} referrerPolicy="no-referrer"
      sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-forms"
    /> : null}
  </section>;
}
