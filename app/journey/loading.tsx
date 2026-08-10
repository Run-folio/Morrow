export default function JourneyLoading() {
  return (
    <main
      aria-label="Loading Journey"
      style={{ minHeight: "100svh", display: "grid", placeItems: "center", background: "#fff", color: "#1f1d3d", fontFamily: "var(--font-geist-sans, Geist, Inter, sans-serif)" }}
    >
      <div style={{ display: "grid", justifyItems: "center", gap: 12 }}>
        <span aria-hidden="true" style={{ width: 34, height: 34, border: "3px solid #f5c4d8", borderTopColor: "#ff3d8b", borderRadius: "50%", animation: "easyt-spin .8s linear infinite" }} />
        <span style={{ fontSize: 13, fontWeight: 500 }}>Loading your journey…</span>
      </div>
      <style>{`@keyframes easyt-spin{to{transform:rotate(360deg)}}`}</style>
    </main>
  );
}
