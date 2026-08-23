export default function TripWorkspaceLoading() {
  return (
    <section
      aria-live="polite"
      style={{ minHeight: "45svh", display: "grid", placeItems: "center", color: "var(--morrovia-ink)", fontFamily: "var(--morrovia-ui)" }}
    >
      <div style={{ display: "grid", justifyItems: "center", gap: 10, padding: 24, textAlign: "center" }}>
        <span aria-hidden="true" style={{ width: 34, height: 34, border: "3px solid var(--morrovia-lilac-strong)", borderTopColor: "var(--morrovia-signal)", borderRadius: "50%", animation: "morrovia-route-spin .8s linear infinite" }} />
        <strong style={{ fontFamily: "var(--morrovia-display)", fontSize: 24 }}>Opening your route…</strong>
        <span style={{ maxWidth: 360, color: "var(--morrovia-ink-soft)", fontSize: 13, lineHeight: 1.45 }}>Keeping your trip details and planning choices intact while this view opens.</span>
      </div>
      <style>{`@keyframes morrovia-route-spin{to{transform:rotate(360deg)}}`}</style>
    </section>
  );
}
