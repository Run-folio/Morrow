"use client";

import { Check, Copy } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { AffiliateClickContext } from "@/lib/easyt/affiliate-click";
import { affiliateProviderLabel, type ResolvedAffiliateAction } from "@/lib/easyt/booking-readiness";
import { MorroviaAffiliateDisclosure, MorroviaAffiliateLink } from "./affiliate-link";
import { EasyTButton } from "./easyt-controls";
import styles from "./trip-stay-workspace.module.css";

/** View-only handoff: copying or opening a partner never changes trip state. */
export default function TripStayHandoff({ details, action, context }: {
  details: string;
  action: ResolvedAffiliateAction;
  context: AffiliateClickContext;
}) {
  const [state, setState] = useState<"idle" | "copying" | "copied" | "failed">("idle");
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const copy = async () => {
    setState("copying");
    try {
      await navigator.clipboard.writeText(details);
      if (mounted.current) setState("copied");
    } catch {
      if (mounted.current) setState("failed");
    }
  };
  return <section id="stay-handoff" tabIndex={-1} className={styles.partnerHandoff} aria-label="Find your stay">
    <strong>Find your stay</strong>
    <EasyTButton fullWidth variant="secondary" icon={state === "copied" ? Check : Copy} loading={state === "copying"} onClick={copy}>{state === "copied" ? "Stay details copied" : "Copy stay details"}</EasyTButton>
    <span className="sr-only" role="status">{state === "copied" ? "Stay details copied" : ""}</span>
    {state === "failed" ? <><p role="status">Couldn’t copy. Select these details:</p><pre className={styles.copyDetails}>{details}</pre></> : null}
    <MorroviaAffiliateLink action={{ ...action, cta: `Open ${affiliateProviderLabel(action.provider)}` }} context={context} variant="primary" fullWidth />
    <MorroviaAffiliateDisclosure provider={action.provider} />
  </section>;
}
