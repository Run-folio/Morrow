"use client";

import { AlertCircle, Check, LoaderCircle, MapPin, RotateCcw } from "lucide-react";
import { useId, type CSSProperties, type ReactNode } from "react";
import { EasyTButton } from "./easyt-controls";
import styles from "./morrovia-loading-states.module.css";

export type MorroviaLoadingStage = {
  label: string;
  state: "complete" | "current" | "next";
};

export function MorroviaSkeleton({
  className = "",
  height,
  radius = "control",
  width,
}: {
  className?: string;
  height?: number | string;
  radius?: "control" | "card" | "round";
  width?: number | string;
}) {
  const style = {
    ...(height !== undefined ? { "--loading-height": typeof height === "number" ? `${height}px` : height } : {}),
    ...(width !== undefined ? { "--loading-width": typeof width === "number" ? `${width}px` : width } : {}),
  } as CSSProperties;

  return <span aria-hidden="true" className={`${styles.skeleton} ${styles[`skeleton${radius[0].toUpperCase()}${radius.slice(1)}`]} ${className}`} style={style} />;
}

export function MorroviaSectionStatus({
  detail,
  onRetry,
  retryLabel = "Try again",
  state = "loading",
  title,
}: {
  detail: string;
  onRetry?: () => void;
  retryLabel?: string;
  state?: "loading" | "long" | "error" | "success";
  title: string;
}) {
  const failed = state === "error";
  const complete = state === "success";
  return (
    <div
      aria-busy={!failed && !complete ? true : undefined}
      className={`${styles.sectionStatus} ${failed ? styles.sectionError : complete ? styles.sectionSuccess : ""}`}
      role={failed ? "alert" : "status"}
    >
      <span className={styles.sectionIcon} aria-hidden="true">
        {failed ? <AlertCircle /> : complete ? <Check /> : <LoaderCircle />}
      </span>
      <div>
        <strong>{title}</strong>
        <p>{detail}</p>
      </div>
      {failed && onRetry ? (
        <EasyTButton icon={RotateCcw} variant="secondary" onClick={onRetry}>{retryLabel}</EasyTButton>
      ) : null}
    </div>
  );
}

export function MorroviaPlanningProgress({
  detail,
  onRetry,
  prompt,
  retryLabel = "Try again",
  stages,
  state = "loading",
  title,
}: {
  detail: string;
  onRetry?: () => void;
  prompt: string;
  retryLabel?: string;
  stages: MorroviaLoadingStage[];
  state?: "loading" | "long" | "error" | "success";
  title: string;
}) {
  const failed = state === "error";
  const complete = state === "success";
  const titleId = useId();
  return (
    <section
      aria-busy={!failed && !complete ? true : undefined}
      className={`${styles.planning} ${failed ? styles.planningError : complete ? styles.planningSuccess : ""}`}
      aria-labelledby={titleId}
    >
      <div className={styles.preservedPrompt}>
        <span>Your trip idea</span>
        <p>{prompt}</p>
      </div>
      <div className={styles.planningState} role={failed ? "alert" : "status"}>
        <span className={styles.planningMark} aria-hidden="true">
          {failed ? <AlertCircle /> : complete ? <Check /> : <LoaderCircle />}
        </span>
        <div className={styles.planningCopy}>
          <p>{failed ? "WE HIT A PAUSE" : complete ? "TRIP BRIEF READY" : state === "long" ? "STILL PLANNING" : "PLANNING YOUR ROUTE"}</p>
          <h2 id={titleId}>{title}</h2>
          <span>{detail}</span>
        </div>
      </div>
      <ol className={styles.stageList} aria-label="Planning progress">
        {stages.map((stage) => (
          <li key={stage.label} data-state={stage.state}>
            <span aria-hidden="true">{stage.state === "complete" ? <Check /> : stage.state === "current" ? <LoaderCircle /> : null}</span>
            <strong>{stage.label}</strong>
          </li>
        ))}
      </ol>
      {failed && onRetry ? <EasyTButton icon={RotateCcw} onClick={onRetry}>{retryLabel}</EasyTButton> : null}
    </section>
  );
}

const mapCopy = {
  initial: ["Opening your route", "Loading the map and placing your stops."],
  fitting: ["Fitting the whole route", "Keeping every stop in view."],
  recalculating: ["Updating the route", "Your stops and edits stay in place while transfer estimates refresh."],
  place: ["Checking this place", "Loading the selected stop details."],
  local: ["Finding places nearby", "Keeping the map and selected stop in place while local results refresh."],
  long: ["The map is taking longer than usual", "Your route is safe. You can keep reviewing the trip while the map catches up."],
  error: ["The map could not finish loading", "Your ordered route is still available. Try the map again when you’re ready."],
} as const;

export function MorroviaMapLoading({
  children,
  onRetry,
  state = "initial",
}: {
  children: ReactNode;
  onRetry?: () => void;
  state?: keyof typeof mapCopy;
}) {
  const failed = state === "error";
  const [title, detail] = mapCopy[state];
  const compact = state !== "initial" && state !== "long" && state !== "error";
  return (
    <section aria-busy={failed ? undefined : true} className={styles.mapLoading} data-mode={compact ? "compact" : "panel"} data-state={state}>
      <div className={styles.mapContext} aria-hidden={state === "initial" || undefined}>{children}</div>
      <div className={`${styles.mapStatus} ${failed ? styles.mapError : ""}`} role={failed ? "alert" : "status"}>
        <span className={styles.mapStatusIcon} aria-hidden="true">{failed ? <AlertCircle /> : state === "place" ? <MapPin /> : <LoaderCircle />}</span>
        <div><strong>{title}</strong><p>{detail}</p></div>
        {failed && onRetry ? <EasyTButton icon={RotateCcw} variant="secondary" onClick={onRetry}>Try map again</EasyTButton> : null}
      </div>
    </section>
  );
}
