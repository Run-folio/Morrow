/** Build artifact policy derived from the exact Netlify site and branch in next.config.ts. */
export const inertOverviewPaidPreview = process.env.MORROVIA_INERT_OVERVIEW_PAID_PREVIEW === "1";

export const overviewPaidPreviewSentinels = {
  "world-nomads": "#overview-preview-wn",
  saily: "#overview-preview-saily",
} as const;

/** Non-navigating fragments stand in for paid actions at preview service boundaries. */
export function overviewPaidPreviewHref(provider: string): string | undefined {
  if (!inertOverviewPaidPreview) return undefined;
  if (provider === "world-nomads" || provider === "saily") return overviewPaidPreviewSentinels[provider];
  return undefined;
}

export const overviewPaidPreviewSurface = "overview";

type BookingLink = { provider: string; href: string; affiliate: boolean };
type ReadinessLink = { id: string; partner?: "saily" | "world-nomads"; href?: string };

/** Do not mutate shared traffic: only a dedicated artifact plus this surface can redact. */
export function redactOverviewBookingLinks<T extends BookingLink>(actions: T[], surface: unknown): T[] {
  if (!inertOverviewPaidPreview || surface !== overviewPaidPreviewSurface) return actions;
  return actions.map(action => {
    const href = overviewPaidPreviewHref(action.provider);
    return href ? { ...action, href, affiliate: true } : action;
  });
}

export function redactOverviewReadinessLinks<T extends ReadinessLink>(cards: T[], surface: unknown): T[] {
  if (!inertOverviewPaidPreview || surface !== overviewPaidPreviewSurface) return cards;
  return cards.map(card => {
    const provider = card.partner ?? (card.id === "esim" ? "saily" : undefined);
    const href = overviewPaidPreviewHref(provider ?? "");
    return href && card.href ? { ...card, href, partner: provider } : card;
  });
}
