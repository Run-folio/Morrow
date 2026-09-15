"use client";

import { FormEvent, useState } from "react";
import { authClient } from "@/lib/auth-client";
import { authFormErrorMessage } from "@/lib/easyt/auth-feedback";
import {
  emailVerificationStatePath,
  requestAcknowledgedVerificationEmail,
  signInEmailHandoffPath,
  submitEmailSignIn,
  submitEmailSignUp,
} from "@/lib/easyt/auth-email-flow";
import { googleSignInErrorPath } from "@/lib/easyt/trip-continuity";
import {
  EasyTButton,
  EasyTField,
  EasyTLinkButton,
  EasyTSegmentedControl,
} from "@/components/easyt/easyt-controls";
import { EasyTPasswordField } from "@/components/easyt/easyt-password-field";
import { MorroviaStatusBanner } from "@/components/easyt/morrovia-feedback";
import styles from "../account.module.css";

export default function LoginForm({
  callbackURL,
  googleEnabled,
  configured,
  emailVerificationRequired,
  showSetupNotice,
  initialMode,
  initialEmail,
  verificationSent,
  backToTripHref,
  initialError,
}: {
  callbackURL: string;
  googleEnabled: boolean;
  configured: boolean;
  emailVerificationRequired: boolean;
  showSetupNotice: boolean;
  initialMode?: "sign-in" | "sign-up";
  initialEmail?: string;
  verificationSent?: boolean;
  backToTripHref?: string;
  initialError?: string;
}) {
  const [mode, setMode] = useState<"sign-in" | "sign-up">(initialMode ?? "sign-in");
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [error, setError] = useState(initialError ?? "");
  const [email, setEmail] = useState(initialEmail ?? "");
  const [verificationFailure, setVerificationFailure] = useState<{ email: string; source: "sign-in" | "sign-up" } | null>(null);
  const [resendBusy, setResendBusy] = useState(false);
  const [resendError, setResendError] = useState("");
  const [resendConfirmed, setResendConfirmed] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy || googleBusy) return;
    setBusy(true); setError(""); setVerificationFailure(null);
    const data = new FormData(event.currentTarget);
    const submittedEmail = String(data.get("email") || "");
    const password = String(data.get("password") || "");
    const name = String(data.get("name") || "Traveller");
    // Keep the submitted destination as the canonical field value before any
    // asynchronous auth response can rerender the form after a failed send.
    setEmail(submittedEmail.trim());
    const result = mode === "sign-up"
      ? await submitEmailSignUp({
        callbackURL,
        email: submittedEmail,
        emailVerificationRequired,
        name,
        password,
        signUpEmail: (credentials) => authClient.signUp.email(credentials),
        sendVerificationEmail: (request) => authClient.sendVerificationEmail(request),
      })
      : await submitEmailSignIn({
        callbackURL,
        email: submittedEmail,
        password,
        signInEmail: (credentials) => authClient.signIn.email(credentials),
        sendVerificationEmail: (request) => authClient.sendVerificationEmail(request),
      });
    if (result.kind === "auth-error") {
      setError(authFormErrorMessage({ mode, message: result.error?.message, code: result.error?.code }));
    } else if (result.kind === "verification-delivery-error") {
      setEmail(result.email);
      setVerificationFailure({ email: result.email, source: mode });
    } else if (result.kind === "verification-sent") {
      window.location.assign(emailVerificationStatePath(callbackURL, result.email));
    } else {
      window.location.assign(callbackURL);
    }
    setBusy(false);
  };

  const resendVerification = async (destination = verificationFailure?.email || initialEmail?.trim() || "") => {
    if (!destination || resendBusy) return;
    setResendBusy(true); setResendError(""); setResendConfirmed(false);
    const result = await requestAcknowledgedVerificationEmail({
      callbackURL,
      email: destination,
      sendVerificationEmail: (request) => authClient.sendVerificationEmail(request),
    });
    if (result.kind === "verification-sent") {
      if (verificationFailure) window.location.assign(emailVerificationStatePath(callbackURL, destination));
      else setResendConfirmed(true);
    } else {
      setEmail(destination);
      setResendError("We still couldn’t send the verification email. Try again in a moment.");
    }
    setResendBusy(false);
  };

  const continueWithGoogle = async () => {
    setGoogleBusy(true);
    setError("");
    try {
      // Better Auth 1.6 accepts query-bearing relative return paths but requires
      // a same-origin absolute URL when a deep link also contains a hash.
      const googleCallbackURL = new URL(callbackURL, window.location.origin).toString();
      const googleErrorCallbackURL = new URL(googleSignInErrorPath(callbackURL), window.location.origin).toString();
      const result = await authClient.signIn.social({
        provider: "google",
        callbackURL: googleCallbackURL,
        errorCallbackURL: googleErrorCallbackURL,
      });
      if (result?.error) setError(result.error.message || "Google sign-in could not start. Please try again.");
    } catch {
      setError("Google sign-in could not start. Please try again.");
    } finally {
      setGoogleBusy(false);
    }
  };

  const sentEmail = initialEmail?.trim() || "";
  if (verificationSent && sentEmail) {
    return <section className={styles.authPanel}>
      <p className={styles.eyebrow}>Check your email</p>
      <h2>Confirm your address.</h2>
      <p className={styles.muted}>We sent a one-time verification link to:</p>
      <p className={styles.verificationEmail}>{sentEmail}</p>
      <p className={styles.verificationInstructions}>Open the link to verify your account and continue to your trip. If it isn’t in your inbox, check spam or send another email.</p>
      {resendConfirmed ? <MorroviaStatusBanner tone="success" title="Another verification email was sent." /> : null}
      {resendError ? <MorroviaStatusBanner tone="warning" title="Verification email not sent" detail={resendError} /> : null}
      <div className={styles.verificationActions}>
        <EasyTLinkButton fullWidth href={signInEmailHandoffPath(callbackURL, sentEmail)}>Go to sign in</EasyTLinkButton>
        <EasyTButton fullWidth variant="secondary" loading={resendBusy} onClick={() => void resendVerification(sentEmail)}>Send another email</EasyTButton>
      </div>
      {backToTripHref ? <a className={styles.tripReturnLink} href={backToTripHref}>← Back to this trip</a> : null}
    </section>;
  }

  return <section className={styles.authPanel}>
    <p className={styles.eyebrow}>Morrovia account</p>
    <h2>{backToTripHref ? "Save this trip." : mode === "sign-in" ? "Welcome back." : "Start travelling."}</h2>
    <p className={styles.muted}>{backToTripHref ? "Sign in to keep this exact trip and continue planning on another device." : mode === "sign-in" ? "Open your saved plans and pick up where you left off." : "Save your first plan and keep every trip in one place."}</p>
    {(!configured || showSetupNotice) && <p className={styles.setupNotice}>Accounts are being connected to the live site. The Tokyo Marathon+ prototype and trip builder are still available.</p>}
    <EasyTSegmentedControl
      ariaLabel="Account action"
      className={styles.tabs}
      value={mode}
      onChange={(next) => { setMode(next); setError(""); setVerificationFailure(null); }}
      options={[
        { label: "Sign in", value: "sign-in" },
        { label: "New here?", value: "sign-up" },
      ]}
    />
    {googleEnabled && <>
      <EasyTButton className={styles.googleButton} type="button" variant="secondary" fullWidth loading={googleBusy} disabled={!configured || busy} onClick={continueWithGoogle}>
        <GoogleMark />
        Continue with Google
      </EasyTButton>
      <div className={styles.divider}>or use email</div>
    </>}
    {error && <p className={styles.error} role="alert">{error}</p>}
    {verificationFailure ? <MorroviaStatusBanner
      tone="warning"
      title={verificationFailure.source === "sign-up" ? "Your account was created, but the verification email was not sent." : "Your email is not verified, and a new link could not be sent."}
      detail="Try sending the verification email again. Your password has not been stored by this page."
      actions={<EasyTButton size="small" variant="secondary" loading={resendBusy} onClick={() => void resendVerification(verificationFailure.email)}>Try again</EasyTButton>}
    /> : null}
    {resendConfirmed && verificationFailure ? <MorroviaStatusBanner tone="success" title="Verification email sent" detail={`Check ${verificationFailure.email}, including spam.`} /> : null}
    {resendError && verificationFailure ? <p className={styles.error} role="alert">{resendError}</p> : null}
    <form className={styles.form} onSubmit={submit} aria-busy={busy || undefined}>
      {mode === "sign-up" && <EasyTField label="Your name" name="name" autoComplete="name" required placeholder="Your name" />}
      <EasyTField label="Email" name="email" type="email" autoComplete="email" required placeholder="you@example.com" value={email} onChange={(event) => { setEmail(event.target.value); setVerificationFailure(null); }} />
      <EasyTPasswordField label="Password" name="password" minLength={8} autoComplete={mode === "sign-in" ? "current-password" : "new-password"} required placeholder="At least 8 characters" />
      {mode === "sign-in" && <a className={styles.forgotLink} href="/journey/forgot-password">Forgot password?</a>}
      <EasyTButton className={styles.authSubmit} type="submit" fullWidth loading={busy} disabled={!configured || googleBusy || Boolean(verificationFailure)}>{configured ? mode === "sign-in" ? "Sign in →" : "Create account →" : "Accounts coming online"}</EasyTButton>
    </form>
    {backToTripHref ? <a className={styles.tripReturnLink} href={backToTripHref}>← Back to this trip</a> : null}
    <p className={styles.legalLink}>{mode === "sign-up" ? <>By creating an account, you agree to the <a href="/journey/terms">Terms of Use</a> and acknowledge the <a href="/journey/privacy">Privacy Notice</a>.</> : <>Read the <a href="/journey/terms">Terms of Use</a> and how Morrovia handles your data in our <a href="/journey/privacy">Privacy Notice</a>.</>}</p>
  </section>;
}

