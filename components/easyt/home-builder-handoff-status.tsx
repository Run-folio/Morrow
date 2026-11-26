"use client";

import { useEffect, useState } from "react";
import styles from "./home-builder-handoff-status.module.css";

export const HOME_BUILDER_ART_DELAY_MS = 300;

/** Mounted only while the calling Home submission / Builder handoff is pending.
 * Never hold the route open for the illustration or its playback. */
export function HomeBuilderHandoffStatus({ title, detail, floating = false }: {
  title: string;
  detail?: string;
  floating?: boolean;
}) {
  const [pastDelay, setPastDelay] = useState(false);
  const [motionAllowed, setMotionAllowed] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setPastDelay(true), HOME_BUILDER_ART_DELAY_MS);
    const preference = window.matchMedia?.("(prefers-reduced-motion: no-preference)");
    const sync = () => setMotionAllowed(preference?.matches === true);
    sync();
    preference?.addEventListener("change", sync);
    return () => {
      window.clearTimeout(timer);
      preference?.removeEventListener("change", sync);
    };
  }, []);

  // The Home button already has immediate feedback; don't flash a second notice
  // on a fast handoff. In Builder, preserve the original immediate textual status.
  if (floating && !pastDelay) return null;
  return <div role="status" className={floating ? styles.floating : styles.inline} data-home-builder-handoff>
    {pastDelay && motionAllowed && !imageFailed ? <img
      src="/journey/motion/plane-travel.webp" alt="" aria-hidden="true" width={96} height={96}
      className={styles.plane} onError={() => setImageFailed(true)} /> : null}
    <div><strong>{title}</strong>{detail ? <p>{detail}</p> : null}</div>
  </div>;
}
