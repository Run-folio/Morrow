import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuth } from "@/lib/auth";
import { isEasyTAuthConfigured } from "@/lib/easyt/auth-environment";
import { isEasyTAdmin } from "@/lib/easyt/owner";
import { listEasyTFeedback } from "@/lib/easyt/repository";
import EasyTNavigation from "../../easyt-navigation";
import FeedbackTriageList from "./feedback-triage-list";
import styles from "./feedback.module.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Feedback · Morrovia" };

export default async function EasyTAdminFeedbackPage() {
  if (!isEasyTAuthConfigured()) redirect("/journey/login?setup=required");
  const session = await getAuth().api.getSession({ headers: await headers() });
  const email = session?.user?.email;
  if (!email) redirect("/journey/login?next=/journey/admin/feedback");
  if (!isEasyTAdmin(email)) redirect("/journey/dashboard");

  const feedback = await listEasyTFeedback();
  const average = feedback.length ? feedback.reduce((sum, item) => sum + item.rating, 0) / feedback.length : 0;
  const distribution = [5, 4, 3, 2, 1].map((rating) => ({ rating, count: feedback.filter((item) => item.rating === rating).length }));

  return <main className={styles.page}>
    <EasyTNavigation current="profile" account={{ name: session.user.name, email }} />
    <section className={styles.wrap}>
      <p className={styles.eyebrow}>EASYT · ADMIN</p>
      <h1>Feedback inbox.</h1>
      <p className={styles.intro}>CSAT responses captured from the product.</p>
      <div className={styles.stats}>
        <article><strong>{feedback.length}</strong><span>responses</span></article>
        <article><strong>{average ? average.toFixed(1) : "No rating yet"}</strong><span>average rating</span></article>
        <article><strong>{feedback.filter((item) => item.comment?.trim()).length}</strong><span>with comments</span></article>
      </div>
      <section className={styles.distribution} aria-label="Rating distribution">{distribution.map((item) => <div key={item.rating}><span>{item.rating}</span><div><i style={{ width: feedback.length ? `${(item.count / feedback.length) * 100}%` : "0%" }} /></div><b>{item.count}</b></div>)}</section>
      <FeedbackTriageList feedback={feedback} />
    </section>
  </main>;
}
