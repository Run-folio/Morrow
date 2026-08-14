import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuth } from "@/lib/auth";
import { isEasyTAuthConfigured } from "@/lib/easyt/auth-environment";
import { isEasyTAdmin } from "@/lib/easyt/owner";
import EasyTNavigation from "../easyt-navigation";
import styles from "../account.module.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin · Morrovia" };

const areas = [
  {
    href: "/journey/admin/feedback",
    eyebrow: "Product quality",
    title: "Feedback inbox",
    description: "Read beta feedback, monitor rating trends and find the friction worth fixing next.",
    action: "Open feedback",
  },
  {
    href: "/journey/admin/emails",
    eyebrow: "Account operations",
    title: "Email delivery",
    description: "Review transactional email events, delivery status and provider-reported failures.",
    action: "Open email delivery",
  },
  {
    href: "/journey/admin/routes",
    eyebrow: "Live content",
    title: "Route catalogue",
    description: "Publish, hide and feature the route starting points travellers see in Discover.",
    action: "Manage routes",
  },
  {
    href: "/journey/admin/users",
    eyebrow: "Account operations",
    title: "Users & support",
    description: "Find beta accounts, check their trip activity and send a secure reset link.",
    action: "Open user support",
  },
  {
    href: "/journey/admin/audit",
    eyebrow: "Governance",
    title: "Admin audit",
    description: "Review the record of content changes and support actions by superusers.",
    action: "Open audit log",
  },
];

export default async function EasyTAdminPage() {
  if (!isEasyTAuthConfigured()) redirect("/journey/login?setup=required");
  const session = await getAuth().api.getSession({ headers: await headers() });
  const email = session?.user?.email;
  if (!email) redirect("/journey/login?next=/journey/admin");
  if (!isEasyTAdmin(email)) redirect("/journey/dashboard");

  return <main className={styles.page}>
    <EasyTNavigation current="admin" account={{ name: session.user.name, email }} />
    <section className={styles.dashboard}>
      <div className={styles.dashTop}>
        <div>
          <p className={styles.eyebrow}>EasyT · superuser</p>
          <h1>Operations.</h1>
          <p className={styles.userLine}>Manage the beta’s operational signals and user-facing delivery systems.</p>
        </div>
      </div>
      <div className={styles.tripGrid}>
        {areas.map((area) => <article className={styles.tripCard} key={area.href}>
          <p className={styles.eyebrow}>{area.eyebrow}</p>
          <h2>{area.title}</h2>
          <p className={styles.tripStops}>{area.description}</p>
          <div className={styles.tripFooter}><Link href={area.href}>{area.action} →</Link></div>
        </article>)}
      </div>
    </section>
  </main>;
}
