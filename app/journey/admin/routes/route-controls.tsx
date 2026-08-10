"use client";

import { useState } from "react";

type Route = { key: string; title: string; countries: string[]; bestFor: string; suggestedDays: { ideal: number } };
type Control = { published: boolean; featured: boolean };

export default function RouteControls({ routes, initialControls }: { routes: Route[]; initialControls: Record<string, Control> }) {
  const [controls, setControls] = useState(initialControls);
  const [saving, setSaving] = useState<string | null>(null);
  const update = async (key: string, patch: Partial<Control>) => {
    const previous = controls[key] ?? { published: true, featured: false };
    const next = { ...previous, ...patch };
    setControls((current) => ({ ...current, [key]: next }));
    setSaving(key);
    const response = await fetch(`/api/easyt/admin/routes/${encodeURIComponent(key)}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(next) });
    if (!response.ok) setControls((current) => ({ ...current, [key]: previous }));
    setSaving(null);
  };
  return <section aria-label="Route catalogue controls" style={{ display: "grid", gap: 12 }}>
    {routes.map((route) => {
      const control = controls[route.key] ?? { published: true, featured: false };
      return <article key={route.key} style={{ padding: 20, border: "1px solid #dddade", borderRadius: 18, background: "#fff", display: "grid", gap: 14 }}>
        <div><p style={{ margin: 0, color: "#ff3d8b", fontSize: 11, fontWeight: 800, letterSpacing: ".1em", textTransform: "uppercase" }}>{route.countries.join(" · ")} · {route.suggestedDays.ideal} days</p><h2 style={{ margin: "8px 0", fontSize: 24, letterSpacing: "-.045em" }}>{route.title}</h2><p style={{ margin: 0, color: "#777482", lineHeight: 1.5 }}>{route.bestFor}</p></div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          <label style={{ display: "inline-flex", gap: 8, alignItems: "center", fontSize: 13, fontWeight: 700 }}><input type="checkbox" checked={control.published} disabled={saving === route.key} onChange={(event) => update(route.key, { published: event.target.checked })} />Visible to travellers</label>
          <label style={{ display: "inline-flex", gap: 8, alignItems: "center", fontSize: 13, fontWeight: 700 }}><input type="checkbox" checked={control.featured} disabled={saving === route.key} onChange={(event) => update(route.key, { featured: event.target.checked })} />Feature first</label>
          {saving === route.key && <span style={{ fontSize: 12, color: "#777482" }}>Saving…</span>}
        </div>
      </article>;
    })}
  </section>;
}
