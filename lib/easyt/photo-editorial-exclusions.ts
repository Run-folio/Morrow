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
},
{
  "provider": "wikimedia",
  "file": "Sunset, Manila, Philippines.jpg",
  "sourceUrl": "https://commons.wikimedia.org/wiki/File:Sunset,_Manila,_Philippines.jpg",
  "reviewedAt": "2026-10-11",
  "reason": "Reviewed pixels are dominated by water/sky with little recognisable city information.",
  "evidenceSha256": "73fe85dcf8a0df385beb20397e6c8b91ae2cecee6ebe00282e595f81b678e70a",
  "evidence": "batch15-fresh-photos-22b3c0f/photo-0.img",
  "reviewReport": "Batch15-fresh-photo-review-22b3c0f.md"
},
{
  "provider": "wikimedia",
  "file": "Coron Palawan, Philippines 06.jpg",
  "sourceUrl": "https://commons.wikimedia.org/wiki/File:Coron_Palawan,_Philippines_06.jpg",
  "reviewedAt": "2026-10-11",
  "reason": "Reviewed pixels contain a prominent photographer watermark and saturated harbour composition.",
  "evidenceSha256": "6c40c55e0c597437b93486f99f172d91c730e790e01e6b5b7c70b65d4fa16caa",
  "evidence": "batch15-fresh-photos-22b3c0f/photo-1.img",
  "reviewReport": "Batch15-fresh-photo-review-22b3c0f.md"
},
{
  "provider": "wikimedia",
  "file": "Philippines-1981-39 hg.jpg",
  "sourceUrl": "https://commons.wikimedia.org/wiki/File:Philippines-1981-39_hg.jpg",
  "reviewedAt": "2026-10-11",
  "reason": "Reviewed 1981 street pixels are dated/soft with prominent foreground vehicles; rejected as this contemporary settlement cover.",
  "evidenceSha256": "dfe68b44bf7bdd17131e86ee40b96dd60e7e2119ab31cb0a75c7b0f1c9ab3389",
  "evidence": "batch15-fresh-photos-22b3c0f/canonical-photo-0.img",
  "reviewReport": "Batch15-fresh-photo-review-22b3c0f.md"
},
{
  "provider": "wikimedia",
  "file": "Athens, Greece Skyline from Mount Lycabettus (5987127852).jpg",
  "sourceUrl": "https://commons.wikimedia.org/wiki/File:Athens,_Greece_Skyline_from_Mount_Lycabettus_(5987127852).jpg",
  "reviewedAt": "2026-10-11",
  "reason": "Reviewed panorama pixels are visibly soft with foreground tree and glare.",
  "evidenceSha256": "8b52302cef586fa7fdaa867f7c62a3e33672eabb7e74b3ae6c327aeaf0519d0c",
  "evidence": "batch15-fresh-photos-22b3c0f/primary-photo-1.img",
  "reviewReport": "Batch15-fresh-photo-review-22b3c0f.md"
},
{
  "provider": "wikimedia",
  "file": "Athens, Greece Skyline from Mount Lycabettus (5986569199).jpg",
  "sourceUrl": "https://commons.wikimedia.org/wiki/File:Athens,_Greece_Skyline_from_Mount_Lycabettus_(5986569199).jpg",
  "reviewedAt": "2026-10-11",
  "reason": "Reviewed dusk pixels are very dark with limited recognisable city detail.",
  "evidenceSha256": "5091a0a7dadfb1bc28435b82a8c8981631f5ca628e30fdbd3b69018319e7c1cf",
  "evidence": "batch15-fresh-photos-22b3c0f/primary-photo-2.img",
  "reviewReport": "Batch15-fresh-photo-review-22b3c0f.md"
},
{
  "provider": "wikimedia",
  "file": "Athens, Greece Skyline view from Mount Lycabettus (5987127698).jpg",
  "sourceUrl": "https://commons.wikimedia.org/wiki/File:Athens,_Greece_Skyline_view_from_Mount_Lycabettus_(5987127698).jpg",
  "reviewedAt": "2026-10-11",
  "reason": "Reviewed dusk panorama pixels are soft with low detail; similar composition does not establish scene diversity.",
  "evidenceSha256": "6fcf686de05b462cff9948bd50f6c689f55696752c22ceafa1083eebdeff14bf",
  "evidence": "batch15-fresh-photos-22b3c0f/primary-photo-3.img",
  "reviewReport": "Batch15-fresh-photo-review-22b3c0f.md"
}
] as const;

export function isEditoriallyExcludedPhoto(sourceUrl: string) {
  try {
    const url = new URL(sourceUrl);
    if (url.hostname !== "commons.wikimedia.org" || !url.pathname.startsWith("/wiki/File:")) return false;
    const file = decodeURIComponent(url.pathname.slice("/wiki/File:".length)).replaceAll("_", " ");
    return photoEditorialExclusions.some(review => review.file === file);
  } catch { return false; }
}
