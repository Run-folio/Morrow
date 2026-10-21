"use client";

import { useRef, type HTMLAttributes } from "react";

const controls = "button, a, input, select, textarea, summary, [role='button'], [role='menu'], [role='menuitem'], [contenteditable='true']";

function allowsCardDrag(target: EventTarget | null) {
  if (!target || !("closest" in target)) return false;
  const control = (target as Element).closest(controls);
  return !control || control.matches("[data-itinerary-drag-surface], [data-itinerary-drag-handle]");
}

/** Existing article layout with a shared native drag boundary for itinerary cards. */
export default function ItineraryDraggableCard({ draggable, onDragStart, onDragEnd, children, ...props }: HTMLAttributes<HTMLElement>) {
  const gesture = useRef<{ allowed: boolean | null; started: boolean; suppressClick: boolean }>({ allowed: null, started: false, suppressClick: false });
  const enabled = Boolean(draggable && onDragStart);
  return <article
    {...props}
    draggable={enabled}
    data-itinerary-draggable={enabled || undefined}
    onPointerDownCapture={(event) => {
      // Let the browser own movement threshold and scrolling; never capture/prevent the pointer.
      gesture.current = {
        allowed: event.pointerType === "mouse" && event.button === 0 && allowsCardDrag(event.target),
        started: false,
        suppressClick: false,
      };
    }}
    onDragStart={(event) => {
      event.stopPropagation();
      if (!enabled || !(gesture.current.allowed ?? allowsCardDrag(event.target))) {
        event.preventDefault();
        return;
      }
      gesture.current.started = true;
      gesture.current.suppressClick = true;
      onDragStart?.(event);
    }}
    onDragEnd={(event) => {
      event.stopPropagation();
      if (gesture.current.started) onDragEnd?.(event);
      gesture.current.started = false;
      gesture.current.allowed = null;
    }}
    onClickCapture={(event) => {
      // A completed drag must not also open details. Keyboard activation stays available.
      if (gesture.current.suppressClick && event.detail !== 0) {
        event.preventDefault();
        event.stopPropagation();
        gesture.current.suppressClick = false;
      }
    }}
  >{children}</article>;
}
