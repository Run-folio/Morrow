"use client";

import { FormEvent, useState } from "react";
import { authClient } from "@/lib/auth-client";
import {
  EasyTButton,
  EasyTField,
  EasyTSegmentedControl,
} from "@/components/easyt/easyt-controls";
import styles from "../account.module.css";

export default function LoginForm({
  callbackURL,
  googleEnabled,
  configured,
  showSetupNotice,
  initialMode,
  initialEmail,
  verificationSent,
}: {
  callbackURL: string;
  googleEnabled: boolean;
  configured: boolean;
  showSetupNotice: boolean;
  initialMode?: "sign-in" | "sign-up";
  initialEmail?: string;
  verificationSent?: boolean;
}) {
  const [mode, setMode] = useState<"sign-in" | "sign-up">(initialMode ?? "sign-in");
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [error, setError] = useState("");
  const [email, setEmail] = useState(initialEmail ?? "");

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setBusy(true); setError("");
    const data = new FormData(event.currentTarget);
    const submittedEmail = String(data.get("email") || "");
    const password = String(data.get("password") || "");
    const name = String(data.get("name") || "Traveller");
    const result = mode === "sign-up"
      ? await authClient.signUp.email({ name, email, password, callbackURL })
      : await authClient.signIn.email({ email: submittedEmail, password, callbackURL });
    if (result.error) {
      const message = result.error.message || "";
      setError(message.toLowerCase().includes("email not verified")
        ? "Email not verified. We sent a fresh verification link. Check your inbox, including spam, then sign in again."
        : mode === "sign-up"
          ? "We could not create your account just now. Check the details and try again."
          : "We could not sign you in. Check your email and password, then try again.");
      setBusy(false);
    }
    else if (mode === "sign-up") {
      window.location.assign(`/journey/login?next=${encodeURIComponent(callbackURL)}&email=${encodeURIComponent(submittedEmail)}&sent=1`);
    }
    else window.location.assign(callbackURL);
  };

  const continueWithGoogle = async () => {
    setGoogleBusy(true);
    setError("");
    const result = await authClient.signIn.social({ provider: "google", callbackURL });
    if (result?.error) {
      setError(result.error.message || "Google sign-in could not start. Please try again.");
      setGoogleBusy(false);
    }
  };

  return <section className={styles.authPanel}>
    <p className={styles.eyebrow}>EasyT account</p>
    <h2>{mode === "sign-in" ? "Welcome back." : "Start travelling."}</h2>
    <p className={styles.muted}>{verificationSent ? `Your account is ready. We sent a one-time verification link to ${initialEmail || "your email"}. Confirm it, then sign in below.` : mode === "sign-in" ? "Open your saved plans and pick up where you left off." : "Save your first plan and keep every trip in one place."}</p>
    {(!configured || showSetupNotice) && <p className={styles.setupNotice}>Accounts are being connected to the live site. The Tokyo Marathon+ prototype and trip builder are still available.</p>}
    <EasyTSegmentedControl
      ariaLabel="Account action"
      className={styles.tabs}
      value={mode}
      onChange={(next) => { setMode(next); setError(""); }}
      options={[
        { label: "Sign in", value: "sign-in" },
        { label: "New here?", value: "sign-up" },
      ]}
    />
    <form className={styles.form} onSubmit={submit}>
      {mode === "sign-up" && <EasyTField label="Your name" name="name" autoComplete="name" required placeholder="Your name" />}
      <EasyTField label="Email" name="email" type="email" autoComplete="email" required placeholder="you@example.com" value={email} onChange={(event) => setEmail(event.target.value)} />
      <EasyTField label="Password" name="password" type="password" minLength={8} autoComplete={mode === "sign-in" ? "current-password" : "new-password"} required placeholder="At least 8 characters" />
      {mode === "sign-in" && <a className={styles.forgotLink} href="/journey/forgot-password">Forgot password?</a>}
      {error && <p className={styles.error} role="alert">{error}</p>}
      <EasyTButton className={styles.authSubmit} type="submit" fullWidth loading={busy} disabled={!configured}>{configured ? mode === "sign-in" ? "Sign in →" : "Create account →" : "Accounts coming online"}</EasyTButton>
    </form>
    {googleEnabled && <><div className={styles.divider}>or</div><EasyTButton type="button" variant="secondary" fullWidth loading={googleBusy} disabled={!configured || busy} onClick={continueWithGoogle}>Continue with Google</EasyTButton></>}
    <p className={styles.legalLink}>Read how EasyT handles your data in our <a href="/journey/privacy">Privacy notice</a>.</p>
  </section>;
}
