"use client";

import { ArrowLeft, Bookmark, CalendarDays, Check, MapPin, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from "react";
import { starterSwipeAction, starterSwipeAxis, type StarterSwipeAxis } from "@/lib/easyt/starter-activity-swipe";
import type { ItineraryIdea } from "@/lib/easyt/trip";
import { EasyTButton } from "./easyt-controls";
import { MorroviaSectionStatus } from "./morrovia-loading-states";
import ResilientImage from "./resilient-image";
import { itineraryActivityLabels } from "./itinerary-activity-state";
import styles from "./starter-activity-deck.module.css";

export type StarterActivityCard = {
  id: string;
  title: string;
  image?: string | null;
  idea: ItineraryIdea;
  state: "available" | "saved" | "planned";
  stateLabel?: string;
  meta?: ReactNode;
  affiliate?: ReactNode;
};
type DeckProps = {
  cards: StarterActivityCard[];
  location: string;
  onDeckSave: (idea: ItineraryIdea) => Promise<"added" | "existing" | false>;
  onUndoDeckSave: (idea: ItineraryIdea) => Promise<boolean>;
  onSchedule: (idea: ItineraryIdea) => boolean | Promise<boolean>;
  isPending?: (idea: ItineraryIdea) => boolean;
};
type Direction = "left" | "right";
type Motion = "idle" | "dragging" | "exiting" | "entering";
type Operation = { card: StarterActivityCard; kind: "saved" | "skipped" | "existing" };
type Gesture = { id: number; x: number; y: number; width: number; axis: StarterSwipeAxis };

const activityLabels = itineraryActivityLabels();
const reducedMotion = () => typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export default function StarterActivityDeck({ cards, location, onDeckSave, onUndoDeckSave, onSchedule, isPending }: DeckProps) {
  const [resolved, setResolved] = useState<ReadonlySet<string>>(() => new Set());
  const [last, setLast] = useState<Operation | null>(null);
  const [motion, setMotion] = useState<Motion>("idle");
  const [offset, setOffset] = useState(0);
  const [direction, setDirection] = useState<Direction>("right");
  const [busy, setBusy] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const [error, setError] = useState("");
  const gesture = useRef<Gesture | null>(null);
  const active = useRef<HTMLElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const feedback = useRef<HTMLDivElement>(null);
  const region = useRef<HTMLDivElement>(null);
  const focusNext = useRef(false);
  const lock = useRef(false);
  const mounted = useRef(false);
  const tick = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const exitAction = useRef<(() => void) | null>(null);
  const remaining = cards.filter(card => !resolved.has(card.id));
  const [card, next] = remaining;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      clearTimeout(tick.current);
      exitAction.current = null;
      gesture.current = null;
    };
  }, []);
  useEffect(() => {
    if (focusNext.current) {
      focusNext.current = false;
      (heading.current ?? feedback.current)?.focus({ preventScroll: true });
    }
  }, [card?.id]);

  const finishExit = () => {
    const finish = exitAction.current;
    exitAction.current = null;
    clearTimeout(tick.current);
    finish?.();
  };

  const advance = async (kind: "skip" | "save") => {
    if (!card || lock.current || (kind === "save" && isPending?.(card.idea))) {
      setOffset(0); setMotion("idle"); return;
    }
    lock.current = true;
    setBusy(true);
    setError("");
    setDirection(kind === "save" ? "right" : "left");
    let result: Operation["kind"] = "skipped";
    if (kind === "save") {
      try {
        const saved = card.state === "available" ? await onDeckSave(card.idea) : "existing";
        if (!saved) throw new Error("Save was not accepted");
        result = saved === "added" ? "saved" : "existing";
      } catch {
        if (mounted.current) {
          lock.current = false; setBusy(false); setOffset(0); setMotion("idle");
          setError("Couldn’t save this idea. Try again.");
        }
        return;
      }
    }
    if (!mounted.current) return;
    exitAction.current = () => {
      const focused = document.activeElement;
      focusNext.current = Boolean(active.current?.contains(focused) || (!next && region.current?.contains(focused)));
      setResolved(previous => new Set(previous).add(card.id));
      setLast({ card, kind: result });
      setAnnouncement(result === "saved" ? "Idea saved." : result === "existing" ? (card.state === "planned" ? "Already planned." : "Already saved.") : "Idea skipped.");
      setOffset(0);
      setMotion(reducedMotion() || !next ? "idle" : "entering");
      lock.current = false; setBusy(false);
    };
    if (reducedMotion()) finishExit();
    else {
      setMotion("exiting");
      tick.current = setTimeout(finishExit, 200);
    }
  };

  const undo = async () => {
    if (!last || lock.current) return;
    lock.current = true; setBusy(true); setError("");
    try {
      if (last.kind === "saved" && !await onUndoDeckSave(last.card.idea)) {
        if (mounted.current) setError("Couldn’t undo this save. Check your itinerary.");
        return;
      }
      if (!mounted.current) return;
      focusNext.current = Boolean(region.current?.contains(document.activeElement));
      setResolved(previous => { const next = new Set(previous); next.delete(last.card.id); return next; });
      setLast(null);
      setAnnouncement("Previous idea restored.");
      setDirection("left"); setMotion(reducedMotion() ? "idle" : "entering");
    } catch {
      if (mounted.current) setError("Couldn’t undo this save. Check your itinerary.");
    } finally {
      lock.current = false;
      if (mounted.current) setBusy(false);
    }
  };

  const start = (event: PointerEvent<HTMLElement>) => {
    // A second fingertip belongs to the browser's zoom gesture, never a save.
    if (!event.isPrimary && event.pointerType === "touch") {
      gesture.current = null;
      if (!lock.current) { setOffset(0); setMotion("idle"); }
      return;
    }
    if (!event.isPrimary || event.button !== 0 || lock.current || gesture.current ||
      (event.target instanceof Element && event.target.closest("button, a, input, select, textarea"))) return;
    gesture.current = { id: event.pointerId, x: event.clientX, y: event.clientY, width: event.currentTarget.clientWidth, axis: "pending" };
    // Capture mouse and pen only after horizontal intent. Touch has implicit capture.
  };
  const move = (event: PointerEvent<HTMLElement>) => {
    const current = gesture.current;
    if (!current || current.id !== event.pointerId) return;
    const dx = event.clientX - current.x;
    const dy = event.clientY - current.y;
    const was = current.axis;
    current.axis = starterSwipeAxis(current.axis, dx, dy);
    if (current.axis !== "horizontal") return;
    if (was !== "horizontal" && !event.currentTarget.hasPointerCapture(event.pointerId)) {
      try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* pointer ended */ }
    }
    if (reducedMotion()) return;
    setMotion("dragging");
    setOffset(Math.max(-current.width, Math.min(current.width, dx)));
  };
  const end = (event: PointerEvent<HTMLElement>, cancelled: boolean) => {
    const current = gesture.current;
    if (!current || current.id !== event.pointerId) return;
    gesture.current = null;
    const decision = !cancelled && starterSwipeAction(current.axis, event.clientX - current.x, current.width);
    if (decision) void advance(decision);
    else { setOffset(0); setMotion("idle"); }
  };

  const style = { "--deck-x": `${offset}px`, "--deck-tilt": `${Math.max(-9, Math.min(9, offset / 14))}deg` } as CSSProperties;
  const displayIndex = card ? cards.findIndex(item => item.id === card.id) + 1 : 0;
  const pending = Boolean(card && isPending?.(card.idea));
  return <div className={styles.deck} ref={region}>
    {card ? <>
      <div className={styles.viewport}>
        {next ? <div key={next.id} className={styles.peek} data-deck-peek aria-hidden="true">
          <ResilientImage className={styles.photo} src={next.image} alt="" draggable={false} fallback={null} />
        </div> : null}
        <ActivityFace key={card.id} card={card} location={location} index={displayIndex} total={cards.length}
          articleRef={active} titleRef={heading} style={style} motion={motion} direction={direction}
          busy={busy || pending} schedule={() => { if (!lock.current && !pending) void onSchedule(card.idea); }}
          start={start} move={move} end={end}
          animationDone={() => { if (motion === "exiting") finishExit(); else if (motion === "entering") setMotion("idle"); }} />
      </div>
      <div className={styles.actions}>
        <EasyTButton variant="secondary" icon={ArrowLeft} aria-disabled={busy} onClick={() => { if (!lock.current) void advance("skip"); }}>Skip</EasyTButton>
        <EasyTButton variant="secondary" icon={card.state === "available" ? Bookmark : Check} aria-disabled={busy || pending || card.state !== "available"} onClick={() => { if (!lock.current && !pending && card.state === "available") void advance("save"); }}>{card.state === "available" ? activityLabels.save : card.state === "planned" ? "Planned" : activityLabels.saved}</EasyTButton>
      </div>
      {card.affiliate ? <div className={styles.partner}>{card.affiliate}</div> : null}
    </> : <MorroviaSectionStatus title="No more ideas for this stop" />}
    <div className={styles.resolution} ref={feedback} tabIndex={-1}>
      {last ? <><span>{last.kind === "saved" ? "Idea saved" : last.kind === "existing" ? (last.card.state === "planned" ? "Already planned" : "Already saved") : "Idea skipped"}</span><EasyTButton variant="quiet" size="small" icon={RotateCcw} aria-disabled={busy} onClick={() => { void undo(); }}>Undo</EasyTButton></> : null}
      {error ? <p role="alert">{error}</p> : null}
    </div>
    <span className={styles.srOnly} role="status">{announcement}{card ? ` ${card.title}, ${displayIndex} of ${cards.length}.` : " No more ideas for this stop."}</span>
  </div>;
}

