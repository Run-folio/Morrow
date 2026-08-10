"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { authClient } from "@/lib/auth-client";
import { EasyTButton, EasyTField } from "@/components/easyt/easyt-controls";
import EasyTNavigation from "../easyt-navigation";
import styles from "../account.module.css";

export default function ForgotPasswordPage() {
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true); setError("");
    const email = String(new FormData(event.currentTarget).get("email") || "");
    const result = await authClient.requestPasswordReset({ email, redirectTo: "/journey/reset-password" });
    if (result.error) setError(result.error.message || "We couldn't send that email.");
    else setSent(true);
    setBusy(false);
  };
  return <main className={styles.page}><EasyTNavigation current="login" /><div className={styles.authWrap}><div className={styles.authGrid}><section className={styles.authPanel}>
    <p className={styles.eyebrow}>EasyT account</p><h2>Reset your password.</h2>
    <p className={styles.muted}>{sent ? "If an account exists for that email, a reset link is on its way." : "Enter your email and we’ll send a secure reset link."}</p>
    {!sent && <form className={styles.form} onSubmit={submit}><EasyTField label="Email" name="email" type="email" autoComplete="email" required placeholder="you@example.com" />{error && <p className={styles.error}>{error}</p>}<EasyTButton type="submit" fullWidth loading={busy}>Send reset link →</EasyTButton></form>}
    <Link className={styles.forgotLink} href="/journey/login">Back to sign in</Link>
  </section></div></div></main>;
}
