/** One reveal per opening, not per result/content revision. */
export function createRevealGate() {
  let revealed = false;
  return (open: boolean, ready: boolean) => {
    if (!open) { revealed = false; return false; }
    if (!ready || revealed) return false;
    revealed = true;
    return true;
  };
}
export function canSpring({reduced = false, disabled = false, excluded = false}: {reduced?: boolean; disabled?: boolean; excluded?: boolean}) {
  return !reduced && !disabled && !excluded;
}

/** Cancelled effect setup does not consume the opening (React StrictMode safe). */
export function scheduleReveal(gate: (open: boolean, ready: boolean) => boolean, play: () => void, request: (callback: FrameRequestCallback) => number, cancel: (id: number) => void) {
  const frame = request(() => { if (gate(true,true)) play(); });
  return () => cancel(frame);
}

export function isMotionActivationKey(key: string, control: "button" | "link", repeat = false) {
  return !repeat && (key === "Enter" || (key === " " && control === "button"));
}

/** "auto" can inherit scroll-behavior:smooth; "instant" cannot. */
export function motionScrollBehavior(
  reduced = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
): ScrollBehavior {
  return reduced ? "instant" : "smooth";
}
