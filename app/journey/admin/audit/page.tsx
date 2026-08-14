import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuth } from "@/lib/auth";
import { listEasyTAdminAuditEvents } from "@/lib/easyt/admin-content";
import { isEasyTAdmin } from "@/lib/easyt/owner";
import EasyTNavigation from "../../easyt-navigation";
import styles from "../../account.module.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin audit · Morrovia" };

export default async function EasyTAuditPage() {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session?.user?.email) redirect("/journey/login?next=/journey/admin/audit");
  if (!isEasyTAdmin(session.user.email)) redirect("/journey/dashboard");
  const events = await listEasyTAdminAuditEvents().catch(() => []);
  return <main className={styles.page}><EasyTNavigation current="admin" account={{ name: session.user.name, email: session.user.email }} /><section className={styles.dashboard}><div className={styles.dashTop}><div><p className={styles.eyebrow}>Governance</p><h1>Admin audit.</h1><p className={styles.userLine}>A record of operational changes and support actions by EasyT superusers.</p></div></div><div className={styles.emailEventList}>{events.map((event) => <article key={event.id} className={styles.emailEventRow}><div><strong>{event.action.replaceAll("_", " ")}</strong><span>{event.target} · {event.actorEmail}</span></div><time dateTime={event.createdAt}>{new Date(event.createdAt).toLocaleString()}</time></article>)}{!events.length && <div className={styles.empty}><h2>No admin activity yet.</h2><p className={styles.muted}>Route and support actions will be recorded here.</p></div>}</div></section></main>;
}
