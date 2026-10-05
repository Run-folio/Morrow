"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState, type ComponentProps } from "react";
import type { JourneyPlannerMap } from "@/components/journey-planner-map";
import { MorroviaSectionStatus } from "./morrovia-loading-states";
import styles from "./deferred-journey-planner-map.module.css";

const LiveMap = dynamic(
  () => import("@/components/journey-planner-map").then((module) => module.JourneyPlannerMap),
  { ssr: false, loading: () => <MorroviaSectionStatus compact title="Loading map" /> },
);

/** Mount a secondary map only when its preview enters view. The same map
 * component and props own camera, selection and fallback behavior after mount. */
export function DeferredJourneyPlannerMap(props: ComponentProps<typeof JourneyPlannerMap>) {
  const host = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = host.current;
    if (!node || !("IntersectionObserver" in window)) {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setVisible(true);
        observer.disconnect();
      }
    }, { rootMargin: "100px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return <div ref={host} className={styles.host}>
    {visible ? <LiveMap {...props} /> : <MorroviaSectionStatus compact title="Map ready when you reach it" />}
  </div>;
}
