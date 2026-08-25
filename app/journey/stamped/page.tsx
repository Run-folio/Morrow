import { headers } from "next/headers";
import { getAuth } from "@/lib/auth";
import { ensureEasyTUser, getEasyTUserPreferences } from "@/lib/easyt/repository";
import { isEasyTAuthConfigured } from "@/lib/easyt/auth-environment";
import EasyTNavigation from "../easyt-navigation";
import StampedClient from "./stamped-client";
import styles from "./stamped.module.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Stamped" };

export default async function StampedPage() {
  let session: any = null;
  let preferences: any = null;
  try {
    if (isEasyTAuthConfigured()) {
      session = await getAuth().api.getSession({ headers: await headers() });
      if (session?.user) {
        await ensureEasyTUser(session.user.id, session.user.email, session.user.name);
        preferences = await getEasyTUserPreferences(session.user.id);
      }
    }
  } catch {
    session = null;
  }

  return (
    <main className={styles.page}>
      <EasyTNavigation
        current="stamped"
        account={session?.user ? { id: session.user.id, name: session.user.name, email: session.user.email, language: preferences?.language } : undefined}
      />
      <StampedClient userKey={session?.user?.id} authenticated={Boolean(session?.user)} />
    </main>
  );
}
