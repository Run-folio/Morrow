import EasyTNavigation from "../easyt-navigation";
import InspirationExplorer from "./inspiration-explorer";
import styles from "./home.module.css";
import HomeProof from "./home-proof";
import HomeHeroTools from "./home-hero-tools";
import HomeFooter from "./home-footer";
import HomeBenefits from "./home-benefits";

export const metadata = { title: "Travel your way" };

export default function EasyTHomePage() {
  return (
    <main className={styles.page}>
      <EasyTNavigation current="home" landing />
      <HomeHeroTools showTools={false} />
      <HomeBenefits />
      <InspirationExplorer />
      <HomeProof />
      <HomeHeroTools showHero={false} />
      <HomeFooter />

    </main>
  );
}
