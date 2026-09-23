export type MorroviaMapSurfaceVariant = "workspace" | "embedded" | "preview";
export type MorroviaEmbeddedInteraction = "selection-only" | "pan-zoom";

export type MorroviaMapSurface =
  | { variant: "workspace" }
  | { variant: "preview" }
  | { variant: "embedded"; interaction: MorroviaEmbeddedInteraction };

export type MorroviaMapInsets = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

export type MorroviaMapTarget =
  | { kind: "route" | "collection"; ids?: string[]; coordinates: Array<[number, number]> }
  | { kind: "stop"; id: string; coordinates: [number, number] }
  | { kind: "leg"; id: string; coordinates: Array<[number, number]> };

export type MorroviaMapCameraRequest =
  | { kind: "none" }
  | { kind: "focus"; center: [number, number]; zoom: number; offset?: [number, number] }
  | { kind: "fit"; coordinates: Array<[number, number]>; padding: MorroviaMapInsets; maxZoom: number };

export function resolveMapSurfacePolicy(surface: MorroviaMapSurface) {
  const domainSelection = surface.variant !== "preview";
  const panZoom = surface.variant === "workspace"
    || surface.variant === "embedded" && surface.interaction === "pan-zoom";
  return { panZoom, domainSelection, zoomControl: panZoom };
}

function finiteLength(value: number) {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function resolveAxisInsets(total: number, safe: number, startOcclusion: number, endOcclusion: number) {
  const minimumDrawable = Math.min(160, finiteLength(total));
  const availableForInsets = Math.max(0, finiteLength(total) - minimumDrawable);
  const end = Math.min(safe + finiteLength(endOcclusion), availableForInsets);
  const start = Math.min(safe + finiteLength(startOcclusion), Math.max(0, availableForInsets - end));
  return { start, end };
}

export function resolveMapInsets({
  width,
  height,
  safe,
  occlusions = {},
}: {
  width: number;
  height: number;
  safe: number;
  occlusions?: Partial<MorroviaMapInsets>;
}): MorroviaMapInsets {
  const safeInset = finiteLength(safe);
  const horizontal = resolveAxisInsets(width, safeInset, occlusions.left ?? 0, occlusions.right ?? 0);
  const vertical = resolveAxisInsets(height, safeInset, occlusions.top ?? 0, occlusions.bottom ?? 0);
  return { top: vertical.start, right: horizontal.end, bottom: vertical.end, left: horizontal.start };
}

function finiteCoordinates(coordinates: Array<[number, number]>) {
  return coordinates.filter(([longitude, latitude]) => Number.isFinite(longitude) && Number.isFinite(latitude));
}

function focusOffset(padding: MorroviaMapInsets): [number, number] | undefined {
  const offset: [number, number] = [
    (padding.left - padding.right) / 2,
    (padding.top - padding.bottom) / 2,
  ];
  return offset[0] === 0 && offset[1] === 0 ? undefined : offset;
}

export function resolveMapCameraRequest(
  target: MorroviaMapTarget,
  padding: MorroviaMapInsets,
): MorroviaMapCameraRequest {
  const coordinates = finiteCoordinates(target.kind === "stop" ? [target.coordinates] : target.coordinates);
  if (!coordinates.length) return { kind: "none" };
  if (target.kind === "stop" || coordinates.length === 1) {
    const offset = focusOffset(padding);
    return { kind: "focus", center: coordinates[0], zoom: 8, ...(offset ? { offset } : {}) };
  }
  return {
    kind: "fit",
    coordinates,
    padding,
    maxZoom: target.kind === "leg" ? 9 : 8,
  };
}
