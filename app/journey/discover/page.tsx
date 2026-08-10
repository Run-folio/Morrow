import EasyTNavigation from "../easyt-navigation";
import { applyEasyTRouteControls, listEasyTRouteControls } from "@/lib/easyt/admin-content";
import { routeFamilies } from "@/lib/easyt/route-catalog";
import DiscoveryBrowser from "./discovery-browser";
import styles from "./discover.module.css";

export const metadata = {
  title: "Find your route · EasyT",
  description: "Browse thoughtful, editable routes by region, feeling and trip length.",
};

export const dynamic = "force-dynamic";

export default async function DiscoveryPage() {
  const controls = await listEasyTRouteControls().catch(() => []);
  return (
    <main className={styles.page}>
      <EasyTNavigation current="home" />
      <section className={styles.hero}>
        <p className={styles.eyebrow}>A BETTER START</p>
        <h1>Discover</h1>
        <p>Start with a shape that already makes sense, then make every day your own.</p>
      </section>
      <DiscoveryBrowser routes={applyEasyTRouteControls(routeFamilies, controls)} />
    </main>
  );
}
