"use client";

import { useEffect, useRef, useState } from "react";
import { hasAffiliateTrackingConsent, PRIVACY_CONSENT_CHANGE_EVENT } from "@/lib/privacy-consent";

export const OMIO_IMPACT_SCRIPT_ID = "omio-impact-tracking";
export const OMIO_IMPACT_SCRIPT_SRC = "https://utt.impactcdn.com/P-A7643967-7b19-4f3a-b9eb-e714bcf1e1f81.js";

type ImpactStat = ((...args: string[]) => void) & { a?: string[][] };

declare global {
  interface Window {
    ire_o?: string;
    impactStat?: ImpactStat;
  }
}

function installOmioImpact() {
  if (document.getElementById(OMIO_IMPACT_SCRIPT_ID)) return;
  const queue: ImpactStat = ((...args: string[]) => {
    queue.a = queue.a ?? [];
    queue.a.push(args);
  }) as ImpactStat;
  window.ire_o = "impactStat";
  window.impactStat = window.impactStat ?? queue;
  window.impactStat("transformLinks");
  window.impactStat("trackImpression");

  const script = document.createElement("script");
  script.id = OMIO_IMPACT_SCRIPT_ID;
  script.async = true;
  script.src = OMIO_IMPACT_SCRIPT_SRC;
  document.head.appendChild(script);
}

function removeOmioImpactTag() {
  document.getElementById(OMIO_IMPACT_SCRIPT_ID)?.remove();
  delete window.impactStat;
  delete window.ire_o;
}

export default function OptionalAffiliateTracking() {
  const [enabled, setEnabled] = useState(false);
  const enabledRef = useRef(false);

  useEffect(() => {
    const refresh = () => {
      const next = hasAffiliateTrackingConsent();
      const withdrawn = enabledRef.current && !next;
      enabledRef.current = next;
      setEnabled(next);
      if (withdrawn) {
        // Impact does not expose a repository-verified shutdown API. Reloading after
        // the saved withdrawal guarantees that its in-memory runtime is discarded.
        removeOmioImpactTag();
        window.setTimeout(() => window.location.reload(), 0);
      }
    };
    refresh();
    window.addEventListener(PRIVACY_CONSENT_CHANGE_EVENT, refresh);
    return () => window.removeEventListener(PRIVACY_CONSENT_CHANGE_EVENT, refresh);
  }, []);

  useEffect(() => {
    if (!enabled) {
      removeOmioImpactTag();
      return;
    }
    installOmioImpact();
    return removeOmioImpactTag;
  }, [enabled]);

  return null;
}
