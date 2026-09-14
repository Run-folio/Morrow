/** Deterministic visual tier; keeps the full title in the accessible heading. */
export function recommendationDetailTitleTier(title: string) {
  return Array.from(title.trim()).length > 56 ? "compact" : "standard";
}
