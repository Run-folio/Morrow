import EasyTNavigation from "../easyt-navigation";
import { MorroviaSkeleton } from "@/components/easyt/morrovia-loading-states";
import accountStyles from "../account.module.css";
import styles from "./dashboard.module.css";

export default function DashboardLoading() {
  return (
    <main className={accountStyles.page} aria-busy="true">
      <EasyTNavigation current="trips" />
      <section className={`${accountStyles.dashboard} ${styles.loadingDashboard}`}>
        <p className={styles.srOnly} role="status">Loading your trips…</p>
        <header className={styles.loadingHeading}>
          <MorroviaSkeleton width={150} height={12} />
          <MorroviaSkeleton width={210} height={64} radius="card" />
          <MorroviaSkeleton width="min(440px, 100%)" height={18} />
        </header>
        <section className={styles.loadingHero} aria-hidden="true">
          <article><MorroviaSkeleton width={118} height={11} /><MorroviaSkeleton width="62%" height={38} radius="card" /><MorroviaSkeleton width="82%" height={15} /><MorroviaSkeleton width="45%" height={44} /></article>
          <MorroviaSkeleton height="100%" radius="card" />
        </section>
        <div className={styles.loadingToolbar} aria-hidden="true"><MorroviaSkeleton width={260} height={44} /><MorroviaSkeleton width={210} height={44} /></div>
        <section className={styles.loadingGrid} aria-hidden="true">
          {[0, 1, 2].map((item) => <article key={item}><MorroviaSkeleton width={84} height={11} /><MorroviaSkeleton width="74%" height={30} radius="card" /><MorroviaSkeleton height={104} radius="card" /><MorroviaSkeleton height={44} /></article>)}
        </section>
      </section>
    </main>
  );
}
