/** Reviewed reference evidence, bounded to one active airport record and exact tuple.
 * OurAirports source tuple comes from the integrity-checked installed snapshot.
 * Operator FAQ uses Gatwick in the question and London Gatwick in its answer.
 * This is photo lookup evidence, not an identity-equivalence crosswalk.
 */
export const reviewedPhotoNameSupplement = {
  canonicalPlaceId: "reference:ourairports:2429",
  canonicalName: "London Gatwick Airport", countryCode: "GB", placeType: "transport_gateway",
  coordinates: [-0.185739, 51.148744], iataCode: "LGW", icaoCode: "EGKK",
  aliases: ["Gatwick"], reviewedAt: "2026-10-11",
  sources: ["https://ourairports.com/airports/EGKK/", "https://www.gatwickairport.com/All_FAQs"],
  evidence: "batch15-systemic-photo-evidence/source-evidence.md",
} as const;
