"use client";

import { useRef, useState, type FormEvent } from "react";
import { Send } from "lucide-react";
import { EasyTButton, EasyTField, EasyTTextArea } from "@/components/easyt/easyt-controls";
import { MorroviaStatusBanner } from "@/components/easyt/morrovia-feedback";
import {
  CONTACT_EMAIL_MAX_LENGTH,
  CONTACT_MESSAGE_MAX_LENGTH,
  CONTACT_MESSAGE_MIN_LENGTH,
  CONTACT_NAME_MAX_LENGTH,
  parseContactMessage,
  type ContactFieldErrors,
  type ContactTopic,
} from "@/lib/easyt/contact-message";
import styles from "./contact.module.css";

type Feedback = { tone: "danger" | "success"; title: string; detail: string } | null;

export default function ContactForm({ topic = "general" }: { topic?: ContactTopic }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [website, setWebsite] = useState("");
  const [errors, setErrors] = useState<ContactFieldErrors>({});
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const messageRef = useRef<HTMLTextAreaElement>(null);

  const focusFirstError = (nextErrors: ContactFieldErrors) => {
    (nextErrors.name ? nameRef : nextErrors.email ? emailRef : messageRef).current?.focus();
  };

  const clearError = (field: keyof ContactFieldErrors) => {
    setErrors((current) => ({ ...current, [field]: undefined }));
    if (feedback?.tone === "danger") setFeedback(null);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submittingRef.current) return;
    const parsed = parseContactMessage({ name, email, message, website, topic });
    if (Object.keys(parsed.errors).length) {
      setErrors(parsed.errors);
      setFeedback({ tone: "danger", title: "Check your message", detail: "Correct the highlighted fields, then try again." });
      focusFirstError(parsed.errors);
      return;
    }
    submittingRef.current = true;
    setSubmitting(true);
    setErrors({});
    setFeedback(null);
    try {
      const response = await fetch("/api/easyt/contact", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(parsed.input),
      });
      const payload = await response.json().catch(() => ({})) as { error?: string; errors?: ContactFieldErrors };
      if (!response.ok) {
        if (payload.errors) {
          setErrors(payload.errors);
          focusFirstError(payload.errors);
        }
        setFeedback({
          tone: "danger",
          title: response.status === 429 ? "Please wait before trying again" : "Message not sent",
          detail: payload.error || "Your message is still here. Please try again.",
        });
        return;
      }
      setName("");
      setEmail("");
      setMessage("");
      setWebsite("");
      setFeedback({ tone: "success", title: "Message sent", detail: "Thanks for getting in touch. Morrovia will reply by email." });
    } catch {
      setFeedback({ tone: "danger", title: "Message not sent", detail: "Your message is still here. Check your connection and try again." });
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  return <form className={styles.form} onSubmit={submit} noValidate aria-busy={submitting || undefined}>
    {feedback ? <MorroviaStatusBanner role={feedback.tone === "danger" ? "alert" : "status"} tone={feedback.tone} title={feedback.title} detail={feedback.detail} /> : null}
    <EasyTField
      ref={nameRef}
      label="Name"
      name="name"
      autoComplete="name"
      required
      minLength={2}
      maxLength={CONTACT_NAME_MAX_LENGTH}
      value={name}
      error={errors.name}
      onChange={(event) => { setName(event.target.value); clearError("name"); }}
    />
    <EasyTField
      ref={emailRef}
      label="Email"
      name="email"
      type="email"
      inputMode="email"
      autoComplete="email"
      required
      maxLength={CONTACT_EMAIL_MAX_LENGTH}
      value={email}
      error={errors.email}
      hint="Morrovia will use this only to reply to your message."
      onChange={(event) => { setEmail(event.target.value); clearError("email"); }}
    />
    <EasyTTextArea
      ref={messageRef}
      label="Message"
      name="message"
      required
      minLength={CONTACT_MESSAGE_MIN_LENGTH}
      maxLength={CONTACT_MESSAGE_MAX_LENGTH}
      rows={8}
      value={message}
      error={errors.message}
      hint={`${message.length.toLocaleString()} of ${CONTACT_MESSAGE_MAX_LENGTH.toLocaleString()} characters`}
      onChange={(event) => { setMessage(event.target.value); clearError("message"); }}
    />
    <label className={styles.honeypot} aria-hidden="true">
      Leave this field empty
      {/* morrovia-ui-audit-allow-next-line native-control -- an off-screen spam trap must not use the visible canonical field shell */}
      <input name="website" value={website} onChange={(event) => setWebsite(event.target.value)} autoComplete="off" tabIndex={-1} />
    </label>
    <div className={styles.actions}>
      <p>Do not include passwords, passport details or payment-card information.</p>
      <EasyTButton type="submit" icon={Send} loading={submitting} disabled={submitting}>
        {submitting ? "Sending message…" : "Send message"}
      </EasyTButton>
    </div>
  </form>;
}
