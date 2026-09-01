import LoginForm from "./login-form";
import EasyTNavigation from "../easyt-navigation";
import styles from "../account.module.css";
import { isEasyTAuthConfigured, isEasyTEmailVerificationRequired, isMorroviaGoogleAuthConfigured } from "@/lib/easyt/auth-environment";
import { googleAuthCallbackErrorMessage } from "@/lib/easyt/auth-feedback";
import { safeJourneyReturnTarget } from "@/lib/easyt/trip-continuity";
import { isCanonicalTripWorkspaceHref } from "@/lib/easyt/trip-workspace-links";

export const metadata = { title: "Sign in" };

export default async function EasyTLoginPage({ searchParams }: { searchParams: Promise<{ next?: string; setup?: string; mode?: string; email?: string; sent?: string; oauth?: string; error?: string }> }) {
  const { next, setup, mode, email, sent, oauth, error } = await searchParams;
  const callbackURL = safeJourneyReturnTarget(next);
  const backToTripHref = isCanonicalTripWorkspaceHref(callbackURL) ? callbackURL : undefined;
  const googleEnabled = isMorroviaGoogleAuthConfigured();
  const configured = isEasyTAuthConfigured();
  const emailVerificationRequired = isEasyTEmailVerificationRequired();
  const initialMode = mode === "sign-up" ? "sign-up" : "sign-in";
  return <main className={styles.page}>
    <EasyTNavigation current="login" />
    <div className={styles.authWrap}>
      <div className={styles.authGrid}>
        <LoginForm callbackURL={callbackURL} googleEnabled={googleEnabled} configured={configured} emailVerificationRequired={emailVerificationRequired} showSetupNotice={setup === "required"} initialMode={sent === "1" ? "sign-in" : initialMode} initialEmail={email} verificationSent={sent === "1" && emailVerificationRequired} backToTripHref={backToTripHref} initialError={oauth === "google" && error ? googleAuthCallbackErrorMessage(error) : undefined} />
      </div>
    </div>
  </main>;
}
