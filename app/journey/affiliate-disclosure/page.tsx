import MorroviaFooter from "@/components/morrovia-footer";
import EasyTNavigation from "../easyt-navigation";
import styles from "../privacy/privacy-current.module.css";

export const metadata = {
  title: "Affiliate disclosure · Morrovia",
  description: "How Morrovia uses affiliate and referral links.",
};

export default function AffiliateDisclosurePage() {
  return <main id="main-content">
    <EasyTNavigation />
    <div className={styles.page}>
      <a className={styles.skipLink} href="#affiliate-content">Skip to affiliate disclosure</a>
      <section className={styles.hero} aria-labelledby="affiliate-title">
        <p>Affiliate disclosure</p>
        <h1 id="affiliate-title">How partner links work at Morrovia.</h1>
        <span>We want it to be clear when Morrovia may earn money from a link or booking you choose to make.</span>
        <small>Last updated 17 August 2026</small>
      </section>
      <article id="affiliate-content" className={styles.content} tabIndex={-1}>
        <section className={styles.section} aria-labelledby="relationships-title">
          <h2 id="relationships-title">Affiliate relationships</h2>
          <p>Morrovia may work with third-party travel and service providers through affiliate or referral relationships. Some links in Morrovia may be affiliate links. If you follow one of these links and complete an eligible purchase or booking, Morrovia may receive a commission or referral fee.</p>
        </section>
        <section className={styles.section} aria-labelledby="cost-title">
          <h2 id="cost-title">What this costs you</h2>
          <p>When Morrovia receives a commission, it will not normally increase the price you pay through the partner link. The final price, availability and terms are always set by the relevant provider.</p>
        </section>
        <section className={styles.section} aria-labelledby="recommendations-title">
          <h2 id="recommendations-title">Recommendations and commercial relationships</h2>
          <p>Morrovia may have commercial relationships with some providers. This disclosure is intended to make those relationships clear; it does not make claims about how every recommendation, ranking or presentation is determined.</p>
        </section>
        <section className={styles.section} aria-labelledby="third-party-title">
          <h2 id="third-party-title">Third-party transactions</h2>
          <p>Bookings and purchases are completed with the relevant third-party provider. Unless we explicitly say otherwise, Morrovia is not the provider of those travel products or services. The provider’s own terms, cancellation and refund policies, and privacy practices may apply.</p>
          <p>Prices and availability can change. Before purchasing, please verify the final price, availability, restrictions and booking details directly with the provider.</p>
        </section>
        <section className={styles.summary} aria-labelledby="nearby-title">
          <div><h2 id="nearby-title">Disclosure near commercial links</h2><p>A dedicated page is not a substitute for clear context. Where a Morrovia link is commercial or affiliate-supported, the product should provide a concise nearby notice, such as: “Morrovia may earn a commission from this link.”</p></div>
        </section>
      </article>
    </div>
    <MorroviaFooter />
  </main>;
}
