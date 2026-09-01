import type { Metadata } from "next";
import EasyTNavigation from "../easyt-navigation";
import Link from "next/link";
import { ArrowRight, CalendarDays, MapPin, Sparkles } from "lucide-react";
import { EasyTLinkButton } from "@/components/easyt/easyt-controls";
import { applyEasyTRouteControls, listEasyTRouteControls } from "@/lib/easyt/admin-content";
import { publicRoutePublishedFamilies } from "@/lib/easyt/public-route";
import { routeImages } from "@/lib/easyt/route-images";
import DiscoveryBrowser from "./discovery-browser";
import styles from "./discover.module.css";

export const metadata: Metadata = {
  title: "Find your route",
  description: "Browse thoughtful, editable routes by region, feeling and trip length.",
  alternates: { canonical: "/journey/discover" },
  openGraph: {
    title: "Find your route",
    description: "Browse thoughtful, editable routes by region, feeling and trip length.",
    url: "/journey/discover",
    siteName: "Morrovia",
    type: "website",
  },
};

export const dynamic = "force-dynamic";

export default async function DiscoveryPage() {
  const controls = await listEasyTRouteControls().catch(() => []);
  const routes = applyEasyTRouteControls(publicRoutePublishedFamilies(), controls);
  const featured = routes[0];
  return (
    <main className={styles.page}>
      <EasyTNavigation current="routes" />
      <section className={styles.hero}>
        <div className={styles.heroBackdrop} aria-hidden="true" />
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>FIND YOUR NEXT ADVENTURE</p>
          <h1>Find a journey <span>worth taking</span></h1>
          <p>Thoughtfully routed multi-stop trips to iconic places and unforgettable regions.</p>
          <div className={styles.heroActions}>
            <EasyTLinkButton className={styles.primaryAction} href="#discover-routes" icon={ArrowRight}>Explore routes</EasyTLinkButton>
            <Link className={styles.secondaryAction} href="/journey/home#how-it-works">How it works</Link>
          </div>
        </div>
        {featured && <article className={styles.featuredCard}>
          <div className={styles.featuredDetails}>
            <div className={styles.featuredLabel}><Sparkles aria-hidden="true" /> FEATURED ROUTE</div>
            <h2>{featured.title}</h2>
            <p>{featured.bestFor}</p>
            <dl>
              <div><dt><MapPin aria-hidden="true" /></dt><dd>{featured.stops.map((stop) => stop.name).join(" → ")}</dd></div>
              <div><dt><CalendarDays aria-hidden="true" /></dt><dd>{featured.suggestedDays.ideal} days · {featured.stops.length} stops</dd></div>
              <div><dt><Sparkles aria-hidden="true" /></dt><dd>{featured.interests.slice(0, 3).map((interest) => interest[0].toUpperCase() + interest.slice(1)).join(" · ")}</dd></div>
            </dl>
            <Link href={`/journey/routes/${featured.key}`}>See the route <ArrowRight aria-hidden="true" /></Link>
          </div>
          <div className={styles.featuredImage} style={{ backgroundImage: `url(${routeImages[featured.key] ?? "/journey/japan-evening-route.jpg"})` }} aria-hidden="true" />
        </article>}
      </section>
      <DiscoveryBrowser routes={routes} />
    </main>
  );
}
