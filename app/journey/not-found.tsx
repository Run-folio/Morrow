import Link from "next/link";

export default function JourneyNotFound() {
  return (
    <main style={{ minHeight: "100svh", display: "grid", placeItems: "center", padding: 24, background: "#f6f7fb", color: "#201d3d" }}>
      <section style={{ width: "min(100%, 520px)", padding: "clamp(28px, 6vw, 56px)", border: "1px solid #dedde5", borderRadius: 28, background: "#fff", textAlign: "center" }}>
        <p style={{ margin: "0 0 12px", color: "#e63878", font: "700 12px/1.2 monospace", letterSpacing: ".16em", textTransform: "uppercase" }}>Morrovia</p>
        <h1 style={{ margin: "0 0 14px", fontSize: "clamp(30px, 7vw, 48px)", lineHeight: 1.02 }}>That route has moved.</h1>
        <p style={{ margin: "0 auto 24px", maxWidth: 380, color: "#6f6b78", fontSize: 16, lineHeight: 1.55 }}>Try one of the routes on the homepage, or start shaping a trip from scratch.</p>
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 10 }}>
          <Link href="/journey/home" style={{ borderRadius: 999, padding: "13px 20px", background: "#201d3d", color: "#fff", textDecoration: "none", fontWeight: 700 }}>Explore Morrovia</Link>
          <Link href="/journey/new" style={{ border: "1px solid #c9c7d1", borderRadius: 999, padding: "12px 20px", color: "#201d3d", textDecoration: "none", fontWeight: 700 }}>Start a trip</Link>
        </div>
      </section>
    </main>
  );
}
