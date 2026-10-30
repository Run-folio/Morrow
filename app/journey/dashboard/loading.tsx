import EasyTNavigation from "../easyt-navigation";
import { MorroviaSkeleton } from "@/components/easyt/morrovia-loading-states";
import accountStyles from "../account.module.css";
import styles from "./dashboard.module.css";

export default function DashboardLoading() {
  return (
    <main className={accountStyles.page} aria-busy="true">
      <EasyTNavigation current="trips" />
      <section className={`${accountStyles.dashboard} ${styles.collectionPage} ${styles.loadingDashboard}`}>
        <p className={styles.srOnly} role="status">Loading your trips…</p>
        <h1 className={styles.srOnly}>My Trips</h1>
        <div className={styles.loadingToolbar} aria-hidden="true"><MorroviaSkeleton width={260} height={44} /><MorroviaSkeleton width={210} height={44} /></div>
        <section className={styles.loadingGrid} aria-hidden="true">
          {[0, 1, 2].map((item) => <article key={item}><MorroviaSkeleton width={84} height={11} /><MorroviaSkeleton width="74%" height={30} radius="card" /><MorroviaSkeleton height={104} radius="card" /><MorroviaSkeleton height={44} /></article>)}
        </section>
      </section>
    </main>
  );
}
