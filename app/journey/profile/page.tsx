import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuth } from "@/lib/auth";
import {
  ensureEasyTUser,
  getEasyTUserPreferences,
} from "@/lib/easyt/repository";
import EasyTNavigation from "../easyt-navigation";
import styles from "../account.module.css";
import { isEasyTAuthConfigured } from "@/lib/easyt/auth-environment";
import ProfileLocaleContent from "./profile-locale-content";

export const dynamic = "force-dynamic";
export const metadata = { title: "Profile" };

export default async function EasyTProfilePage() {
  if (!isEasyTAuthConfigured())
    redirect("/journey/login?setup=required");
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session?.user) redirect("/journey/login?next=/journey/profile");
  await ensureEasyTUser(session.user.id, session.user.email, session.user.name);
  const preferences = await getEasyTUserPreferences(session.user.id);

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
      <ProfileLocaleContent
        ownerId={session.user.id}
        name={session.user.name || ""}
        email={session.user.email}
        accountLanguage={preferences.language}
        initialTravelProfile={preferences.travelProfile}
        initialTravelReadinessProfile={preferences.travelReadinessProfile}
      />
    </main>
  );
}
