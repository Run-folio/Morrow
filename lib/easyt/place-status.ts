export type PlaceStatusEvidence = {
  provider: "google-places" | "openstreetmap" | "booking-demand";
  businessStatus?: string;
  openingHours?: string;
};

/** Only a provider status with explicit, supported semantics becomes a claim. */
export function operationalPlaceStatus(evidence: PlaceStatusEvidence): true | undefined {
  if (evidence.provider === "google-places" && evidence.businessStatus === "OPERATIONAL") return true;
  return undefined;
}
