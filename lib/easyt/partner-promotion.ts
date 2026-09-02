export type PartnerPromotion = {
  provider: string;
  code: string;
  discountPercent: number;
  newCustomersOnly: boolean;
  maximumPurchase: { amount: number; currency: "EUR" };
  expiresAt: string;
  termsUrl: string;
};

export type PartnerPromotionAction = {
  provider?: string | null;
  href?: string | null;
};

/** Approved traveller-facing partner offers. App-only codes do not belong here. */
export const partnerPromotions = {
  omioNewCustomer: {
    provider: "omio",
    code: "NEW10",
    discountPercent: 10,
    newCustomersOnly: true,
    maximumPurchase: { amount: 80, currency: "EUR" },
    expiresAt: "2026-11-30T23:59:00+01:00",
    termsUrl: "https://www.omio.com/coupon",
  },
} as const satisfies Record<string, PartnerPromotion>;

function hasSafeOutboundUrl(action: PartnerPromotionAction) {
  if (!action.href || action.href !== action.href.trim()) return false;
  try {
    return new URL(action.href).protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Resolves an offer only after the actual outbound provider and URL exist.
 * The final advertised second remains eligible; the offer disappears after it.
 */
export function partnerPromotionForAction(
  action: PartnerPromotionAction | null | undefined,
  now = new Date(),
): PartnerPromotion | null {
  if (!action || action.provider !== "omio" || !hasSafeOutboundUrl(action)) return null;
  const promotion = partnerPromotions.omioNewCustomer;
  return now.getTime() <= new Date(promotion.expiresAt).getTime() ? promotion : null;
}
