"use client";

import { useMemo, useState } from "react";
import { authClient } from "@/lib/auth-client";

type User = { email: string; name: string | null; tripCount: number; lastTripActivity: string | null; createdAt: string };

export default function UserSupport({ users }: { users: User[] }) {
  const [query, setQuery] = useState("");
  const [working, setWorking] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [deleteCandidate, setDeleteCandidate] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [deletedEmails, setDeletedEmails] = useState<string[]>([]);
  const filtered = useMemo(() => users.filter((user) => !deletedEmails.includes(user.email.toLowerCase()) && `${user.name ?? ""} ${user.email}`.toLowerCase().includes(query.trim().toLowerCase())), [deletedEmails, query, users]);

  const sendReset = async (email: string) => {
    setWorking(email); setMessage("");
    const result = await authClient.requestPasswordReset({ email, redirectTo: "/journey/reset-password" });
    if (result.error) setMessage(result.error.message || "We couldn't send the reset email.");
    else {
      await fetch("/api/easyt/admin/audit", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "password_reset_requested", target: email }) });
      setMessage(`Reset link requested for ${email}.`);
    }
    setWorking(null);
  };

  const deleteAccount = async () => {
    if (!deleteCandidate) return;
    setWorking(deleteCandidate); setMessage("");
    const response = await fetch("/api/easyt/admin/users/delete", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: deleteCandidate, confirmation }) });
    const payload = await response.json().catch(() => null) as { error?: string } | null;
    if (!response.ok) setMessage(payload?.error || "We couldn't delete that account.");
    else { setDeletedEmails((current) => [...current, deleteCandidate.toLowerCase()]); setMessage(`Account ${deleteCandidate} was permanently deleted.`); setDeleteCandidate(null); setConfirmation(""); }
    setWorking(null);
  };

  return <section style={{ display: "grid", gap: 16 }}>
    <label style={{ display: "grid", gap: 8, maxWidth: 460, fontWeight: 700, fontSize: 13 }}>Find a user
      <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by name or email" style={{ border: "1px solid #d9d7de", borderRadius: 12, minHeight: 44, padding: "0 12px", font: "inherit" }} />
    </label>
    {message && <p role="status" style={{ margin: 0, color: "#615d70" }}>{message}</p>}
    <div style={{ display: "grid", gap: 10 }}>
      {filtered.map((user) => <article key={user.email} style={{ padding: 18, border: "1px solid #dddade", borderRadius: 18, background: "#fff", display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", alignItems: "center", gap: 16 }}>
        <div><strong>{user.name || "Unnamed traveller"}</strong><p style={{ margin: "4px 0", color: "#777482" }}>{user.email}</p><small style={{ color: "#777482" }}>{user.tripCount} {user.tripCount === 1 ? "trip" : "trips"} · Last trip activity {user.lastTripActivity ? new Date(user.lastTripActivity).toLocaleDateString() : "not yet"}</small></div>
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "flex-end", gap: 8 }}><button type="button" disabled={working === user.email} onClick={() => sendReset(user.email)} style={{ minHeight: 40, border: 0, borderRadius: 999, background: "#171331", color: "#fff", padding: "0 14px", fontWeight: 800, cursor: "pointer" }}>{working === user.email ? "Sending…" : "Send reset link"}</button><button type="button" disabled={working === user.email} onClick={() => { setDeleteCandidate(user.email); setConfirmation(""); setMessage(""); }} style={{ minHeight: 40, border: "1px solid #c65b66", borderRadius: 999, background: "#fff", color: "#a32434", padding: "0 14px", fontWeight: 800, cursor: "pointer" }}>Delete account</button></div>
      </article>)}
      {!filtered.length && <p style={{ color: "#777482" }}>No matching EasyT users yet.</p>}
    </div>
    {deleteCandidate && <div role="dialog" aria-modal="true" aria-labelledby="delete-account-title" style={{ position: "fixed", inset: 0, zIndex: 20, display: "grid", placeItems: "center", padding: 20, background: "rgb(23 19 49 / .48)" }}>
      <section style={{ width: "min(100%, 480px)", padding: 28, borderRadius: 22, background: "#fff", boxShadow: "0 24px 70px rgb(23 19 49 / .25)", display: "grid", gap: 16 }}>
        <p style={{ margin: 0, color: "#a32434", fontSize: 11, fontWeight: 800, letterSpacing: ".1em", textTransform: "uppercase" }}>Permanent action</p><h2 id="delete-account-title" style={{ margin: 0, fontSize: 28, letterSpacing: "-.045em" }}>Delete this account?</h2><p style={{ margin: 0, color: "#615d70", lineHeight: 1.55 }}>This permanently removes <strong>{deleteCandidate}</strong>, their trips and EasyT data, and revokes access. Type their email address to enable deletion.</p>
        <label style={{ display: "grid", gap: 8, fontWeight: 700, fontSize: 13 }}>Confirm email<input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="off" placeholder={deleteCandidate} style={{ border: "1px solid #d9d7de", borderRadius: 12, minHeight: 44, padding: "0 12px", font: "inherit" }} /></label>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}><button type="button" onClick={() => { setDeleteCandidate(null); setConfirmation(""); }} style={{ minHeight: 40, border: "1px solid #d9d7de", borderRadius: 999, background: "#fff", padding: "0 14px", fontWeight: 800, cursor: "pointer" }}>Cancel</button><button type="button" disabled={confirmation.trim().toLowerCase() !== deleteCandidate.toLowerCase() || working === deleteCandidate} onClick={deleteAccount} style={{ minHeight: 40, border: 0, borderRadius: 999, background: "#a32434", color: "#fff", padding: "0 14px", fontWeight: 800, cursor: "pointer", opacity: confirmation.trim().toLowerCase() === deleteCandidate.toLowerCase() ? 1 : .45 }}>{working === deleteCandidate ? "Deleting…" : "Delete permanently"}</button></div>
      </section>
    </div>}
  </section>;
}
