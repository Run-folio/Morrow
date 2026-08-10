import EasyTNavigation from "../easyt-navigation";
import InspirationExplorer from "./inspiration-explorer";
import styles from "./home.module.css";
import ProductShowcase from "./product-showcase";
import HomeTripStarter from "./home-trip-starter";
import HomeProof from "./home-proof";
import HomeHeroTools from "./home-hero-tools";

export const metadata = { title: "Travel your way · EasyT" };

export default function EasyTHomePage() {
  return (
    <main className={styles.page}>
      <EasyTNavigation current="home" />
      <HomeHeroTools showTools={false} />

      <section id="start-building" className={styles.builderSection}>
        <HomeTripStarter />
      </section>

      <HomeProof />

      <ProductShowcase />

      <InspirationExplorer />

      <HomeHeroTools showHero={false} />

    </main>
  );
}
