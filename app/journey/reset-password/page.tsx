"use client";

import { FormEvent, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";
import { authClient } from "@/lib/auth-client";
import { EasyTButton, EasyTField } from "@/components/easyt/easyt-controls";
import EasyTNavigation from "../easyt-navigation";
import styles from "../account.module.css";

function ResetPasswordForm() {
  const params = useSearchParams();
  const token = params.get("token") || "";
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setBusy(true); setError("");
    const data = new FormData(event.currentTarget);
    const password = String(data.get("password") || "");
    const confirm = String(data.get("confirm") || "");
    if (password !== confirm) { setError("Passwords do not match."); setBusy(false); return; }
    const result = await authClient.resetPassword({ newPassword: password, token });
    if (result.error) setError(result.error.message || "That reset link is no longer valid.");
    else setDone(true);
    setBusy(false);
  };
  return <main className={styles.page}><EasyTNavigation current="login" /><div className={styles.authWrap}><section className={styles.authPanel}>
    <p className={styles.eyebrow}>EasyT account</p><h2>{done ? "Password updated." : "Choose a new password."}</h2>
    <p className={styles.muted}>{done ? "You can now sign in with your new password." : "Use at least 8 characters."}</p>
    {!done && <form className={styles.form} onSubmit={submit}><EasyTField label="New password" name="password" type="password" minLength={8} required autoComplete="new-password" placeholder="At least 8 characters" /><EasyTField label="Confirm password" name="confirm" type="password" minLength={8} required autoComplete="new-password" placeholder="Repeat your password" />{error && <p className={styles.error}>{error}</p>}<EasyTButton type="submit" fullWidth loading={busy} disabled={!token}>Update password →</EasyTButton></form>}
    {done && <Link className={styles.forgotLink} href="/journey/login">Back to sign in</Link>}
  </section></div></main>;
}

export default function ResetPasswordPage() {
  return <Suspense fallback={null}><ResetPasswordForm /></Suspense>;
}
