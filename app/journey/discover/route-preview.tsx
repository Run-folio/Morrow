"use client";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, X } from "lucide-react";
import type { DiscoveryRoute } from "@/lib/easyt/discovery-catalogue";
import type { PublicRoutePlanDraft } from "@/lib/easyt/public-route";
import { discoveryDuration, discoveryShape } from "@/lib/easyt/route-discovery";
import { EasyTButton as Button, EasyTLinkButton as LinkButton } from "@/components/easyt/easyt-controls";
import { MorroviaStatusBanner } from "@/components/easyt/morrovia-feedback";
import { MorroviaMapLoading } from "@/components/easyt/morrovia-loading-states";
import RoutePlanLink from "../routes/[slug]/route-plan-link";
import DiscoveryPhoto from "./discovery-photo";
import styles from "./discover.module.css";
const DiscoveryMap = dynamic(() => import("./discovery-map"), { loading: () => <MorroviaMapLoading>Ordered route stops</MorroviaMapLoading>, ssr: false });

export default function RoutePreview({ route, onClose, imageUnavailable = false }: { route: DiscoveryRoute; onClose: () => void; imageUnavailable?: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [stop, setStop] = useState(0);
  const [draft, setDraft] = useState<PublicRoutePlanDraft | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const element = dialog.current!;
    const focus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    const scrollY = window.scrollY;
    document.body.style.overflow = "hidden";
    element.showModal();
    return () => { element.close(); document.body.style.overflow = previousOverflow; focus?.focus({ preventScroll: true }); window.scrollTo({ top: scrollY, behavior: "instant" }); };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setError("");
    setDraft(null);
    void fetch(`/api/easyt/public-routes/${encodeURIComponent(route.key)}`, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(12_000)]), cache: "no-store" }).then(async (response) => {
      if (!response.ok) throw new Error(response.status === 404 ? "This route is no longer available to start." : "We couldn’t load the starting route. Please try again.");
      const data = await response.json() as { draft: PublicRoutePlanDraft };
      if (!controller.signal.aborted) setDraft(data.draft);
    }).catch((value: unknown) => { if (!controller.signal.aborted) setError(value instanceof Error ? value.message : "The starting route is unavailable."); });
    return () => controller.abort();
  }, [route.key, attempt]);
  return (
    // morrovia-ui-audit-allow-next-line native-dialog -- atlas exploration needs a scrollable native modal; the canonical confirmation dialog owns consequential confirmation rather than route browsing
    <dialog ref={dialog} className={styles["atlas-dialog"]} aria-labelledby="atlas-title" onCancel={(event) => { event.preventDefault(); onClose(); }}>
      <div className={styles["atlas-top"]}><span className={styles.eyebrow}>AN OPEN PAGE IN YOUR ATLAS</span><Button variant="quiet" icon={X} iconOnly onClick={onClose}>Close route preview</Button></div>
      <div className={styles["atlas-visual"]}><div className={styles["atlas-photo"]}><DiscoveryPhoto route={route} priority unavailable={imageUnavailable} /></div><DiscoveryMap route={route} selectedStop={stop} onStop={setStop} /></div>
      <div className={styles["atlas-copy"]}>
        <div className={styles["atlas-heading"]}><div><span className={styles.eyebrow}>{route.countries.join(" → ")}</span><h2 id="atlas-title">{route.title}</h2></div><div className={styles["atlas-facts"]}><strong>{discoveryDuration(route)}</strong><span>{discoveryShape(route)}</span><small>Suggested range</small></div></div>
        <p className={styles["route-character"]}>{route.character}</p><p className={styles["best-for"]}>{route.bestFor}</p>
        <ol className={styles["stop-order"]} aria-label="Route stops in order">{route.stops.map((item, index) => <li key={item.id}><Button variant="quiet" aria-pressed={index === stop} onClick={() => setStop(index)}><span>{String(index + 1).padStart(2, "0")}</span><strong>{item.name}</strong><small>{item.country}</small></Button></li>)}</ol>
        <p className={styles["stop-reason"]}><strong>{route.stops[stop]?.name}</strong> {route.stops[stop]?.reason}</p>
        <p className={styles["route-truth"]}>Suggested durations are catalogue guidance. Connections are illustrative; schedules and transfer details need checking.</p>
        {error && <MorroviaStatusBanner tone="warning" title="Starting route unavailable" detail={error} actions={<Button variant="secondary" onClick={() => setAttempt((value) => value + 1)}>Try again</Button>} />}
      </div>
      <div className={styles["atlas-actions"]}><p>A starting point.<br /><em>Yours to change.</em></p><div><LinkButton href={route.href} prefetch={false} variant="secondary" icon={ArrowUpRight}>Explore route</LinkButton>{draft ? <RoutePlanLink draft={draft} placement="discovery" className={styles.startRoute}>Start with this route</RoutePlanLink> : <Button disabled loading={!error}>Start with this route</Button>}</div></div>
    </dialog>
  );
}

