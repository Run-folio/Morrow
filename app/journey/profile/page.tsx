import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuth } from "@/lib/auth";
import {
  ensureEasyTUser,
  getEasyTUserPreferences,
} from "@/lib/easyt/repository";
import EasyTNavigation from "../easyt-navigation";
import ProfileForm from "./profile-form";
import styles from "../account.module.css";
import { isEasyTAuthConfigured } from "@/lib/easyt/auth-environment";
import { easytCopy } from "@/lib/easyt/i18n";

export const dynamic = "force-dynamic";
export const metadata = { title: "Profile · EasyT" };

export default async function EasyTProfilePage() {
  if (!isEasyTAuthConfigured())
    redirect("/journey/login?setup=required");
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session?.user) redirect("/journey/login?next=/journey/profile");
  await ensureEasyTUser(session.user.id, session.user.email, session.user.name);
  const preferences = await getEasyTUserPreferences(session.user.id);
  const copy = easytCopy[preferences.language].account;

  return (
    <main className={styles.page}>
      <EasyTNavigation
        current="profile"
        account={{
          name: session.user.name,
          email: session.user.email,
          language: preferences.language,
        }}
      />
      <section className={styles.profileWrap}>
        <p className={styles.eyebrow}>{copy.settings}</p>
        <h1>{copy.profileTitle}</h1>
        <ProfileForm
          name={session.user.name || ""}
          email={session.user.email}
          initialLanguage={preferences.language}
          initialTravelProfile={preferences.travelProfile}
        />
      </section>
    </main>
  );
}
