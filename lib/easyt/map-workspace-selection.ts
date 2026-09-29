/** The Map workspace owns this selection; the canvas only reports interactions. */
export type WorkspacePlaceSelection =
  | { kind: "none" }
  | { kind: "google"; placeId: string; stopId: string; dayId: string | null; referenceId?: string }
  | { kind: "existing-map-result"; resultId: string; stopId: string; dayId: string | null };

export function nativeGooglePoiSelection(placeId: string, stopId: string, dayId: string | null): WorkspacePlaceSelection {
  return { kind: "google", placeId, stopId, dayId };
}
