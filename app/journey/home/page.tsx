import EasyTNavigation from "../easyt-navigation";
import InspirationExplorer from "./inspiration-explorer";
import styles from "./home.module.css";
import HomeProof from "./home-proof";
import HomeHeroTools from "./home-hero-tools";
import HomeFooter from "./home-footer";
import HomeBenefits from "./home-benefits";
import { homepageEligibleRouteCards, selectHomepageRouteCards } from "@/lib/easyt/homepage-routes";

export const metadata = { title: "Travel your way" };
export const dynamic = "force-dynamic";

export default function EasyTHomePage() {
  const routes = selectHomepageRouteCards(homepageEligibleRouteCards());
  return (
    <main className={styles.page}>
      <EasyTNavigation current="home" landing />
      <HomeHeroTools showTools={false} />
      <HomeBenefits />
      <InspirationExplorer routes={routes} />
      <HomeProof />
      <HomeHeroTools showHero={false} />
      <HomeFooter />

    </main>
  );
}
