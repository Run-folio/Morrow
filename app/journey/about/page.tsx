import type { Metadata } from "next";
import Image from "next/image";
import { ArrowRight, CloudSun, Heart, MapPinned, Route, Sparkles, TimerReset } from "lucide-react";
import { EasyTLinkButton } from "@/components/easyt/easyt-controls";
import EasyTNavigation from "../easyt-navigation";
import styles from "./about.module.css";

export const metadata: Metadata = {
  title: "About Morrovia",
  description:
    "Why Morrovia helps independent travellers turn complex, multi-stop trip ideas into thoughtful plans they can shape.",
  alternates: { canonical: "/journey/about" },
};

const heroPrinciples = [
  [Route, "Multi-stop trips made coherent"],
  [Sparkles, "A realistic first plan"],
  [Heart, "Built for independent travellers"],
] as const;

const travellerPrinciples = [
  {
    icon: TimerReset,
    title: "Realistic travel time",
    copy: "Morrovia accounts for transfers, connections, movement and the effect travel has on a day.",
  },
  {
    icon: CloudSun,
    title: "Honest uncertainty",
    copy: "Supported facts stay distinct from estimates, with important details clearly marked for verification.",
  },
  {
    icon: MapPinned,
    title: "Traveller control",
    copy: "Morrovia proposes a coherent first plan, but you can edit, move, save and shape it as the trip evolves.",
  },
] as const;

const connectedCapabilities = [
  {
    title: "Route planning",
    copy: "Put every stop in an order that makes sense.",
  },
  {
    title: "Smart nights",
    copy: "Balance nights around pace, distance and what matters most.",
  },
  {
    title: "Day-by-day itinerary",
    copy: "Turn the route into an editable daily plan, with travel time in view.",
  },
  {
    title: "Before you go",
    copy: "Keep bookings and practical details connected to the journey.",
  },
] as const;

function SectionHeading({ eyebrow, title, id }: { eyebrow: string; title: string; id: string }) {
  return (
    <header className={styles.sectionHeading}>
      <p>{eyebrow}</p>
      <h2 id={id}>{title}</h2>
    </header>
  );
}

export default function AboutPage() {
  return (
    <main className={`${styles.page} morrovia-editorial-page`}>
      <EasyTNavigation current="about" landing />

      <section className={styles.hero} aria-labelledby="about-title">
        <div className={styles.heroGrid}>
          <div className={styles.heroCopy}>
            <p className={styles.eyebrow}>ABOUT MORROVIA</p>
            <h1 id="about-title">
              <span className={styles.heroTitleLine}>Travel is complicated.</span>
              <span className={styles.heroTitleLine}>Planning it <em>shouldn’t</em> be.</span>
            </h1>
            <p className={styles.heroLede}>
              Morrovia helps independent travellers turn complex, multi-stop ideas into realistic routes, sensible nights and a plan that stays connected from first idea to departure.
            </p>
            <ul className={styles.heroPrinciples} aria-label="What Morrovia stands for">
              {heroPrinciples.map(([Icon, label]) => (
                <li key={label}>
                  <Icon aria-hidden="true" />
                  <span>{label}</span>
                </li>
              ))}
            </ul>
          </div>

          <figure className={styles.heroArtwork}>
            <Image
              src="/journey/about/about-hero-multi-stop-journey.png"
              width={1573}
              height={1000}
              sizes="(max-width: 820px) calc(100vw - 32px), 48vw"
              alt="An illustrated traveller following a connected multi-stop route through mountains, rail journeys and coastal destinations."
              priority
            />
          </figure>
        </div>
      </section>

      <section className={styles.whySection} aria-labelledby="why-morrovia">
        <div className={styles.whyGrid}>
          <SectionHeading eyebrow="WHY WE BUILT MORROVIA" title="One trip, not twenty tabs" id="why-morrovia" />
          <div className={styles.whyNarrative}>
            <p>
              Finding a flight, a room or a train is the easy part. The hard part is seeing whether every stop, transfer and day still works together.
            </p>
            <p>
              That is why we built Morrovia: one connected plan you can shape, question and change, with every final decision still yours.
            </p>
          </div>
        </div>
      </section>

      <section className={styles.principlesSection} aria-labelledby="built-around-you">
        <div className={styles.sectionInner}>
          <SectionHeading eyebrow="BUILT AROUND REAL TRAVEL" title="Designed for real travel" id="built-around-you" />
          <div className={styles.travellerGrid}>
            {travellerPrinciples.map(({ icon: Icon, title, copy }) => (
              <article key={title}>
                <Icon aria-hidden="true" />
                <div>
                  <h3>{title}</h3>
                  <p>{copy}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.flowSection} aria-labelledby="connected-plan">
        <div className={styles.sectionInner}>
          <SectionHeading eyebrow="ONE CONNECTED PLANNING FLOW" title="From rough idea to a trip that works" id="connected-plan" />
          <div className={styles.flowGrid}>
            <figure className={styles.productPreview}>
              <Image
                src="/journey/product-shots/about-workspace-map-current.jpg"
                width={1284}
                height={1111}
                sizes="(max-width: 820px) calc(100vw - 32px), 58vw"
                alt="The current Morrovia Map workspace showing a connected route through Delhi, Agra and Jaipur."
              />
              <figcaption>The current Morrovia Map keeps every stop, transfer and day in one connected view.</figcaption>
            </figure>
            <ol className={styles.capabilityList}>
              {connectedCapabilities.map(({ title, copy }, index) => (
                <li key={title}>
                  <span aria-hidden="true">{index + 1}</span>
                  <div>
                    <h3>{title}</h3>
                    <p>{copy}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      <section className={styles.cta} aria-labelledby="about-cta-title">
        <Image
          className={styles.ctaArtwork}
          src="/journey/about/about-closing-atlas-journey-v2.png"
          width={1774}
          height={887}
          sizes="(max-width: 820px) calc(100vw - 32px), 88vw"
          alt=""
        />
        <div className={styles.ctaCopy}>
          <p className={styles.eyebrow}>THE ROAD AHEAD</p>
          <h2 id="about-cta-title">Your next trip starts with a route you can trust</h2>
          <p>Bring the places, dates and must-dos. Morrovia will turn them into a connected first plan, ready for you to shape.</p>
          <EasyTLinkButton href="/journey/new" icon={ArrowRight} size="large">
            Start my trip
          </EasyTLinkButton>
        </div>
      </section>
    </main>
  );
}
