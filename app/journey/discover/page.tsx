import type { Metadata } from "next";
import EasyTNavigation from "../easyt-navigation";
import Link from "next/link";
import { ArrowRight, CalendarDays, MapPin, Sparkles } from "lucide-react";
import { applyEasyTRouteControls, listEasyTRouteControls } from "@/lib/easyt/admin-content";
import { routeFamilies } from "@/lib/easyt/route-catalog";
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
  return (
    <main className={styles.page}>
      <EasyTNavigation current="routes" />
      <section className={styles.hero}>
        <div className={styles.heroBackdrop} aria-hidden="true" />
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>A BETTER START</p>
          <h1>Discover routes that make <span>sense</span></h1>
          <p>Handpicked route ideas for the way you want to travel. Every one is 100% editable.</p>
          <div className={styles.heroActions}>
            <a className={styles.primaryAction} href="#discover-routes">Start exploring <ArrowRight aria-hidden="true" /></a>
            <Link className={styles.secondaryAction} href="/journey/home#how-it-works">How it works</Link>
          </div>
        </div>
        <article className={styles.featuredCard}>
          <div className={styles.featuredLabel}><Sparkles aria-hidden="true" /> FEATURED ROUTE</div>
          <h2>Japan, one good day at a time</h2>
          <p>A first-timer friendly route with neighbourhoods, meals and slower mornings.</p>
          <dl>
            <div><dt><MapPin aria-hidden="true" /></dt><dd>Tokyo → Takayama → Kyoto</dd></div>
            <div><dt><CalendarDays aria-hidden="true" /></dt><dd>10 days · 3 stops</dd></div>
            <div><dt><Sparkles aria-hidden="true" /></dt><dd>Food · culture · rail</dd></div>
          </dl>
          <Link href="/journey/routes/japan-slow">See the route <ArrowRight aria-hidden="true" /></Link>
        </article>
      </section>
      <DiscoveryBrowser routes={applyEasyTRouteControls(routeFamilies, controls)} />
    </main>
  );
}
