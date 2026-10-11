/** Asset review is an explicit editorial decision, not automated image-quality detection.
 * Match provider file identity across widths and encodings, never a destination name.
 */
export const photoEditorialExclusions = [{
  provider: "wikimedia",
  file: "Athens, Greece Skyline at Night (5986575817).jpg",
  sourceUrl: "https://commons.wikimedia.org/wiki/File:Athens,_Greece_Skyline_at_Night_(5986575817).jpg",
  reviewedAt: "2026-10-11",
  reason: "Downloaded provider pixels and rendered dashboard crop show severe blur/light trails; rejected by implementation and independent review.",
  evidenceSha256: "580bceb2c2279125525bde1adf206810b44bd823410fbef211e223d5717119b6",
  evidence: "Batch15-review-7e85cab/evidence/final7e85/dashboard/1440-athens-card.png",
}] as const;

export function isEditoriallyExcludedPhoto(sourceUrl: string) {
  try {
    const url = new URL(sourceUrl);
    if (url.hostname !== "commons.wikimedia.org" || !url.pathname.startsWith("/wiki/File:")) return false;
    const file = decodeURIComponent(url.pathname.slice("/wiki/File:".length)).replaceAll("_", " ");
    return photoEditorialExclusions.some(review => review.file === file);
  } catch { return false; }
}
