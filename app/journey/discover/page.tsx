import type { Metadata } from "next";
import EasyTNavigation from "../easyt-navigation";
import { applyEasyTRouteControls, listEasyTRouteControls } from "@/lib/easyt/admin-content";
import { publicRoutePublishedFamilies } from "@/lib/easyt/public-route";
import { discoveryCatalogue } from "@/lib/easyt/discovery-catalogue";
import { featuredDiscoveryRoutes, publishedDiscoveryStyles, publishedDiscoveryWonders } from "@/lib/easyt/route-discovery";
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
  try {
    const controls = await listEasyTRouteControls();
    const families = applyEasyTRouteControls(publicRoutePublishedFamilies(), controls);
    const featured = controls.some((control) => control.featured) ? families.slice(0, 4) : featuredDiscoveryRoutes(families);
    const ordered = [...featured, ...families.filter((route) => !featured.some((item) => item.key === route.key))];
    const routes = discoveryCatalogue(ordered);
    const shortcuts = [
      ...publishedDiscoveryStyles(families).map((style) => ({ label: style.label, interest: style.interest })),
      ...publishedDiscoveryWonders(families).map((wonder) => ({ label: wonder.title, routeKey: wonder.route.key })),
    ];
    return <main className={styles.page}><EasyTNavigation current="routes" deferPrefetch /><DiscoveryBrowser routes={routes} shortcuts={shortcuts} /></main>;
  } catch {
    return <main className={styles.page}><EasyTNavigation current="routes" deferPrefetch /><DiscoveryBrowser routes={[]} unavailable /></main>;
  }
}
