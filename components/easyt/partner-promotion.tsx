"use client";

import { useEffect, useState } from "react";
import type { PartnerPromotionAction } from "@/lib/easyt/partner-promotion";
import { partnerPromotionForAction } from "@/lib/easyt/partner-promotion";
import { MorroviaContextualDisclosure } from "./morrovia-feedback";
import styles from "./partner-promotion.module.css";

export function MorroviaPartnerPromotion({
  action,
  className,
  now,
  presentation = "expanded",
}: {
  action: PartnerPromotionAction | null | undefined;
  className?: string;
  /** Deterministic Storybook/test override. */
  now?: Date;
  presentation?: "compact" | "expanded";
}) {
  const nowTime = now?.getTime();
  const [currentNow, setCurrentNow] = useState(() => now ?? new Date());
  const [detailsOpen, setDetailsOpen] = useState(false);
  const promotion = partnerPromotionForAction(action, currentNow);

  useEffect(() => {
    if (nowTime !== undefined) setCurrentNow(new Date(nowTime));
  }, [nowTime]);

  useEffect(() => {
    if (nowTime !== undefined || !promotion) return;
    const remaining = new Date(promotion.expiresAt).getTime() - Date.now();
    const delay = Math.min(Math.max(remaining + 1, 0), 2_147_483_647);
    const timeout = window.setTimeout(() => setCurrentNow(new Date()), delay);
    return () => window.clearTimeout(timeout);
  }, [nowTime, promotion]);

  if (!promotion) return null;

  const title = `New to Omio? Save ${promotion.discountPercent}%`;
  const compactDetail = `Use code ${promotion.code} on purchases up to €${promotion.maximumPurchase.amount}. First-time Omio customers only. Valid until 30 Nov 2026.`;

  if (presentation === "compact") return <aside className={`${styles.promotion} ${styles.compact} ${className ?? ""}`} aria-label="Omio new-customer offer">
    <MorroviaContextualDisclosure
      actions={<a className={styles.termsLink} href={promotion.termsUrl} target="_blank" rel="noopener noreferrer" aria-label="Omio promotion terms, opens in a new tab">Terms apply</a>}
      align="start"
      className={styles.compactDisclosure}
      detail={compactDetail}
      onOpenChange={setDetailsOpen}
      open={detailsOpen}
      title={title}
      triggerLabel={title}
    />
  </aside>;

  return <aside className={`${styles.promotion} ${className ?? ""}`} aria-label="Omio new-customer offer">
    <strong>New to Omio? Save {promotion.discountPercent}%</strong>
    <p>
      Use code <code>{promotion.code}</code> on purchases up to €{promotion.maximumPurchase.amount}. First-time Omio customers only. Valid until 30 Nov 2026.{" "}
      <a href={promotion.termsUrl} target="_blank" rel="noopener noreferrer" aria-label="Omio promotion terms, opens in a new tab">Terms apply</a>.
    </p>
  </aside>;
}