function GoogleMark() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" focusable="false">
    {/* morrovia-ui-audit-allow-next-line inline-color -- Official Google provider blue must retain exact brand fidelity. */}
    <path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.4-.18-2.06H12v3.9h5.38a4.6 4.6 0 0 1-2 3.02v2.53h3.24c1.9-1.75 2.98-4.33 2.98-7.39Z" />
    {/* morrovia-ui-audit-allow-next-line inline-color -- Official Google provider green must retain exact brand fidelity. */}
    <path fill="#34A853" d="M12 22c2.7 0 4.97-.9 6.62-2.38l-3.24-2.53c-.9.6-2.05.96-3.38.96-2.6 0-4.8-1.76-5.59-4.12H3.06v2.61A10 10 0 0 0 12 22Z" />
    {/* morrovia-ui-audit-allow-next-line inline-color -- Official Google provider yellow must retain exact brand fidelity. */}
    <path fill="#FBBC05" d="M6.41 13.93A6 6 0 0 1 6.1 12c0-.67.12-1.32.31-1.93V7.46H3.06A10 10 0 0 0 2 12c0 1.61.38 3.14 1.06 4.54l3.35-2.61Z" />
    {/* morrovia-ui-audit-allow-next-line inline-color -- Official Google provider red must retain exact brand fidelity. */}
    <path fill="#EA4335" d="M12 5.95c1.47 0 2.79.5 3.83 1.5l2.87-2.87A9.63 9.63 0 0 0 12 2a10 10 0 0 0-8.94 5.46l3.35 2.61C7.2 7.71 9.4 5.95 12 5.95Z" />
  </svg>;
}
