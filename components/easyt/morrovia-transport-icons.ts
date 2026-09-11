import {
  CarFront,
  CircleHelp,
  Footprints,
  Plane,
  Route,
  Ship,
  TrainFront,
  type LucideIcon,
} from "lucide-react";
import { canonicalMapTransportMode, type MapTransportMode } from "../../lib/easyt/map-spatial-context.ts";

export const LUCIDE_PLANE_INTRINSIC_BEARING = 45;

const transportIcons: Record<MapTransportMode, LucideIcon> = {
  flight: Plane,
  train: TrainFront,
  road: CarFront,
  ferry: Ship,
  walk: Footprints,
  mixed: Route,
  unknown: CircleHelp,
};

export function mapTransportIcon(mode: unknown) {
  return transportIcons[canonicalMapTransportMode(mode)];
}

export function mapTransportIconRotation(mode: unknown, bearing: number | null) {
  if (canonicalMapTransportMode(mode) !== "flight" || bearing === null || !Number.isFinite(bearing)) return null;
  const rotation = bearing - LUCIDE_PLANE_INTRINSIC_BEARING;
  return ((rotation + 540) % 360) - 180;
}
