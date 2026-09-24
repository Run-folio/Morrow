export type MobileMapDrawerDrag = {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  elapsedMs: number;
  open: boolean;
};

/** Handle-only gestures keep ordinary result scrolling and map panning separate. */
export function mobileMapDrawerDragDecision(gesture: MobileMapDrawerDrag): "open" | "collapsed" | null {
  const deltaX = gesture.endX - gesture.startX;
  const deltaY = gesture.endY - gesture.startY;
  const distance = Math.abs(deltaY);
  if (distance < 20 || distance <= Math.abs(deltaX)) return null;
  const intentional = distance >= 56 || distance / Math.max(gesture.elapsedMs, 1) >= 0.45;
  if (!intentional) return null;
  if (deltaY < 0 && !gesture.open) return "open";
  if (deltaY > 0 && gesture.open) return "collapsed";
  return null;
}
