"use client";

import { useEffect, useId, useRef, useState } from "react";
import { MessageCircleHeart, X } from "lucide-react";
import { EasyTButton, EasyTTextArea } from "./easyt-controls";
import { beginFeedbackAttempt, completeFeedbackAttempt, failFeedbackAttempt, reconcileFeedbackAttempt, type FeedbackResponseFlow } from "@/lib/easyt/feedback-response-flow";
import styles from "./contextual-feedback.module.css";

const faces = ["😞", "🙁", "😐", "🙂", "😍"];
const initialFlow: FeedbackResponseFlow = { phase: "open", rating: null, comment: "", attempt: null };
const draftKey = (ownerId: string) => `morrovia:contextual-feedback:draft:${encodeURIComponent(ownerId)}`;
type Props = { ownerId: string; onDismiss(): void; onSubmitted(): void; storyState?: "invitation" | "open" | "failure" | "submitted" };

export function EasyTFeedback({ ownerId, onDismiss, onSubmitted, storyState }: Props) {
  const [open, setOpen] = useState(storyState === "open" || storyState === "failure");
  const [flow, setFlow] = useState<FeedbackResponseFlow>(() => storyState === "failure"
    ? { ...initialFlow, phase: "failed", rating: 4, comment: "I could find the route, but the save status was unclear." }
    : storyState === "submitted" ? { ...initialFlow, phase: "sent" } : initialFlow);
  const [message, setMessage] = useState("");
  const [language, setLanguage] = useState<"en" | "es">("en");
  const [dismissed, setDismissed] = useState(false);
  const questionRef = useRef<HTMLHeadingElement>(null);
  const live = useRef(true);
  const sending = useRef(false);
  const flowRef = useRef(flow);
  const formId = useId();
  flowRef.current = flow;

  useEffect(() => {
    live.current = true;
    setLanguage(localStorage.getItem("easyt-language") === "es" ? "es" : "en");
    const updateLanguage = (event: Event) => setLanguage((event as CustomEvent<"en" | "es">).detail);
    window.addEventListener("easyt-language-change", updateLanguage);
    if (storyState) return () => { live.current = false; window.removeEventListener("easyt-language-change", updateLanguage); };
    try {
      const raw = localStorage.getItem(draftKey(ownerId));
      if (raw) {
        const saved: unknown = JSON.parse(raw);
        if (saved && typeof saved === "object") {
          const candidate = saved as Partial<FeedbackResponseFlow>;
          if (candidate.phase === "uncertain" && candidate.attempt && typeof candidate.attempt.attemptId === "string") {
            setFlow({ phase: "uncertain", rating: candidate.attempt.rating, comment: candidate.attempt.comment, attempt: candidate.attempt });
            setOpen(true);
          } else if (candidate.rating && candidate.rating >= 1 && candidate.rating <= 5) {
            setFlow({ ...initialFlow, rating: candidate.rating, comment: typeof candidate.comment === "string" ? candidate.comment : "" });
          }
        }
      }
    } catch { /* An unreadable local draft is ignored. */ }
    return () => { live.current = false; window.removeEventListener("easyt-language-change", updateLanguage); };
  }, [ownerId, storyState]);

  useEffect(() => {
    if (storyState) return;
    if (flow.phase === "sent" || flow.phase === "already-submitted") localStorage.removeItem(draftKey(ownerId));
    else if (flow.phase === "sending" || flow.phase === "uncertain" || flow.rating || flow.comment)
      localStorage.setItem(draftKey(ownerId), JSON.stringify(flow.phase === "sending" ? { ...flow, phase: "uncertain" } : flow));
  }, [flow, ownerId, storyState]);

  const copy = language === "es" ? {
    invite: "Compartir comentarios", close: "Cerrar comentarios", question: "¿Cómo se siente Morrovia?", rate: "Valora Morrovia del 1 al 5",
    note: "¿Qué podríamos mejorar?", send: "Enviar comentarios", retry: "Intentar de nuevo", sending: "Enviando…",
    uncertainty: "No pudimos confirmar el envío. Inténtalo de nuevo sin cambiar tu respuesta.", error: "No se pudo enviar. Puedes intentarlo de nuevo.",
    thanks: "Gracias por tus comentarios.", already: "Esta encuesta ya recibió una respuesta de tu cuenta.", checking: "Comprobando la respuesta anterior…",
  } : {
    invite: "Share feedback", close: "Dismiss feedback", question: "How’s Morrovia feeling?", rate: "Rate Morrovia from 1 to 5",
    note: "Anything we could improve?", send: "Send feedback", retry: "Try again", sending: "Sending…",
    uncertainty: "We couldn’t confirm the response. Try again with the same answer.", error: "Feedback could not be sent. You can try again.",
    thanks: "Thank you for your feedback.", already: "This survey already has a response from your account.", checking: "Checking the earlier response…",
  };
  const dismiss = () => { setDismissed(true); onDismiss(); };
  const edit = (change: (current: FeedbackResponseFlow) => FeedbackResponseFlow) => {
    if (flowRef.current.phase === "uncertain" || flowRef.current.phase === "sending") return;
    setFlow(change);
    setMessage("");
  };
  const reconcile = async (changeAnswer: boolean): Promise<"submitted" | "clear" | "unknown"> => {
    sending.current = true;
    setMessage(copy.checking);
    try {
      const response = await fetch("/api/easyt/feedback/survey", { cache: "no-store" });
      if (!response.ok) throw new Error("Unable to reconcile");
      const status: { submitted?: boolean } = await response.json();
      if (!live.current) return "unknown";
      if (status.submitted) { setFlow(reconcileFeedbackAttempt(flowRef.current, true)); onSubmitted(); return "submitted"; }
      if (changeAnswer) setFlow(reconcileFeedbackAttempt(flowRef.current, false));
      setMessage("");
      return "clear";
    } catch {
      if (live.current) setMessage(copy.uncertainty);
      return "unknown";
    } finally { sending.current = false; }
  };
  const send = async () => {
    if (sending.current || !flowRef.current.rating) return;
    let next = flowRef.current;
    if (next.phase === "uncertain") {
      if (await reconcile(false) !== "clear") return;
    }
    next = beginFeedbackAttempt(next, next.attempt?.attemptId ?? crypto.randomUUID());
    if (next.phase !== "sending" || !next.attempt) return;
    sending.current = true;
    setFlow(next);
    setMessage("");
    try {
      const response = await fetch("/api/easyt/feedback/survey", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(next.attempt),
      });
      if (!live.current) return;
      if (response.status === 409 || response.status === 400) {
        setFlow(failFeedbackAttempt(next, false)); setMessage(copy.error); return;
      }
      if (!response.ok) throw new Error("Unconfirmed submission");
      const body: { result?: "created" | "replayed" | "already-submitted" | "payload-conflict" } = await response.json();
      if (!live.current) return;
      if (body.result === "created" || body.result === "replayed" || body.result === "already-submitted") {
        setFlow(completeFeedbackAttempt(next, body.result)); onSubmitted();
      } else { setFlow(failFeedbackAttempt(next, true)); setMessage(copy.uncertainty); }
    } catch {
      if (live.current) { setFlow(failFeedbackAttempt(next, true)); setMessage(copy.uncertainty); }
    } finally { sending.current = false; }
  };

  if (dismissed) return null;
  return <aside className={styles.feedback} aria-label={flow.phase === "sent" ? copy.thanks : flow.phase === "already-submitted" ? copy.already : open ? copy.question : copy.invite}>
    <EasyTButton className={styles.close} variant="quiet" icon={X} iconOnly onClick={dismiss}>{copy.close}</EasyTButton>
    {flow.phase === "sent" || flow.phase === "already-submitted" ? <p role="status">{flow.phase === "sent" ? copy.thanks : copy.already}</p> : !open ? (
      <EasyTButton variant="secondary" icon={MessageCircleHeart} onClick={() => { setOpen(true); requestAnimationFrame(() => questionRef.current?.focus()); }}>{copy.invite}</EasyTButton>
    ) : <div className={styles.form}>
      <h3 ref={questionRef} tabIndex={-1} id={`${formId}-question`}>{copy.question}</h3>
      <div className={styles.faces} role="radiogroup" aria-labelledby={`${formId}-question`}>
        {faces.map((face, index) => <button key={index} type="button" role="radio" aria-checked={flow.rating === index + 1}
          tabIndex={flow.rating === index + 1 || (!flow.rating && index === 0) ? 0 : -1}
          aria-label={`${index + 1} out of 5`} className={flow.rating === index + 1 ? styles.selectedFace : styles.face}
          disabled={flow.phase === "sending" || flow.phase === "uncertain"}
          onKeyDown={(event) => {
            if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
            event.preventDefault();
            const next = (index + (event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : 4)) % faces.length;
            edit((current) => ({ ...current, rating: next + 1, phase: "open" }));
            (event.currentTarget.parentElement?.children[next] as HTMLElement | undefined)?.focus();
          }}
          onClick={() => edit((current) => ({ ...current, rating: index + 1, phase: "open" }))}>{face}</button>)}
      </div>
      <EasyTTextArea label={copy.note} optional value={flow.comment} maxLength={1000} rows={3}
        disabled={flow.phase === "sending" || flow.phase === "uncertain"}
        onChange={(event) => edit((current) => ({ ...current, comment: event.target.value, phase: "open" }))} />
      <EasyTButton onClick={() => void send()} disabled={!flow.rating || sending.current} loading={flow.phase === "sending"}>
        {flow.phase === "uncertain" || flow.phase === "failed" ? copy.retry : flow.phase === "sending" ? copy.sending : copy.send}
      </EasyTButton>
      {flow.phase === "uncertain" ? <EasyTButton variant="quiet" onClick={() => { if (!sending.current) void reconcile(true); }}>
        {language === "es" ? "Cambiar respuesta" : "Edit answer"}
      </EasyTButton> : null}
      {message ? <p role="status">{message}</p> : null}
    </div>}
  </aside>;
}
