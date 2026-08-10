import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuth } from "@/lib/auth";
import { isEasyTAdmin } from "@/lib/easyt/owner";
import { listEasyTEmailEvents } from "@/lib/easyt/repository";
import EasyTNavigation from "../../easyt-navigation";
import styles from "../../account.module.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Email delivery · EasyT" };

export default async function EasyTEmailAdminPage() {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session?.user) redirect("/journey/login?next=/journey/admin/emails");
  if (!isEasyTAdmin(session.user.email)) redirect("/journey/dashboard");
  const events = await listEasyTEmailEvents().catch(() => []);
  return <main className={styles.page}>
    <EasyTNavigation current="trips" />
    <section className={styles.dashboard}>
      <div className={styles.dashTop}><div><p className={styles.eyebrow}>Operations</p><h1>Email delivery.</h1><p className={styles.userLine}>Transactional events from Resend, including failures and webhook updates.</p></div></div>
      <div className={styles.emailEventList}>{events.map((event) => <article key={event.id} className={styles.emailEventRow}><div><strong>{event.subject}</strong><span>{event.recipientEmail} · {event.template}</span></div><b className={`${styles.emailStatus} ${styles[`emailStatus${event.status[0].toUpperCase()}${event.status.slice(1)}`]}`}>{event.status}</b><time dateTime={event.createdAt}>{new Date(event.createdAt).toLocaleString()}</time>{event.errorMessage ? <p>{event.errorMessage}</p> : null}</article>)}{!events.length ? <div className={styles.empty}><h2>No email events yet.</h2><p className={styles.muted}>Once Resend is configured and an EasyT email is sent, it will appear here.</p></div> : null}</div>
    </section>
  </main>;
}
