"use client";

import { Info, type LucideIcon } from "lucide-react";
import { createPortal } from "react-dom";
import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { EasyTButton } from "./easyt-controls";
import styles from "./overview-info.module.css";

const CLOSE_DELAY = 150;
const infoOpen = "morrovia-overview-info-open";
const EDGE = 8;
const ANCHOR_GAP = 4;
const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(value, high));
type Position = { left: number; top: number; width: number; maxHeight: number };

/** Informational (not interactive) content. A portal avoids clipping inside Overview cards. */
export function OverviewInfo({ label, children, icon = Info }: { icon?: LucideIcon; label: string; children: ReactNode }) {
  const id = useId();
  const anchor = useRef<HTMLButtonElement>(null);
  const tooltip = useRef<HTMLDivElement>(null);
  const sources = useRef({ trigger: false, popup: false, focus: false, pinned: false, suppress: false, pointer: "" });
  const closeTimer = useRef<number | undefined>(undefined);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<Position | null>(null);

  function stopClose() {
    window.clearTimeout(closeTimer.current);
    closeTimer.current = undefined;
  }
  function reveal() {
    stopClose();
    if (sources.current.suppress) return;
    document.dispatchEvent(new CustomEvent(infoOpen, { detail: id }));
    setOpen(true);
  }
  function hide(suppress = false) {
    stopClose();
    const source = sources.current;
    source.pinned = false;
    source.popup = false;
    source.suppress = suppress;
    setOpen(false);
    setPosition(null);
  }
  function closeIfInactive() {
    stopClose();
    closeTimer.current = window.setTimeout(() => {
      const source = sources.current;
      if (!source.trigger && !source.popup && !source.focus && !source.pinned) hide();
    }, CLOSE_DELAY);
  }

  useEffect(() => {
    const anotherOpened = (event: Event) => {
      if ((event as CustomEvent<string>).detail !== id) hide(true);
    };
    document.addEventListener(infoOpen, anotherOpened);
    return () => {
      window.clearTimeout(closeTimer.current);
      document.removeEventListener(infoOpen, anotherOpened);
    };
  }, [id]);
  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => {
      if (!(event.target instanceof Node)) return;
      if (!anchor.current?.contains(event.target) && !tooltip.current?.contains(event.target)) hide(true);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      event.preventDefault();
      hide(true);
    };
    document.addEventListener("pointerdown", dismiss, true);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", dismiss, true);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return;
    const update = () => {
      if (!anchor.current || !tooltip.current) return;
      const viewport = window.visualViewport;
      const left = (viewport?.offsetLeft ?? 0) + EDGE;
      const top = (viewport?.offsetTop ?? 0) + EDGE;
      const right = left + (viewport?.width ?? document.documentElement.clientWidth) - 2 * EDGE;
      const bottom = top + (viewport?.height ?? document.documentElement.clientHeight) - 2 * EDGE;
      const target = anchor.current.getBoundingClientRect();
      const width = Math.min(288, right - left);
      if (width <= 0 || bottom <= top) return;
      const above = Math.max(0, target.top - top - ANCHOR_GAP);
      const below = Math.max(0, bottom - target.bottom - ANCHOR_GAP);
      const natural = tooltip.current.scrollHeight;
      const placeAbove = natural > below && above > below;
      const maxHeight = Math.max(1, placeAbove ? above : below);
      const y = placeAbove ? target.top - ANCHOR_GAP - Math.min(natural, maxHeight) : target.bottom + ANCHOR_GAP;
      const next = {
        width, maxHeight,
        left: clamp((target.left + target.right - width) / 2, left, right - width),
        top: clamp(y, top, bottom - Math.min(natural, maxHeight)),
      };
      setPosition(old => old && old.left === next.left && old.top === next.top && old.width === next.width
        && old.maxHeight === next.maxHeight ? old : next);
    };
    update();
    // Measure again after the clamped width changes text wrapping, without flashing the panel.
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    if (tooltip.current) observer?.observe(tooltip.current);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    window.visualViewport?.addEventListener("resize", update);
    window.visualViewport?.addEventListener("scroll", update);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
      window.visualViewport?.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("scroll", update);
    };
  }, [open]);

  return <>
    <EasyTButton
      ref={anchor}
      className={styles.trigger}
      icon={icon}
      iconOnly
      variant="quiet"
      aria-describedby={open ? id : undefined}
      aria-expanded={open}
      onPointerEnter={event => {
        if (event.pointerType === "touch") return;
        const source = sources.current;
        source.trigger = true;
        source.suppress = false;
        reveal();
      }}
      onPointerLeave={() => {
        sources.current.trigger = false;
        closeIfInactive();
      }}
      onPointerDown={event => { sources.current.pointer = event.pointerType; }}
      onFocus={event => {
        if (!event.currentTarget.matches(":focus-visible")) return;
        sources.current.focus = true;
        sources.current.suppress = false;
        reveal();
      }}
      onBlur={() => {
        const source = sources.current;
        source.focus = false;
        source.pinned = false;
        closeIfInactive();
      }}
      onClick={event => {
        const source = sources.current;
        const touch = event.detail > 0 && source.pointer === "touch";
        const keyboard = event.detail === 0;
        if (source.pinned || (keyboard && open)) {
          hide(true);
        } else {
          source.suppress = false;
          source.pinned = touch || !keyboard;
          reveal();
        }
      }}
    >{label}</EasyTButton>
    {open ? createPortal(<div
      id={id}
      ref={tooltip}
      className={styles.tooltip}
      role="tooltip"
      style={position ?? undefined}
      data-positioned={position ? true : undefined}
      onPointerEnter={() => {
        sources.current.popup = true;
        stopClose();
      }}
      onPointerLeave={() => {
        sources.current.popup = false;
        closeIfInactive();
      }}
    >{children}</div>, document.body) : null}
  </>;
}
