import type { Metadata } from "next";
import EasyTNavigation from "../easyt-navigation";
import { applyEasyTRouteControls, listEasyTRouteControls } from "@/lib/easyt/admin-content";
import { publicRoutePublishedFamilies } from "@/lib/easyt/public-route";
import { discoveryCatalogue } from "@/lib/easyt/discovery-catalogue";
import { catalogueWithEditorialImages, routesOverviewEditorial } from "@/lib/easyt/routes-overview-editorial";
import { featuredDiscoveryRoutes, publishedDiscoveryStyles, publishedDiscoveryWonders } from "@/lib/easyt/route-discovery";
import DiscoveryBrowser from "./discovery-browser";
import styles from "./discover.module.css";
import homepageStyles from "../home/immersive/immersive.module.css";

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
    const editorial = routesOverviewEditorial(routes);
    const shortcuts = [
      ...publishedDiscoveryStyles(families).map((style) => ({ label: style.label, interest: style.interest })),
      ...publishedDiscoveryWonders(families).map((wonder) => ({ label: wonder.title, routeKey: wonder.route.key })),
    ];
    return <main className={styles.page}><DiscoveryBrowser navigation={<div className={homepageStyles.navigation}><EasyTNavigation current="routes" landing logoTone="light" deferPrefetch /></div>} routes={catalogueWithEditorialImages(routes, editorial)} editorial={editorial} shortcuts={shortcuts} /></main>;
  } catch {
    return <main className={styles.page}><DiscoveryBrowser navigation={<div className={homepageStyles.navigation}><EasyTNavigation current="routes" landing logoTone="light" deferPrefetch /></div>} routes={[]} unavailable /></main>;
  }
}
