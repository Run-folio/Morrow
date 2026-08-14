"use client";

import { useEffect, useState } from "react";
import { MessageCircleHeart, X } from "lucide-react";

import styles from "@/app/journey/account.module.css";

const faces = ["😞", "🙁", "😐", "🙂", "😍"];
const storageKey = "easyt-dashboard-feedback-dismissed";

export function EasyTFeedback() {
  const [dismissed, setDismissed] = useState(false);
  const [rating, setRating] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [language, setLanguage] = useState<"en" | "es">("en");

  useEffect(() => {
    setDismissed(localStorage.getItem(storageKey) === "1");
    setLanguage(localStorage.getItem("easyt-language") === "es" ? "es" : "en");
    const updateLanguage = (event: Event) => setLanguage((event as CustomEvent<"en" | "es">).detail);
    window.addEventListener("easyt-language-change", updateLanguage);
    return () => window.removeEventListener("easyt-language-change", updateLanguage);
  }, []);

  const copy = language === "es"
    ? { close: "Cerrar", aria: "Compartir comentarios", thanks: "Gracias.", sent: "Tus comentarios ayudan a mejorar Morrovia.", title: "¿Cómo se siente Morrovia?", subtitle: "Valoración rápida, nota opcional.", rate: "Valora Morrovia del 1 al 5", placeholder: "¿Qué podríamos mejorar? (opcional)", send: "Enviar comentarios", sending: "Enviando…", error: "Guardado en este dispositivo; inténtalo de nuevo más tarde." }
    : { close: "Dismiss feedback", aria: "Share feedback", thanks: "Thank you.", sent: "Your feedback helps shape Morrovia.", title: "How’s Morrovia feeling?", subtitle: "Quick rating, optional note.", rate: "Rate Morrovia from 1 to 5", placeholder: "Anything we could improve? (optional)", send: "Send feedback", sending: "Sending…", error: "Saved privately on this device. Try again later." };

  const close = () => {
    localStorage.setItem(storageKey, "1");
    setDismissed(true);
  };

  const send = async () => {
    if (!rating) return;
    setState("sending");
    try {
      const response = await fetch("/api/easyt/feedback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ rating, comment }),
      });
      if (!response.ok) throw new Error();
      setState("sent");
      window.setTimeout(close, 1600);
    } catch {
      localStorage.setItem("easyt-dashboard-feedback-draft", JSON.stringify({ rating, comment }));
      setState("error");
    }
  };

  if (dismissed) return null;
  return <aside className={styles.feedback} aria-label={copy.aria}>
    <button className={styles.feedbackClose} type="button" onClick={close} aria-label={copy.close}><X size={15} /></button>
    {state === "sent" ? <><strong>{copy.thanks}</strong><p>{copy.sent}</p></> : <>
      <span className={styles.feedbackIcon}><MessageCircleHeart size={17} /></span>
      <strong>{copy.title}</strong>
      <p>{copy.subtitle}</p>
      <div className={styles.feedbackFaces} role="radiogroup" aria-label={copy.rate}>
        {faces.map((face, index) => <button key={face} type="button" className={rating === index + 1 ? styles.feedbackFaceActive : ""} onClick={() => { setRating(index + 1); setState("idle"); }} aria-label={`${index + 1} out of 5`} aria-pressed={rating === index + 1}>{face}</button>)}
      </div>
      {rating ? <>
        <textarea value={comment} onChange={(event) => setComment(event.target.value)} placeholder={copy.placeholder} maxLength={1000} />
        <button type="button" className={styles.feedbackSend} onClick={send} disabled={state === "sending"}>{state === "sending" ? copy.sending : copy.send}</button>
      </> : null}
      {state === "error" ? <small>{copy.error}</small> : null}
    </>}
  </aside>;
}
