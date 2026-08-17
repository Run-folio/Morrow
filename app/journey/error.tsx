"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function JourneyError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("Morrovia journey error", error);
  }, [error]);

  return (
    <main style={{ minHeight: "100svh", display: "grid", placeItems: "center", padding: 24, background: "var(--morrovia-paper)", color: "var(--morrovia-ink)", fontFamily: "var(--morrovia-ui)" }}>
      <section style={{ width: "min(100%, 520px)", padding: "clamp(28px, 6vw, 56px)", border: "1px solid var(--morrovia-line)", borderRadius: "var(--morrovia-radius)", background: "#fff", boxShadow: "0 14px 32px rgba(23, 16, 111, .07)", textAlign: "center" }}>
        <p style={{ margin: "0 0 12px", color: "var(--morrovia-signal)", font: "700 12px/1.2 var(--morrovia-meta)", letterSpacing: ".16em", textTransform: "uppercase" }}>Morrovia</p>
        <h1 style={{ margin: "0 0 14px", color: "var(--morrovia-ink)", fontFamily: "var(--morrovia-display)", fontSize: "clamp(30px, 7vw, 48px)", lineHeight: 1.02 }}>Something went off route.</h1>
        <p style={{ margin: "0 auto 24px", maxWidth: 380, color: "var(--morrovia-muted)", fontSize: 16, lineHeight: 1.55 }}>Your trip is safe. Try the page again, or return to Morrovia home.</p>
        <div className="morrovia-error-actions" style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 10 }}>
          <button type="button" onClick={() => reset()} style={{ border: 0, borderRadius: "var(--morrovia-control-radius)", padding: "13px 20px", background: "var(--morrovia-ink)", color: "#fff", fontWeight: 700, cursor: "pointer" }}>Try again</button>
          <Link href="/journey/home" style={{ border: "1px solid var(--morrovia-line)", borderRadius: "var(--morrovia-control-radius)", padding: "12px 20px", color: "var(--morrovia-ink)", textDecoration: "none", fontWeight: 700 }}>Go home</Link>
        </div>
      </section>
      <style>{`.morrovia-error-actions button:focus-visible,.morrovia-error-actions a:focus-visible{outline:2px solid var(--morrovia-signal);outline-offset:3px}`}</style>
    </main>
  );
}
