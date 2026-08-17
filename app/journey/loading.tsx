export default function JourneyLoading() {
  return (
    <main
      aria-label="Loading Journey"
      style={{ minHeight: "100svh", display: "grid", placeItems: "center", background: "var(--morrovia-paper)", color: "var(--morrovia-ink)", fontFamily: "var(--morrovia-ui)" }}
    >
      <div style={{ display: "grid", justifyItems: "center", gap: 12 }}>
        <span aria-hidden="true" style={{ width: 34, height: 34, border: "3px solid var(--morrovia-lilac-strong)", borderTopColor: "var(--morrovia-signal)", borderRadius: "50%", animation: "easyt-spin .8s linear infinite" }} />
        <span style={{ fontSize: 13, fontWeight: 500 }}>Loading your journey…</span>
      </div>
      <style>{`@keyframes easyt-spin{to{transform:rotate(360deg)}}`}</style>
    </main>
  );
}
