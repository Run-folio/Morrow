import EasyTNavigation from "../easyt-navigation";
import { morroviaLegalIdentity } from "@/lib/morrovia-legal-identity";
import styles from "../privacy/privacy-current.module.css";

export const metadata = {
  title: "Affiliate and commercial disclosure",
  description: "How Morrovia uses partner links and keeps travel bookings with third-party providers.",
};

export default function AffiliateDisclosurePage() {
  return <main id="main-content">
    <EasyTNavigation />
    <div className={styles.page}>
      <a className={styles.skipLink} href="#affiliate-content">Skip to affiliate and commercial disclosure</a>
      <section className={styles.hero} aria-labelledby="affiliate-title">
        <p>Affiliate and commercial disclosure</p>
        <h1 id="affiliate-title">How partner links and travel bookings work.</h1>
        <span>Morrovia helps you plan, then hands booking and payment to the named third-party provider.</span>
        <small>Last updated 1 September 2026</small>
      </section>
      <article id="affiliate-content" className={styles.content} tabIndex={-1}>
        <section className={styles.section} aria-labelledby="operator-title">
          <h2 id="operator-title">Who operates Morrovia</h2>
          <p><strong>{morroviaLegalIdentity.operatorTradingAs}</strong> operates the Morrovia product.</p>
        </section>
        <section className={styles.section} aria-labelledby="relationships-title">
          <h2 id="relationships-title">Affiliate relationships</h2>
          <p>Morrovia may receive an affiliate commission or referral fee if you follow an eligible partner link and later make a qualifying purchase. Current or recent named partners include Trip.com, Viator, Omio and Saily. Booking.com may also supply accommodation discovery results where that service is configured. Morrovia can use other clearly identified, configured partners.</p>
        </section>
        <section className={styles.section} aria-labelledby="cost-title">
          <h2 id="cost-title">What this costs you</h2>
          <p>Morrovia does not add a separate fee when you use a current partner link. Where a nearby notice says “at no extra cost to you”, the partner arrangement does not add a separate Morrovia charge to the provider’s displayed price. This does not promise that a provider has the lowest available price.</p>
        </section>
        <section className={styles.section} aria-labelledby="recommendations-title">
          <h2 id="recommendations-title">Recommendations and commercial relationships</h2>
          <p>Affiliate commission does not determine route ranking, destination suggestions, itinerary suggestions, accommodation recommendation ordering or transport choice in the current product. Those planning decisions use the traveller’s trip context, route facts and labelled provider results, not commission rates.</p>
        </section>
        <section className={styles.section} aria-labelledby="third-party-title">
          <h2 id="third-party-title">Booking and payment stay with the provider</h2>
          <p>Opening a partner link is not a booking. Travel booking, checkout and payment take place with the named third-party provider, not with Morrovia. Morrovia does not currently accept payment for flights, accommodation, activities, transport, connectivity or other travel services.</p>
          <p>The provider’s current prices, availability, inventory, contract terms, privacy notice, cancellation and refund rules apply. Verify the final details with that provider before paying.</p>
          <p>Morrovia does not mark a stay, activity or transport service as booked, or a readiness task as complete, just because a partner link was opened. Completion is shown only when booking evidence is later added to the trip’s saved booking record.</p>
        </section>
        <section className={styles.summary} aria-labelledby="nearby-title">
          <div><h2 id="nearby-title">Disclosure near commercial links</h2><p>A dedicated page is not a substitute for clear context. Where a Morrovia link is commercial or affiliate-supported, the product should provide a concise nearby notice, such as: “Morrovia may earn a commission from this link.”</p></div>
        </section>
      </article>
    </div>
  </main>;
}
