import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { Gift, LockKeyhole } from "lucide-react";

import { getAuth } from "@/lib/auth";
import { getTripGiftPreview } from "@/lib/easyt/repository";
import EasyTNavigation from "../../easyt-navigation";
import ClaimGift from "./claim-gift";
import styles from "../../account.module.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "A trip for you · EasyT" };

type PageProps = { params: Promise<{ token: string }> };

function maskEmail(email: string) {
  const [local = "", domain = ""] = email.split("@");
  if (!domain) return "this email address";
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}${"•".repeat(Math.max(3, local.length - visible.length))}@${domain}`;
}

export default async function GiftTripPage({ params }: PageProps) {
  const { token } = await params;
  const gift = await getTripGiftPreview(token).catch(() => null);
  if (!gift) notFound();
  const session = await getAuth().api.getSession({ headers: await headers() });
  const next = `/journey/gift/${encodeURIComponent(token)}`;
  const accountMatches = session?.user?.email?.toLowerCase() === gift.recipientEmail.toLowerCase();
  const expired = gift.status === "expired";
  const recipientLabel = accountMatches ? gift.recipientEmail : maskEmail(gift.recipientEmail);

  return (
    <main className={styles.page}>
      <EasyTNavigation current="trips" />
      <section className={styles.giftClaimPage}>
        <div className={styles.giftClaimCard}>
          <span className={styles.giftClaimIcon}><Gift aria-hidden="true" /></span>
          <p className={styles.eyebrow}>A trip has been gifted to you</p>
          <h1>{gift.tripTitle}</h1>
          <p className={styles.giftClaimCopy}>
            {gift.senderName} has shared their plan with you. Claiming it creates your own editable copy. Their original stays theirs.
          </p>
          {gift.note ? <blockquote className={styles.giftNote}>“{gift.note}”</blockquote> : null}
          <p className={styles.giftRecipient}>For {recipientLabel}</p>
          {expired ? (
            <p className={styles.syncError}>This invitation expired before it was claimed.</p>
          ) : accountMatches ? (
            <ClaimGift token={token} />
          ) : session?.user ? (
            <p className={styles.syncError}>
              This invitation was sent to a different email address. Sign in with the invited account to claim it.
            </p>
          ) : (
            <div className={styles.giftClaimActions}>
              <p className={styles.muted}>Sign in or create an account with the invited email address to add this trip to My trips.</p>
              <Link className={styles.primaryLink} href={`/journey/login?next=${encodeURIComponent(next)}`}>
                <LockKeyhole aria-hidden="true" /> Sign in to claim
              </Link>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
