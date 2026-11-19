export type StarterSwipeAxis = "pending" | "horizontal" | "vertical";

export function starterSwipeAxis(axis: StarterSwipeAxis, dx: number, dy: number): StarterSwipeAxis {
  if (axis !== "pending") return axis;
  const x = Math.abs(dx);
  const y = Math.abs(dy);
  if (Math.max(x, y) < 10) return "pending";
  if (y >= x * .8) return "vertical";
  return "horizontal";
}

export function starterSwipeAction(axis: StarterSwipeAxis, dx: number, cardWidth: number): "save" | "skip" | null {
  if (axis !== "horizontal" || Math.abs(dx) < Math.max(62, Math.min(92, cardWidth * .24))) return null;
  return dx > 0 ? "save" : "skip";
}