function ActivityFace({ card, location, index, total, articleRef, titleRef, style, motion, direction, busy, schedule, start, move, end, animationDone }: {
  card: StarterActivityCard; location: string; index: number; total: number;
  articleRef: React.Ref<HTMLElement>; titleRef: React.Ref<HTMLHeadingElement>;
  style: CSSProperties; motion: Motion; direction: Direction; busy: boolean; schedule: () => void;
  start: (event: PointerEvent<HTMLElement>) => void; move: (event: PointerEvent<HTMLElement>) => void;
  end: (event: PointerEvent<HTMLElement>, cancelled: boolean) => void; animationDone: () => void;
}) {
  const photoUrl = card.image || null;
  const [displayedPhoto, setDisplayedPhoto] = useState<string | null>(null);
  const [failedPhoto, setFailedPhoto] = useState<string | null>(null);
  const hasPhoto = !!photoUrl && displayedPhoto === photoUrl && failedPhoto !== photoUrl;
  // A warm data/provider URL may be complete before React observes its load
  // event. Check at attachment; never let a passive reset overwrite success.
  const checkCachedPhoto = useCallback((image: HTMLImageElement | null) => {
    if (photoUrl && image?.complete && image.naturalWidth > 0) setDisplayedPhoto(photoUrl);
  }, [photoUrl]);
  return <article ref={articleRef} className={styles.card} data-deck-card data-photo={hasPhoto} data-motion={motion} data-direction={direction} style={style}
    onPointerDown={start} onPointerMove={move} onPointerUp={event => end(event, false)}
    onPointerCancel={event => end(event, true)}
    onLostPointerCapture={event => {
      // Touch implicitly captures the tapped heading/span. Moving capture to the
      // article bubbles its child's loss here; only loss FROM the article cancels.
      if (event.target === event.currentTarget) end(event, true);
    }}
    onPointerLeave={event => { if (!event.currentTarget.hasPointerCapture(event.pointerId)) end(event, true); }}
    onAnimationEnd={event => { if (event.target === event.currentTarget) animationDone(); }}>
    {photoUrl && failedPhoto !== photoUrl ? <img key={photoUrl} ref={checkCachedPhoto} className={styles.photo} src={photoUrl}
      alt="" draggable={false} style={hasPhoto ? undefined : { visibility: "hidden" }}
      onLoad={() => setDisplayedPhoto(photoUrl)} onError={() => setFailedPhoto(photoUrl)} />
      : <span className={styles.noPhoto} aria-hidden="true"><MapPin /></span>}
    <span className={styles.count} aria-hidden="true">{index} of {total}</span>
    <div className={styles.overlay}>
      <h3 className={styles.title} tabIndex={-1} ref={titleRef}>{card.title}</h3>
      <div className={styles.details}>
        <div className={styles.location}>{location}{card.meta ? <> · {card.meta}</> : null}</div>
        {card.state !== "planned" ? <EasyTButton className={styles.schedule} variant="quiet" size="small" icon={CalendarDays} aria-disabled={busy} onClick={schedule}>{activityLabels.chooseDay}</EasyTButton> : card.stateLabel ? <span>{card.stateLabel}</span> : null}
      </div>
    </div>
  </article>;
}
