import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuth } from "@/lib/auth";
import { listEasyTAdminUsers } from "@/lib/easyt/admin-content";
import { isEasyTAdmin } from "@/lib/easyt/owner";
import EasyTNavigation from "../../easyt-navigation";
import UserSupport from "./user-support";
import styles from "../../account.module.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Users & support · EasyT" };

export default async function EasyTUsersAdminPage() {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session?.user?.email) redirect("/journey/login?next=/journey/admin/users");
  if (!isEasyTAdmin(session.user.email)) redirect("/journey/dashboard");
  const users = await listEasyTAdminUsers().catch(() => []);
  return <main className={styles.page}><EasyTNavigation current="admin" account={{ name: session.user.name, email: session.user.email }} /><section className={styles.dashboard}><div className={styles.dashTop}><div><p className={styles.eyebrow}>Account operations</p><h1>Users & support.</h1><p className={styles.userLine}>Find beta accounts, understand their trip activity and send a secure password-reset link.</p></div></div><UserSupport users={users} /></section></main>;
}
