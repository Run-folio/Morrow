import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuth } from "@/lib/auth";
import {
  ensureEasyTUser,
  getCountryStamps,
  getEasyTUserPreferences,
  listTripsForOwner,
} from "@/lib/easyt/repository";
import EasyTNavigation from "../easyt-navigation";
import DashboardClient from "./dashboard-client";
import styles from "../account.module.css";
import dashboardStyles from "./dashboard.module.css";
import { isEasyTAuthConfigured } from "@/lib/easyt/auth-environment";

export const dynamic = "force-dynamic";
export const metadata = { title: "Trips · Morrovia" };

export default async function EasyTDashboardPage() {
  if (!isEasyTAuthConfigured()) {
    redirect("/journey/login?setup=required");
  }

  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session?.user) redirect("/journey/login?next=/journey/dashboard");
  await ensureEasyTUser(session.user.id, session.user.email, session.user.name);
  const [trips, preferences, stamps] = await Promise.all([
    listTripsForOwner(session.user.id),
    getEasyTUserPreferences(session.user.id),
    getCountryStamps(session.user.id),
  ]);
  return (
    <main className={styles.page}>
      <EasyTNavigation
        current="trips"
        account={{
          id: session.user.id,
          name: session.user.name,
          email: session.user.email,
          language: preferences.language,
        }}
      />
      <section className={styles.dashboard}>
        <div className={styles.dashTop}>
          <div>
            <p className={styles.eyebrow}>Your travel workspace</p>
            <h1>Trips<span className={dashboardStyles.titleDot}>.</span></h1>
            <p className={styles.userLine}>
              Plan, revisit and travel with every journey from one place.
            </p>
          </div>
        </div>
        <DashboardClient key={session.user.id} trips={trips} stamps={stamps} ownerId={session.user.id} />
      </section>
    </main>
  );
}
