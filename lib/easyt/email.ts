import "server-only";

import { createEasyTEmailEvent } from "./repository";

export type EasyTEmailTemplate = "verification" | "password_reset" | "trip_gift" | "trip_share" | "trip_saved";
type EasyTEmail = { to: string; subject: string; text: string; html?: string; template?: EasyTEmailTemplate };

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] ?? character);

export function emailButton(url: string, label: string) {
  return `<p style="margin:28px 0"><a href="${escapeHtml(url)}" style="display:inline-block;padding:13px 20px;border-radius:999px;background:#17152f;color:#fff;text-decoration:none;font-weight:700">${escapeHtml(label)}</a></p>`;
}

export function emailLayout(input: { eyebrow: string; title: string; body: string; footer?: string }) {
  return `<!doctype html><html><body style="margin:0;background:#f7f7f5;color:#17152f;font-family:Arial,sans-serif"><div style="max-width:560px;margin:32px auto;padding:40px 32px;background:#fff;border:1px solid #e4e2e7;border-radius:18px"><p style="margin:0 0 20px;color:#ff3d8b;font:700 12px monospace;letter-spacing:.16em;text-transform:uppercase">${escapeHtml(input.eyebrow)}</p><h1 style="margin:0 0 18px;font-size:32px;line-height:1.05;font-weight:700">${escapeHtml(input.title)}</h1><div style="font-size:16px;line-height:1.6;color:#605b6d">${input.body}</div>${input.footer ? `<p style="margin:34px 0 0;padding-top:18px;border-top:1px solid #e8e6eb;color:#96919e;font-size:12px;line-height:1.5">${escapeHtml(input.footer)}</p>` : ""}</div></body></html>`;
}

export function verificationEmail(url: string) {
  return { subject: "Verify your Morrovia account", template: "verification" as const, text: `Welcome to Morrovia. Verify your account: ${url}`, html: emailLayout({ eyebrow: "Morrovia account", title: "Keep your trips together.", body: `<p>Confirm your email address to save plans, collect stamps and access Morrovia from any device.</p>${emailButton(url, "Verify email")}`, footer: "If you didn’t create a Morrovia account, you can ignore this email." }) };
}

export function passwordResetEmail(url: string) {
  return { subject: "Reset your Morrovia password", template: "password_reset" as const, text: `Reset your Morrovia password: ${url}`, html: emailLayout({ eyebrow: "Morrovia security", title: "Reset your password.", body: `<p>We received a request to reset your Morrovia password.</p>${emailButton(url, "Reset password")}`, footer: "If you did not request this, you can safely ignore this email." }) };
}

export function tripGiftEmail(input: { title: string; note?: string | null; url: string }) {
  return { subject: `A trip was shared with you: ${input.title}`, template: "trip_gift" as const, text: [`A trip was shared with you: ${input.title}`, input.note ? `Message: ${input.note}` : "", `Claim your editable copy: ${input.url}`].filter(Boolean).join("\n\n"), html: emailLayout({ eyebrow: "A trip for you", title: input.title, body: `${input.note ? `<p style="padding:16px;background:#fff4f8;border-radius:10px">${escapeHtml(input.note)}</p>` : ""}${emailButton(input.url, "Open shared trip")}`, footer: "The sender’s original plan will not be changed when you claim your copy." }) };
}

/** Send a transactional email through Resend and record its lifecycle. */
export async function sendEasyTEmail(email: EasyTEmail) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  const template = email.template ?? "trip_saved";
  if (!apiKey || !from) {
    await createEasyTEmailEvent({ recipientEmail: email.to, subject: email.subject, template, status: "failed", errorMessage: "Missing RESEND_API_KEY or EMAIL_FROM" }).catch(() => undefined);
    throw new Error("Transactional email is not configured. Add RESEND_API_KEY and EMAIL_FROM.");
  }
  const response = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ from, to: email.to, subject: email.subject, text: email.text, html: email.html ?? email.text.replace(/\n/g, "<br>") }) });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    await createEasyTEmailEvent({ recipientEmail: email.to, subject: email.subject, template, status: "failed", errorMessage: detail.slice(0, 500) }).catch(() => undefined);
    throw new Error(`Email delivery failed (${response.status})${detail ? `: ${detail}` : ""}`);
  }
  const payload = await response.json().catch(() => ({})) as { id?: string };
  await createEasyTEmailEvent({ providerId: payload.id, recipientEmail: email.to, subject: email.subject, template, status: "sent" }).catch(() => undefined);
  return payload.id;
}
