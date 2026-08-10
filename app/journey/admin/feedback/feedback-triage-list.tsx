"use client";

import { useMemo, useState } from "react";
import styles from "./feedback.module.css";

type EasyTFeedbackStatus = "new" | "reviewed" | "planned" | "resolved";
type EasyTFeedbackRow = { id: string; ownerEmail: string | null; rating: number; comment: string | null; surface: string; status: EasyTFeedbackStatus; internalNote: string | null; createdAt: string };
const statuses: EasyTFeedbackStatus[] = ["new", "reviewed", "planned", "resolved"];

export default function FeedbackTriageList({ feedback }: { feedback: EasyTFeedbackRow[] }) {
  const [items, setItems] = useState(feedback);
  const [filter, setFilter] = useState<"all" | EasyTFeedbackStatus>("all");
  const [saving, setSaving] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const shown = useMemo(() => items.filter((item) => filter === "all" || item.status === filter), [filter, items]);
  const update = (id: string, patch: Partial<Pick<EasyTFeedbackRow, "status" | "internalNote">>) => setItems((current) => current.map((item) => item.id === id ? { ...item, ...patch } : item));
  const save = async (item: EasyTFeedbackRow) => {
    setSaving(item.id); setMessage("");
    const response = await fetch(`/api/easyt/admin/feedback/${item.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status: item.status, internalNote: item.internalNote ?? "" }) });
    const payload = await response.json().catch(() => null) as { error?: string } | null;
    if (!response.ok) setMessage(payload?.error || "We couldn't save that triage update.");
    else setMessage("Triage update saved.");
    setSaving(null);
  };
  return <section className={styles.list} aria-label="Feedback responses">
    <div className={styles.triageHeader}><strong>{shown.length} {filter === "all" ? "responses" : filter}</strong><label><span className="sr-only">Filter feedback</span><select className={styles.status} value={filter} onChange={(event) => setFilter(event.target.value as "all" | EasyTFeedbackStatus)}><option value="all">All feedback</option>{statuses.map((status) => <option key={status} value={status}>{status}</option>)}</select></label></div>
    {message && <p className={styles.triageMessage} role="status">{message}</p>}
    {!shown.length ? <p className={styles.empty}>No feedback in this view.</p> : shown.map((item) => <article key={item.id}><header><strong>{"★".repeat(item.rating)}<span>{"★".repeat(5 - item.rating)}</span></strong><time dateTime={item.createdAt}>{new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(item.createdAt))}</time></header><p>{item.comment?.trim() || "No written comment."}</p><small>{item.ownerEmail || "Unknown account"} · {item.surface}</small><div className={styles.triage}><label>Status<select className={`${styles.status} ${styles[`status${item.status[0].toUpperCase()}${item.status.slice(1)}`]}`} value={item.status} onChange={(event) => update(item.id, { status: event.target.value as EasyTFeedbackStatus })}>{statuses.map((status) => <option key={status} value={status}>{status}</option>)}</select></label><label>Internal note<textarea value={item.internalNote ?? ""} onChange={(event) => update(item.id, { internalNote: event.target.value.slice(0, 2000) })} placeholder="What did we learn? What happens next?" /></label><div className={styles.triageActions}><button className={styles.save} type="button" disabled={saving === item.id} onClick={() => save(item)}>{saving === item.id ? "Saving…" : "Save triage"}</button></div></div></article>)}
  </section>;
}
