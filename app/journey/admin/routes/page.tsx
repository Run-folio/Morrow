import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuth } from "@/lib/auth";
import { isEasyTAdmin } from "@/lib/easyt/owner";
import { listEasyTRouteControls } from "@/lib/easyt/admin-content";
import { routeFamilies } from "@/lib/easyt/route-catalog";
import EasyTNavigation from "../../easyt-navigation";
import RouteControls from "./route-controls";
import styles from "../../account.module.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Route catalogue · Morrovia" };

export default async function RouteCataloguePage() {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session?.user?.email) redirect("/journey/login?next=/journey/admin/routes");
  if (!isEasyTAdmin(session.user.email)) redirect("/journey/dashboard");
  const controls = await listEasyTRouteControls();
  return <main className={styles.page}><EasyTNavigation current="admin" account={{ name: session.user.name, email: session.user.email }} /><section className={styles.dashboard}><div className={styles.dashTop}><div><p className={styles.eyebrow}>Live content</p><h1>Route catalogue.</h1><p className={styles.userLine}>Changes publish immediately to Discover. Feature routes to move them to the top.</p></div></div><RouteControls routes={routeFamilies} initialControls={Object.fromEntries(controls.map((control) => [control.routeKey, { published: control.published, featured: control.featured }]))} /></section></main>;
}
