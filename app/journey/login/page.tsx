import LoginForm from "./login-form";
import EasyTNavigation from "../easyt-navigation";
import styles from "../account.module.css";
import { isEasyTAuthConfigured } from "@/lib/easyt/auth-environment";
import { isCanonicalTripWorkspaceHref } from "@/lib/easyt/trip-workspace-links";

export const metadata = { title: "Sign in · Morrovia" };

export default async function EasyTLoginPage({ searchParams }: { searchParams: Promise<{ next?: string; setup?: string; mode?: string; email?: string; sent?: string }> }) {
  const { next, setup, mode, email, sent } = await searchParams;
  const callbackURL = next?.startsWith("/journey/") ? next : "/journey/dashboard";
  const backToTripHref = isCanonicalTripWorkspaceHref(callbackURL) ? callbackURL : undefined;
  const googleEnabled = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
  const configured = isEasyTAuthConfigured();
  const initialMode = mode === "sign-up" ? "sign-up" : "sign-in";
  return <main className={styles.page}>
    <EasyTNavigation current="login" />
    <div className={styles.authWrap}>
      <div className={styles.authGrid}>
        <LoginForm callbackURL={callbackURL} googleEnabled={googleEnabled} configured={configured} showSetupNotice={setup === "required"} initialMode={sent === "1" ? "sign-in" : initialMode} initialEmail={email} verificationSent={sent === "1"} backToTripHref={backToTripHref} />
      </div>
    </div>
  </main>;
}
